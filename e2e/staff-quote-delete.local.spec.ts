import { expect, test } from "@playwright/test";
const url = "http://127.0.0.1:4292/e2e/fixtures/staff-quote-delete.html";
for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`delete draft from list and cards at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(url);
    const draft = page.getByRole("button", { name: "Delete draft quote 805-0395" });
    await expect(draft).toBeVisible();
    await expect(page.getByRole("button", { name: /Delete draft quote/ })).toHaveCount(1);
    await draft.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/staff-delete-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    page.once("dialog", async dialog => {
      expect(dialog.message()).toContain("805-0395 for Example Customer");
      await dialog.dismiss();
    });
    await draft.click();
    await expect(page.getByLabel("Delete requests")).toHaveText("0");
    await page.getByRole("button", { name: "Draft · 1", exact: true }).click();
    await expect(draft).toBeVisible();
    await page.getByLabel("Simulate failure").check();
    page.once("dialog", dialog => dialog.accept());
    await draft.click();
    await expect(draft).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText("Quote could not be deleted");
    await expect(draft).toBeEnabled();
    await page.getByLabel("Simulate failure").uncheck();
    page.once("dialog", dialog => dialog.accept());
    await draft.click();
    await expect(page.getByLabel("Delete requests")).toHaveText("2");
    await expect(draft).toHaveCount(0);
    await page.getByRole("button", { name: "All quotes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Open quote 805-0291" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open quote 805-0396" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Delete draft quote/ })).toHaveCount(0);
  });
}
