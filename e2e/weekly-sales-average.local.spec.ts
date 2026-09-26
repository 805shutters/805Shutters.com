import { test, expect } from "@playwright/test";
for (const width of [1600, 820, 390]) {
  test(`calendar-year weekly average and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1180 });
    await page.clock.setFixedTime(new Date("2026-09-26T19:00:00Z"));
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/e2e/fixtures/weekly-sales-average.html");
    const average = page.getByRole("region", { name: "Average weekly gross sales" });
    await expect(average).toContainText("$1,000.00");
    await expect(average).toContainText("2026 calendar year · 38 completed weeks");
    await page.getByRole("button", { name: "Previous sales week" }).click();
    await expect(average).toContainText("$1,000.00");
    for (let i = 0; i < 37; i++) await page.getByRole("button", { name: "Previous sales week" }).click();
    await expect(average).toContainText("2025 calendar year · 53 weeks");
    await expect(average).toContainText("$1,000.00");
    await page.getByRole("button", { name: "This week", exact: true }).click();
    await expect(average).toContainText("2026 calendar year");
    await average.scrollIntoViewIfNeeded();
    expect(await average.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/805-average-${width}.png` });
    await page.getByRole("button", { name: /Weekly gross sales status/ }).click();
    await expect(page.getByText(/The average uses all recorded signed gross sales/)).toBeVisible();
    await page.reload();
    await expect(average).toContainText("$1,000.00");
    await page.goto("/e2e/fixtures/weekly-sales-average.html?unavailable");
    await expect(average).toContainText("Sales history unavailable");
    expect(errors).toEqual([]);
  });
}
