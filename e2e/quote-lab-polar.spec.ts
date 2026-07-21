import { expect, test } from "@playwright/test";

const accessCode = process.env.QUOTE_LAB_ACCESS_CODE;
const categories = [
  "Shutters", "Roller Shades", "Roman Shades", "Honeycomb Shades", "Sheer Shades",
  "Mini Blinds", "Faux Wood Blinds", "Wood Blinds", "Vertical Blinds", "Smart Drapes",
  "Drapery Tracks", "Tension Shades", "Retractable Screens", "Awnings",
  "Vinyl Blinds",
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
  const normanAudit = page.locator('details[aria-label="Internal pricing audit"]').first();
  await normanAudit.locator("summary").click();
  await expect(normanAudit.getByText("Retail x 0.30", { exact: true })).toBeVisible();
  await expect(normanAudit.getByText("$89.40", { exact: true }).first()).toBeVisible();
  await expect(normanAudit.getByText(/No source-backed wholesale cost/)).toHaveCount(0);
  await normanAudit.screenshot({ path: testInfo.outputPath("quote-lab-norman-wholesale-audit.png") });
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

test("Lotus shares existing categories and adds Vinyl Blinds without exposing dealer cost", async ({ page }, testInfo) => {
  test.skip(!accessCode, "Requires QUOTE_LAB_ACCESS_CODE for the isolated preview.");
  const response = await page.request.post("/api/quote-lab/access", { data: { code: accessCode } });
  expect(response.ok()).toBe(true);
  await page.goto("/quote-lab");

  const rollerControls = page.getByTestId("quote-lab-catalog-controls").first();
  const rollerProduct = rollerControls.getByRole("combobox", { name: "Manufacturer and product" });
  await rollerProduct.click();
  await expect(page.getByRole("option", { name: "Lotus - Lotus Roller Shades", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "Lotus - Lotus Roller Shades", exact: true }).click();
  await expect(rollerProduct).toContainText("Lotus - Lotus Roller Shades");
  await expect(rollerControls.getByText("Dealer-net only; customer retail undefined", { exact: true })).toBeVisible();
  await expect(rollerControls.getByRole("combobox", { name: "Price program" })).toContainText("1% Roller Shade - Custom Cut");
  const lotusAudit = page.locator('details[aria-label="Internal pricing audit"]').first();
  await lotusAudit.locator("summary").click();
  await expect(lotusAudit.getByText("Dealer-net source grid", { exact: true })).toBeVisible();
  await expect(lotusAudit.getByText("$35.02", { exact: true }).first()).toBeVisible();
  await expect(lotusAudit.getByText("Incomplete - customer retail undefined", { exact: true })).toBeVisible();
  await expect(lotusAudit.getByText("Stored price mismatch", { exact: false })).toHaveCount(0);
  await expect(lotusAudit.getByText(/No source-backed wholesale cost/)).toHaveCount(0);
  await lotusAudit.screenshot({ path: testInfo.outputPath("quote-lab-lotus-wholesale-audit.png") });

  await rollerControls.getByRole("button", { name: "Compare manufacturers" }).click();
  const comparisonPanel = rollerControls.getByTestId("manufacturer-comparison-panel");
  await expect(comparisonPanel.getByText("Norman - Soluna Roller Shades", { exact: true })).toBeVisible();
  await expect(comparisonPanel.getByText("Polar - Interior Roller", { exact: true })).toBeVisible();
  await expect(comparisonPanel.getByText("Lotus - Lotus Roller Shades", { exact: true })).toBeVisible();
  await expect(comparisonPanel.getByText("Customer retail undefined", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("quote-lab-manufacturer-comparison-desktop.png"), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await expect(comparisonPanel).toBeVisible();
  await comparisonPanel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("quote-lab-manufacturer-comparison-mobile.png"), fullPage: false });
  await page.setViewportSize({ width: 1280, height: 720 });

  const normanComparison = comparisonPanel.locator("details").filter({ hasText: "Norman - Soluna Roller Shades" });
  await normanComparison.locator("summary").click();
  await normanComparison.getByTitle(/^Use Norman /).first().click();
  await expect(rollerProduct).toContainText("Norman - Soluna Roller Shades");

  const firstLineCard = rollerControls.locator("xpath=ancestor::div[contains(@class, 'overflow-hidden')][1]");
  await firstLineCard.getByRole("button", { name: "Roller Shades", exact: true }).click();
  await firstLineCard.locator('[aria-label="Select line item product type"]').getByRole("button", { name: "Vinyl Blinds", exact: true }).click();
  const vinylControls = page.getByTestId("quote-lab-catalog-controls").first();
  const vinylProduct = vinylControls.getByRole("combobox", { name: "Manufacturer and product" });
  await vinylProduct.click();
  await page.getByRole("option", { name: "Lotus - Lotus Vinyl Blinds", exact: true }).click();
  await expect(vinylProduct).toContainText("Lotus - Lotus Vinyl Blinds");
  await expect(vinylControls.getByText("Dealer-net only; customer retail undefined", { exact: true })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("quote-lab-lotus-desktop.png"), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await expect(page.getByRole("button", { name: /^Vinyl Blinds/ }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("quote-lab-lotus-mobile.png"), fullPage: false });
});

test("Shutter comparison keeps Norman and Onyx distinct and labels provisional pricing", async ({ page }) => {
  test.skip(!accessCode, "Requires QUOTE_LAB_ACCESS_CODE for the isolated preview.");
  const response = await page.request.post("/api/quote-lab/access", { data: { code: accessCode } });
  expect(response.ok()).toBe(true);
  await page.goto("/quote-lab");

  const firstControls = page.getByTestId("quote-lab-catalog-controls").first();
  const firstLineCard = firstControls.locator("xpath=ancestor::div[contains(@class, 'overflow-hidden')][1]");
  await firstLineCard.getByRole("button", { name: "Roller Shades", exact: true }).click();
  await firstLineCard.locator('[aria-label="Select line item product type"]').getByRole("button", { name: "Shutters", exact: true }).click();

  const shutterControls = page.getByTestId("quote-lab-catalog-controls").first();
  await expect(shutterControls.getByRole("combobox", { name: "Manufacturer and product" })).toContainText("Select required");
  await shutterControls.getByRole("button", { name: "Compare manufacturers" }).click();
  const panel = shutterControls.getByTestId("manufacturer-comparison-panel");
  await expect(panel.getByText("Norman - Norman Shutters", { exact: true })).toBeVisible();
  await expect(panel.getByText("Onyx - Onyx Shutters", { exact: true })).toBeVisible();
  await expect(panel.getByText("Provisional pricing source", { exact: true })).toHaveCount(2);

  const onyx = panel.locator("details").filter({ hasText: "Onyx - Onyx Shutters" });
  await onyx.locator("summary").click();
  await onyx.getByTitle(/^Use Onyx /).first().click();
  await expect(shutterControls.getByRole("combobox", { name: "Manufacturer and product" })).toContainText("Onyx - Onyx Shutters");
});

test("Norman coupled quantity and SmartSense price through the existing builder", async ({ page }, testInfo) => {
  test.skip(!accessCode, "Requires QUOTE_LAB_ACCESS_CODE for the isolated preview.");
  const response = await page.request.post("/api/quote-lab/access", { data: { code: accessCode } });
  expect(response.ok()).toBe(true);
  await page.goto("/quote-lab");

  const controls = page.getByTestId("quote-lab-catalog-controls").first();
  await expect(controls.getByRole("combobox", { name: "Manufacturer and product" })).toContainText("Norman - Soluna Roller Shades");
  await page.getByRole("button", { name: "Shade Type", exact: true }).first().click();
  await page.getByRole("button", { name: "Coupled Shades", exact: true }).first().click();
  const countControl = page.getByRole("button", { name: "Coupled Shade Count", exact: true }).first();
  await expect(page.getByRole("button", { name: /Coupled Shade Count/ }).first()).toBeVisible();
  await countControl.click();
  await page.getByRole("button", { name: "3", exact: true }).first().click();
  await expect(page.getByText("$1,128", { exact: true }).first()).toBeVisible();

  const motor = controls.getByRole("combobox", { name: "Motor or control" });
  await motor.click();
  await page.getByRole("option", { name: "SmartSense", exact: true }).click();
  await expect(page.getByText("$1,188", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("quote-lab-norman-coupled-desktop.png"), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  const mobileCountControl = page.getByRole("button", { name: /Coupled Shade Count/ }).first();
  await expect(mobileCountControl).toBeVisible();
  await mobileCountControl.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("quote-lab-norman-coupled-mobile.png"), fullPage: false });
});
