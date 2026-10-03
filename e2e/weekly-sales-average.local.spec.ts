import { test, expect } from "@playwright/test";
for (const width of [1600, 820, 390]) {
  test(`calendar-year weekly average and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1180 });
    await page.clock.setFixedTime(new Date("2026-09-26T19:00:00Z"));
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/e2e/fixtures/weekly-sales-average.html");
    const average = page.getByRole("region", { name: "Average weekly gross sales" });
    await expect(average).toContainText("$3,102.26");
    await expect(average).toHaveText("AVG$3,102.26");
    await page.getByRole("button", { name: "Previous sales week" }).click();
    await expect(average).toContainText("$3,102.26");
    for (let i = 0; i < 11; i++) await page.getByRole("button", { name: "Previous sales week" }).click();
    await expect(page.getByRole("button", { name: "Previous sales week" })).toBeDisabled();
    await expect(average).toContainText("$3,102.26");
    await expect(page.getByRole("button", { name: /Weekly gross sales status/ })).toContainText("Jun 29 – Jul 5, 2026");
    await expect(page.getByRole("button", { name: /Weekly gross sales status/ })).toContainText("$21,227.07");
    await expect(page.getByRole("button", { name: /Weekly gross sales status/ })).toContainText("Goal met");
    await page.getByRole("button", { name: "This week", exact: true }).click();
    await average.scrollIntoViewIfNeeded();
    expect(await average.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/805-average-${width}.png` });
    await page.getByRole("button", { name: /Weekly gross sales status/ }).click();
    await expect(page.getByText(/The average uses actual recorded signed gross sales/)).toBeVisible();
    await expect(page.getByText(/June 29–July 5 as Week 1 for 2026/)).toBeVisible();
    await page.reload();
    await expect(average).toContainText("$3,102.26");
    await page.goto("/e2e/fixtures/weekly-sales-average.html?unavailable");
    await expect(average).toHaveText("AVG—");
    expect(errors).toEqual([]);
  });
}
