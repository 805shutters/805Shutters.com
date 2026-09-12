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
async function choose(page: Page, code: string) {
  await openFabric(page);
  await page.getByRole("textbox", { name: "Fabric search" }).fill(code);
  await page.getByRole("button", { name: new RegExp(`${code} -`) }).click();
}
for (const device of ["desktop", "ipad"] as const) {
  test(`${device}: new fabrics, category, save/reopen, copy and locked price`, async ({ browser }, testInfo) => {
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
    await page.goto(`${testInfo.project.use.baseURL}/e2e/fixtures/norman-fall.html`);
    await openFabric(page);
    const search = page.getByRole("textbox", { name: "Fabric search" });
    await search.fill("");
    const results = page.getByRole("button").filter({ hasText: /F\d{4} -/ });
    await expect(results).toHaveCount(440);
    await results.last().scrollIntoViewIfNeeded();
    await expect(results.last()).toBeInViewport();
    await page.getByLabel("Fabric category").selectOption("Room Darkening");
    await search.fill("Springtide");
    await expect(results).toHaveCount(0);
    await page.getByLabel("Fabric category").selectOption("Light Filtering");
    await expect(results).toHaveCount(7);
    await page.screenshot({ path: testInfo.outputPath(`${device}-fabric-search.png`) });
    await search.fill("F2221");
    await expect(results).toHaveCount(1);
    await expect(results).toContainText("Light Filtering · Fabric PG4");
    await results.click();
    await expect.poll(async () => (await state(page)).unit_price).toBe(465.3);
    expect(await state(page)).toMatchObject({ fabric: "Springtide", mount_type: "Inside Mount", lift_system: "Cordless", valance: "No Valance", notes: "Keep these notes", options_json: { fabric_color_code: "F2221", fabric_color_name: "Sandy Taupe", fabric_program_id: "roller_cordless_fabric_price_group_4_pg4", control_side: "Left", discount_percent: 10 } });
    await page.getByRole("button", { name: "Save fixture", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved locally");
    await page.reload();
    await expect.poll(async () => (await state(page)).fabric).toBe("Springtide");
    await expect(page.getByRole("region", { name: "Contract details" })).toContainText("F2221 - Sandy Taupe");
    await page.getByRole("button", { name: "Copy fixture", exact: true }).click();
    const copy = JSON.parse(await page.getByTestId("copied-state").innerText());
    expect(copy.unit_price).toBe(465.3);
    expect(copy.options_json).toEqual((await state(page)).options_json);
    await page.getByLabel("Test width").fill("98");
    await expect(page.getByRole("alert")).toContainText('Fabric specs must be within 9.5" to 96"');
    await page.getByLabel("Test width").fill("36");
    await page.getByLabel("Lock saved price").check();
    await page.getByLabel("Test width").fill("60");
    await expect.poll(async () => (await state(page)).unit_price).toBe(465.3);
    expect((await state(page)).options_json.manual_price_override).not.toBe(true);
    await page.getByLabel("Test width").fill("36");
    await page.getByLabel("Lock saved price").uncheck();
    await page.getByRole("button", { name: "Set manual price", exact: true }).click();
    await choose(page, "F2207");
    await expect.poll(async () => (await state(page)).unit_price).toBe(777.77);
    expect((await state(page)).options_json).toMatchObject({ manual_price_override: true, sent_price_snapshot: { unit_price: 777.77 }, control_side: "Left" });
    await page.getByLabel("Lock saved price").check();
    await page.getByLabel("Test width").fill("60");
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
