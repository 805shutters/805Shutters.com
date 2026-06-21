import { describe, expect, it } from "vitest";
import {
  buildDashboardSummaryMetrics,
  needToOrderRows,
  quotedPipelineQuotes
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
    mikeProfit: 0,
    salesOwner: "mike",
    installationInvoiceDocumentId: null,
    installationInvoiceAmount: 0,
    installationInvoiceNumber: null,
    installationInvoiceUrl: null,
    installationMatchStatus: "unmatched",
    installationMatchedAt: null,
    isInstallationComplete: false,
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
    ...overrides
  };
}

describe("dashboard summary metrics", () => {
  it("counts Need to Order by sold/approved status, not order-number presence", () => {
    const rows = [
      row({ id: "sold-with-ref", jobId: "job-sold", status: "sold", manufacturerOrderRef: "ABC-123" }),
      row({ id: "approved", jobId: "job-approved", status: "approved" }),
      row({ id: "closed-live", jobId: "job-closed", status: "sold", liveStatus: "closed" }),
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
        "depositCollected",
        "installReview",
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
    expect(summary).not.toHaveProperty("customerFiles");
    expect(summary).not.toHaveProperty("jessicaOwed");
    expect(summary).not.toHaveProperty("payoffLeft");
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
});
