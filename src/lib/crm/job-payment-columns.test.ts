import { describe, expect, it } from "vitest";
import { jobPaymentColumns } from "./job-payment-columns";
import type { PaymentPlan } from "./in-house-plan-model";
import type { JobTrackingViewItem } from "./job-tracking-view";

const source = (meta: Record<string, unknown> = {}) => ({
  quote: { id: "quote-a", meta }, total: 1000, balanceOutstanding: 666.67,
} as JobTrackingViewItem);
const plan = (paid = [33333, 0, 0]): PaymentPlan => ({
  id: "plan-a", quote_id: "quote-a", bookkeeping_entry_id: null, status: "active",
  current: { outstandingCents: 100000 - paid.reduce((sum, n) => sum + n, 0) },
  installments: [33333, 33333, 33334].map((amount_cents, index) => ({
    id: `installment-${index + 1}`, plan_id: "plan-a", number: index + 1,
    amount_cents, paid_cents: paid[index], due_date: `2026-0${index + 8}-06`,
  })),
} as PaymentPlan);

describe("job payment columns", () => {
  it("keeps standard jobs on their existing two-payment layout", () => {
    expect(jobPaymentColumns(source(), [])).toBeNull();
    expect(jobPaymentColumns(source(), [{ ...plan(), quote_id: "another-quote" }])).toBeNull();
  });
  it("represents each installment independently, including partial receipts", () => {
    const result = jobPaymentColumns(source(), [plan([33333, 10000, 0])])!;
    expect(result.payments.map(p => [p.label, p.amount, p.received, p.remaining, p.paid])).toEqual([
      ["Deposit", 333.33, 333.33, 0, true],
      ["Second payment", 333.33, 100, 233.33, false],
      ["Balance", 333.34, 0, 333.34, false],
    ]);
    expect(result.outstanding).toBe(566.67);
    expect(result.paidCount).toBe(1);
    expect(result.payments[1].dueDate).toBe("2026-09-06");
  });
  it("does not mistake an early final receipt for all payments paid", () => {
    const result = jobPaymentColumns(source(), [plan([33333, 0, 33334])])!;
    expect(result.payments.map(p => p.paid)).toEqual([true, false, true]);
    expect(result.paidCount).toBe(2);
    expect(result.outstanding).toBe(333.33);
  });
  it("matches a standalone ledger entry by exact ID even when a quote is linked", () => {
    const item = { ...source(), row: { id: "entry-a", source: "manual", quoteId: "quote-a", meta: {} } } as JobTrackingViewItem;
    expect(jobPaymentColumns(item, [plan()])).toBeNull();
    const entryPlan = { ...plan(), id: "entry-plan", quote_id: null, bookkeeping_entry_id: "entry-a" };
    expect(jobPaymentColumns(item, [plan(), entryPlan])?.plan?.id).toBe("entry-plan");
  });
  it("shows agreed thirds without inventing receipts or monthly dates", () => {
    const agreed = source({ adjustments: { paymentSchedule: "in_house_three_month_v1" } });
    const result = jobPaymentColumns(agreed, [])!;
    expect(result.payments.map(p => p.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(result.payments.every(p => !p.paid && p.received === null && p.dueDate === null)).toBe(true);
    expect(result.verified).toBe(false);
  });
  it.each(["unavailable", "review", "incomplete", "duplicate"])("does not show receipts as verified when %s", reason => {
    let plans = [plan()];
    if (reason === "review") plans[0].status = "review";
    if (reason === "incomplete") plans[0].installments.pop();
    if (reason === "duplicate") plans.push({ ...plan(), id: "duplicate" });
    const result = jobPaymentColumns(source(), plans, reason !== "unavailable")!;
    expect(result.verified).toBe(false);
    expect(result.paidCount).toBe(0);
    expect(result.payments.every(p => p.received === null)).toBe(true);
    expect(result.notice).toBeTruthy();
  });
  it("ignores cancelled plans and retains completed and paused evidence", () => {
    expect(jobPaymentColumns(source(), [{ ...plan(), status: "cancelled" }])).toBeNull();
    expect(jobPaymentColumns(source(), [{ ...plan([33333, 33333, 33334]), status: "completed" }])?.paidCount).toBe(3);
    expect(jobPaymentColumns(source(), [{ ...plan(), status: "paused" }])?.notice).toBe("Payment plan paused.");
  });
});
