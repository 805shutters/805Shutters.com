#!/usr/bin/env node
/**
 * Claims one submitted-measure Norman Roller task and prepares a saved portal draft.
 * Safety boundary: this process cannot click checkout, submit-order, confirm-order,
 * or place-order controls. It stops at Norman's order queue/review screen.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const HOME_URL = "https://www.normanwindowcoverings.com/Login/default.asp";
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
  const result = await runQueuedTask(args.taskId);
  console.log(JSON.stringify(result, null, 2));
}

async function runQueuedTask(taskId) {
  // Verify the user's visible, authenticated Chrome session before claiming the
  // queue row. A missing debugger or logged-out portal must leave the task queued.
  const context = await authenticatedNormanContext();
  const task = await claimTask(taskId);
  if (!task) {
    return { status: "skipped", message: "No queued Norman Roller draft tasks." };
  }
  try {
    assertSafePlan(task.payload);
    const result = await preparePortalDraft(task, context);
    await workerRequest({
      action: "complete",
      formId: task.technical_measure_form_id,
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
  const result = {
    taskId: "",
    serve: false,
    bridgePort: 47635,
    cdpUrl: process.env.NORMAN_CHROME_CDP_URL || "http://127.0.0.1:9222",
    screenshotDir: process.env.NORMAN_ORDER_SCREENSHOT_DIR || "tmp/norman-order-drafts",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--task-id") result.taskId = argv[++index] || "";
    else if (arg.startsWith("--task-id=")) result.taskId = arg.slice(10);
    else if (arg === "--serve") result.serve = true;
    else if (arg === "--bridge-port") result.bridgePort = Number(argv[++index] || result.bridgePort);
    else if (arg === "--cdp-url") result.cdpUrl = argv[++index] || result.cdpUrl;
    else if (arg === "--screenshot-dir") result.screenshotDir = argv[++index] || result.screenshotDir;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(result.bridgePort) || result.bridgePort < 1024 || result.bridgePort > 65535) {
    throw new Error("Norman bridge port must be an integer between 1024 and 65535.");
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

async function preparePortalDraft(task, context) {
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

async function authenticatedNormanContext() {
  if (!connectedBrowser?.isConnected()) {
    try {
      connectedBrowser = await chromium.connectOverCDP(args.cdpUrl);
    } catch {
      throw new Error(`Chrome is not available at ${args.cdpUrl}. Start the Norman order Chrome session with remote debugging, then log into Norman before trying again.`);
    }
  }
  for (const context of connectedBrowser.contexts()) {
    const hasNormanPage = context.pages().some((page) => {
      try {
        const hostname = new URL(page.url()).hostname;
        return hostname === "normanwindowcoverings.com" || hostname.endsWith(".normanwindowcoverings.com");
      } catch {
        return false;
      }
    });
    if (!hasNormanPage) continue;
    const probe = await context.newPage();
    try {
      await probe.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const body = await probe.locator("body").innerText().catch(() => "");
      if (/RA00743|RA-007-43|MIKE\s+SHEPARD/i.test(body)) return context;
    } finally {
      await probe.close().catch(() => {});
    }
  }
  throw new Error("Log into the authorized Norman RA00743 account in the remote-debugging Chrome session before starting order entry.");
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
  console.log(`Norman review-only order bridge ready at http://127.0.0.1:${args.bridgePort}.`);
  console.log(`Chrome debugger: ${args.cdpUrl}. Log into Norman RA00743 in that Chrome session before using the CRM button.`);
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
      const run = bridgeRuns.get(taskId);
      return sendJson(response, run ? 200 : 404, run || { status: "unknown", message: "This local run was not found." });
    }
    if (url.pathname !== "/start") return sendText(response, 404, "Not found.");
    const taskId = url.searchParams.get("taskId") || "";
    if (!TASK_ID_PATTERN.test(taskId)) return sendText(response, 400, "The queued task identifier is invalid.");
    const currentRun = bridgeRuns.get(taskId);
    if (!currentRun || currentRun.status === "failed" || currentRun.status === "skipped") {
      bridgeRuns.set(taskId, { status: "starting", message: "Checking the logged-in Norman browser session before claiming the queued task." });
      setTimeout(() => void runBridgeTask(taskId), 0);
    }
    return sendBridgePage(response, taskId);
  } catch (error) {
    return sendText(response, 500, error instanceof Error ? error.message : "The local Norman bridge failed.");
  }
}

async function runBridgeTask(taskId) {
  try {
    bridgeRuns.set(taskId, { status: "running", message: "Preparing the Norman saved draft. No final-order controls are permitted." });
    const result = await runQueuedTask(taskId);
    bridgeRuns.set(taskId, {
      status: result.status,
      message: result.status === "review_ready"
        ? "Saved draft ready for manual review. The order has not been placed."
        : result.message || "No queued task was claimed.",
      portalDraftId: result.portalDraftId || null,
    });
  } catch (error) {
    bridgeRuns.set(taskId, {
      status: "failed",
      message: error instanceof Error ? error.message : "Norman order entry failed.",
    });
  }
}

function sendBridgePage(response, taskId) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>805 Norman Order Entry</title>
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:10vh auto;padding:24px;color:#171714}main{border:1px solid #d8d5cc;border-radius:18px;padding:28px;box-shadow:0 10px 35px #0001}h1{margin-top:0}#state{font-size:1.1rem;font-weight:700}small{display:block;margin-top:24px;color:#5d5a52}</style>
</head><body><main><h1>Norman saved-draft entry</h1><p id="state">Starting…</p><p id="detail">Checking the active Chrome login before the queue is claimed.</p><small>Review-only safety is enforced: this runner cannot place, submit, checkout, confirm, or finalize an order.</small></main>
<script>
const taskId=${JSON.stringify(taskId)};
async function poll(){try{const response=await fetch("/status?taskId="+encodeURIComponent(taskId),{cache:"no-store"});const run=await response.json();document.querySelector("#state").textContent=String(run.status||"working").replaceAll("_"," ");document.querySelector("#detail").textContent=run.message||"Working…";if(!["review_ready","failed","skipped"].includes(run.status))setTimeout(poll,1000)}catch{document.querySelector("#detail").textContent="The local runner status could not be read.";setTimeout(poll,2000)}}poll();
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
