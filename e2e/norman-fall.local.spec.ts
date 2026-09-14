import { test, expect, type Page } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });

// Start: node node_modules/vite/bin/vite.js --config e2e/norman-fall.vite.mjs
// Run: E2E_BASE_URL=http://127.0.0.1:4193 npx playwright test e2e/norman-fall.local.spec.ts
async function state(page: Page) {
  return JSON.parse(await page.getByTestId("saved-state").innerText());
}
async function openFabric(page: Page) {
  await page.locator('button[title^="Fabric:"]').click();
}
function fabricSearch(page: Page) {
  return page.getByRole("textbox", { name: "Fabric search", exact: true }).or(page.getByPlaceholder("Search collection, color, or code...", { exact: true }));
}
async function choose(page: Page, code: string) {
  await openFabric(page);
  await fabricSearch(page).fill(code);
  await page.getByRole("button", { name: new RegExp(`${code} -`) }).click();
}
for (const engine of ["current", "v1"] as const) {
for (const device of ["desktop", "ipad"] as const) {
  test(`${engine} ${device}: new fabrics, category, save/reopen, copy and locked price`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      viewport: device === "ipad" ? { width: 768, height: 1024 } : { width: 1440, height: 1000 },
      hasTouch: device === "ipad", isMobile: device === "ipad",
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/") ? route.continue() : route.abort();
    });
    await page.goto(`${testInfo.project.use.baseURL}/e2e/fixtures/norman-fall.html?engine=${engine}`);
    await openFabric(page);
    const search = fabricSearch(page);
    await search.fill("");
    const results = page.getByRole("button").filter({ hasText: /F\d{4} -/ });
    await expect(results).toHaveCount(440);
    await results.last().scrollIntoViewIfNeeded();
    await expect(results.last()).toBeInViewport();
    if (engine === "current") {
      await page.getByLabel("Fabric category").selectOption("Room Darkening");
      await search.fill("Springtide");
      await expect(results).toHaveCount(0);
      await page.getByLabel("Fabric category").selectOption("Light Filtering");
    } else {
      await search.fill("Springtide");
    }
    await expect(results).toHaveCount(7);
    await page.screenshot({ path: testInfo.outputPath(`${device}-fabric-search.png`) });
    await search.fill("F2221");
    await expect(results).toHaveCount(1);
    await expect(results).toContainText("Light Filtering · Fabric PG4");
    await results.click();
    await expect.poll(async () => (await state(page)).unit_price).toBe(504.3);
    expect(await state(page)).toMatchObject({ fabric: "Springtide", mount_type: "Inside Mount", lift_system: "Cordless", valance: "No Valance", notes: "Keep these notes", options_json: { fabric_color_code: "F2221", fabric_color_name: "Sandy Taupe", fabric_program_id: "roller_cordless_fabric_price_group_4_pg4", control_side: "Left", discount_percent: 10 } });
    await page.getByRole("button", { name: "Save fixture", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved locally");
    await page.reload();
    await expect.poll(async () => (await state(page)).fabric).toBe("Springtide");
    await expect(page.getByRole("region", { name: "Contract details" })).toContainText("F2221 - Sandy Taupe");
    await expect(page.getByRole("region", { name: "Contract details" })).not.toContainText(/Pricing (Input|Source|Calculation|Dimension)|Catalog Product Id|Quote Lab/);
    await expect(page.getByTestId("update-count")).toHaveText("0");
    await expect(page.getByRole("region", { name: "Contract details" })).toContainText("Installation: $25.00 (1 × $25)");
    await expect(page.getByRole("region", { name: "Contract details" })).toContainText("Shipping: $14.00 (1 × $14)");
    await page.getByRole("button", { name: "Copy fixture", exact: true }).click();
    const copy = JSON.parse(await page.getByTestId("copied-state").innerText());
    expect(copy.unit_price).toBe(504.3);
    expect(copy.options_json).toEqual((await state(page)).options_json);
    await page.getByLabel("Test width", {exact:true}).fill("98");
    await expect(page.getByRole("alert").filter({ hasText: "Fabric specs" })).toContainText('Fabric specs must be within 9.5" to 96"');
    await expect.poll(async () => (await state(page)).unit_price).toBe(0);
    await page.getByLabel("Test width", {exact:true}).fill("36");
    await expect.poll(async () => (await state(page)).unit_price).toBe(504.3);
    await page.getByLabel("Test width fraction", {exact:true}).selectOption("1/16");
    await expect.poll(async () => (await state(page)).options_json.pricing_grid_width).toBe(42);
    await page.getByLabel("Test width fraction", {exact:true}).selectOption("0");
    await expect.poll(async () => (await state(page)).unit_price).toBe(504.3);
    await page.getByLabel("Test width", {exact:true}).fill("48");
    await page.getByLabel("Test width", {exact:true}).fill("60");
    await page.getByLabel("Test width", {exact:true}).fill("36");
    await expect.poll(async () => (await state(page)).unit_price).toBe(504.3);
    await page.getByLabel("Test quantity").fill("3");
    await expect.poll(async () => (await state(page)).options_json.customer_charges?.eligibleUnitCount).toBe(3);
    await expect(page.getByTestId("line-total")).toHaveText("1512.90");
    await expect(page.getByRole("region", { name: "Contract details" })).toContainText("Installation: $75.00 (3 × $25)");
    await expect(page.getByRole("region", { name: "Contract details" })).toContainText("Shipping: $42.00 (3 × $14)");
    await page.getByLabel("Lock saved price").check();
    await page.getByLabel("Test width", {exact:true}).fill("60");
    await expect.poll(async () => (await state(page)).unit_price).toBe(504.3);
    expect((await state(page)).options_json.manual_price_override).not.toBe(true);
    await page.getByLabel("Test width", {exact:true}).fill("36");
    await page.getByLabel("Lock saved price").uncheck();
    await page.getByRole("button", { name: "Set manual price", exact: true }).click();
    await choose(page, "F2207");
    await expect.poll(async () => (await state(page)).unit_price).toBe(777.77);
    expect((await state(page)).options_json).toMatchObject({ manual_price_override: true, sent_price_snapshot: { unit_price: 777.77 }, control_side: "Left" });
    await page.getByLabel("Lock saved price").check();
    await page.getByLabel("Test width", {exact:true}).fill("60");
    await expect.poll(async () => (await state(page)).unit_price).toBe(777.77);
    await page.getByRole("button", { name: "Save fixture", exact: true }).click();
    await page.reload();
    await expect.poll(async () => (await state(page)).unit_price).toBe(777.77);
    await page.screenshot({ path: testInfo.outputPath(`${device}-saved-fabric.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });
}

}
