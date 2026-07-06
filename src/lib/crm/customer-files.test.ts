import { describe, expect, it } from "vitest";
import { buildCustomerFiles } from "@/lib/crm/customer-files";
import type { CrmBookkeepingRow, CrmCustomer, CrmJob } from "@/lib/crm/types";

function makeCustomer(overrides: Partial<CrmCustomer>): CrmCustomer {
  return {
    id: "customer-1",
    created_at: "2026-07-04T00:00:00Z",
    updated_at: "2026-07-04T00:00:00Z",
    source: "bookkeeping_import",
    display_name: "Katie Kushner",
    normalized_name: "katie kushner",
    phone: null,
    email: null,
    address: null,
    city: null,
    first_sold_date: null,
    latest_sold_date: null,
    latest_status: "sold",
    lifetime_value: 0,
    open_balance: 0,
    notes: null,
    meta: {},
    external_source: null,
    external_id: null,
    ...overrides
  } as CrmCustomer;
}

function makeJob(overrides: Partial<CrmJob>): CrmJob {
  return {
    id: "job-1",
    created_at: "2026-06-29T00:00:00Z",
    updated_at: "2026-06-29T00:00:00Z",
    source: "manual",
    lead_id: null,
    status: "sold",
    priority: "normal",
    customer_name: "Katie Kushner",
    phone: null,
    email: null,
    address: null,
    city: null,
    product_interest: null,
    sales_owner: null,
    next_action: null,
    next_action_due: null,
    appointment_start: null,
    appointment_end: null,
    estimated_total: 0,
    deposit_paid: 0,
    notes: null,
    meta: {},
    external_source: null,
    external_id: null,
    ...overrides
  } as CrmJob;
}

function makeRow(overrides: Partial<CrmBookkeepingRow>): CrmBookkeepingRow {
  return {
    id: "row-1",
    source: "crm_quote",
    quoteId: null,
    jobId: null,
    customerName: "Katie Kushner",
    customerPhone: null,
    quoteNumber: null,
    soldDate: "2026-06-29",
    total: 0,
    depositDue: 0,
    depositPaid: 0,
    balancePaid: 0,
    paidTotal: 0,
    creditIn: 0,
    creditOut: 0,
    paymentType: null,
    cogs: 0,
    balance: 0,
    kenCut: 0,
    kenCutOverride: null,
    mikeProfit: 0,
    salesOwner: null,
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
    installationMatchStatus: "unmatched",
    installationMatchedAt: null,
    isInstallationComplete: false,
    isMissingInstallerInvoice: false,
    remainingProfitBeforeJessica: 0,
    jessicaCommission: 0,
    jessicaCommissionPaidAt: null,
    jessicaCommissionOwed: 0,
    isPaidInFull: false,
    manufacturerName: null,
    manufacturerOrderRef: null,
    manufacturerOrderUrl: null,
    manufacturerDocumentUrl: null,
    notes: null,
    status: "sold",
    payments: [],
    creditsIn: [],
    creditsOut: [],
    expenses: [],
    expensesTotal: 0,
    remakeTotal: 0,
    ...overrides
  } as CrmBookkeepingRow;
}

function build(args: Partial<Parameters<typeof buildCustomerFiles>[0]>) {
  return buildCustomerFiles({
    customers: [],
    products: [],
    contracts: [],
    jobs: [],
    quotes: [],
    bookkeepingRows: [],
    ...args
  });
}

describe("buildCustomerFiles financial totals", () => {
  it("uses live ledger data instead of the imported snapshot and ignores quoted jobs", () => {
    // Katie Kushner regression: stale imported snapshot + live ledger row for
    // the same sale + an unsold quoted job used to sum to a phantom balance.
    const files = build({
      customers: [makeCustomer({ lifetime_value: 1198.7, open_balance: 1198.7 })],
      jobs: [
        makeJob({ id: "job-shutters", status: "sold", estimated_total: 1198.7, deposit_paid: 689.25 }),
        makeJob({ id: "job-honeycomb", status: "quoted", estimated_total: 1410.3 })
      ],
      bookkeepingRows: [makeRow({ jobId: "job-shutters", total: 1198.7, balance: 509.45 })]
    });

    expect(files).toHaveLength(1);
    expect(files[0].openBalance).toBeCloseTo(509.45, 2);
    expect(files[0].lifetimeValue).toBeCloseTo(1198.7, 2);
  });

  it("keeps the imported snapshot when there is no live financial data", () => {
    const files = build({
      customers: [makeCustomer({ lifetime_value: 2500, open_balance: 800 })],
      jobs: [makeJob({ id: "job-quoted", status: "quoted", estimated_total: 1410.3 })]
    });

    expect(files[0].openBalance).toBe(800);
    expect(files[0].lifetimeValue).toBe(2500);
  });

  it("counts sold jobs without ledger rows but not closed or quoted ones", () => {
    const files = build({
      jobs: [
        makeJob({ id: "job-sold", status: "sold", estimated_total: 1000, deposit_paid: 400 }),
        makeJob({ id: "job-closed", status: "closed", estimated_total: 500, deposit_paid: 0 }),
        makeJob({ id: "job-quoted", status: "quoted", estimated_total: 900 })
      ]
    });

    expect(files).toHaveLength(1);
    // Sold job contributes its unpaid remainder; the closed job counts toward
    // lifetime value only; the quoted job counts toward neither.
    expect(files[0].openBalance).toBeCloseTo(600, 2);
    expect(files[0].lifetimeValue).toBeCloseTo(1500, 2);
  });
});
