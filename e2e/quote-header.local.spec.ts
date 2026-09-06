import { expect, test } from "@playwright/test";

// Uses the isolated SQLite Quote Lab only; never sends customer communications.
test("quote header stays visible without hover and preserves product choices and notes", async ({ page }) => {
  test.skip(!process.env.QUOTE_LAB_ACCESS_CODE, "Requires a local Quote Lab access code");
  test.setTimeout(120_000);
  expect((await page.request.post("/api/quote-lab/access", { data: { code: process.env.QUOTE_LAB_ACCESS_CODE } })).ok()).toBe(true);
  expect((await page.request.post("/api/quote-lab/state", { data: { expectedRevision: 0 } })).ok()).toBe(true);
  await page.goto("/quote-lab");
  const header = page.locator("#quote-builder-command-bar");
  await expect(header).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.mouse.move(0, 900);
    for (const name of ["Fresh Start", "Send Quote", "Send Payment Link", "Builder", "Pricing Grids", "Contract", "Add Quote", "Copy Current"]) {
      await expect(header.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(header.getByRole("button", { name: "Send Quote", exact: true })).toBeDisabled();
    await page.screenshot({ path: `output/quote-header-${width}.png`, fullPage: true });
    const before = await header.boundingBox();
    await header.hover();
    expect(Math.abs((await header.boundingBox())!.height - before!.height)).toBeLessThan(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/quote-header-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Norman", exact: true }).click();
  await expect(page.locator("[data-catalog-product-id]").first()).toBeVisible();
  await page.getByRole("button", { name: "Soluna Roller Shades · Roller Shades", exact: true }).click();
  await expect(page.getByRole("button", { name: "Living Room", exact: true })).toBeEnabled();
  const note = page.getByLabel("General Job Notes", { exact: true });
  await note.fill("Local header verification note");
  await header.getByRole("button", { name: "Builder", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Quote saved" })).toBeVisible();
  await page.reload();
  await expect(note).toHaveValue("Local header verification note");
  await expect(header.getByRole("button", { name: "Contract", exact: true })).toBeEnabled();
});
