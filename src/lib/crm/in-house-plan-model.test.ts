import { describe, it, expect } from "vitest";
import {
  monthlyDate,
  dateOnly,
  splitThirds,
  reconcilePlan,
  overdueWeek,
  planHour,
  type PaymentPlan,
  type PlanSnapshot,
  type PlanPayment,
} from "./in-house-plan-model";
import { computeQuoteMoney, DEFAULT_ADJUSTMENTS } from "./quote-money";
import { computeSelectionMoney } from "./public-quote";
import { IN_HOUSE_SCHEDULE, scheduleAmounts } from "./payment-schedule";
export function fixture(): PaymentPlan {
  const snapshot: PlanSnapshot = {
    target: { quoteId: "quote" },
    jobId: "job",
    customerName: "Synthetic",
    quoteNumber: "TEST",
    email: "sample@example.invalid",
    phone: "+18055550100",
    acceptedDate: "2024-01-29",
    totalCents: 10001,
    depositCents: 3333,
    depositOutstandingCents: 3333,
    outstandingCents: 10001,
    paidCents: 0,
    creditFingerprint: "[]",
    payments: [],
  };
  return {
    id: "plan",
    quote_id: "quote",
    bookkeeping_entry_id: null,
    status: "waiting_deposit",
    principal_cents: 10001,
    baseline: structuredClone(snapshot),
    current: structuredClone(snapshot),
    anchor_date: null,
    review_reason: null,
    approved_by: "signed-contract",
    approved_at: "2024-01-29",
    updated_at: "2024-01-29",
    installments: [3333, 3333, 3335].map((c, n) => ({
      id: `i${n + 1}`,
      plan_id: "plan",
      number: n + 1,
      amount_cents: c,
      paid_cents: 0,
      due_date: n === 0 ? "2024-01-29" : null,
    })),
  };
}
function receipt(
  id: string,
  cents: number,
  paidAt: string,
  installmentId?: string,
): PlanPayment {
  return {
    id,
    cents,
    paidAt,
    installmentId,
    method: "check",
    label: "Payment",
  };
}
function snapshot(p: PaymentPlan, payments: PlanPayment[]) {
  const paid = payments.reduce((n, r) => n + r.cents, 0);
  return {
    ...p.current,
    payments,
    paidCents: paid,
    outstandingCents: p.principal_cents - paid,
    depositOutstandingCents: Math.max(3333 - paid, 0),
  };
}
describe("accepted three-month receipt schedule", () => {
  it.each([
    [10001, [3333, 3333, 3335]],
    [10002, [3334, 3334, 3334]],
    [10000, [3333, 3333, 3334]],
    [3, [1, 1, 1]],
  ])("rounds %i cents into exactly three payments", (c, expected) =>
    expect(splitThirds(c as number)).toEqual(expected),
  );
  it("handles month ends, leap years and Los Angeles midnight", () => {
    expect(monthlyDate("2024-01-31", 1)).toBe("2024-02-29");
    expect(monthlyDate("2025-01-31", 1)).toBe("2025-02-28");
    expect(monthlyDate("2024-01-31", 2)).toBe("2024-03-31");
    expect(monthlyDate("2024-12-31", 1)).toBe("2025-01-31");
    expect(dateOnly("2024-02-01T05:00:00Z")).toBe("2024-01-31");
    expect(planHour(new Date("2026-10-03T16:00Z"))).toBe(9);
  });
  it("waits for full deposit and anchors to its final receipt rather than acceptance or installation", () => {
    const p = fixture();
    const part = reconcilePlan(
      p,
      snapshot(p, [receipt("a", 1000, "2024-01-30")]),
    );
    expect(part.status).toBe("waiting_deposit");
    expect(part.installments.map((i) => i.due_date)).toEqual([
      "2024-01-29",
      null,
      null,
    ]);
    const full = reconcilePlan(
      { ...p, ...part },
      snapshot(p, [
        receipt("a", 1000, "2024-01-30"),
        receipt("b", 2333, "2024-01-31"),
      ]),
    );
    expect(full.status).toBe("active");
    expect(full.anchor_date).toBe("2024-01-31");
    expect(full.installments.map((i) => i.due_date)).toEqual([
      "2024-01-29",
      "2024-02-29",
      "2024-03-31",
    ]);
  });
  it("allocates partial and early payments oldest first and identified payments to the exact installment", () => {
    const p = fixture();
    const r = reconcilePlan(
      p,
      snapshot(p, [
        receipt("early", 1000, "2024-01-30", "i3"),
        receipt("deposit", 4333, "2024-01-31"),
      ]),
    );
    expect(r.installments.map((i) => i.paid_cents)).toEqual([3333, 1000, 1000]);
    expect(r.allocations.reduce((n, a) => n + a.amount_cents, 0)).toBe(5333);
    expect(reconcilePlan({ ...p, ...r }, r.current).installments).toEqual(
      r.installments,
    );
  });
  it("completes only when all three are covered", () => {
    const p = fixture();
    const r = reconcilePlan(
      p,
      snapshot(p, [receipt("all", 10001, "2024-01-31")]),
    );
    expect(r.status).toBe("completed");
    expect(r.installments.map((i) => i.paid_cents)).toEqual([3333, 3333, 3335]);
  });
  it.each([
    "removed",
    "date",
    "total",
    "refund",
    "credit",
    "duplicate",
    "missing-date",
  ])("holds collection after %s changes", (kind) => {
    const p = fixture();
    const r = reconcilePlan(p, snapshot(p, [receipt("a", 3333, "2024-01-31")]));
    const changed = snapshot(p, [receipt("a", 3333, "2024-01-31")]);
    if (kind === "removed") changed.payments = [];
    if (kind === "date") changed.payments[0].paidAt = "2024-02-01";
    if (kind === "total") changed.totalCents++;
    if (kind === "credit") changed.creditFingerprint = "credit";
    if (kind === "refund")
      changed.payments.push(receipt("refund", -100, "2024-02-01"));
    if (kind === "duplicate") changed.payments.push(changed.payments[0]);
    if (kind === "missing-date") changed.payments[0].paidAt = "";
    expect(reconcilePlan({ ...p, ...r }, changed).status).toBe("review");
  });
  it("keeps pause/cancellation and weekly staff alert boundaries", () => {
    const p = fixture();
    expect(reconcilePlan({ ...p, status: "paused" }, p.current).status).toBe(
      "paused",
    );
    expect(reconcilePlan({ ...p, status: "cancelled" }, p.current).status).toBe(
      "cancelled",
    );
    expect(overdueWeek("2024-02-29", "2024-02-29")).toBeNull();
    expect(overdueWeek("2024-02-29", "2024-03-01")).toBe(0);
    expect(overdueWeek("2024-02-29", "2024-03-08")).toBe(1);
  });
  it("uses the final total after discounts, tax and fees; standard keeps its deposit", () => {
    const adj = {
      ...DEFAULT_ADJUSTMENTS,
      depositPercent: 50,
      discountPercent: 10,
      taxPercent: 8.25,
      fees: [{ name: "Charge", amount: 10 }],
      paymentSchedule: IN_HOUSE_SCHEDULE,
    };
    const money = computeQuoteMoney(100, adj);
    expect(money.total).toBe(107.17);
    expect(money.depositRequired).toBe(35.72);
    expect(scheduleAmounts(money.total)).toEqual([3572, 3572, 3573]);
    expect(
      computeQuoteMoney(100, { ...adj, paymentSchedule: "standard" })
        .depositRequired,
    ).toBe(53.59);
    expect(
      computeSelectionMoney(
        [{ id: "accepted", lineTotal: 50, priceReady: true }],
        adj,
      ).depositDue,
    ).toBe(19.48);
  });
});
