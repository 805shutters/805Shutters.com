#!/usr/bin/env node
/**
 * Claims one submitted-measure Norman Roller task and prepares a saved portal draft.
 * Safety boundary: this process cannot click checkout, submit-order, confirm-order,
 * or place-order controls. It stops at Norman's order queue/review screen.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LOGIN_URL = "https://www.normanwindowcoverings.com/frontend/login.asp";
const HOME_URL = "https://www.normanwindowcoverings.com/Login/default.asp";
const ROLLER_URL = "https://www.normanwindowcoverings.com/Login/RollerShadesRR/SessionCtrl.asp?pgmcode=RR";
const BLOCKED_ACTION = /\b(check\s*out|checkout|submit\s+order|place\s+order|confirm\s+order|process\s+order|send\s+order|finalize\s+order)\b/i;
const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const task = await claimTask(args.taskId);
  if (!task) {
    console.log(JSON.stringify({ status: "skipped", message: "No queued Norman Roller draft tasks." }));
    return;
  }
  try {
    assertSafePlan(task.payload);
    const result = await preparePortalDraft(task);
    await workerRequest({
      action: "complete",
      formId: task.technical_measure_form_id,
      taskId: task.id,
      status: "review_ready",
      portalDraftId: result.portalDraftId,
      screenshotPath: result.screenshotPath,
      review: result.review,
    });
    console.log(JSON.stringify({ status: "review_ready", task_id: task.id, ...result }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await workerRequest({
      action: "complete",
      formId: task.technical_measure_form_id,
      taskId: task.id,
      status: "failed",
      errorMessage: message,
    }).catch((completionError) => {
      console.error(`Norman failure status could not be recorded: ${completionError instanceof Error ? completionError.message : String(completionError)}`);
    });
    throw error;
  }
}

function parseArgs(argv) {
  const result = { taskId: "", headed: false, screenshotDir: process.env.NORMAN_ORDER_SCREENSHOT_DIR || "tmp/norman-order-drafts" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--task-id") result.taskId = argv[++index] || "";
    else if (arg.startsWith("--task-id=")) result.taskId = arg.slice(10);
    else if (arg === "--headed") result.headed = true;
    else if (arg === "--screenshot-dir") result.screenshotDir = argv[++index] || result.screenshotDir;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function assertSafePlan(plan) {
  if (!plan || plan.adapter !== "norman_roller" || plan.safety !== "saved_draft_only" || !plan.ready) {
    throw new Error("Task payload is not a ready Norman Roller saved-draft plan.");
  }
  if (!Array.isArray(plan.lines) || !plan.lines.length) throw new Error("Task contains no Norman Roller lines.");
  if ((plan.portalSequence || []).some((step) => BLOCKED_ACTION.test(String(step)))) {
    throw new Error("Task payload contains a forbidden final-order action.");
  }
}

async function claimTask(taskId) {
  const result = await workerRequest({ action: "claim", taskId: taskId || undefined });
  return result.task || null;
}

async function preparePortalDraft(task) {
  const credentials = normanCredentials();
  if (!credentials.username || !credentials.password) throw new Error("Norman credentials are not configured in the environment or macOS Keychain.");
  fs.mkdirSync(args.screenshotDir, { recursive: true });
  const browser = await chromium.launch({ headless: !args.headed });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const report = [];
  page.on("dialog", async (dialog) => {
    const message = dialog.message();
    report.push({ field: "portal.dialog", status: "dismissed", message });
    await dialog.dismiss();
  });
  try {
    await login(page, credentials);
    await page.goto(ROLLER_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
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
  } finally {
    await browser.close();
  }
}

async function login(page, credentials) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const username = page.locator('input[type="text"], input:not([type])').first();
  const password = page.locator('input[type="password"]').first();
  await username.fill(credentials.username);
  await password.fill(credentials.password);
  await page.evaluate(() => {
    const form = document.forms.Loginform || document.querySelector("form");
    if (!form) throw new Error("Norman login form was not found.");
    form.submit();
  });
  await waitLoaded(page);
  if (!/\/Login\/default\.asp/i.test(page.url())) await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const body = await page.locator("body").innerText().catch(() => "");
  if (!/RA00743|MIKE\s+SHEPARD/i.test(body)) throw new Error("Norman login did not reach the authorized RA00743 dealer account.");
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

async function workerRequest(body) {
  const url = process.env.NORMAN_ORDER_WORKER_URL || "https://www.805shutters.com/api/crm/norman-order-worker";
  const secret = process.env.NORMAN_ORDER_WORKER_SECRET || keychain("805-norman-worker-secret", "order-drafts");
  if (!secret) throw new Error("Norman order worker secret is not configured in the environment or macOS Keychain.");
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.message === "string" ? result.message : `Norman worker API failed with HTTP ${response.status}.`);
  return result;
}

function normanCredentials() {
  return {
    username: process.env.NORMAN_USERNAME || keychain("mts-norman-username", "quote_norman_order_entry") || keychain("mts-norman-login", "username"),
    password: process.env.NORMAN_PASSWORD || keychain("mts-norman-password", "quote_norman_order_entry") || keychain("mts-norman-login", "password"),
  };
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

function safeName(value) {
  return String(value || "norman-order").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
