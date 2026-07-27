#!/usr/bin/env node
/**
 * Claims one submitted-measure manufacturer task and prepares a saved portal draft.
 * Safety boundary: this process cannot click checkout, submit-order, confirm-order,
 * or place-order controls. It stops at Norman's order queue/review screen.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const PORTAL_URLS = {
  Norman: "https://www.normanwindowcoverings.com/Login/default.asp",
  Onyx: "https://admin.onyxshutters.com/OrderList.aspx",
  Lotus: "https://www.lotusblind.com/",
  Polar: "https://polarshades.picbusiness.com/",
};
const HOME_URL = PORTAL_URLS.Norman;
const ROLLER_URL = "https://www.normanwindowcoverings.com/Login/RollerShadesRR/SessionCtrl.asp?pgmcode=RR";
const BLOCKED_ACTION = /\b(check\s*out|checkout|submit\s+order|place\s+order|confirm\s+order|process\s+order|send\s+order|finalize\s+order)\b/i;
const TASK_ID_PATTERN = /^[a-zA-Z0-9:_-]{8,180}$/;
const args = parseArgs(process.argv.slice(2));
const bridgeRuns = new Map();
let connectedBrowser = null;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (args.serve) {
    await serveBridge();
    return;
  }
  const result = await runQueuedTask(args.taskId, args.manufacturer);
  console.log(JSON.stringify(result, null, 2));
}

async function runQueuedTask(taskId, requestedManufacturer = "Norman") {
  // Verify the user's visible, authenticated Chrome session before claiming the
  // queue row. A missing debugger or logged-out portal must leave the task queued.
  const context = await authenticatedManufacturerContext(requestedManufacturer);
  if (!["Norman", "Onyx"].includes(requestedManufacturer)) {
    return {
      status: "skipped",
      message: `${requestedManufacturer} ordering queue is open. Automatic field entry stays disabled until that portal adapter is verified.`,
    };
  }
  const task = await claimTask(taskId, requestedManufacturer);
  if (!task) {
    return { status: "skipped", message: `No queued ${requestedManufacturer} draft tasks.` };
  }
  try {
    assertSafePlan(task);
    const result = await preparePortalDraft(task, context);
    await workerRequest({
      action: "complete",
      formId: task.technical_measure_form_id,
      recordId: task.record_id,
      taskId: task.id,
      status: "review_ready",
      portalDraftId: result.portalDraftId,
      screenshotPath: result.screenshotPath,
      review: result.review,
    });
    return { status: "review_ready", task_id: task.id, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await workerRequest({
      action: "complete",
      formId: task.technical_measure_form_id,
      recordId: task.record_id,
      taskId: task.id,
      status: "failed",
      errorMessage: message,
    }).catch((completionError) => {
      console.error(`Manufacturer failure status could not be recorded: ${completionError instanceof Error ? completionError.message : String(completionError)}`);
    });
    throw error;
  }
}

function parseArgs(argv) {
  const result = {
    taskId: "",
    manufacturer: "Norman",
    serve: false,
    bridgePort: 47635,
    cdpUrl: process.env.NORMAN_CHROME_CDP_URL || "http://127.0.0.1:9222",
    screenshotDir: process.env.NORMAN_ORDER_SCREENSHOT_DIR || "tmp/norman-order-drafts",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--task-id") result.taskId = argv[++index] || "";
    else if (arg.startsWith("--task-id=")) result.taskId = arg.slice(10);
    else if (arg === "--manufacturer") result.manufacturer = argv[++index] || result.manufacturer;
    else if (arg.startsWith("--manufacturer=")) result.manufacturer = arg.slice(15);
    else if (arg === "--serve") result.serve = true;
    else if (arg === "--bridge-port") result.bridgePort = Number(argv[++index] || result.bridgePort);
    else if (arg === "--cdp-url") result.cdpUrl = argv[++index] || result.cdpUrl;
    else if (arg === "--screenshot-dir") result.screenshotDir = argv[++index] || result.screenshotDir;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(result.bridgePort) || result.bridgePort < 1024 || result.bridgePort > 65535) {
    throw new Error("Manufacturer bridge port must be an integer between 1024 and 65535.");
  }
  result.manufacturer = manufacturerLabel(result.manufacturer);
  return result;
}

function assertSafePlan(task) {
  const plan = task.payload;
  if (task.manufacturer === "Norman") {
    if (!plan || plan.adapter !== "norman_roller" || plan.safety !== "saved_draft_only" || !plan.ready) {
      throw new Error("Task payload is not a ready Norman Roller saved-draft plan.");
    }
    if (!Array.isArray(plan.lines) || !plan.lines.length) throw new Error("Task contains no Norman Roller lines.");
    if ((plan.portalSequence || []).some((step) => BLOCKED_ACTION.test(String(step)))) {
      throw new Error("Task payload contains a forbidden final-order action.");
    }
    return;
  }
  if (task.manufacturer === "Onyx") {
    const packets = Array.isArray(plan?.onyxPackets) ? plan.onyxPackets : [];
    if (packets.length !== 1) {
      throw new Error("Onyx automatic entry currently requires one exactly routed product packet.");
    }
    const packet = packets[0];
    if (packet.status !== "READY" || packet.allowedAction !== "draft_entry_only" || !packet.portalMaterial) {
      throw new Error("The Onyx product-to-portal material mapping must be verified before automatic entry.");
    }
    if (!Array.isArray(packet.lines) || !packet.lines.length) throw new Error("Task contains no Onyx shutter lines.");
    if (packet.lines.some((line) => line.frenchDoor || line.specialtyReference || line.extension)) {
      throw new Error("French-door, specialty-shape, and extension Onyx lines require additional verified portal fields before automatic entry.");
    }
    return;
  }
  throw new Error(`${task.manufacturer} automatic draft entry is not yet verified. The ordering queue has been opened for manual review.`);
}

async function claimTask(taskId, manufacturer) {
  const result = await workerRequest({ action: "claim", taskId: taskId || undefined, manufacturer });
  return result.task || null;
}

async function preparePortalDraft(task, context) {
  if (task.manufacturer === "Onyx") return prepareOnyxPortalDraft(task, context);
  fs.mkdirSync(args.screenshotDir, { recursive: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  const report = [];
  page.on("dialog", async (dialog) => {
    const message = dialog.message();
    report.push({ field: "portal.dialog", status: "dismissed", message });
    await dialog.dismiss();
  });
  await page.goto(ROLLER_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const passwordFieldCount = await page.locator('input[type="password"]').count();
  if (passwordFieldCount || !/\/Login\/RollerShadesRR\//i.test(page.url())) {
    throw new Error("The attached Chrome session is no longer logged into the authorized Norman RA00743 dealer account.");
  }
  try {
    await clickSafe(page.locator('input[value*="Add New Order"], button:has-text("Add New Order")').first(), "add_new_order");
    await waitLoaded(page);
    await fillNamed(page, "txtPO", task.payload.header.poNumber);
    await fillNamed(page, "txtSMark", task.payload.header.sideMark);
    await selectRequired(page, task.payload.header.leadTimeCode, ["LeadTime", "leadtime"], "lead_time", report);
    await selectRequired(page, task.payload.header.shipViaCode, ["ShipVia", "shipvia"], "ship_via", report);
    await verifyShipTo(page, task.payload.header.shipToProfileId, report);
    await clickContinue(page, "header");

    for (let index = 0; index < task.payload.lines.length; index += 1) {
      if (index > 0) await openNextLine(page);
      await fillLine(page, task.payload.lines[index], report);
      await clickContinue(page, `line_${index + 1}`);
    }

    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (!/order\s+queue|order\s+information|order\s+detail|shopping\s+cart|review/i.test(bodyText)) {
      throw new Error("Norman did not return to a recognizable saved-draft review screen.");
    }
    const portalDraftId = extractDraftId(page.url(), bodyText);
    const screenshotPath = path.resolve(args.screenshotDir, `${safeName(task.payload.header.poNumber)}-${Date.now()}-review.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      portalDraftId,
      screenshotPath,
      review: { url: page.url(), title: await page.title(), capturedAt: new Date().toISOString(), report, safety: "saved_draft_only" },
    };
  } catch (error) {
    report.push({ field: "automation", status: "failed", message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function prepareOnyxPortalDraft(task, context) {
  fs.mkdirSync(args.screenshotDir, { recursive: true });
  const packet = task.payload.onyxPackets[0];
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  const report = [];
  page.on("dialog", async (dialog) => {
    report.push({ field: "portal.dialog", status: "dismissed", message: dialog.message() });
    await dialog.dismiss();
  });
  await page.goto(PORTAL_URLS.Onyx, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (await page.locator('input[type="password"]:visible').count()) {
    await page.bringToFront();
    throw new Error("LOGIN_REQUIRED: Sign into Onyx in the opened manufacturer tab, then press Run Ordering Agent again.");
  }
  const poNumber = String(packet.header?.poNumber || packet.source?.quoteNumber || "").trim();
  if (!poNumber) throw new Error("Onyx automatic entry requires a stable quote or PO number.");
  if (await page.getByText(poNumber, { exact: true }).count()) {
    throw new Error(`An Onyx draft already exists for PO ${poNumber}. Open and review that draft instead of creating a duplicate.`);
  }

  await clickSafe(
    page.locator('input[value*="Add New Order"], button:has-text("Add New Order")').first(),
    "onyx.add_new_order",
  );
  await waitLoaded(page);
  await selectById(page, "ctl00_mainCopy_dwnMaterial", packet.header.materialCategory, "material_category");
  await fillById(page, "ctl00_mainCopy_txtSideMark", packet.header.sideMark);
  await fillById(page, "ctl00_mainCopy_txtPONo", poNumber);
  await setOnyxCheckbox(page, "#ctl00_mainCopy_ckbRushOrder_0", packet.header.rushOrder);
  await fillById(page, "ctl00_mainCopy_txtNote", packet.header.orderNote || "");
  await selectById(page, "ctl00_mainCopy_dvShipTo_dwnCustID", packet.header.shipToName, "ship_to");
  await fillById(page, "ctl00_mainCopy_txtShipNote", packet.header.shipNote || "");
  await clickSafe(page.locator("#ctl00_mainCopy_btnSelect"), "onyx.header.next");
  await waitLoaded(page);

  for (let index = 0; index < packet.lines.length; index += 1) {
    if (index > 0) {
      await clickSafe(
        page.locator('input[value*="Add New Item"], input[value*="Add Item"], button:has-text("Add New Item"), button:has-text("Add Item")').first(),
        "onyx.add_item",
      );
      await waitLoaded(page);
    }
    await fillOnyxLine(page, packet.lines[index], report);
    await clickSafe(page.locator("#ctl00_mainCopy_Button1"), `onyx.line_${index + 1}.save`);
    await waitLoaded(page);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (!/Add New Item|Order Detail|Order Information|Room/i.test(bodyText)) {
    throw new Error("Onyx did not return to a recognizable saved-draft review screen.");
  }
  const portalDraftId = extractDraftId(page.url(), bodyText);
  const screenshotPath = path.resolve(args.screenshotDir, `${safeName(poNumber)}-${Date.now()}-onyx-review.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return {
    portalDraftId,
    screenshotPath,
    review: {
      url: page.url(),
      title: await page.title(),
      capturedAt: new Date().toISOString(),
      report,
      safety: "saved_draft_only",
      manufacturer: "Onyx",
      lineCount: packet.lines.length,
    },
  };
}

async function fillOnyxLine(page, line, report) {
  await selectById(page, "ctl00_mainCopy_dwnMaterialID", line.material, "material", true);
  await selectById(page, "ctl00_mainCopy_dwnShape", line.shutterType, "shutter_type", true);
  await selectById(page, "ctl00_mainCopy_dwnFrameType", line.frameType, "frame_type", true);
  await selectOnyxRadio(page, "ctl00$mainCopy$rdWidthType", line.widthType === "Window Size" ? "W" : "F", "width_type");
  await selectById(page, "ctl00_mainCopy_dwnFrameNum", line.frameNo, "frame_number");
  await selectById(page, "ctl00_mainCopy_dwnColor", line.color, "color");
  await selectOnyxRadioLabel(page, "ctl00$mainCopy$rdLouver", line.louver, "louver");
  await selectOnyxRadio(page, "ctl00$mainCopy$rdHingeColor", ({
    "Antique Brass": "Antique",
    "Bright Brass": "Bright",
    Nickle: "Nickle",
    Black: "BLK",
    "Paint to Match": "Match",
  })[line.hingeColor] || line.hingeColor, "hinge_color");
  await selectOnyxRadio(page, "ctl00$mainCopy$rdStile", line.stile === "Astragal" ? "A" : "R", "stile");
  await selectOnyxRadio(page, "ctl00$mainCopy$rdTiltRod", ({
    Center: "C",
    "Hidden1 (Notch on Stile)": "H1",
    "Hidden2 (Notch on Louver)": "H2",
    Hidden3: "H3",
    "Off Set": "O",
  })[line.tiltRod], "tilt_rod");
  await selectOnyxRadio(page, "ctl00$mainCopy$rdLiberty", line.libertyArch ? "Y" : "N", "liberty_arch");
  for (const [index, label] of ["Hidden Hinge", "Raised Panel", "Flush Rail", "Solid Flat Panel"].entries()) {
    await setOnyxCheckbox(page, `#ctl00_mainCopy_cblOptions_${index}`, line.otherOptions.includes(label));
  }
  await fillById(page, "ctl00_mainCopy_txtRoom", line.room);
  await fillOnyxDimension(page, line.widthA, "#ctl00_mainCopy_txtWidth1", "#ctl00_mainCopy_dwnWidth1", "width");
  await fillOnyxDimension(page, line.heightB, "#ctl00_mainCopy_txtHeightB", "#ctl00_mainCopy_dwnHeightB", "height");
  await fillById(page, "ctl00_mainCopy_txtConfigID", line.panelConfig);
  await fillFirstOnyx(page, ['input[name*="txtQty"]', 'input[name*="OrderQty"]', 'input[type="number"]'], String(line.portalLineQuantity), "quantity");
  await fillById(page, "ctl00_mainCopy_txtItemNote", line.itemNote || "");
  await selectOnyxRadio(page, "ctl00$mainCopy$rdWindowType", ({
    Single: "Single",
    "Corner Left": "CornerL",
    "Corner Right": "CornerR",
    Bay: "Bay",
    "French Door No Cutout": "FD NoCutout",
    "Side By Side": "S By S",
  })[line.windowType], "window_type");
  await selectOnyxRail(page, "ctl00$mainCopy$rdDividerRail", line.dividerRail, line.dividerPosition, "divider_rail");
  await selectOnyxRail(page, "ctl00$mainCopy$rdSplitRod", line.splitTiltRod, line.splitPosition, "split_tilt_rod");
  await selectOnyxRadio(page, "ctl00$mainCopy$rdScribe", line.scribe ? "Y" : "N", "scribe");
  await selectOnyxRadio(page, "ctl00$mainCopy$rdExtension", line.extension ? "Y" : "N", "extension");
  await selectOnyxRadio(page, "ctl00$mainCopy$rdDoubleHung", line.doubleHung ? "Y" : "N", "double_hung");
  await selectOnyxRadio(page, "ctl00$mainCopy$rdMotor", line.motor ? "Y" : "N", "motor");
  report.push({
    field: `line_${line.lineNumber}`,
    status: "filled",
    room: line.room,
    source_opening_id: line.sourceOpeningId,
  });
}

async function fillOnyxDimension(page, value, wholeSelector, fractionSelector, field) {
  if (!value || !Number.isFinite(Number(value.whole))) throw new Error(`Onyx ${field} is missing.`);
  const whole = page.locator(wholeSelector);
  const fraction = page.locator(fractionSelector);
  if (!await whole.count() || !await fraction.count()) throw new Error(`Onyx ${field} controls were not found.`);
  await whole.fill(String(value.whole));
  const option = await optionMatch(fraction, value.fraction || "", false);
  if (!option) throw new Error(`Onyx ${field} fraction ${value.fraction || "blank"} was not found.`);
  await fraction.selectOption({ value: option.value });
}

async function fillById(page, id, value) {
  const target = page.locator(`#${id}`);
  if (!await target.count()) throw new Error(`Onyx field ${id} was not found.`);
  await target.fill(String(value ?? ""));
}

async function selectById(page, id, wanted, field, wait = false) {
  if (wanted === null || wanted === undefined || wanted === "") throw new Error(`Onyx ${field} is missing.`);
  const target = page.locator(`#${id}`);
  if (!await target.count()) throw new Error(`Onyx ${field} field was not found.`);
  const option = await optionMatch(target, wanted, false);
  if (!option) throw new Error(`Onyx ${field} option ${wanted} was not found.`);
  await target.selectOption({ value: option.value });
  if (wait) await waitLoaded(page, 8_000);
}

async function fillFirstOnyx(page, selectors, value, field) {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (!await target.count()) continue;
    await target.fill(String(value ?? ""));
    return;
  }
  throw new Error(`Onyx ${field} field was not found.`);
}

async function selectOnyxRadio(page, name, value, field) {
  if (value === null || value === undefined || value === "") throw new Error(`Onyx ${field} is missing.`);
  const target = page.locator(`input[type="radio"][name="${name}"][value="${value}"]`).first();
  if (!await target.count()) throw new Error(`Onyx ${field} choice ${value} was not found.`);
  await target.check({ force: true });
  if (!await target.isChecked()) throw new Error(`Onyx ${field} choice did not stay selected.`);
}

async function selectOnyxRadioLabel(page, name, wanted, field) {
  if (wanted === null || wanted === undefined || wanted === "") throw new Error(`Onyx ${field} is missing.`);
  const matches = [];
  for (const radio of await page.locator(`input[type="radio"][name="${name}"]`).all()) {
    const id = await radio.getAttribute("id");
    const label = id ? page.locator(`label[for="${id}"]`) : null;
    const labelText = label && await label.count() ? await label.first().innerText() : "";
    if (normalized(labelText) === normalized(wanted)) matches.push(radio);
  }
  if (matches.length !== 1) throw new Error(`Onyx ${field} choice ${wanted} was ${matches.length ? "ambiguous" : "not found"}.`);
  await matches[0].check({ force: true });
}

async function selectOnyxRail(page, name, wanted, position, field) {
  await selectOnyxRadioLabel(page, name, wanted, field);
  if (normalized(wanted) !== "custom") return;
  if (!position || !Number.isFinite(Number(position.whole))) throw new Error(`Onyx custom ${field} position is missing.`);
  const formatted = `${position.whole}${position.fraction ? ` ${position.fraction}` : ""}`;
  await fillFirstOnyx(
    page,
    [`input[name*="${name.includes("Divider") ? "Divider" : "Split"}"][type="text"]`],
    formatted,
    `${field}_position`,
  );
}

async function setOnyxCheckbox(page, selector, checked) {
  const target = page.locator(selector);
  if (!await target.count()) throw new Error(`Onyx checkbox ${selector} was not found.`);
  await target.setChecked(Boolean(checked));
}

async function authenticatedManufacturerContext(manufacturer) {
  if (!connectedBrowser?.isConnected()) {
    try {
      connectedBrowser = await chromium.connectOverCDP(args.cdpUrl);
    } catch {
      throw new Error(`Chrome is not available at ${args.cdpUrl}. Start the manufacturer-order Chrome session, then sign into ${manufacturer} before trying again.`);
    }
  }
  const portalUrl = PORTAL_URLS[manufacturer];
  if (!portalUrl) throw new Error("The manufacturer ordering queue is not configured.");
  for (const context of connectedBrowser.contexts()) {
    const probe = await context.newPage();
    let leaveOpenForLogin = false;
    try {
      await probe.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const body = await probe.locator("body").innerText().catch(() => "");
      const passwordFields = await probe.locator('input[type="password"]:visible').count();
      if (manufacturer === "Norman" && !passwordFields && /RA00743|RA-007-43|MIKE\s+SHEPARD/i.test(body)) return context;
      if (manufacturer === "Onyx" && !passwordFields && /ORDER\s+lIST|Add New Order|Log out/i.test(body)) return context;
      if ((manufacturer === "Lotus" || manufacturer === "Polar") && !passwordFields && !/log\s*in|sign\s*in/i.test(body)) return context;
      leaveOpenForLogin = true;
      await probe.bringToFront();
      throw new Error(`LOGIN_REQUIRED: Sign into ${manufacturer} in the opened manufacturer tab, then press Run Ordering Agent again.`);
    } finally {
      if (!leaveOpenForLogin) await probe.close().catch(() => {});
    }
  }
  throw new Error(`LOGIN_REQUIRED: Sign into ${manufacturer} in the manufacturer-order Chrome window, then press Run Ordering Agent again.`);
}

async function fillLine(page, line, report) {
  await selectRoom(page, line.room, report);
  await fillNamed(page, "txtBlindLoca", line.room);
  await fillEighths(page, line.widthEighths, "PdWidth1", "cmbwidth");
  await fillEighths(page, line.lengthEighths, "PdLeng1", "cmbLeng");
  await checkNamed(page, "MountType", line.mountCode);
  await checkNamed(page, "Isdoor", line.installationCode);
  await checkNamed(page, "BlindNum", line.shadeTypeCode);

  await selectNamedExact(page, "dplClothBrand1", line.fabric.type);
  await waitLoaded(page, 4_000);
  await selectNamedExact(page, "dplFabricOpenness11", line.fabric.collection);
  await waitLoaded(page, 4_000);
  await selectNamedExact(page, "dplColor", line.fabric.colorCode, true);

  await chooseUniqueValue(page, line.liftCode, "lift_system");
  await chooseUniqueValue(page, line.valanceCode, "valance");
  await chooseUniqueValue(page, line.hemBarCode, "hem_bar");
  if (line.chainCode) await chooseUniqueValue(page, line.chainCode, "chain_type");
  if (line.motorCode) await chooseUniqueValue(page, line.motorCode, "motor_type");

  await checkNamed(page, "IsFabricRoll", line.portalDetails.rollTypeCode);
  await checkNamed(page, "BracketType", line.portalDetails.bracketTypeCode);
  await checkNamed(page, "chkRaceway", line.portalDetails.racewayCode);
  await checkNamed(page, "LightGuard360YN", line.portalDetails.lightGuardCode);
  await checkNamed(page, "HoldDownBracket", line.portalDetails.holdDownsCode);
  if (line.portalDetails.controlSide) await selectUniqueLabel(page, line.portalDetails.controlSide, "control_side");
  if (line.portalDetails.chainLengthType) await selectUniqueLabel(page, line.portalDetails.chainLengthType, "chain_length_type");
  if (line.portalDetails.holdDownColor) await selectUniqueLabel(page, line.portalDetails.holdDownColor, "hold_down_color");
  await fillNamed(page, "OrderQty", String(line.quantity));
  await fillNamed(page, "LineNote", line.specialInstructions || "");
  report.push({ field: `line_${line.sequence}`, status: "filled", source_line_id: line.lineId });
}

async function selectRoom(page, room, report) {
  const roomSelect = page.locator('select[name="txtroomsel"]').first();
  const options = await roomSelect.locator("option").allTextContents();
  const exact = options.find((option) => normalized(option) === normalized(room));
  if (exact) await roomSelect.selectOption({ label: exact });
  else {
    const other = options.find((option) => normalized(option) === "other");
    if (!other) throw new Error(`${room}: Norman room option could not be mapped.`);
    await roomSelect.selectOption({ label: other });
    await fillNamed(page, "cmbRoom", room);
  }
  report.push({ field: "room", status: "selected", value: room });
}

async function fillEighths(page, total, wholeName, fractionName) {
  const whole = Math.floor(total / 8);
  const remainder = total % 8;
  await fillNamed(page, wholeName, String(whole));
  if (remainder) await selectNamedExact(page, fractionName, `${remainder}/8` === "2/8" ? "1/4" : `${remainder}/8` === "4/8" ? "1/2" : `${remainder}/8` === "6/8" ? "3/4" : `${remainder}/8`);
}

async function fillNamed(page, name, value) {
  const target = page.locator(`input[name="${name}"], textarea[name="${name}"]`).first();
  if (!await target.count()) throw new Error(`Norman field ${name} was not found.`);
  await target.fill(String(value));
}

async function checkNamed(page, name, value) {
  const target = page.locator(`input[type="radio"][name="${name}"][value="${value}"]`).first();
  if (!await target.count()) throw new Error(`Norman choice ${name}=${value} was not found.`);
  await target.check({ force: true });
  if (!await target.isChecked()) throw new Error(`Norman choice ${name}=${value} did not stay selected.`);
}

async function selectNamedExact(page, name, wanted, contains = false) {
  const select = page.locator(`select[name="${name}"]`).first();
  if (!await select.count()) throw new Error(`Norman select ${name} was not found.`);
  const option = await optionMatch(select, wanted, contains);
  if (!option) throw new Error(`Norman ${name} option ${wanted} was not found.`);
  await select.selectOption({ value: option.value });
}

async function selectRequired(page, wanted, names, field, report) {
  for (const name of names) {
    const select = page.locator(`select[name="${name}"], select[id="${name}"]`).first();
    if (!await select.count()) continue;
    const option = await optionMatch(select, wanted, false);
    if (!option) throw new Error(`Norman ${field} option ${wanted} was not found.`);
    await select.selectOption({ value: option.value });
    report.push({ field, status: "selected", value: wanted });
    return;
  }
  const candidates = await selectsWithOption(page, wanted, false);
  if (candidates.length !== 1) throw new Error(`Norman ${field} control for ${wanted} was ${candidates.length ? "ambiguous" : "not found"}.`);
  await candidates[0].select.selectOption({ value: candidates[0].option.value });
  report.push({ field, status: "selected", value: wanted });
}

async function verifyShipTo(page, expected, report) {
  if (!expected) throw new Error("The expected Norman ship-to marker is not configured.");
  const body = normalized(await page.locator("body").innerText());
  if (!body.includes(normalized(expected))) throw new Error(`Expected Norman ship-to marker ${expected} is not visible on the order header.`);
  report.push({ field: "ship_to_profile", status: "verified_visible", value: expected });
}

async function chooseUniqueValue(page, wanted, field) {
  if (wanted === "") return;
  const radios = page.locator(`input[type="radio"][value="${wanted}"]:visible`);
  if (await radios.count() === 1) {
    await radios.first().check({ force: true });
    return;
  }
  const candidates = await selectsWithOption(page, wanted, false);
  if (candidates.length !== 1) throw new Error(`Norman ${field} value ${wanted} was ${candidates.length ? "ambiguous" : "not found"}.`);
  await candidates[0].select.selectOption({ value: candidates[0].option.value });
}

async function selectUniqueLabel(page, wanted, field) {
  const candidates = await selectsWithOption(page, wanted, false);
  if (candidates.length !== 1) throw new Error(`Norman ${field} choice ${wanted} was ${candidates.length ? "ambiguous" : "not found"}.`);
  await candidates[0].select.selectOption({ value: candidates[0].option.value });
}

async function selectsWithOption(page, wanted, contains) {
  const selects = await page.locator("select:visible").all();
  const matches = [];
  for (const select of selects) {
    const option = await optionMatch(select, wanted, contains);
    if (option) matches.push({ select, option });
  }
  return matches;
}

async function optionMatch(select, wanted, contains) {
  const options = await select.evaluate((element) => Array.from(element.options).map((option) => ({ value: option.value, text: option.textContent || "" })));
  const key = normalized(wanted);
  return options.find((option) => normalized(option.value) === key || normalized(option.text) === key)
    || (contains ? options.find((option) => normalized(option.text).includes(key)) : null);
}

async function clickContinue(page, field) {
  const control = page.locator('input[value="Continue"], button:has-text("Continue")').first();
  await clickSafe(control, `${field}.continue`);
  await waitLoaded(page);
}

async function openNextLine(page) {
  const control = page.locator('input[value*="Add New Item"], input[value*="Add Item"], button:has-text("Add Item")').first();
  await clickSafe(control, "add_item");
  await waitLoaded(page);
}

async function clickSafe(locator, field) {
  if (!await locator.count()) throw new Error(`Norman ${field} control was not found.`);
  const text = `${await locator.textContent().catch(() => "")} ${await locator.getAttribute("value").catch(() => "")}`.trim();
  if (BLOCKED_ACTION.test(text)) throw new Error(`Blocked forbidden Norman action: ${text}`);
  await locator.click();
}

async function waitLoaded(page, timeout = 30_000) {
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});
}

function extractDraftId(url, body) {
  const fromUrl = url.match(/[?&](?:BLSession|sessionid|orderid)=([^&]+)/i)?.[1];
  const fromBody = body.match(/(?:draft|session|order)\s*(?:#|number|id|:)\s*([A-Z0-9-]+)/i)?.[1];
  return fromUrl || fromBody || null;
}

async function serveBridge() {
  const server = http.createServer((request, response) => {
    void handleBridgeRequest(request, response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(args.bridgePort, "127.0.0.1", resolve);
  });
  console.log(`Manufacturer review-only order bridge ready at http://127.0.0.1:${args.bridgePort}.`);
  console.log(`Chrome debugger: ${args.cdpUrl}. Sign into each manufacturer in that Chrome session before using the CRM button.`);
  await new Promise(() => {});
}

async function handleBridgeRequest(request, response) {
  try {
    if (!isLoopbackAddress(request.socket.remoteAddress)) {
      return sendText(response, 403, "Loopback requests only.");
    }
    const url = new URL(request.url || "/", `http://127.0.0.1:${args.bridgePort}`);
    if (request.method !== "GET") return sendText(response, 405, "GET required.");
    if (url.pathname === "/health") {
      return sendJson(response, 200, { ok: true, safety: "saved_draft_only", cdpUrl: args.cdpUrl });
    }
    if (url.pathname === "/status") {
      const taskId = url.searchParams.get("taskId") || "";
      const manufacturer = manufacturerLabel(url.searchParams.get("manufacturer") || "Norman");
      const run = bridgeRuns.get(`${manufacturer}:${taskId}`);
      return sendJson(response, run ? 200 : 404, run || { status: "unknown", message: "This local run was not found." });
    }
    if (url.pathname !== "/start") return sendText(response, 404, "Not found.");
    const taskId = url.searchParams.get("taskId") || "";
    const manufacturer = manufacturerLabel(url.searchParams.get("manufacturer") || "");
    if (!TASK_ID_PATTERN.test(taskId)) return sendText(response, 400, "The queued task identifier is invalid.");
    const runKey = `${manufacturer}:${taskId}`;
    const currentRun = bridgeRuns.get(runKey);
    if (!currentRun || ["failed", "skipped", "login_required"].includes(currentRun.status)) {
      bridgeRuns.set(runKey, { status: "starting", message: `Checking the logged-in ${manufacturer} browser session before claiming the queued task.` });
      setTimeout(() => void runBridgeTask(taskId, manufacturer), 0);
    }
    return sendBridgePage(response, taskId, manufacturer);
  } catch (error) {
    return sendText(response, 500, error instanceof Error ? error.message : "The local manufacturer bridge failed.");
  }
}

async function runBridgeTask(taskId, manufacturer) {
  const runKey = `${manufacturer}:${taskId}`;
  try {
    bridgeRuns.set(runKey, { status: "running", message: `Preparing the ${manufacturer} saved draft. No final-order controls are permitted.` });
    const result = await runQueuedTask(taskId, manufacturer);
    bridgeRuns.set(runKey, {
      status: result.status,
      message: result.status === "review_ready"
        ? "Saved draft ready for manual review. The order has not been placed."
        : result.message || "No queued task was claimed.",
      portalDraftId: result.portalDraftId || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : `${manufacturer} order entry failed.`;
    bridgeRuns.set(runKey, {
      status: message.startsWith("LOGIN_REQUIRED:") ? "login_required" : "failed",
      message: message.replace(/^LOGIN_REQUIRED:\s*/, ""),
    });
  }
}

