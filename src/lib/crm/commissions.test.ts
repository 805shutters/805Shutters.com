import { describe, expect, it } from "vitest";
import { buildCommissionSummary } from "@/lib/crm/commissions";
import { CrmBookkeepingPayment, CrmBookkeepingRow, CrmCommissionPayment } from "@/lib/crm/types";

function bookkeepingPayment(overrides: Partial<CrmBookkeepingPayment> = {}): CrmBookkeepingPayment {
  return {
    id: "payment-1",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    quote_id: null,
    job_id: null,
    bookkeeping_entry_id: null,
    payment_label: "Balance payment",
    payment_type: "cash",
    amount: 1000,
    paid_at: "2026-06-15",
    notes: null,
    source: "manual",
    ...overrides
  };
}

function row(overrides: Partial<CrmBookkeepingRow> = {}): CrmBookkeepingRow {
  return {
    id: "row-1",
    source: "manual",
    quoteId: null,
    jobId: "job-1",
    customerName: "Test Customer",
    quoteNumber: null,
    soldDate: "2026-06-01",
    total: 1000,
    depositDue: 0,
    depositPaid: 0,
    balancePaid: 1000,
    paidTotal: 1000,
    creditIn: 0,
    creditOut: 0,
    paymentType: "cash",
    cogs: 300,
    balance: 0,
    kenCut: 100,
    kenCutOverride: null,
    mikeProfit: 600,
    salesOwner: "mike",
    installationInvoiceDocumentId: null,
    installationInvoiceAmount: 0,
    installationInvoiceNumber: null,
    installationInvoiceUrl: null,
    installationMatchStatus: "matched",
    installationMatchedAt: "2026-06-10T00:00:00.000Z",
    isInstallationComplete: true,
    remainingProfitBeforeJessica: 600,
    jessicaCommission: 0,
    jessicaCommissionPaidAt: null,
    jessicaCommissionOwed: 0,
    isPaidInFull: true,
    manufacturerName: null,
    manufacturerOrderRef: null,
    manufacturerOrderUrl: null,
    manufacturerDocumentUrl: null,
    notes: null,
    status: "closed",
    payments: [bookkeepingPayment()],
    creditsIn: [],
    creditsOut: [],
    expenses: [],
    expensesTotal: 0,
    remakeTotal: 0,
    ...overrides
  };
}

function commissionPayment(overrides: Partial<CrmCommissionPayment> = {}): CrmCommissionPayment {
  return {
    id: "commission-payment-1",
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    recipient: "mike",
    paid_on: "2026-06-30",
    period_month: "2026-06-01",
    amount: 0,
    note: null,
    created_by_email: "bookkeeper@example.com",
    meta: {},
    ...overrides
  };
}

describe("buildCommissionSummary", () => {
  it("pays Mike 100% of Mike-sale profit and splits Jessica-sale profit 50/50 after paid in full", () => {
    const summary = buildCommissionSummary(
      [
        row({ id: "mike-sale", salesOwner: "mike", remainingProfitBeforeJessica: 600 }),
        row({
          id: "jessica-sale",
          salesOwner: "jessica",
          remainingProfitBeforeJessica: 800,
          payments: [bookkeepingPayment({ id: "payment-2", paid_at: "2026-06-20" })]
        }),
        row({
          id: "open-jessica-sale",
          salesOwner: "jessica",
          remainingProfitBeforeJessica: 1000,
          isPaidInFull: false,
          balance: 1000,
          paidTotal: 0,
          payments: []
        })
      ],
      []
    );

    expect(summary.totals).toMatchObject({
      mikeEarned: 1000,
      mikePaid: 0,
      mikeOwed: 1000,
      jessicaEarned: 400,
      jessicaPaid: 0,
      jessicaOwed: 400
    });
  });

  it("subtracts Mike/Jessica payment history into monthly running balances", () => {
    const summary = buildCommissionSummary(
      [
        row({ id: "mike-june", salesOwner: "mike", remainingProfitBeforeJessica: 600 }),
        row({
          id: "jessica-june",
          salesOwner: "jessica",
          remainingProfitBeforeJessica: 800,
          payments: [bookkeepingPayment({ id: "payment-2", paid_at: "2026-06-20" })]
        }),
        row({
          id: "jessica-july",
          salesOwner: "jessica",
          soldDate: "2026-07-01",
          remainingProfitBeforeJessica: 200,
          payments: [bookkeepingPayment({ id: "payment-3", paid_at: "2026-07-05" })]
        })
      ],
      [
        commissionPayment({ id: "mike-june-paid", recipient: "mike", amount: 100, period_month: "2026-06-01" }),
        commissionPayment({
          id: "jessica-june-paid",
          recipient: "jessica",
          amount: 50,
          period_month: "2026-06-01"
        }),
        commissionPayment({ id: "mike-july-paid", recipient: "mike", amount: 20, period_month: "2026-07-01" })
      ]
    );

    expect(summary.monthly).toEqual([
      {
        periodMonth: "2026-06-01",
        mikeEarned: 1000,
        mikePaid: 100,
        mikeBalance: 900,
        jessicaEarned: 400,
        jessicaPaid: 50,
        jessicaBalance: 350
      },
      {
        periodMonth: "2026-07-01",
        mikeEarned: 100,
        mikePaid: 20,
        mikeBalance: 980,
        jessicaEarned: 100,
        jessicaPaid: 0,
        jessicaBalance: 450
      }
    ]);
    expect(summary.totals).toMatchObject({
      mikeEarned: 1100,
      mikePaid: 120,
      mikeOwed: 980,
      jessicaEarned: 500,
      jessicaPaid: 50,
      jessicaOwed: 450
    });
  });

  it("resets owed balances when commission payments cover earned commissions", () => {
    const summary = buildCommissionSummary(
      [
        row({ id: "mike-sale", salesOwner: "mike", remainingProfitBeforeJessica: 600 }),
        row({
          id: "jessica-sale",
          salesOwner: "jessica",
          remainingProfitBeforeJessica: 800,
          payments: [bookkeepingPayment({ id: "payment-2", paid_at: "2026-06-20" })]
        })
      ],
      [
        commissionPayment({ id: "mike-paid", recipient: "mike", amount: 1000, period_month: "2026-06-01" }),
        commissionPayment({ id: "jessica-paid", recipient: "jessica", amount: 400, period_month: "2026-06-01" })
      ]
    );

    expect(summary.totals).toMatchObject({
      mikeEarned: 1000,
      mikePaid: 1000,
      mikeOwed: 0,
      jessicaEarned: 400,
      jessicaPaid: 400,
      jessicaOwed: 0
    });
  });
});
