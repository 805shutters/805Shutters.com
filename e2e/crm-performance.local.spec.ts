import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) {
  test(`older activity remains accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/e2e/fixtures/crm-performance.html");
    await page.getByRole("button", { name: "Load older activity" }).click();
    await expect(page.getByText(/Nov 21, 2026/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Load older activity" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
