import { expect, test } from "@playwright/test";

for (const width of [390, 820, 1440]) test.describe(`${width}px job payment columns`, () => {
  test.use({ viewport: { width, height: 1100 } });
  test("shows three independent payments and records the selected installment in card and list views", async ({ page }) => {
    const plan = {
      id: "plan-1", quote_id: "quote-1", bookkeeping_entry_id: null, status: "active",
      current: { customerName: "Three Payment Customer", quoteNumber: "LOCAL-0001", outstandingCents: 175000 },
      notifications: [], history: [],
      installments: [100000, 100000, 100000].map((amount_cents, index) => ({
        id: `installment-${index + 1}`, plan_id: "plan-1", number: index + 1, amount_cents,
        paid_cents: index === 0 ? 100000 : index === 1 ? 25000 : 0,
        due_date: `2026-0${index + 8}-06`, paid_at: index === 0 ? "2026-08-06" : null,
      })),
    };
    let saves = 0;
    await page.route("**/api/crm/in-house-plans/", r => r.fulfill({ json: { plans: [plan] } }));
    await page.route("**/api/crm/in-house-plans/plan-1/receipt/", async r => {
      const body = r.request().postDataJSON();
      expect(body).toMatchObject({ installmentId: "installment-2", amount: 750, method: "check", receiptDate: "2026-09-06" });
      expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
      saves++;
      plan.installments[1].paid_cents = 100000;
      plan.installments[1].paid_at = "2026-09-06";
      plan.current.outstandingCents = 100000;
      await r.fulfill({ json: { plan, receipt: { reused: false } } });
    });
    await page.goto("/e2e/fixtures/job-payment-columns.html");
    const card = page.getByRole("article", { name: "Job status for Three Payment Customer" });
    const standard = page.getByRole("article", { name: "Job status for Standard Payment Customer" });
    const second = card.getByRole("cell").filter({ has: page.getByRole("button", { name: "Record Second payment for Three Payment Customer", exact: true }) });
    await expect(card.getByRole("button", { name: "Review Deposit for Three Payment Customer", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(second).toContainText("Partially paid");
    await expect(second).toContainText("Received $250.00 · Remaining $750.00");
    await expect(card).toContainText("Total still owed $1,750.00");
    await expect(card.locator("th").filter({ hasText: /^Second payment$/ })).toHaveCount(1);
    await expect(standard.locator("th").filter({ hasText: /^Second payment$/ })).toHaveCount(0);
    await expect(standard.locator("th").filter({ hasText: /^Balance paid$/ })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/job-payment-columns/cards-${width}.png`, fullPage: true });
    await second.getByRole("button").click();
    const form = card.getByRole("form", { name: "Record received installment payment" });
    await expect(form.getByLabel("Amount received")).toHaveValue("750.00");
    await form.getByLabel("Actual receipt date (Los Angeles)").fill("2026-09-06");
    await form.getByRole("combobox", { name: "Method" }).selectOption("check");
    await form.getByRole("button", { name: "Save received payment" }).click();
    await expect(card.getByRole("button", { name: "Review Second payment for Three Payment Customer", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(card).toContainText("2 of 3 payments paid");
    await expect(card).toContainText("Total still owed $1,000.00");
    expect(saves).toBe(1);
    await card.getByRole("button", { name: "Close payment details", exact: true }).click();
    await page.getByRole("radio", { name: "List view" }).check();
    const row = page.getByRole("row", { name: "Job status for Three Payment Customer" });
    await expect(row.getByRole("button", { name: "Review Second payment for Three Payment Customer", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("columnheader", { name: "Total still owed", exact: true })).toBeVisible();
    await expect(page.getByRole("row", { name: "Job status for Standard Payment Customer" }).getByLabel("Second payment not applicable")).toContainText("—");
    await row.getByRole("button", { name: "Record Balance for Three Payment Customer", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "In-house payment details" });
    await expect(dialog.getByLabel("Amount received")).toHaveValue("1000.00");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Record Balance for Three Payment Customer", exact: true })).toBeFocused();
    expect(saves).toBe(1);
    await page.screenshot({ path: `output/job-payment-columns/list-${width}.png`, fullPage: true });
  });
});
