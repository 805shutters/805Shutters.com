import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`closed job drawer works at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const writes: string[] = [];
    await page.route('**/api/**', route => {
      if (route.request().method() !== 'GET') writes.push(route.request().url());
      return route.fulfill({ json: { plans: [] } });
    });
    await page.goto('/e2e/fixtures/closed-paid-jobs.html');
    await page.getByRole('button', { name: 'Sold', exact: true }).click();
    const closed = page.getByRole('article', { name: 'Job status for Closed sample', exact: true });
    const summary = closed.locator('summary').first();
    const financials = closed.getByText('Cost of goods', { exact: true });
    await expect(summary).toContainText('Closed sample');
    await expect(summary).toContainText('805-closed');
    await expect(summary).toContainText('$1,254.00');
    await expect(financials).toBeHidden();
    for (const name of ['Reopened paid sample', 'Unpaid sample']) {
      const active = page.getByRole('article', { name: `Job status for ${name}`, exact: true });
      await expect(active.locator('summary')).toHaveCount(0);
      await expect(active.getByText('Cost of goods', { exact: true })).toBeVisible();
    }
    await summary.click();
    await expect(financials).toBeVisible();
    await closed.getByRole('button', { name: 'Open job', exact: true }).click();
    await expect(page.getByText('Opened Closed sample', { exact: true })).toBeVisible();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(financials).toBeHidden();
    await page.keyboard.press('Space');
    await expect(financials).toBeVisible();
    await summary.click();
    await expect(financials).toBeHidden();
    const box = await summary.boundingBox();
    expect(box!.height).toBeLessThan(viewport.width > 600 ? 80 : 115);
    const arrow = summary.locator('svg').last();
    expect((await arrow.boundingBox())!.x).toBeGreaterThan(box!.x + box!.width - 50);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(writes).toEqual([]);
    await page.screenshot({ path: `test-results/closed-jobs/drawer-${viewport.width}.png`, fullPage: true });
  });
}
