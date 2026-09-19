import { describe, expect, it } from "vitest";
import { payableFixtureRow } from "../../../e2e/fixtures/payables-data";
import { buildOwnerPayablesLedger, isOwnerPayableJob, ownerPayableFinancials, ownerPayableReadiness, projectOwnerPayableRows, resolveOwnerPaymentAmount } from "./owner-payables";
import type { CrmCommissionPayment, CrmCommissionPaymentAllocation } from "./types";

const payment = (overrides: Partial<CrmCommissionPayment> = {}): CrmCommissionPayment => ({ id: "p1", created_at: "2026-09-18", updated_at: "2026-09-18", paid_on: "2026-09-18", period_month: null, recipient: "mike", amount: 100, note: "Existing payment", created_by_email: null, meta: {}, ...overrides });

describe("equal owner payables", () => {
  it.each(["mike", "jessica", null] as const)("splits all jobs equally regardless of seller %s", salesOwner => {
    const row = payableFixtureRow({ salesOwner, total: 10000, cogs: 4000, installationInvoiceAmount: 1000, advertisingReserve: 700, expensesTotal: 55, remakeTotal: 10 });
    expect(ownerPayableFinancials(row)).toEqual({ buyout: 1000, installation: 1000, profit: 4000, mike: 2000, jessica: 2000 });
  });
  it("preserves source financials, costs, payments and metadata", () => {
    const row = payableFixtureRow({ meta: { other: "retain" } });
    const before = structuredClone(row);
    const projected = projectOwnerPayableRows([row]);
    expect(row).toEqual(before);
    expect(projected[0].mikeProfit).toBe(300);
    expect(projected[0].jessicaCommission).toBe(300);
  });
  it("conserves cents and does not pay out a loss", () => {
    for (let cents = 1; cents < 500; cents++) {
      const result = ownerPayableFinancials(payableFixtureRow({ total: 1000, cogs: 900 - cents / 100 }));
      expect(Math.round((result.mike + result.jessica) * 100)).toBe(cents);
    }
    expect(ownerPayableFinancials(payableFixtureRow({ cogs: 1000 })).mike).toBe(0);
  });
  it("uses paid-and-closed automatic state and a reversible metadata override", () => {
    expect(ownerPayableReadiness(payableFixtureRow())).toMatchObject({ ready: true, automatic: true });
    const row = payableFixtureRow({ isPaidInFull: false, balance: 200, status: "sold" });
    expect(ownerPayableReadiness(row).ready).toBe(false);
    row.meta = { ownerPayableReadiness: { ready: true, reason: "Reconciled", updatedAt: "2026-09-18" } };
    expect(ownerPayableReadiness(row)).toMatchObject({ ready: true, automatic: false });
    row.meta.ownerPayableReadiness = { ready: null, updatedAt: "2026-09-18" };
    expect(ownerPayableReadiness(row)).toMatchObject({ ready: false, automatic: true });
  });
  it("excludes unsold quotes and lost jobs", () => {
    expect(isOwnerPayableJob(payableFixtureRow({ status: "lost", isPaidInFull: false }))).toBe(false);
    expect(isOwnerPayableJob(payableFixtureRow({ status: "draft", isPaidInFull: false }))).toBe(false);
  });
  it("retains full historical payment and excess as account credit", () => {
    const rows = [payableFixtureRow()];
    const commissionPayments = [payment({ amount: 600 })];
    const before = structuredClone(commissionPayments);
    const ledger = buildOwnerPayablesLedger({ rows, kenPayments: [], commissionPayments });
    expect(ledger.people.mike).toMatchObject({ earned: 300, owed: -300, advanceBalance: 300 });
    expect(ledger.people.jessica.earned).toBe(300);
    expect(ledger.history[0].amount).toBe(600);
    expect(commissionPayments).toEqual(before);
  });
  it("keeps explicit job allocations and partial payments", () => {
    const allocation = { id: "a1", payment_id: "p1", item_key: "mike:manual:row-1", recipient: "mike", amount: 100, source: "manual", customer_name: "Test Customer", meta: {} } as CrmCommissionPaymentAllocation;
    const ledger = buildOwnerPayablesLedger({ rows: [payableFixtureRow()], kenPayments: [], commissionPayments: [payment()], commissionAllocations: [allocation] });
    expect(ledger.people.mike.items[0]).toMatchObject({ paidAmount: 100, remainingAmount: 200, paymentState: "partial", explicitAllocationIds: ["a1"] });
    expect(ledger.history[0].allocations[0].itemKey).toBe(allocation.item_key);
  });
  it("applies advances without subtracting them twice", () => {
    const ledger = buildOwnerPayablesLedger({ rows: [payableFixtureRow()], kenPayments: [], commissionPayments: [payment({ recipient: "jessica", amount: 200, meta: { advancePayment: true } })] });
    expect(ledger.people.jessica.owed).toBe(100);
    expect(ledger.people.jessica.items[0]).toMatchObject({ paidAmount: 200, remainingAmount: 100, accountCreditApplied: 200 });
    expect(ledger.history[0].isAdvance).toBe(true);
  });
  it("does not apply an advance twice when a historical payout already allocated it", () => {
    const rows = [payableFixtureRow(), payableFixtureRow({ id: "row-2" })];
    const advance = payment({ id: "advance", amount: 100, meta: { advancePayment: true } });
    const payout = payment({ id: "payout", amount: 200, meta: { advanceApplied: 100, selectedItemAllocations: [{ item_key: "mike:manual:row-1", person: "mike", source: "manual", amount: 300 }] } });
    const ledger = buildOwnerPayablesLedger({ rows, kenPayments: [], commissionPayments: [advance, payout] });
    expect(ledger.people.mike.owed).toBe(300);
    expect(ledger.people.mike.items.find(item => item.itemKey === "mike:manual:row-2")?.remainingAmount).toBe(300);
    expect(ledger.history.reduce((sum, batch) => sum + batch.amount, 0)).toBe(300);
  });
  it("accepts partial payments and rejects excess, invalid and fractional cents", () => {
    expect(resolveOwnerPaymentAmount(25, 100, 80)).toBe(25);
    for (const value of [0, -1, 81, NaN, Infinity, "bad", 0.001]) expect(() => resolveOwnerPaymentAmount(value, 100, 80)).toThrow();
  });
});
