import { describe, expect, it } from "vitest";
import {
  buildPartnerPaymentLedger,
  buildUnpaidPartnerPaymentItemForRow,
  partnerPaymentItemKeyForRow
} from "@/lib/crm/partner-payments";
import {
  CrmBookkeepingPayment,
  CrmBookkeepingRow,
  CrmCommissionPayment,
  CrmCommissionPaymentAllocation,
  CrmKenPayment,
  CrmKenPaymentAllocation
} from "@/lib/crm/types";

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
    customerPhone: null,
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
    installationInvoicePaidAt: null,
    installationInvoicePaidAmount: 0,
    installationInvoicePaymentMethod: null,
    installationInvoicePaymentNotes: null,
    installationInvoiceOpenAmount: 0,
    isInstallationInvoicePaid: false,
    installationMatchStatus: "matched",
    installationMatchedAt: "2026-06-10T00:00:00.000Z",
    isInstallationComplete: true,
    isMissingInstallerInvoice: false,
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

function kenPayment(overrides: Partial<CrmKenPayment> = {}): CrmKenPayment {
  return {
    id: "ken-payment-1",
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    paid_on: "2026-06-30",
    period_month: "2026-06-01",
    amount: 0,
    note: null,
    created_by_email: "bookkeeper@example.com",
    meta: {},
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

function kenAllocation(overrides: Partial<CrmKenPaymentAllocation> = {}): CrmKenPaymentAllocation {
  return {
    id: "ken-allocation-1",
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    payment_id: "ken-payment-1",
    source: "manual",
    quote_id: null,
    bookkeeping_entry_id: "row-1",
    job_id: "job-1",
    item_key: "ken:manual:row-1",
    customer_name: "Test Customer",
    closed_at: "2026-06-15",
    amount: 100,
    period_month: "2026-06-01",
    meta: {},
    ...overrides
  };
}

function commissionAllocation(overrides: Partial<CrmCommissionPaymentAllocation> = {}): CrmCommissionPaymentAllocation {
  return {
    id: "commission-allocation-1",
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    payment_id: "commission-payment-1",
    recipient: "mike",
    source: "manual",
    quote_id: null,
    bookkeeping_entry_id: "row-1",
    job_id: "job-1",
    item_key: "mike:manual:row-1",
    customer_name: "Test Customer",
    closed_at: "2026-06-15",
    amount: 600,
    period_month: "2026-06-01",
    meta: {},
    ...overrides
  };
}

describe("partner payment row helpers", () => {
  it("builds the same clickable unpaid item from a paid-in-full row", () => {
    const paymentRow = row({
      id: "jessica-row",
      salesOwner: "jessica",
      mikeProfit: 300,
      jessicaCommission: 300,
      jessicaCommissionOwed: 300
    });
    const item = buildUnpaidPartnerPaymentItemForRow("jessica", paymentRow);

    expect(partnerPaymentItemKeyForRow("jessica", paymentRow)).toBe("jessica:manual:jessica-row");
    expect(item).toMatchObject({
      itemKey: "jessica:manual:jessica-row",
      person: "jessica",
      remainingAmount: 300,
      paymentState: "unpaid"
    });
  });

  it("does not create a clickable payment item for open rows or zero amounts", () => {
    expect(buildUnpaidPartnerPaymentItemForRow("mike", row({ isPaidInFull: false, balance: 100 }))).toBeNull();
    expect(buildUnpaidPartnerPaymentItemForRow("jessica", row({ jessicaCommission: 0 }))).toBeNull();
  });

  it("holds Mike/Jessica items while the installer invoice is missing, but not Ken's", () => {
    const heldRow = row({
      id: "held-row",
      salesOwner: "jessica",
      kenCut: 100,
      mikeProfit: 300,
      jessicaCommission: 300,
      jessicaCommissionOwed: 0,
      isMissingInstallerInvoice: true
    });
    expect(buildUnpaidPartnerPaymentItemForRow("mike", heldRow)).toBeNull();
    expect(buildUnpaidPartnerPaymentItemForRow("jessica", heldRow)).toBeNull();
    expect(buildUnpaidPartnerPaymentItemForRow("ken", heldRow)).toMatchObject({
      person: "ken",
      remainingAmount: 100,
      paymentState: "unpaid"
    });
  });
});

describe("buildPartnerPaymentLedger", () => {
  it("creates active payable rows only for paid-in-full jobs", () => {
    const ledger = buildPartnerPaymentLedger({
      rows: [
        row({ id: "mike-sale", salesOwner: "mike", remainingProfitBeforeJessica: 600, kenCut: 100 }),
        row({
          id: "jessica-sale",
          jobId: "job-2",
          customerName: "Jessica Customer",
          salesOwner: "jessica",
          remainingProfitBeforeJessica: 800,
          mikeProfit: 400,
          jessicaCommission: 400,
          kenCut: 100,
          payments: [bookkeepingPayment({ id: "payment-2", paid_at: "2026-06-20" })]
        }),
        row({
          id: "open-sale",
          jobId: "job-3",
          salesOwner: "mike",
          remainingProfitBeforeJessica: 1000,
          balance: 1000,
          paidTotal: 0,
          isPaidInFull: false,
          payments: []
        })
      ],
      kenPayments: [],
      commissionPayments: []
    });

    expect(ledger.people.ken).toMatchObject({ earned: 200, paid: 0, owed: 200, activeJobCount: 2 });
    expect(ledger.people.mike).toMatchObject({ earned: 1000, paid: 0, owed: 1000, activeJobCount: 2 });
    expect(ledger.people.jessica).toMatchObject({ earned: 400, paid: 0, owed: 400, activeJobCount: 1 });
  });

  it("keeps Ken payable but holds Mike/Jessica on rows missing the installer invoice", () => {
    const ledger = buildPartnerPaymentLedger({
      rows: [
        row({
          id: "held-sale",
          salesOwner: "jessica",
          kenCut: 100,
          mikeProfit: 400,
          jessicaCommission: 400,
          jessicaCommissionOwed: 0,
          isMissingInstallerInvoice: true
        })
      ],
      kenPayments: [],
      commissionPayments: []
    });

    expect(ledger.people.ken).toMatchObject({ earned: 100, owed: 100, activeJobCount: 1 });
    expect(ledger.people.mike).toMatchObject({ earned: 0, owed: 0, activeJobCount: 0 });
    expect(ledger.people.jessica).toMatchObject({ earned: 0, owed: 0, activeJobCount: 0 });
  });

  it("tracks Mike and Jessica sold earnings before jobs become payable", () => {
    const ledger = buildPartnerPaymentLedger({
      rows: [
        row({
          id: "mike-sold",
          jobId: "job-mike-sold",
          status: "sold",
          salesOwner: "mike",
          balance: 1000,
          paidTotal: 0,
          isPaidInFull: false,
          payments: [],
          mikeProfit: 600,
          jessicaCommission: 0
        }),
        row({
          id: "jessica-sold",
          jobId: "job-jessica-sold",
          status: "approved",
          salesOwner: "jessica",
          balance: 1000,
          paidTotal: 0,
          isPaidInFull: false,
          payments: [],
          mikeProfit: 400,
          jessicaCommission: 400
        })
      ],
      kenPayments: [],
      commissionPayments: []
    });

    expect(ledger.people.mike).toMatchObject({
      earned: 0,
      owed: 0,
      activeJobCount: 0,
      soldEarned: 1000,
      soldJobCount: 2
    });
    expect(ledger.people.jessica).toMatchObject({
      earned: 0,
      owed: 0,
      activeJobCount: 0,
      soldEarned: 400,
      soldJobCount: 1
    });
  });

  it("mirrors the displayed Mike and Jessica payout amounts instead of re-deriving a split", () => {
    const ledger = buildPartnerPaymentLedger({
      rows: [
        row({
          id: "displayed-mike-only",
          salesOwner: "jessica",
          remainingProfitBeforeJessica: 1000,
          mikeProfit: 909.6,
          jessicaCommission: 0
        })
      ],
      kenPayments: [],
      commissionPayments: []
    });

    expect(ledger.people.mike.activeItems).toHaveLength(1);
    expect(ledger.people.mike.activeItems[0]).toMatchObject({
      itemKey: "mike:manual:displayed-mike-only",
      remainingAmount: 909.6
    });
    expect(ledger.people.jessica.activeItems).toHaveLength(0);
  });

  it("marks explicitly allocated jobs paid and resets due balances", () => {
    const ledger = buildPartnerPaymentLedger({
      rows: [row()],
      kenPayments: [kenPayment({ amount: 100 })],
      kenAllocations: [kenAllocation()],
      commissionPayments: [commissionPayment({ amount: 600 })],
      commissionAllocations: [commissionAllocation()]
    });

    expect(ledger.people.ken).toMatchObject({ earned: 100, paid: 100, owed: 0, activeJobCount: 0 });
    expect(ledger.people.mike).toMatchObject({ earned: 600, paid: 600, owed: 0, activeJobCount: 0 });
    expect(ledger.history.find((batch) => batch.id === "ken-payment-1")?.allocations).toHaveLength(1);
  });

  it("uses selected allocation metadata when allocation rows are unavailable", () => {
    const ledger = buildPartnerPaymentLedger({
      rows: [row()],
      kenPayments: [],
      commissionPayments: [
        commissionPayment({
          amount: 600,
          meta: {
            selectedItemAllocations: [
              {
                person: "mike",
                source: "manual",
                bookkeeping_entry_id: "row-1",
                job_id: "job-1",
                item_key: "mike:manual:row-1",
                customer_name: "Test Customer",
                closed_at: "2026-06-15",
                amount: 600,
                period_month: "2026-06-01"
              }
            ]
          }
        })
      ]
    });

    expect(ledger.people.mike).toMatchObject({ earned: 600, paid: 600, owed: 0, activeJobCount: 0 });
    expect(ledger.history[0].allocations[0]).toMatchObject({
      itemKey: "mike:manual:row-1",
      amount: 600,
      virtual: false
    });
  });

  it("does not double count metadata when explicit allocation rows are loaded", () => {
    const ledger = buildPartnerPaymentLedger({
      rows: [row()],
      kenPayments: [],
      commissionPayments: [
        commissionPayment({
          amount: 600,
          meta: {
            selectedItemAllocations: [
              {
                person: "mike",
                source: "manual",
                item_key: "mike:manual:row-1",
                customer_name: "Test Customer",
                amount: 600
              }
            ]
          }
        })
      ],
      commissionAllocations: [commissionAllocation()]
    });

    expect(ledger.people.mike).toMatchObject({ earned: 600, paid: 600, owed: 0, activeJobCount: 0 });
    expect(ledger.history[0].allocations).toHaveLength(1);
    expect(ledger.history[0].allocations[0].id).toBe("commission-allocation-1");
  });

  it("applies unallocated legacy payments oldest-first without losing history", () => {
    const ledger = buildPartnerPaymentLedger({
      rows: [
        row({ id: "older", customerName: "Older", remainingProfitBeforeJessica: 600 }),
        row({
          id: "newer",
          customerName: "Newer",
          remainingProfitBeforeJessica: 400,
          mikeProfit: 400,
          payments: [bookkeepingPayment({ id: "newer-payment", paid_at: "2026-06-25" })]
        })
      ],
      kenPayments: [],
      commissionPayments: [commissionPayment({ amount: 700 })]
    });

    expect(ledger.people.mike).toMatchObject({ earned: 1000, paid: 700, owed: 300, activeJobCount: 1 });
    expect(ledger.people.mike.activeItems[0]).toMatchObject({ itemKey: "mike:manual:newer", remainingAmount: 300 });
    expect(ledger.history[0]).toMatchObject({ isLegacy: true });
  });

  it("leaves a remaining active balance after partial allocated payment", () => {
    const ledger = buildPartnerPaymentLedger({
      rows: [row()],
      kenPayments: [],
      commissionPayments: [commissionPayment({ amount: 250 })],
      commissionAllocations: [commissionAllocation({ amount: 250 })]
    });

    expect(ledger.people.mike).toMatchObject({ earned: 600, paid: 250, owed: 350, activeJobCount: 1 });
    expect(ledger.people.mike.activeItems[0]).toMatchObject({ paymentState: "partial", remainingAmount: 350 });
  });

  it("reopens allocated jobs when the payment and allocation are removed", () => {
    const paidLedger = buildPartnerPaymentLedger({
      rows: [row()],
      kenPayments: [kenPayment({ amount: 100 })],
      kenAllocations: [kenAllocation()],
      commissionPayments: [],
      commissionAllocations: []
    });
    const reopenedLedger = buildPartnerPaymentLedger({
      rows: [row()],
      kenPayments: [],
      kenAllocations: [],
      commissionPayments: [],
      commissionAllocations: []
    });

    expect(paidLedger.people.ken.owed).toBe(0);
    expect(reopenedLedger.people.ken.owed).toBe(100);
    expect(reopenedLedger.people.ken.activeItems).toHaveLength(1);
  });

  it("applies only Payables-button Ken payments to the 500k business buyout ledger", () => {
    const ledger = buildPartnerPaymentLedger({
      rows: [],
      kenPayments: [
        kenPayment({
          id: "legacy-ken-payment",
          paid_on: "2026-06-30",
          amount: 3778,
          meta: { batchSource: "unified_payment_ledger" }
        }),
        kenPayment({
          id: "ken-payment-1",
          paid_on: "2026-07-04",
          amount: 3714.7,
          meta: {
            batchSource: "unified_payment_ledger",
            selectedItemAllocations: [{ item_key: "ken:manual:row-1", amount: 3714.7 }]
          }
        })
      ],
      commissionPayments: []
    });

    expect(ledger.kenBuyout).toMatchObject({
      target: 500000,
      totalPaid: 3778,
      remainingBalance: 496222,
      paidPct: 0.8,
      paymentCount: 2
    });
    expect(ledger.kenBuyout.payments[0]).toMatchObject({
      id: "ken-payment-1",
      amount: 3714.7,
      runningPaid: 3714.7,
      remainingBalance: 496285.3
    });
    expect(ledger.kenBuyout.payments[1]).toMatchObject({
      id: "initial-ken-buyout-elizabeth-mathieu",
      amount: 63.3,
      runningPaid: 3778,
      remainingBalance: 496222
    });
  });
});
