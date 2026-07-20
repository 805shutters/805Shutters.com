import { expect, test } from "@playwright/test";

const accessCode = process.env.QUOTE_LAB_ACCESS_CODE;
const categories = [
  "Shutters", "Roller Shades", "Roman Shades", "Honeycomb Shades", "Sheer Shades",
  "Mini Blinds", "Faux Wood Blinds", "Wood Blinds", "Vertical Blinds", "Smart Drapes",
  "Drapery Tracks", "Tension Shades", "Retractable Screens", "Awnings",
];

test("protected Quote Lab renders Polar in the exact existing builder", async ({ page }, testInfo) => {
  test.skip(!accessCode, "Requires QUOTE_LAB_ACCESS_CODE for the isolated preview.");
  const response = await page.request.post("/api/quote-lab/access", { data: { code: accessCode } });
  expect(response.ok()).toBe(true);
  await page.goto("/quote-lab");
  await expect(page.getByTestId("quote-lab-catalog-controls").first()).toBeVisible();

  for (const category of categories) {
    await expect(page.locator('[aria-label="Add quote line item"]').getByRole("button", { name: category }).first()).toBeVisible();
  }

  const firstControls = page.getByTestId("quote-lab-catalog-controls").first();
  const manufacturer = firstControls.getByRole("combobox", { name: "Manufacturer and product" });
  await expect(manufacturer).toContainText("Norman - Soluna Roller Shades");
  await manufacturer.press("ArrowDown");
  await page.getByRole("option", { name: "Polar - Interior Roller", exact: true }).click();
  await expect(manufacturer).toContainText("Polar - Interior Roller");
  await expect(firstControls.getByRole("combobox", { name: "Price program" })).toContainText("Price Group 1");
  await expect(page.getByText("$142", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Show quote actions menu", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Send Quote", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send Payment Link", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("quote-lab-polar-desktop.png"), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await expect(page.locator('[aria-label="Add quote line item"]').getByRole("button", { name: "Awnings" }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("quote-lab-polar-mobile.png"), fullPage: false });
});
