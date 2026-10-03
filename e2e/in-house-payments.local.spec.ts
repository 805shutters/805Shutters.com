import { expect, test } from "@playwright/test";
const url = "/e2e/fixtures/in-house-payments.html";
for (const width of [390, 820, 1440])
  test.describe(`${width}px in-house payments`, () => {
    test.use({ viewport: { width, height: 1000 } });
    test.beforeEach(async ({ page }) => {
      const plan = {
        id: "plan",
        quote_id: "fixture",
        status: "waiting_deposit",
        review_reason: null,
        processing_error: null,
        current: {
          customerName: "Synthetic Customer",
          quoteNumber: "LOCAL-TEST",
        },
        notifications: [],
        installments: [1, 2, 3].map((n) => ({
          id: `installment-${n}`,
          plan_id: "plan",
          number: n,
          amount_cents: 30001,
          paid_cents: 0,
          due_date: n === 1 ? "2026-01-31" : null,
        })),
      };
      await page.route("**/api/crm/in-house-plans/", (r) =>
        r.fulfill({ json: { plans: [plan] } }),
      );
      await page.route("**/api/crm/in-house-plans/plan/receipt/", async (r) => {
        const b = r.request().postDataJSON();
        expect(b).toMatchObject({
          installmentId: "installment-1",
          amount: 100,
          receiptDate: "2026-01-31",
          method: "check",
        });
        expect(b.requestId).toMatch(/^[a-f0-9-]{36}$/);
        plan.installments[0].paid_cents = 10000;
        await r.fulfill({ json: { plan, receipt: { reused: false } } });
      });
      await page.route("**/api/test/payment-schedule", (r) =>
        r.fulfill({ json: { ok: true } }),
      );
    });
    test("saves and reloads versioned terms and returns to standard", async ({
      page,
    }) => {
      await page.goto(url);
      const terms = page.getByRole("region", { name: "Quote payment terms" });
      await terms
        .getByRole("button", { name: "In-house 3-month payments", exact: true })
        .click();
      await expect(terms).toContainText("Deposit: $300.01");
      await terms.getByRole("button", { name: "Save payment terms" }).click();
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("schedule")))
        .toBe("in_house_three_month_v1");
      await page.reload();
      await expect(
        terms.getByRole("button", {
          name: "In-house 3-month payments",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await terms
        .getByRole("button", { name: "Return to standard payments" })
        .click();
      await terms.getByRole("button", { name: "Save payment terms" }).click();
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("schedule")))
        .toBe("standard");
      await page.reload();
      await expect(
        terms.getByRole("button", {
          name: "In-house 3-month payments",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "false");
    });
    test("records a partial receipt and displays relative monthly dates without horizontal overflow", async ({
      page,
    }) => {
      await page.goto(url);
      const tracking = page.getByRole("region", {
        name: "In-house payment tracking",
      });
      await tracking
        .getByRole("button", { name: "Record received payment 1", exact: true })
        .click();
      await tracking.getByLabel("Amount received").fill("100");
      await tracking
        .getByLabel("Actual receipt date (Los Angeles)")
        .fill("2026-01-31");
      await tracking
        .getByRole("combobox", { name: "Method" })
        .selectOption("check");
      await tracking
        .getByRole("button", { name: "Save received payment" })
        .click();
      await expect(tracking).toContainText("Received: $100.00");
      await expect(tracking).toContainText("Remaining: $200.01");
      await expect(tracking).toContainText("Waiting for full deposit");
      await expect(tracking).toContainText(
        "1 calendar month after full deposit",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `output/in-house-payments/tracking-${width}.png`,
        fullPage: true,
      });
    });
    test("shows signed three-payment terms and requests the exact deposit installment", async ({
      page,
    }) => {
      await page.route(
        "**/api/quote/synthetic-signing/square-checkout",
        async (r) => {
          expect(r.request().postDataJSON()).toMatchObject({
            paymentType: "deposit",
            installmentId: "installment-1",
          });
          await r.fulfill({ json: { message: "Synthetic checkout verified" } });
        },
      );
      await page.goto(url + "?signed=1");
      await expect(
        page.getByRole("region", { name: "Three-payment schedule" }),
      ).toContainText("Payment 1 of 3: $300.01");
      await expect(
        page.getByText(
          "There is no added financing fee or interest and no automatic card charging.",
          { exact: false },
        ),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Pay deposit with card", exact: true })
        .click();
      await expect(
        page.getByText("Synthetic checkout verified", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("50% deposit today, the rest auto-charged monthly", {
          exact: false,
        }),
      ).toHaveCount(0);
    });
  });
