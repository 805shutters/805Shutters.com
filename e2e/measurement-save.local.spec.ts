import { test, expect } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });
const saved = async (page: import("@playwright/test").Page) => JSON.parse(await page.getByTestId("persisted-state").innerText());

test("failed measurement save keeps dimensions for retry, then persists the matched grid price and total", async ({ page }) => {
  await page.goto("/e2e/fixtures/measurement-save.html?case=retry&fail=1");
  await page.getByRole("button", { name: "Add Size", exact: true }).click();
  await page.getByLabel("Width in inches", { exact: true }).fill("36.5");
  await page.getByLabel("Height in inches", { exact: true }).fill("60.25");
  await page.getByRole("button", { name: "Use measurements", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Test save interrupted");
  await expect(page.getByLabel("Width in inches", { exact: true })).toHaveValue("36.5");
  await expect(page.getByLabel("Height in inches", { exact: true })).toHaveValue("60.25");
  expect((await saved(page)).sales_quote_line_items[0].width_whole).toBe(0);
  await page.getByRole("button", { name: "Use measurements", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Choose a slat size" })).toBeVisible();
  await page.getByRole("button", { name: '1"', exact: true }).click();
  await expect.poll(async () => (await saved(page)).sales_quote_designs[0].unit_price).toBeGreaterThan(39);
  const state = await saved(page);
  expect(state.sales_quote_line_items[0]).toMatchObject({ width_whole: 36, width_fraction: "1/2", height_whole: 60, height_fraction: "1/4" });
  const design = state.sales_quote_designs[0];
  expect(design.unit_price).toBe(360); // Source grid 42 x 61 = $321, plus $25 install + $14 shipping.
  expect(design.options_json).toMatchObject({ pricing_calculation_status: "priced", pricing_grid_width: 42, pricing_grid_height: 61, pricing_block_reason: null });
  await expect.poll(async () => (await saved(page)).sales_quotes[0].total_amount).toBe(design.unit_price);
  await page.reload();
  await expect(page.getByRole("button", { name: '36 1/2" × 60 1/4"', exact: true })).toBeVisible();
  expect((await saved(page)).sales_quote_designs[0].unit_price).toBe(design.unit_price);
});

test("four-step measurement grid completes the save and calculates a CityLights price", async ({ page }) => {
  await page.goto("/e2e/fixtures/measurement-save.html?case=grid");
  await page.getByRole("button", { name: "Add Size", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "36", exact: true }).click();
  await dialog.getByRole("button", { name: "0 (even)", exact: true }).click();
  await dialog.getByRole("button", { name: "60", exact: true }).click();
  await dialog.getByRole("button", { name: "0 (even)", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Choose a slat size" })).toBeVisible();
  await page.getByRole("button", { name: '1"', exact: true }).click();
  await expect.poll(async () => (await saved(page)).sales_quote_designs[0].unit_price).toBeGreaterThan(39);
  const state = await saved(page);
  expect(state.sales_quote_line_items[0]).toMatchObject({width_whole:36,height_whole:60});
  expect(state.sales_quote_designs[0].options_json).toMatchObject({ pricing_grid_width:36, pricing_grid_height:61 });
  expect(state.sales_quote_designs[0].unit_price).toBe(342); // Source grid 36 x 61 = $303 plus $39.
});

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
  test(`saved dimensions recover a stale invalid price on reopen at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/e2e/fixtures/measurement-save.html?case=stale-${viewport.width}&stale=1`);
    await expect.poll(async () => (await saved(page)).sales_quote_designs[0].unit_price).toBe(342);
    await expect.poll(async () => (await saved(page)).sales_quotes[0].total_amount).toBe(342);
    await page.getByRole("button", { name: '36" × 60"', exact: true }).click();
    await expect(page.getByLabel("Width in inches", { exact: true })).toHaveValue("36");
    await expect(page.getByLabel("Height in inches", { exact: true })).toHaveValue("60");
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ animations: "disabled", path: `test-results/measurements-${viewport.width}.png` });
  });
}
