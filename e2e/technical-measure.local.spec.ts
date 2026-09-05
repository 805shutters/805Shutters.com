import { test, expect, type Page } from "@playwright/test";
import type { TechnicalMeasureForm } from "../src/lib/crm/technical-measures";

// Local fixtures only: intercept all APIs and prevent external traffic.
const stamp = "2026-09-05T12:00:00Z";
function fixture(): TechnicalMeasureForm {
  return {
    id: "fixture", created_at: stamp, updated_at: stamp, job_id: "job", quote_id: "quote", customer_id: "customer", contract_id: null,
    status: "draft", contractUrl: "/fixture-contract",
    customer_snapshot: { name: "Jamie Sample", address: "100 Example Lane", city: "Ventura, CA 93001", phone: "805-555-0100", email: "jamie@example.com" },
    quote_snapshot: { quoteNumber: "805-TEST", signedAt: stamp, adjustments: {} },
    baseline_total: 1600, current_total: 1600, technician_email: null, technician_name: null, submitted_at: null,
    meta: { installation_duration_minutes: 120, vendor_order_preparations: [{ manufacturer: "Norman", taskId: "test", status: "queued", message: "Packet ready for review", lineCount: 4, orderPacketUrl: "/fixture-contract" }] },
    addendum: null, changes: [], contractChanges: [], requiresAddendum: false, futureMeasures: [],
    lines: ["Living Room", "Kitchen", "Dining Room", "Office"].map((room, i) => {
      const values = { design_id: null, room, opening_label: "A", width_in: 36, height_in: 60, width_confirmed: true, height_confirmed: true, quantity: 1, notes: "", product_id: "roller", program_id: "test", fabric: "White", details: { mount_type: "Inside Mount", supplier: "Norman" }, motorization: [], surcharges: [], discount_percent: 0, measure_complete: false };
      return { id: `line-${i}`, form_id: "fixture", quote_line_item_id: `quote-${i}`, sort_order: i, baseline: structuredClone(values), current_values: values, baseline_unit_price: 400, current_unit_price: 400, price_status: "priced", changes: [], measure_schema: null };
    }),
  };
}
async function setup(page: Page, form: TechnicalMeasureForm) {
  const writes: string[] = [];
  const user = { id: "10000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "805shutters@gmail.com", app_metadata: {}, user_metadata: {}, created_at: stamp };
  const accessToken = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 7200 })).toString("base64url"), "fake"].join(".");
  await page.addInitScript(({ user, accessToken }) => localStorage.setItem("sb-jobtracking-test-auth-token", JSON.stringify({ access_token: accessToken, refresh_token: "fake", token_type: "bearer", expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, user })), { user, accessToken });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/\/$/, "");
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (url.hostname === "jobtracking-test.supabase.co") return route.fulfill({ json: user });
      return route.abort();
    }
    if (path === "/fixture-contract") return route.fulfill({ contentType: "text/html", body: "<h1>Original contract fixture</h1>" });
    if (!path.startsWith("/api/")) return route.continue();
    const method = route.request().method();
    if (method !== "GET") writes.push(`${method} ${path}`);
    if (path === "/api/crm/technical-measures/fixture") {
      if (method === "PATCH") {
        const payload = route.request().postDataJSON();
        for (const line of payload.lines || []) {
          const target = form.lines.find(item => item.id === line.id);
          if (target) target.current_values = { ...target.current_values, ...line.currentValues };
        }
      }
      return route.fulfill({ json: { form } });
    }
    if (path.endsWith("/submit")) { form.status = "submitted"; return route.fulfill({ json: { form } }); }
    if (path.endsWith("/future-measures")) {
      form.futureMeasures = [{ id: "future", ...route.request().postDataJSON(), created_at: stamp, created_by: user.email }];
      return route.fulfill({ json: { form } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/crm/technical-measures/fixture/");
  await expect(page.getByRole("heading", { name: "Line items", exact: true })).toBeVisible();
  return writes;
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const first = await page.locator(".technical-measure-ledger-item > button").first().boundingBox();
  expect(first!.y + first!.height).toBeLessThan(page.viewportSize()!.height);
}

test("phone opens every line directly without saving; contract and back retain the selection", async ({ page }) => {
  const writes = await setup(page, fixture());
  await expect(page.locator(".technical-measure-ledger-item > button")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Technical Measure", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Measure" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "805-555-0100" })).toHaveAttribute("href", "tel:8055550100");
  await expect(page.getByRole("link", { name: "jamie@example.com" })).toHaveAttribute("href", "mailto:jamie@example.com");
  await expect(page.getByText("Packet ready for review")).toBeHidden();
  await fits(page);
  await page.screenshot({ path: "test-results/measure-phone.png", scale: "css" });
  await page.locator(".technical-measure-ledger-item > button").nth(2).click();
  await expect(page.locator(".technical-measure-line--active")).toContainText("Line 3 of 4");
  await page.getByRole("button", { name: "Contract", exact: true }).click();
  await expect(page.getByTitle("Original customer contract")).toBeVisible();
  await page.getByRole("button", { name: "Field Measure", exact: true }).click();
  await expect(page.locator(".technical-measure-line--active")).toContainText("Line 3 of 4");
  await page.screenshot({ path: "test-results/measure-line-phone.png", scale: "css" });
  await page.getByRole("button", { name: "Back to line items", exact: true }).first().click();
  await expect(page.locator(".technical-measure-ledger-item > button")).toHaveCount(4);
  await page.getByText("Order status", { exact: true }).click();
  await expect(page.getByText("Packet ready for review")).toBeVisible();
  await page.getByText("Order status", { exact: true }).click();
  await page.getByText("Future windows", { exact: true }).click();
  await page.getByRole("button", { name: "Add Future Measure" }).click();
  await expect(page.getByRole("button", { name: "Select future width" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect.poll(() => writes.length).toBeGreaterThan(0);
});

test("iPad retains split contract reference and submitted read-only lines", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const form = fixture(); form.status = "submitted";
  const writes = await setup(page, form);
  await expect(page.getByTitle("Original customer contract")).toBeVisible();
  await expect(page.getByText("4 of 4 complete", { exact: true })).toBeVisible();
  await fits(page);
  await page.screenshot({ path: "test-results/measure-ipad.png", scale: "css" });
  await page.locator(".technical-measure-ledger-item > button").last().click();
  await expect(page.locator(".technical-measure-line--active").getByRole("button", { name: "Submit line item" })).toBeDisabled();
  await expect(page.locator(".technical-measure-line--active textarea")).toBeDisabled();
  expect(writes).toEqual([]);
});

test("long contact details wrap on a small phone and missing details have clear fallbacks", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const form = fixture();
  form.customer_snapshot = { name: "Alexandra Jamie Example-Sample", address: "12345 Very Long Example Street, Apartment 400", city: "San Buenaventura, CA 93001", phone: null, email: "alexandra.jamie.longemailaddress@example.com" };
  await setup(page, form);
  await fits(page);
  await expect(page.getByText("Phone not provided")).toBeVisible();
  await page.screenshot({ path: "test-results/measure-small-phone.png", scale: "css" });
});

test("empty measure remains usable without completion actions", async ({ page }) => {
  const form = fixture(); form.lines = []; form.customer_snapshot.address = null; form.customer_snapshot.city = null; form.customer_snapshot.email = null;
  await setup(page, form);
  await expect(page.getByText("No line items on this measure.")).toBeVisible();
  await expect(page.getByText("Address not provided")).toBeVisible();
  await expect(page.getByText("Email not provided")).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete Measure", exact: true })).toHaveCount(0);
});

test("completion reveals required change order beneath the list", async ({ page }) => {
  const form = fixture(); form.requiresAddendum = true;
  form.lines.forEach(line => {
    line.current_values.measure_complete = true;
    line.measure_schema = { schemaVersion: 1, routingKey: "test", manufacturer: "Norman", productKey: "roller", productName: "Roller Shades", productKind: "shade", orderSchemaPath: "", orderTemplateDocxUrl: "", orderTemplatePdfUrl: "", technicalMeasureDocxUrl: "", technicalMeasurePdfUrl: "", sourceReference: "fixture", verification: "test", fields: [] };
  });
  const writes = await setup(page, form);
  await expect(page.getByRole("heading", { name: "Contract Change Order", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Complete Measure", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Contract Change Order", exact: true })).toBeVisible();
  await expect(page.locator("details").filter({ has: page.getByText("Contract change order · acknowledgment required", { exact: true }) })).toHaveAttribute("open", "");
  expect(writes.some(path => path.endsWith("/submit"))).toBe(false);
  await expect.poll(async () => (await page.getByRole("heading", { name: "Contract Change Order", exact: true }).boundingBox())!.y).toBeLessThan(300);
  await page.screenshot({ path: "test-results/measure-change-order.png", scale: "css" });
});

test("cached offline measure still opens line items", async ({ page }) => {
  await setup(page, fixture());
  await page.route("**/api/crm/technical-measures/fixture", route => route.abort());
  await page.reload();
  await expect(page.getByText("Saved on this phone", { exact: true })).toBeVisible();
  await expect(page.locator(".technical-measure-ledger-item > button")).toHaveCount(4);
  await page.locator(".technical-measure-ledger-item > button").first().click();
  await expect(page.locator(".technical-measure-line--active")).toContainText("Line 1 of 4");
});


test("future window dimensions save from the collapsed tools", async ({ page }) => {
  const writes = await setup(page, fixture());
  await page.getByText("Future windows", { exact: true }).click();
  await page.getByRole("button", { name: "Add Future Measure" }).click();
  await page.getByRole("button", { name: "Select future width" }).click();
  await page.getByRole("button", { name: "36", exact: true }).click();
  await page.getByRole("button", { name: "0 (even)", exact: true }).click();
  await page.getByRole("button", { name: "60", exact: true }).click();
  await page.getByRole("button", { name: "0 (even)", exact: true }).click();
  await page.getByRole("button", { name: "Save to Customer File", exact: true }).click();
  await expect(page.locator(".technical-measure-future-list")).toContainText('36" × 60"');
  expect(writes).toContain("POST /api/crm/technical-measures/fixture/future-measures");
});

test("line validation, line submission, and measure completion retain their guards", async ({ page }) => {
  const form = fixture();
  form.lines = form.lines.slice(0, 1);
  form.lines[0].measure_schema = { schemaVersion: 1, routingKey: "test", manufacturer: "Norman", productKey: "roller", productName: "Roller Shades", productKind: "shade", orderSchemaPath: "", orderTemplateDocxUrl: "", orderTemplatePdfUrl: "", technicalMeasureDocxUrl: "", technicalMeasurePdfUrl: "", sourceReference: "fixture", verification: "test", fields: [] };
  form.lines[0].current_values.width_confirmed = false;
  const writes = await setup(page, form);
  await expect(page.getByRole("button", { name: "Complete Measure", exact: true })).toBeDisabled();
  await expect(page.locator(".technical-measure-ledger-item")).toHaveCSS("background-color", "rgb(255, 241, 240)");
  await page.screenshot({ path: "test-results/measure-line-incomplete.png", scale: "css" });
  await page.locator(".technical-measure-ledger-item > button").click();
  await page.getByRole("button", { name: "Submit line item", exact: true }).click();
  await expect(page.locator(".technical-measure-line--active").getByRole("alert")).toContainText("Width confirmation");
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Confirm width", exact: true }).click();
  await page.getByRole("button", { name: "Submit line item", exact: true }).click();
  await expect(page.getByText("1 of 1 complete", { exact: true })).toBeVisible();
  await expect(page.locator(".technical-measure-ledger-item")).toHaveCSS("background-color", "rgb(237, 247, 239)");
  await page.screenshot({ path: "test-results/measure-line-complete.png", scale: "css" });
  await expect(page.getByRole("button", { name: "Complete Measure", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Complete Measure", exact: true }).click();
  await expect.poll(() => writes.includes("POST /api/crm/technical-measures/fixture/submit")).toBe(true);
  await expect(page.locator(".tm805-status")).toHaveText("submitted");
});
