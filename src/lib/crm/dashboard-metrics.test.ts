import { describe, expect, it } from "vitest";
import {
  buildDashboardSummaryMetrics,
  needToOrderRows,
  quotedPipelineQuotes,
  depositNeededRows,
  balanceDueCompletedRows,
  soldLifecycleJobs
} from "@/lib/crm/dashboard-metrics";
import { CrmBookkeepingRow, CrmJob, CrmQuote } from "@/lib/crm/types";

function job(overrides: Partial<CrmJob> = {}): CrmJob {
  return {
    id: "job-1",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    source: "crm",
    lead_id: null,
    status: "sold",
    priority: "normal",
    customer_name: "Test Customer",
    phone: "8055551212",
    email: null,
    address: null,
    city: "Ventura",
    product_interest: "Shutters",
    sales_owner: "Mike",
    next_action: null,
    next_action_due: null,
    appointment_start: null,
    appointment_end: null,
    estimated_total: 0,
    deposit_paid: 0,
    notes: null,
    meta: {},
    ...overrides
  };
}

function quote(overrides: Partial<CrmQuote> = {}): CrmQuote {
  return {
    id: "quote-1",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    job_id: "job-1",
    quote_number: null,
    status: "sent",
    quote_total: 1000,
    materials_cost: 0,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 0,
    balance_due: 0,
    sold_by: null,
    sent_at: "2026-06-15T00:00:00.000Z",
    approved_at: null,
    sold_at: null,
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    customer_email: null,
    customer_phone: null,
    customer_address: null,
    share_token: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    quote_group_id: null,
    quote_label: null,
    meta: {},
    notes: null,
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
    balancePaid: 0,
    paidTotal: 0,
    creditIn: 0,
    creditOut: 0,
    paymentType: null,
    cogs: 500,
    balance: 1000,
    kenCut: 0,
    kenCutOverride: null,
    advertisingReserve: 70,
    mikeProfit: 0,
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
  };
}

describe("dashboard summary metrics", () => {
  it("counts Need to Order by sold/approved status, not order-number presence", () => {
    const rows = [
      row({ id: "sold-with-ref", jobId: "job-sold", status: "sold", manufacturerOrderRef: "ABC-123" }),
      row({ id: "approved", jobId: "job-approved", status: "approved" }),
      row({ id: "closed-live", jobId: "job-closed", status: "sold", liveStatus: "closed", isPaidInFull: true, balance: 0 }),
      row({ id: "ordered", jobId: "job-ordered", status: "ordered", manufacturerOrderRef: null }),
      row({ id: "paid", jobId: "job-paid", status: "sold", isPaidInFull: true, balance: 0 })
    ];

    expect(needToOrderRows(rows).map((item) => item.id)).toEqual(["sold-with-ref", "approved"]);

    const summary = buildDashboardSummaryMetrics({
      jobs: [],
      quotes: [],
      rows,
      installationInvoiceEmails: [],
      orderCogsEmails: []
    });

    expect(summary.needsOrder).toBe(2);
  });

  it("keeps only the sales and operations top-summary fields", () => {
    const summary = buildDashboardSummaryMetrics({
      jobs: [],
      quotes: [],
      rows: [],
      installationInvoiceEmails: [],
      orderCogsEmails: []
    });

    expect(Object.keys(summary).sort()).toEqual(
      [
        "awaitingProduct",
        "balanceDueCompleted",
        "balanceDueCompletedAmount",
        "depositCollected",
        "depositNeeded",
        "depositNeededAmount",
        "measureNeeded",
        "missingCogs",
        "needsOrder",
        "openBalance",
        "openJobs",
        "quotedJobs",
        "quotedPipeline",
        "scheduledJobs",
        "soldJobs",
        "soldPipeline"
      ].sort()
    );
    expect(summary).not.toHaveProperty("readyInstall");
    expect(summary).not.toHaveProperty("readyToInstall");
    expect(summary).not.toHaveProperty("installReview");
    expect(summary).not.toHaveProperty("customerFiles");
    expect(summary).not.toHaveProperty("jessicaOwed");
    expect(summary).not.toHaveProperty("payoffLeft");
  });

  it("counts only active sold measure-needed jobs", () => {
    const summary = buildDashboardSummaryMetrics({
      jobs: [
        job({ id: "needs-measure", meta: { measure_needed: { status: "needed" } } }),
        job({ id: "ordered-measure", status: "ordered", meta: { measure_needed: { status: "needed" } } }),
        job({ id: "measured", meta: { measure_needed: { status: "measured" } } }),
        job({ id: "unflagged", meta: {} })
      ],
      quotes: [],
      rows: [],
      installationInvoiceEmails: [],
      orderCogsEmails: []
    });

    expect(summary.measureNeeded).toBe(1);
  });

  it("counts Sold Jobs from CRM job lifecycle statuses, not bookkeeping rows", () => {
    const jobs = [
      job({ id: "new", status: "new" }),
      job({ id: "scheduled", status: "scheduled" }),
      job({ id: "quoted", status: "quoted" }),
      job({ id: "sold", status: "sold" }),
      job({ id: "ordered", status: "ordered" }),
      job({ id: "installed", status: "installed" }),
      job({ id: "invoiced", status: "invoiced" }),
      job({ id: "closed", status: "closed" }),
      job({ id: "lost", status: "lost" })
    ];
    const rows = [
      row({ id: "manual-a", jobId: null, source: "manual", status: "manual" }),
      row({ id: "manual-b", jobId: null, source: "manual", status: "manual" }),
      row({ id: "legacy", jobId: null, source: "legacy_sheet", status: "legacy" }),
      row({ id: "sold-row", jobId: "sold", status: "sold" })
    ];

    const summary = buildDashboardSummaryMetrics({
      jobs,
      quotes: [],
      rows,
      installationInvoiceEmails: [],
      orderCogsEmails: []
    });

    expect(soldLifecycleJobs(jobs).map((item) => item.id)).toEqual([
      "sold",
      "ordered",
      "installed",
      "invoiced",
      "closed"
    ]);
    expect(summary.soldJobs).toBe(5);
  });

  it("separates quoted pipeline from sold pipeline", () => {
    const quotes = [
      quote({ id: "group-low", quote_group_id: "group-1", quote_total: 1200 }),
      quote({ id: "group-high", quote_group_id: "group-1", quote_total: 1800 }),
      quote({ id: "standalone", quote_total: 700 }),
      quote({ id: "live-sold", live_status: "sold", quote_total: 5000 }),
      quote({ id: "old", quote_total: 9000, sent_at: "2026-03-01T00:00:00.000Z" }),
      quote({ id: "sold", status: "sold", quote_total: 4000 })
    ];
    const rows = [
      row({ id: "sold-open", jobId: "job-open", status: "sold", total: 3000, balance: 1200 }),
      row({ id: "approved-open", jobId: "job-approved", status: "approved", total: 1500, balance: 1500 }),
      row({ id: "paid-sold", jobId: "job-paid", status: "sold", total: 5000, balance: 0, isPaidInFull: true })
    ];

    expect(quotedPipelineQuotes(quotes, "2026-06-20T00:00:00.000Z").map((item) => item.id)).toEqual([
      "group-high",
      "standalone"
    ]);

    const summary = buildDashboardSummaryMetrics({
      jobs: [job({ id: "job-open" }), job({ id: "job-approved" }), job({ id: "job-paid" })],
      quotes,
      rows,
      installationInvoiceEmails: [],
      orderCogsEmails: [],
      now: "2026-06-20T00:00:00.000Z"
    });

    expect(summary.quotedPipeline).toBe(2500);
    expect(summary.soldPipeline).toBe(4500);
  });

  it("keeps closed-status rows with open balances in active sold totals", () => {
    const rows = [
      row({
        id: "closed-with-balance",
        jobId: "job-closed-open",
        status: "paid",
        liveStatus: "closed",
        total: 7710,
        balance: 3855,
        isPaidInFull: false
      })
    ];

    const summary = buildDashboardSummaryMetrics({
      jobs: [job({ id: "job-closed-open", status: "closed" })],
      quotes: [],
      rows,
      installationInvoiceEmails: [],
      orderCogsEmails: []
    });

    expect(summary.openJobs).toBe(1);
    expect(summary.soldPipeline).toBe(7710);
    expect(summary.openBalance).toBe(3855);
  });
});

