import type {OwnedAction,OwnedActionChange} from "../src/lib/crm/owned-actions";
import type { InstallerOutcomeEvidence } from "../src/lib/crm/job-progress";
import { test, expect, devices, type Page } from "@playwright/test";
import { buildDashboardData } from "../src/lib/crm/backend";
import type { CrmJob, CrmQuote, CrmBookkeepingPayment, CrmBookkeepingCredit, CrmBookkeepingEntry } from "../src/lib/crm/types";

// Fully synthetic browser test. Every API request is intercepted; no customer,
// database, message, payment provider, or production auth is touched.
const email = "805shutters@gmail.com";
const stamp = "2026-09-01T12:00:00Z";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = ["Avery Sample", "Jordan Demo", "Taylor Example", "Morgan Preview", "Cameron Fixture", "Riley Test", "Sam Opportunity", "Quinn Lost"];
function fixture() {
  const jobs = names.map((name, n) => ({ id: id(n + 1), created_at: stamp, updated_at: stamp, source: "crm", lead_id: null, status: n === 6 ? "scheduled" : n === 7 ? "lost" : "sold", priority: "normal", customer_name: name, phone: "8055550100", email: `${name.split(" ")[0].toLowerCase()}@example.com`, address: "100 Example Lane, Ventura", city: "Ventura", product_interest: "Plantation shutters", sales_owner: "Jessica", next_action: "Confirm project details", next_action_due: null, appointment_start: n === 6 ? stamp : null, appointment_end: null, estimated_total: 4000, deposit_paid: 0, notes: "Synthetic local verification record", meta: n === 1 ? { measure_needed: { status: "needed", form_status: "draft" } } : {} }) as CrmJob);
  const quotes = jobs.slice(0, 6).map((job, n) => ({ id: id(n + 20), created_at: stamp, updated_at: stamp, job_id: job.id, quote_number: `805-DEMO-${n + 1}`, customer_name: job.customer_name, status: n === 2 ? "ordered" : n === 3 ? "installed" : "sold", quote_total: 4000, materials_cost: 1250, labor_cost: 0, discount: 0, tax: 0, deposit_required: 2000, balance_due: 2000, sold_by: "Jessica", sent_at: null, approved_at: null, sold_at: n === 5 ? null : `2026-08-${31 - n}T12:00:00Z`, ordered_at: n === 2 ? stamp : null, received_at: null, installed_at: n === 3 ? stamp : null, archived_at: null, manufacturer_name: n === 2 ? "Norman" : null, manufacturer_order_ref: n === 2 ? "DEMO-PO-200" : null, manufacturer_order_url: null, manufacturer_document_url: null, customer_email: job.email, customer_phone: job.phone, customer_address: job.address, share_token: `test-only-${n}`, customer_signature: null, customer_printed_name: null, signed_at: n === 5 ? null : `2026-08-${31 - n}T12:00:00Z`, quote_group_id: null, quote_label: null, meta: {}, notes: "Demo project notes" }) as CrmQuote);
  const payments = quotes.slice(1, 5).map((quote, n) => ({ id: id(n + 40), created_at: stamp, updated_at: stamp, quote_id: quote.id, job_id: quote.job_id, bookkeeping_entry_id: null, payment_label: "Deposit", payment_type: "zelle", amount: n === 3 ? 4000 : 2000, paid_at: "2026-09-01", source: "crm_quote", notes: "Sample receipt", meta: {} }) as CrmBookkeepingPayment);
  const credits: CrmBookkeepingCredit[] = [];
  quotes.push({ ...quotes[0], id: id(90), job_id: jobs[6].id, customer_name: jobs[6].customer_name, customer_email: jobs[6].email, status: "sent", sold_at: null, signed_at: null, quote_total: 20000, balance_due: 20000 });
  const entries: CrmBookkeepingEntry[] = [];
  return { jobs, quotes, payments, credits, entries, ownedActions: [] as OwnedAction[], installerOutcomes: [] as InstallerOutcomeEvidence[] };
}
async function setup(page: Page, includeLegacy = false) {
  const records = fixture();
  if (includeLegacy) records.entries.push({ id: id(300), job_id: null, quote_id: null, source: "legacy_sheet", customer_name: "Legacy Sample", sold_date: "2026-09-02", total_amount: 2000, cogs_amount: 600, payment_type: "cash", meta: { customer_email: "legacy@example.com", deposit_required: 1000 }, created_at: stamp, updated_at: stamp, installation_invoice_amount: 0, installation_match_status: "unmatched", notes: "Imported test record", sales_owner: null, sales_owner_auth_user_id: null, sales_owner_set_at: null, installation_invoice_document_id: null, installation_invoice_number: null, installation_invoice_url: null, installation_matched_at: null, jessica_commission_paid_at: null, manufacturer_name: null, manufacturer_order_ref: null, manufacturer_order_url: null, manufacturer_document_url: null, imported_sheet_row: 300, ken_cut_override: null });
  const writes: { url: string; body: Record<string, unknown> }[] = [];
  let failCogs = false;
  const user = { id: id(99), aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: stamp };
  const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, email, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 7200 })).toString("base64url"), "synthetic-signature"].join(".");
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem("sb-jobtracking-test-auth-token", JSON.stringify({ access_token: token, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, user }));
  }, { user, token });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/\/$/, "");
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      if (url.hostname === "jobtracking-test.supabase.co") return route.fulfill({ json: user });
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/crm/session") return route.fulfill({ json: { email, displayName: "Local test" } });
    if (url.pathname === "/api/crm/jobs" && route.request().method() === "GET") {
      return route.fulfill({ json: buildDashboardData({ ...records, events: [], customers: [], products: [], contracts: [], expenses: [], installationInvoiceEmails: [], kenPayments: [], openingBalance: 0, payoffTarget: 500000 }) });
    }
    if (!url.pathname.startsWith("/api/crm/")) return route.fulfill({ json: { ok: true } });
    if (route.request().method() === "GET") return route.fulfill({ status: 503, json: { message: "Activity is outside this synthetic fixture." } });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    writes.push({ url: url.pathname, body });
    if (url.pathname === "/api/crm/operations/tasks") {
      const change=body as unknown as OwnedActionChange;
      const previous=records.ownedActions.find(a=>a.id===change.id);
      if(previous && previous.revision!==change.expectedRevision) return route.fulfill({status:409,json:{message:"This action changed. Refresh and review the latest revision before saving."}});
      const action={...change.action,id:change.id,revision:(previous?.revision||0)+1,created_at:stamp,updated_at:stamp,waiting_since:stamp} as OwnedAction;
      records.ownedActions=records.ownedActions.filter(a=>a.id!==action.id).concat(action);
      return route.fulfill({json:{action}});
    }
    if (url.pathname.endsWith("/square-payment-link")) return route.fulfill({ json: { amount: body.expectedAmount, recipient: body.expectedRecipient, url: "https://square.link/test-only", email: { sent: true } } });
    if (url.pathname === "/api/crm/job-tracking/stage") {
      if (body.stage === "ordered" && body.jobId === records.jobs[1].id) return route.fulfill({ status: 409, json: { message: "Submit the required technical measure before marking this job ordered." } });
      const quote = records.quotes.find((item) => item.id === body.quoteId);
      if (quote) quote.meta = { ...quote.meta, job_tracking: { stage: body.stage } };
      return route.fulfill({ json: { auditRecorded: true } });
    }
    const entry = records.entries.find((item) => url.pathname === `/api/crm/bookkeeping/${item.id}`);
    if (entry) {
      if (body.customer_email !== undefined) entry.meta = { ...entry.meta, customer_email: body.customer_email };
      if (body.contract_signed_at) entry.meta = { ...entry.meta, job_tracking_contract: { signed_at: body.contract_signed_at, url: body.contract_url } };
      for (const key of ["ordered_at", "installed_at"]) if (body[key] !== undefined) entry.meta = { ...entry.meta, job_tracking_dates: { ...(entry.meta?.job_tracking_dates as object || {}), [key]: body[key] } };
      if (body.installed_at) { entry.installation_match_status = "matched"; entry.installation_matched_at = String(body.installed_at); }
      for (const key of ["sold_date", "cogs_amount", "notes", "manufacturer_name", "manufacturer_order_ref", "manufacturer_order_url"]) if (body[key] !== undefined) Object.assign(entry, { [key]: body[key] });
      return route.fulfill({ json: { entry } });
    }
    const quote = records.quotes.find((item) => url.pathname === `/api/crm/quotes/${item.id}`);
    if (quote) {
      if (failCogs && body.materials_cost !== undefined) return route.fulfill({ status: 502, json: { message: "Synthetic save failure; no changes written." } });
      if (body.payment_amount) records.payments.push({ ...records.payments[0], id: id(100 + writes.length), quote_id: quote.id, job_id: quote.job_id, amount: Number(body.payment_amount), payment_label: String(body.payment_label), payment_type: body.payment_type as CrmBookkeepingPayment['payment_type'], paid_at: String(body.paid_at), notes: String(body.payment_notes || "") });
      if (body.balance_due_target !== undefined) {
        const paid = records.payments.filter((item) => item.quote_id === quote.id).reduce((sum, item) => sum + item.amount, 0);
        records.credits.push({ id: id(200 + writes.length), to_quote_id: quote.id, from_quote_id: null, to_bookkeeping_entry_id: null, from_bookkeeping_entry_id: null, amount: quote.quote_total - paid - Number(body.balance_due_target), credit_date: "2026-09-03", reason: String(body.balance_adjustment_note), created_at: stamp, updated_at: stamp } as unknown as CrmBookkeepingCredit);
      }
      if (body.meta && typeof body.meta === "object") quote.meta = { ...quote.meta, ...body.meta };
      for (const key of ["materials_cost", "deposit_required", "sold_at", "signed_at", "manufacturer_name", "manufacturer_order_ref", "ordered_at", "installed_at", "notes"]) if (body[key] !== undefined) Object.assign(quote, { [key]: body[key] });
      return route.fulfill({ json: { quote } });
    }
    return route.fulfill({ status: 400, json: { error: `Unexpected synthetic write: ${url.pathname}` } });
  });
  await page.goto("/crm/?view=tracking", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Job Tracking", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Job tracking", exact: true })).toBeVisible();
  return { records, writes, failNextCogs: () => { failCogs = true; } };
}

