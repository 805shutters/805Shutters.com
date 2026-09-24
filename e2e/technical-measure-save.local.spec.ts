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
async function setup(page: Page, form = fixture("draft")) {
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
    if (url.pathname.replace(/\/$/, "") === "/api/crm/technical-measures/measure-fixture" && request.method() === "PATCH") {
      const payload = request.postDataJSON();
      form.lines = form.lines.map(line => ({ ...line, current_values: payload.lines.find((item: { id: string }) => item.id === line.id).currentValues }));
      return route.fulfill({ json: { form } });
    }
    return route.fulfill({ status: 404, json: { message: "Outside fixture" } });
  });
  await page.goto("/crm/technical-measures/measure-fixture/");
  await expect(page.getByRole("heading", { name: "Line items", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Technical measure line items", exact: true })).toBeVisible();
  return writes;
}

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 820, height: 1180 }, { width: 1440, height: 1000 }]) {
  test(`${viewport.width}: all fractions fit and save advances after height`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 1000, hasTouch: true });
    const page = await context.newPage();
    const form = fixture("draft");
    // Cover both shutter configuration and shade control-side destinations.
    if (viewport.width !== 820) form.lines.forEach(line => {
      line.baseline.product_id = "norman_shutters";
      line.current_values.product_id = "norman_shutters";
    });
    const writes = await setup(page, form);
    await page.getByRole("button", { name: "Open field measure for Bedroom 1 · A" }).click();
    await page.getByRole("button", { name: "Select width", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    const fractions = dialog.getByRole("group", { name: "width fractions", exact: true });
    await expect(fractions.getByRole("button")).toHaveCount(16);
    for (const label of ["Even", "1/16", "1/8", "3/16", "1/4", "5/16", "3/8", "7/16", "1/2", "9/16", "5/8", "11/16", "3/4", "13/16", "7/8", "15/16"]) {
      const button = fractions.getByRole("button", { name: label, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
    await expect(dialog.getByRole("button", { name: /All (8ths|16ths)/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "9", exact: true }).click();
    await fractions.getByRole("button", { name: "3/4", exact: true }).click();
    await dialog.getByRole("button", { name: "Next: height" }).click();
    await dialog.getByRole("button", { name: "5", exact: true }).click();
    await dialog.getByRole("button", { name: "9", exact: true }).click();
    await dialog.getByRole("button", { name: "15/16", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Save size" })).toBeInViewport({ ratio: 1 });
    expect(await dialog.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(dialog.getByRole("button", { name: "15/16", exact: true })).toHaveCSS("background-color", "rgb(183, 239, 208)");
    await page.screenshot({ path: testInfo.outputPath("fractions.png"), scale: "css" });
    await dialog.getByRole("button", { name: "Save size" }).click();
    await expect(dialog).toHaveCount(0);
    const next = page.locator("#measure-next-line-0");
    await expect(next).toBeFocused();
    await expect(next).toBeInViewport({ ratio: 1 });
    expect(form.lines[0].current_values).toMatchObject({ width_in: 9.75, height_in: 59.9375, width_confirmed: true, height_confirmed: true });
    expect(writes).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath("saved-next-section.png"), scale: "css" });
    await page.reload();
    await page.getByRole("button", { name: "Open field measure for Bedroom 1 · A" }).click();
    await expect(page.getByRole("button", { name: "Select width", exact: true }).first()).toContainText("9 3/4");
    await expect(page.getByRole("button", { name: "Select height", exact: true }).first()).toContainText("59 15/16");
    await context.close();
  });
}
