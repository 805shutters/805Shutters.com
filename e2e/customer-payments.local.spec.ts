import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome' });
const preview = '/e2e/fixtures/customer-payments.html';
test('requests deposit, balance, full or exact custom amounts through one reviewed channel', async ({ page }) => {
  await page.goto(preview);
  await page.getByRole('button', { name: 'Send payment link to Alex Sample, 805-0412 · Camarillo', exact: true }).click();
  const choice = page.getByLabel('Payment requested', { exact: true });
  await expect(choice).toHaveValue('deposit');
  await expect(page.getByText('Amount on payment link').locator('..')).toContainText('$3,200.00');
  await choice.selectOption('balance');
  await expect(page.getByText('Amount on payment link').locator('..')).toContainText('$3,200.00');
  await choice.selectOption('full');
  await expect(page.getByText('Amount on payment link').locator('..')).toContainText('$6,400.00');
  await choice.selectOption('custom');
  const custom = page.getByLabel('Specific amount ($)', { exact: true });
  await custom.fill('6400.01'); await expect(page.getByRole('button', { name: 'Send text link', exact: true })).toBeDisabled();
  await custom.fill('0'); await expect(page.getByRole('button', { name: 'Send text link', exact: true })).toBeDisabled();
  await custom.fill('725.50');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await expect(page.getByText('Subject: Your 805 Shutters payment link', { exact: false })).toContainText('$725.50');
  await page.getByRole('button', { name: 'Send email link', exact: true }).dblclick();
  await expect(page.getByRole('status')).toContainText('provider accepted the $725.50 payment link');
  const requests = await page.evaluate(() => (window as unknown as {paymentRequests: unknown[]}).paymentRequests);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ quoteId: 'q1', jobId: 'j1', requestKind: 'custom', paymentType: 'balance', customAmount: 725.5, expectedAmount: 725.5, channel: 'email', expectedRecipient: 'one@example.test' });
  await expect(choice).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Provider accepted', exact: true })).toBeDisabled();
});

test('keeps the same request key after uncertain acceptance and never silently switches channel', async ({ page }) => {
  await page.goto(`${preview}?send-error=1`);
  await page.getByRole('button', { name: 'Send payment link to Jordan Example, 805-0398 · Ventura', exact: true }).click();
  await page.getByRole('button', { name: 'Send text link', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Provider acceptance unknown');
  await expect(page.getByRole('button', { name: 'Email', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Check same request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check same request', exact: true })).toBeEnabled();
  const requests = await page.evaluate(() => (window as unknown as {paymentRequests: unknown[]}).paymentRequests);
  expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1]);
});

test('filters, paid and unlinked jobs, missing phone and history remain usable', async ({ page }) => {
  await page.goto(preview);
  await expect(page.getByText('Unsold Sample', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Payment status' }).selectOption('all');
  await expect(page.getByRole('button', { name: 'Send payment link to Unsold Sample, Draft quote', exact: true })).toBeDisabled();
  await expect(page.getByText('Sale not recorded', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send payment link to Morgan Preview, 805-0386 · Oxnard', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send payment link to Unlinked Sample, Legacy order', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Search customer payments' }).fill('0407');
  await page.getByRole('button', { name: 'Send payment link to Taylor Demo, 805-0407 · Thousand Oaks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Text message', exact: true })).toBeDisabled();
  await page.getByLabel('Payment requested', { exact: true }).selectOption('full');
  await expect(page.getByText('Amount on payment link').locator('..')).toContainText('$4,400.00');
  await page.getByRole('button', { name: 'Payment History', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Transactions', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Customer Payments', exact: true }).click();
  await expect(page.getByLabel('Payment requested', { exact: true })).toHaveValue('full');
  await expect(page.locator('body')).not.toContainText('Application error');
});

for (const width of [1440, 1024, 390]) {
  test(`fits the approved payment panel at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(preview);
    await page.getByRole('button', { name: 'Send payment link to Alex Sample, 805-0412 · Camarillo', exact: true }).click();
    await page.getByLabel('Payment requested', { exact: true }).selectOption('custom');
    await page.getByLabel('Specific amount ($)', { exact: true }).fill('1000');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Send text link', exact: true })).toBeEnabled();
    await page.screenshot({ path: `output/payment-hub-${width}.png`, fullPage: true });
  });
}
