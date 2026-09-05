import { expect, test, devices, type Page } from "@playwright/test";
import type { TechnicalMeasureForm, TechnicalMeasureLineValues } from "../src/lib/crm/technical-measures";

// Isolated local fixture: all APIs and external requests are intercepted.
const baseline: TechnicalMeasureLineValues = {
  design_id: null, room: "Bedroom 1", opening_label: "A", width_in: 72, height_in: 36,
  quantity: 1, notes: "Match the existing trim.\nKeep the original valance return.",
  product_id: "faux_wood", program_id: null, fabric: "Bright White",
  details: { supplier: "Norman", slat_size: '2 1/2"', mount_type: "Inside Mount", control_side: "Right", valance: "Decorative valance with returns", catalog_source_page: "INTERNAL-DO-NOT-SHOW" },
  motorization: [], surcharges: [], discount_percent: 0,
};
function fixture(status: TechnicalMeasureForm["status"] = "submitted", sparse = false): TechnicalMeasureForm {
  const sold = sparse ? { ...baseline, fabric: null, notes: "", details: {} } : baseline;
  return {
    id: "measure-fixture", job_id: "job-fixture", quote_id: "quote-fixture", customer_id: null, contract_id: null,
    created_at: "2026-09-05T12:00:00Z", updated_at: "2026-09-05T12:00:00Z", status,
    contractUrl: sparse ? null : "/contract-fixture", customer_snapshot: { name: "Sample Customer", email: null, phone: null, address: null, city: null },
    quote_snapshot: { quoteNumber: "805-TEST", signedAt: null, adjustments: {} },
    baseline_total: 1200, current_total: 1200, technician_email: null, technician_name: null,
    submitted_at: status === "submitted" ? "2026-09-05T12:00:00Z" : null,
    meta: {}, addendum: null, changes: [], contractChanges: [], requiresAddendum: false,
    lines: [0, 1].map((index) => ({
      id: `line-${index}`, form_id: "measure-fixture", quote_line_item_id: `quote-line-${index}`, sort_order: index,
      baseline: { ...sold, room: `Bedroom ${index + 1}` },
      current_values: { ...sold, room: `Bedroom ${index + 1}`, width_in: 71.625, height_in: 35.5, fabric: "Field selection", notes: "Field note only", details: { ...sold.details, control_side: "Left" }, measure_complete: status === "submitted" },
      baseline_unit_price: 600, current_unit_price: 600, price_status: "unchanged", changes: [],
    })),
  };
}
async function setup(page: Page, form = fixture()) {
  const writes: string[] = [];
  const user = { id: "test-user", email: "local@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
  await page.addInitScript((user) => {
    localStorage.setItem("sb-measure-details-test-auth-token", JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, token_type: "bearer", user }));
  }, user);
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "measure-details-test.supabase.co") return route.fulfill({ json: user });
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) return route.abort();
    if (url.pathname === "/contract-fixture") return route.fulfill({ contentType: "text/html", body: "<h1>Original contract fixture</h1>" });
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (request.method() !== "GET") writes.push(`${request.method()} ${url.pathname}`);
    if (url.pathname.replace(/\/$/, "") === "/api/crm/technical-measures/measure-fixture" && request.method() === "GET") return route.fulfill({ json: { form } });
    return route.fulfill({ status: 404, json: { message: "Outside fixture" } });
  });
  await page.goto("/crm/technical-measures/measure-fixture/");
  await expect(page.getByRole("heading", { name: "Line items", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Technical measure line items", exact: true })).toBeVisible();
  return writes;
}
for (const size of [
  { name: "phone", options: { ...devices["iPhone 13"], defaultBrowserType: undefined } },
  { name: "ipad", options: { ...devices["iPad (gen 7) landscape"], defaultBrowserType: undefined } },
  { name: "desktop", options: { viewport: { width: 1440, height: 1000 } } },
]) {
  test(`${size.name}: exposes sold details beside field measurements without changing the contract`, async ({ browser }, testInfo) => {
    const context = await browser.newContext(size.options);
    const page = await context.newPage();
    const writes = await setup(page);
    const card = page.locator(".technical-measure-ledger-item").first();
    const details = card.getByRole("region", { name: "Original contract options" });
    await expect(details).toContainText('Contract size: 72" × 36"');
    await expect(card.locator(".technical-measure-ledger-size")).toContainText('71 5/8" × 35 1/2"');
    for (const value of ["Bright White", '2 1/2"', "Inside Mount", "Right", "Decorative valance with returns", "Match the existing trim.", "Keep the original valance return.", "Norman"]) await expect(details).toContainText(value);
    for (const value of ["Field selection", "Field note only", "INTERNAL-DO-NOT-SHOW"]) await expect(details).not.toContainText(value);
    await expect(details.getByRole("link", { name: "Open full contract" })).toHaveAttribute("href", "/contract-fixture");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await details.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${size.name}.png`), fullPage: false, scale: "css" });
    await details.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await expect(details.getByText("Keep the original valance return.", { exact: false })).toBeInViewport({ ratio: 1 });
    await details.screenshot({ path: testInfo.outputPath(`${size.name}-details.png`), scale: "css" });
    await card.getByRole("button", { name: "Open field measure for Bedroom 1 · A" }).click();
    await expect(page.getByRole("region", { name: "Original contract options" }).first()).toContainText("Bright White");
    await expect(page.getByRole("button", { name: "Submit line item", exact: true }).first()).toBeDisabled();
    await page.getByRole("button", { name: "Back to line items", exact: true }).first().click();
    await expect(card).toBeVisible();
    expect(writes).toEqual([]);
    await context.close();
  });
}
test("draft with sparse contract details remains navigable without empty links", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const writes = await setup(page, fixture("draft", true));
  const card = page.locator(".technical-measure-ledger-item").first();
  await expect(card).toContainText("Needs measure");
  await expect(card).toContainText("Faux Wood Blinds");
  await expect(card.getByRole("link", { name: "Open full contract" })).toHaveCount(0);
  await expect(card).not.toContainText("undefined");
  await card.getByRole("button").click();
  await expect(page.getByRole("button", { name: "Submit line item", exact: true }).first()).toBeEnabled();
  expect(writes).toEqual([]);
});

test("motorized contract includes named program and selected accessories with quantities", async ({ page }) => {
  const form = fixture();
  const line = form.lines[0];
  line.baseline = { ...baseline, product_id: "roller", program_id: "roller_cordless_fabric_price_group_1_pg1",
    motorization: [{ groupId: "automate_home", optionId: "motor_rechargeable_battery_pack_or_ac_adapter", units: 2 }],
    surcharges: [{ id: "dual_shade", units: 2 }],
  };
  const writes = await setup(page, form);
  const details = page.locator(".technical-measure-ledger-item").first().getByRole("region", { name: "Original contract options" });
  await expect(details).toContainText("Cordless Fabric - Price Group 1");
  await expect(details).toContainText("Motorization");
  await expect(details).toContainText("Motor (Rechargeable Battery Pack or AC Adapter) × 2");
  await expect(details).toContainText("Dual shade × 2");
  expect(writes).toEqual([]);
});