function sendBridgePage(response, taskId, manufacturer) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>805 ${escapeHtml(manufacturer)} Ordering Agent</title>
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:10vh auto;padding:24px;color:#171714}main{border:1px solid #d8d5cc;border-radius:18px;padding:28px;box-shadow:0 10px 35px #0001}h1{margin-top:0}#state{font-size:1.1rem;font-weight:700}small{display:block;margin-top:24px;color:#5d5a52}</style>
</head><body><main><h1>${escapeHtml(manufacturer)} ordering agent</h1><p id="state">Starting…</p><p id="detail">Checking the active Chrome login before the queue is claimed.</p><button id="retry" type="button" hidden onclick="location.reload()">I signed in — retry</button><small>Review-only safety is enforced: this runner cannot place, submit, checkout, confirm, or finalize an order.</small></main>
<script>
const taskId=${JSON.stringify(taskId)};
const manufacturer=${JSON.stringify(manufacturer)};
async function poll(){try{const response=await fetch("/status?taskId="+encodeURIComponent(taskId)+"&manufacturer="+encodeURIComponent(manufacturer),{cache:"no-store"});const run=await response.json();document.querySelector("#state").textContent=String(run.status||"working").replaceAll("_"," ");document.querySelector("#detail").textContent=run.message||"Working…";document.querySelector("#retry").hidden=run.status!=="login_required";if(!["review_ready","failed","skipped","login_required"].includes(run.status))setTimeout(poll,1000)}catch{document.querySelector("#detail").textContent="The local runner status could not be read.";setTimeout(poll,2000)}}poll();
</script></body></html>`);
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(value));
}

function sendText(response, status, value) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(value);
}

function isLoopbackAddress(value) {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

async function workerRequest(body) {
  const url = process.env.MANUFACTURER_ORDER_WORKER_URL || "https://www.805shutters.com/api/crm/manufacturer-order-worker";
  const secret = process.env.MANUFACTURER_ORDER_WORKER_SECRET
    || process.env.NORMAN_ORDER_WORKER_SECRET
    || keychain("805-norman-worker-secret", "order-drafts");
  if (!secret) throw new Error("Manufacturer order worker secret is not configured in the environment or macOS Keychain.");
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.message === "string" ? result.message : `Manufacturer worker API failed with HTTP ${response.status}.`);
  return result;
}

function keychain(service, account) {
  if (process.platform !== "darwin") return "";
  try {
    return execFileSync("security", ["find-generic-password", "-a", account, "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return ""; }
}

function normalized(value) {
  return String(value ?? "").toLowerCase().replace(/[™®]/g, "").replace(/[-_.,:;()[\]'\"]/g, " ").replace(/\s+/g, " ").trim();
}

function manufacturerLabel(value) {
  const match = Object.keys(PORTAL_URLS).find((item) => item.toLowerCase() === String(value || "").trim().toLowerCase());
  if (!match) throw new Error("The manufacturer ordering queue is not configured.");
  return match;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeName(value) {
  return String(value || "manufacturer-order").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
