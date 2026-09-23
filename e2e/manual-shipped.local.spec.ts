import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  for (const view of ['Card view', 'List view']) {
    test(`manual shipped saves without a form at ${width}px in ${view}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/e2e/fixtures/shipping-status.html');
      await page.getByRole('radio', { name: view, exact: true }).click();
      await page.getByRole('button', { name: 'Mark Shutters shipped for Sample customer', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Review Shutters shipped for Sample customer', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByLabel('Confirmed ship date')).toHaveCount(0);
      await expect(page.getByText('Shipped Sep 17, 2026', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Review Roller Shades shipped for Sample customer', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Mark Installed for Sample customer', exact: true })).toHaveAttribute('aria-pressed', 'false');
    });
  }
}
