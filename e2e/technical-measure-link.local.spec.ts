import { test, expect } from "@playwright/test";
for (const width of [1600, 390]) for (const view of ["Card view", "List view"]) {
  test(`submitted measure link beside contract at ${width}px in ${view}`, async ({ page }) => {
    await page.setViewportSize({width, height: 1000});
    await page.goto("/e2e/fixtures/technical-measure-link.html");
    await page.getByRole("radio", {name: view, exact: true}).click();
    const link = page.getByRole("link", {name: "Technical measure for Completed Sample", exact: true});
    await expect(link).toHaveAttribute("href", "/crm/technical-measures/measure-0");
    await expect(link).toHaveAttribute("target", "_blank");
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await expect(link.locator("xpath=preceding-sibling::button[1]")).toHaveText("Contract");
    await expect(page.getByRole("link", {name: "Technical measure for Draft Sample", exact: true})).toHaveCount(0);
    await expect(page.getByRole("link", {name: "Technical measure for No Measure Sample", exact: true})).toHaveCount(0);
    const popupPromise = page.waitForEvent("popup");
    await link.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/\/crm\/technical-measures\/measure-0$/);
    await popup.close();
  });
}