test("full local tracking workflow: filters, sorting, edits, receipts and Square confirmation", async ({ page }) => {
  const { writes, failNextCogs } = await setup(page);
  const table = page.getByRole("table");
  await expect(page.getByText("Active order balances", { exact: true }).locator("..")).toContainText("$14,000.00");
  await expect(page.getByRole("navigation", { name: "Filter jobs by status" }).getByRole("button").first()).toHaveText("All Active7");
  await expect(page.getByRole("button", { name: /^All Active\s+7$/ })).toHaveAttribute("aria-pressed", "true");
  await expect(table.locator("tbody tr")).toHaveCount(7);
  await expect(table.locator("tbody tr").first()).toContainText("Avery Sample");
  await page.getByRole("button", { name: /^Archive\s+1$/ }).click();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("Quinn Lost");
  await page.getByRole("button", { name: /^All Active\s+7$/ }).click();
  await expect(table.locator("tbody tr")).toHaveCount(7);
  await page.getByRole("button", { name: /^Ordered\s+1$/ }).click();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("Taylor Example");
  await page.getByRole("button", { name: /^All Active\s+7$/ }).click();
  await page.getByRole("textbox", { name: "Search job tracking" }).fill("Avery");
  await page.getByRole("button", { name: "Record COGS for Avery Sample", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Record COGS", exact: true }).fill("0");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({ materials_cost: 0 });
  await page.getByRole("button", { name: "Edit required deposit for Avery Sample", exact: true }).click();
  await page.getByRole("spinbutton").fill("1500");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await table.getByRole("button", { name: "Record payment", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Amount received" }).fill("500");
  await page.getByRole("button", { name: "Record received payment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({ payment_amount: 500, payment_type: "zelle", payment_label: "Deposit payment" });
  await page.getByRole("button", { name: "Adjust outstanding balance for Avery Sample" }).click();
  await page.getByRole("spinbutton").fill("3490");
  await page.getByRole("textbox", { name: "Reason for correction" }).fill("$10 courtesy discount");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({ balance_due_target: 3490, balance_adjustment_note: "$10 courtesy discount" });
  await table.getByRole("button", { name: "Send balance link", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("$2,490.00");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes.filter((item) => item.url.endsWith("square-payment-link"))).toHaveLength(0);
  await table.getByRole("button", { name: "Send deposit link", exact: true }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm & send Square link" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({ paymentType: "deposit", expectedAmount: 1000, expectedRecipient: "avery@example.com" });
  await expect(page.getByRole("link", { name: "Open generated link" })).toHaveAttribute("href", "https://square.link/test-only");
  await page.getByRole("button", { name: /Change stage for Avery/ }).click();
  await page.getByRole("radio", { name: "Follow Up", exact: true }).check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("button", { name: /Change stage for Avery.*Deposit Needed/ })).toBeVisible();
  failNextCogs();
  await page.getByRole("button", { name: "Record COGS for Avery Sample", exact: true }).click();
  await page.getByRole("spinbutton").fill("99");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Synthetic save failure");
  await expect(page.getByRole("spinbutton")).toHaveValue("99");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("textbox", { name: "Search job tracking" }).fill("Jordan");
  await page.getByRole("button", { name: /Change stage for Jordan/ }).click();
  await page.getByRole("radio", { name: "Ordered", exact: true }).check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("required technical measure");
});

test("imported job uses its own Square ledger and editable verified contact", async ({ page }) => {
  const { writes } = await setup(page, true);
  await page.getByRole("textbox", { name: "Search job tracking" }).fill("Legacy Sample");
  const table = page.getByRole("table");
  await table.getByRole("button", { name: "Send balance link", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("legacy@example.com");
  await expect(page.getByRole("dialog")).toContainText("$1,000.00");
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm & send Square link" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.url).toBe(`/api/crm/bookkeeping/${id(300)}/square-payment-link`);
  expect(writes.at(-1)?.body).toMatchObject({ expectedAmount: 1000, expectedRecipient: "legacy@example.com", paymentType: "balance" });
  await page.getByRole("button", { name: "Record signed contract for Legacy Sample", exact: true }).click();
  await page.getByLabel("Actual date signed", { exact: true }).fill("2026-08-31");
  await page.getByRole("textbox", { name: "Signed document URL (optional)" }).fill("https://example.com/signed.pdf");
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({ contract_signed_at: "2026-08-31T12:00:00Z", contract_url: "https://example.com/signed.pdf" });
  await expect(table).toContainText("Signature recorded");
  await expect(table.getByRole("link", { name: "View contract" })).toHaveAttribute("href", "https://example.com/signed.pdf");
  await page.getByRole("button", { name: "Edit customer email for Legacy Sample", exact: true }).click();
  await page.getByRole("textbox", { name: "Verified customer email" }).fill("updated@example.com");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(table).toContainText("updated@example.com");
  await table.getByRole("button", { name: "Record order", exact: true }).click();
  await page.getByRole("textbox", { name: "Manufacturer / vendor" }).fill("Norman");
  await page.getByRole("textbox", { name: "Order reference" }).fill("DEMO-LEGACY-ORDER");
  await page.getByLabel("Order date", { exact: true }).fill("2026-09-02");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({ manufacturer_order_ref: "DEMO-LEGACY-ORDER", ordered_at: "2026-09-02T12:00:00Z" });
  await expect(table).toContainText("DEMO-LEGACY-ORDER");
  await page.getByRole("button", { name: "Record completed installation for Legacy Sample", exact: true }).click();
  await page.getByLabel("Actual installation date", { exact: true }).fill("2026-09-03");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({ installed_at: "2026-09-03T12:00:00Z" });
  await expect(table.getByRole("button", { name: "Edit sold date for Legacy Sample" })).toHaveText("Sep 2, 2026");
  expect(writes.filter((write) => write.body.payment_amount)).toHaveLength(0);
});

test("actual sold date reorders jobs and quote evidence edits preserve unrelated metadata", async ({ page }) => {
  const { writes, records } = await setup(page);
  await page.getByRole("textbox", { name: "Search job tracking" }).fill("Riley");
  await page.getByRole("button", { name: "Edit sold date for Riley Test" }).click();
  await page.getByLabel("Actual date sold", { exact: true }).fill("2026-09-03");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({ sold_at: "2026-09-03T12:00:00Z" });
  await page.getByRole("textbox", { name: "Search job tracking" }).fill("");
  await expect(page.getByRole("table").locator("tbody tr").first()).toContainText("Riley Test");
  await page.getByRole("button", { name: "Record signed contract for Riley Test" }).click();
  // Another editor changed the job after this dialog opened. Only the intended
  // contract metadata key should be sent, never an old full metadata snapshot.
  records.quotes[5].meta = { job_tracking: { stage: "ordered" }, preserved: true };
  await page.getByLabel("Actual date signed", { exact: true }).fill("2026-09-03");
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(Object.keys(writes.at(-1)?.body.meta as object)).toEqual(["job_tracking_contract"]);
  expect(records.quotes[5].meta).toMatchObject({ job_tracking: { stage: "ordered" }, preserved: true });
  await page.getByRole("button", { name: "Record completed installation for Riley Test" }).click();
  await page.getByLabel("Actual installation date", { exact: true }).fill("2026-09-03");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({ installed_at: "2026-09-03T12:00:00Z" });
  expect(writes.some((write) => write.body.payment_amount)).toBe(false);
});

test("iPad user agent stays in full CRM and edits tracking with touch", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ ...devices["iPad Pro 11"], baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3017" });
  try {
    const page = await context.newPage();
    await setup(page);
    await expect(page).toHaveURL(/\/crm\/\?view=tracking$/);
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("article")).toHaveCount(7);
    await page.getByRole("button", { name: "Record COGS for Avery Sample", exact: true }).tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("job-tracking-ipad-touch.png"), scale: "css" });
    await page.getByRole("button", { name: "Cancel", exact: true }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally { await context.close(); }
});

for (const viewport of [{ name: "desktop", width: 1728, height: 1117 }, { name: "ipad", width: 1024, height: 1366 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`local ${viewport.name} layout and keyboard dialog`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await setup(page);
    await page.getByRole("heading", { name: "Job tracking", exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`job-tracking-${viewport.name}.png`), scale: "css" });
    if (viewport.width <= 1180) {
      await expect(page.getByRole("table")).toHaveCount(0);
      await expect(page.getByRole("article")).toHaveCount(7);
      const firstCard = page.getByRole("article").first();
      expect(await firstCard.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      expect(await firstCard.getByRole("button", { name: "Avery Sample", exact: true }).evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      await firstCard.screenshot({ path: testInfo.outputPath(`job-tracking-${viewport.name}-card.png`), scale: "css" });
      await page.getByRole("heading", { name: "Job tracking", exact: true }).scrollIntoViewIfNeeded();
    } else {
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.getByRole("article")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Show details for Avery Sample" }).click();
    await expect(page.getByRole("heading", { name: "Payment history" })).toBeVisible();
    await page.getByRole("button", { name: "Edit required deposit for Avery Sample" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Search job tracking" }).fill("no matching fixture");
    await expect(page.getByText(/No jobs match this status and search/).filter({ visible: true })).toBeVisible();
  });
}

test("unsupported terminal label stays actionable and preserves all payments", async ({ page }) => {
  const { records, writes } = await setup(page);
  const originalPayments = structuredClone(records.payments);
  await page.getByRole("button", { name: /Change stage for Avery/ }).click();
  await page.getByRole("radio", { name: "Complete", exact: true }).check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("Avery Sample");
  await page.getByRole("button", { name: /^Needs Attention\s+1$/ }).click();
  await expect(page.getByRole("table")).toContainText("Recorded complete");
  expect(records.payments).toEqual(originalPayments);
  expect(writes.every((write) => write.url === "/api/crm/job-tracking/stage")).toBe(true);
});

test("mobile card records received money separately from confirmed Square requests", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { records, writes } = await setup(page);
  await page.getByRole("textbox", { name: "Search job tracking" }).fill("Avery");
  const card = page.getByRole("article").first();
  await card.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("No customer charge or message will be sent");
  await page.getByRole("spinbutton", { name: "Amount received" }).fill("500");
  await page.getByRole("button", { name: "Record received payment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toContainText("$1,500.00 due");
  expect(writes.filter((write) => write.url.endsWith("square-payment-link"))).toHaveLength(0);
  const receivedCount = records.payments.length;
  await card.getByRole("button", { name: "Send deposit link", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("$1,500.00");
  await expect(page.getByRole("dialog")).toContainText("avery@example.com");
  await page.screenshot({ path: testInfo.outputPath("job-tracking-mobile-square-confirmation.png"), scale: "css" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes.filter((write) => write.url.endsWith("square-payment-link"))).toHaveLength(0);
  await card.getByRole("button", { name: "Send deposit link", exact: true }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm & send Square link" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({ expectedAmount: 1500, expectedRecipient: "avery@example.com" });
  expect(records.payments).toHaveLength(receivedCount);
});


test("partial reports and terminal conflicts agree with operational queues", async ({ page }, testInfo) => {
  const { records, writes } = await setup(page);
  records.installerOutcomes.push({ id: id(501), job_id: records.jobs[4].id, quote_id: records.quotes[4].id, status: "partially_installed", signed_at: "2026-09-03T12:00:00Z", issues: [{ lineId: "opening-1", notInstalled: true, details: "Missing product" }], meta: { workflow: { outcome: "partially_completed", updatedAt: "2026-09-03T12:00:00Z" } } });
  records.quotes[4].meta = { job_tracking: { stage: "complete" } };
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Job tracking", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Needs Attention\s+1$/ }).click();
  await expect(page.getByRole("table")).toContainText("Cameron Fixture");
  await expect(page.getByRole("table")).toContainText("Partial / incomplete");
  await expect(page.getByRole("table")).toContainText("Paid in full");
  await page.getByRole("button", { name: "Show details for Cameron Fixture" }).click();
  await expect(page.getByRole("table")).toContainText(id(501));
  await page.screenshot({ path: testInfo.outputPath("partial-paid-attention-desktop.png"), scale: "css" });
  await page.getByRole("button", { name: /^Balance Needed\s+1$/ }).click();
  await expect(page.getByRole("table")).toContainText("Morgan Preview");
  const balanceTile = page.getByText("Completed / Balance Open", { exact: true }).locator("..");
  await expect(balanceTile).toContainText("1");
  await balanceTile.click();
  await expect(page.getByRole("region", { name: "Completed / Balance Open", exact: true })).toBeVisible();
  await expect(page.getByRole("listbox", { name: "Completed / Balance Open records" }).getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("listbox", { name: "Completed / Balance Open records" })).toContainText("Morgan Preview");
  expect(writes).toHaveLength(0);
});


test("failed refresh retains the last snapshot and recovery clears the warning", async ({ page }) => {
  const { writes } = await setup(page);
  await page.route("**/api/crm/jobs**", route => route.fulfill({ status: 503, json: { message: "Synthetic source outage" } }));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("alert").filter({ hasText: "Refresh failed" })).toBeVisible();
  await expect(page.getByText("Active order balances", { exact: true }).locator("..")).toContainText("$14,000.00");
  await page.unroute("**/api/crm/jobs**");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("alert").filter({ hasText: "Refresh failed" })).toHaveCount(0);
  expect(writes).toHaveLength(0);
});


test("owned actions retain conflicting edits and show assigned commitments", async ({page}) => {
 const {records,writes}=await setup(page);
 await page.getByRole('button',{name:'Add internal action',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('textbox',{name:'Owner',exact:true})).toHaveValue('Mike');
 await dialog.getByRole('combobox',{name:'Exact job / order'}).selectOption({index:1});
 await dialog.getByRole('textbox',{name:'Next action',exact:true}).fill('Confirm product receipt');
 await dialog.getByLabel('Due date',{exact:true}).fill('2026-09-10');
 await dialog.getByRole('button',{name:'Save action',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 const queue=page.getByRole('region',{name:'Owned next actions'});
 await expect(queue).toContainText('Confirm product receipt');
 await expect(queue).toContainText('Mike');
 await queue.getByRole('button',{name:'Review action'}).click();
 records.ownedActions[0].revision+=1;
 await dialog.getByRole('textbox',{name:'Next action',exact:true}).fill('Arrange return visit');
 await dialog.getByRole('textbox',{name:'Reason for this change'}).fill('Vendor changed delivery');
 await dialog.getByRole('button',{name:'Save action',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('This action changed');
 await expect(dialog.getByRole('textbox',{name:'Next action',exact:true})).toHaveValue('Arrange return visit');
 expect(records.ownedActions[0].title).toBe('Confirm product receipt');
 expect(writes.filter(w=>w.url==='/api/crm/operations/tasks')).toHaveLength(2);
});