describe("depositNeededRows", () => {
  it("flags sold jobs where the required deposit hasn't been collected", () => {
    const rows = [
      row({ id: "a", jobId: "ja", status: "sold", depositDue: 200, depositPaid: 0, balance: 800 }),
      row({ id: "b", jobId: "jb", status: "sold", depositDue: 200, depositPaid: 200, balance: 800 }),
      row({ id: "c", jobId: "jc", status: "sold", depositDue: 0, depositPaid: 0, balance: 1000 }),
      row({ id: "d", jobId: "jd", status: "ordered", depositDue: 200, depositPaid: 0, balance: 800 }),
    ];
    expect(depositNeededRows(rows).map((r) => r.id)).toEqual(["a"]);
  });

  it("summary counts distinct jobs + sums the deposit shortfall", () => {
    const summary = buildDashboardSummaryMetrics({
      jobs: [],
      quotes: [],
      rows: [
        row({ id: "a", jobId: "ja", status: "sold", depositDue: 200, depositPaid: 50, balance: 750 }),
        row({ id: "b", jobId: "jb", status: "sold", depositDue: 300, depositPaid: 0, balance: 1000 }),
      ],
    });
    expect(summary.depositNeeded).toBe(2);
    expect(summary.depositNeededAmount).toBe(450); // (200-50) + (300-0)
  });
});

describe("balanceDueCompletedRows", () => {
  it("flags completed jobs (installed/invoiced) with an unpaid balance", () => {
    const rows = [
      row({ id: "a", jobId: "ja", liveStatus: "installed", balance: 500, isPaidInFull: false }),
      row({ id: "b", jobId: "jb", status: "sold", balance: 500, isPaidInFull: false }),
      row({ id: "c", jobId: "jc", liveStatus: "closed", balance: 0, isPaidInFull: false }),
      row({ id: "d", jobId: "jd", liveStatus: "closed", balance: 500, isPaidInFull: true }),
    ];
    expect(balanceDueCompletedRows(rows).map((r) => r.id)).toEqual(["a"]);
  });

  it("summary sums the unpaid balance for completed jobs", () => {
    const summary = buildDashboardSummaryMetrics({
      jobs: [],
      quotes: [],
      rows: [
        row({ id: "a", jobId: "ja", liveStatus: "installed", balance: 400, isPaidInFull: false }),
        row({ id: "b", jobId: "jb", liveStatus: "closed", balance: 100, isPaidInFull: false }),
      ],
    });
    expect(summary.balanceDueCompleted).toBe(2);
    expect(summary.balanceDueCompletedAmount).toBe(500);
  });
});
