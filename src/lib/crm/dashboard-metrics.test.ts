import { describe, expect, it } from "vitest";
import {
  buildClosedSalesReport,
  previousClosedSalesMonday,
  buildDashboardSummaryMetrics,
  needToOrderRows,
  quotedPipelineQuotes,
  depositNeededRows,
  balanceDueCompletedRows,
  soldLifecycleJobs,
  trackingRowNeedsDeposit
} from "@/lib/crm/dashboard-metrics";
import { CrmCustomerContract, CrmBookkeepingRow, CrmJob, CrmQuote } from "@/lib/crm/types";

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
  it("counts prepaid unfinished orders and separates deposit prerequisites", () => {
    const rows = [
      row({ id: "sold-with-ref", jobId: "job-sold", status: "sold", manufacturerOrderRef: "ABC-123" }),
      row({ id: "approved", jobId: "job-approved", status: "approved" }),
      row({ id: "closed-live", jobId: "job-closed", status: "sold", liveStatus: "closed", isPaidInFull: true, balance: 0 }),
      row({ id: "ordered", jobId: "job-ordered", status: "ordered", manufacturerOrderRef: null }),
      row({ id: "paid", jobId: "job-paid", status: "sold", isPaidInFull: true, balance: 0 })
    ];

    expect(needToOrderRows(rows).map((item) => item.id)).toEqual(["closed-live", "paid"]);

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
        "measureScheduled",
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

  it("keeps required measures visible after ordering", () => {
    const summary = buildDashboardSummaryMetrics({
      jobs: [
        job({ id: "needs-measure", meta: { measure_needed: { status: "needed" } } }),
        job({
          id: "scheduled-measure",
          meta: {
            measure_needed: {
              status: "needed",
              schedule_status: "scheduled",
              scheduled_start_at: "2026-07-30T17:00:00.000Z"
            }
          }
        }),
        job({ id: "ordered-measure", status: "ordered", meta: { measure_needed: { status: "needed" } } }),
        job({ id: "measured", meta: { measure_needed: { status: "measured" } } }),
        job({ id: "unflagged", meta: {} })
      ],
      quotes: [],
      rows: [],
      installationInvoiceEmails: [],
      orderCogsEmails: []
    });

    expect(summary.measureNeeded).toBe(2);
    expect(summary.measureScheduled).toBe(1);
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

  it("uses the latest offered version and exact opportunity grouping, separately from sold pipeline", () => {
    const quotes = [
      quote({ id: "group-low", quote_group_id: "group-1", quote_total: 1200, sent_at: "2026-06-12T18:00:00Z" }),
      quote({ id: "group-high", quote_group_id: "group-1", quote_total: 1800, sent_at: "2026-06-10T18:00:00Z" }),
      quote({ id: "standalone", job_id: "standalone-job", quote_total: 700 }),
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
      "group-low",
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

    expect(summary.quotedPipeline).toBe(1900);
    expect(summary.soldPipeline).toBe(9500);
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
    expect(depositNeededRows(rows).map((r) => r.id)).toEqual(["a", "c"]);
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

  it("summary counts sold jobs with no payment even when the deposit amount is not configured", () => {
    const summary = buildDashboardSummaryMetrics({
      jobs: [],
      quotes: [],
      rows: [
        row({ id: "missing-deposit-amount", jobId: "j-missing", status: "sold", depositDue: 0, depositPaid: 0, balance: 2811.05 }),
      ],
    });

    expect(summary.depositNeeded).toBe(1);
    expect(summary.depositNeededAmount).toBe(0);
  });
});

describe("trackingRowNeedsDeposit", () => {
  it("keeps sold work with no configured deposit in the tracking deposit queue until a payment is recorded", () => {
    expect(trackingRowNeedsDeposit(row({ status: "sold", depositDue: 0, depositPaid: 0 }))).toBe(true);
    expect(trackingRowNeedsDeposit(row({ status: "sold", depositDue: 0, depositPaid: 100 }))).toBe(false);
  });

  it("keeps a configured deposit in the queue until it is fully collected", () => {
    expect(trackingRowNeedsDeposit(row({ status: "approved", depositDue: 500, depositPaid: 200 }))).toBe(true);
    expect(trackingRowNeedsDeposit(row({ status: "approved", depositDue: 500, depositPaid: 500 }))).toBe(false);
    expect(trackingRowNeedsDeposit(row({ status: "ordered", depositDue: 500, depositPaid: 0 }))).toBe(false);
  });
});

describe("balanceDueCompletedRows", () => {
  it("requires a completed service report instead of status or an installer invoice", () => {
    const rows = [
      row({ id: "status-only", jobId: "status-job", liveStatus: "installed", balance: 500 }),
      row({
        id: "invoice-only",
        jobId: "invoice-job",
        liveStatus: "invoiced",
        balance: 500,
        installationInvoiceDocumentId: "gmail-invoice-1",
        installationInvoiceAmount: 300,
        installationMatchStatus: "matched",
        isInstallationComplete: true,
      }),
      row({ id: "completed-report", jobId: "completed-job", liveStatus: "installed", balance: 500 }),
    ];
    const jobs = [
      job({ id: "status-job", status: "installed" }),
      job({
        id: "invoice-job",
        status: "invoiced",
        meta: {
          installationInvoiceSource: "gmail",
          installationInvoiceMessageId: "gmail-invoice-1",
          installationInvoiceWorkflowAppliedAt: "2026-08-10T20:50:23.256Z",
        },
      }),
      job({
        id: "completed-job",
        status: "installed",
        meta: {
          completedServiceReportSource: "gmail",
          completedServiceReportMessageId: "gmail-service-1",
          completedServiceReportAppliedAt: "2026-08-11T20:50:23.256Z",
        },
      }),
    ];

    expect(balanceDueCompletedRows(rows, jobs).map((r) => r.id)).toEqual(["completed-report"]);
  });

  it("accepts completion evidence from the linked quote and excludes paid jobs", () => {
    const jobs = [job({ id: "job-a", status: "installed" }), job({ id: "job-b", status: "closed" })];
    const quotes = [
      quote({
        id: "quote-a",
        job_id: "job-a",
        status: "installed",
        meta: {
          completedServiceReportSource: "gmail",
          completedServiceReportMessageId: "gmail-service-a",
          completedServiceReportAppliedAt: "2026-08-11T20:50:23.256Z",
        },
      }),
      quote({
        id: "quote-b",
        job_id: "job-b",
        status: "paid",
        meta: {
          completedServiceReportSource: "gmail",
          completedServiceReportMessageId: "gmail-service-b",
          completedServiceReportAppliedAt: "2026-08-11T20:50:23.256Z",
        },
      }),
    ];
    const summary = buildDashboardSummaryMetrics({
      jobs,
      quotes,
      rows: [
        row({ id: "a", jobId: "job-a", quoteId: "quote-a", liveStatus: "installed", balance: 400 }),
        row({ id: "b", jobId: "job-b", quoteId: "quote-b", liveStatus: "closed", balance: 0, isPaidInFull: true }),
      ],
    });
    expect(summary.balanceDueCompleted).toBe(1);
    expect(summary.balanceDueCompletedAmount).toBe(400);
  });
});

// Signing-based revenue is independent of the quote, fulfillment and payment dates.
describe("weekly closed sales", () => {
  const now = "2026-09-15T18:00:00Z";
  const signed = (overrides: Partial<CrmQuote> = {}) => quote({ signed_at: "2026-09-10T18:00:00Z", status: "sold", ...overrides });
  const contract = (overrides: Partial<CrmCustomerContract> = {}): CrmCustomerContract => ({
    id: "contract-1", created_at: now, updated_at: now, customer_id: null, job_id: "job-1", quote_id: "quote-1",
    bookkeeping_entry_id: null, title: "Signed contract", contract_url: null, share_token: null, status: "sold",
    signed_at: "2026-09-10T18:00:00Z", total_amount: 1500, meta: {}, ...overrides
  });
  const calculate = (quotes: CrmQuote[] = [], contracts: CrmCustomerContract[] = [], at = now) => buildClosedSalesReport({ jobs: [job()], quotes, contracts, now: at });

  it("selects the previous Monday–Sunday week and counts an older quote by signing", () => {
    const report = calculate([signed({ quote_total: 1234.56, created_at: "2026-08-01T12:00:00Z" }), quote({ id: "unsigned" }), signed({ id: "current", signed_at: "2026-09-15T12:00:00Z" })]);
    expect(report.latestWeekStart).toBe("2026-09-07");
    expect(report.weeks[0]).toMatchObject({ startDate: "2026-09-07", endDate: "2026-09-13", startAt: "2026-09-07T07:00:00.000Z", endExclusiveAt: "2026-09-14T07:00:00.000Z", totalCents: 123456 });
    expect(report.weeks[0].sales).toHaveLength(1);
  });

  it("includes exact Monday midnight and Sunday end, but excludes the next Monday", () => {
    const report = calculate([
      signed({ id: "before", signed_at: "2026-09-07T06:59:59Z" }),
      signed({ id: "start", signed_at: "2026-09-07T07:00:00Z", quote_total: 0.1 }),
      signed({ id: "end", signed_at: "2026-09-14T06:59:59.999Z", quote_total: 0.2 }),
      signed({ id: "after", signed_at: "2026-09-14T07:00:00Z" })
    ]);
    expect(report.weeks[0].totalCents).toBe(30);
    expect(report.weeks[0].sales.map(s => s.id)).toEqual(["quote:end", "quote:start"]);
  });

  it.each([
    ["2026-03-09T12:00:00Z", "2026-03-02T08:00:00.000Z", "2026-03-09T07:00:00.000Z"],
    ["2026-11-02T12:00:00Z", "2026-10-26T07:00:00.000Z", "2026-11-02T08:00:00.000Z"],
    ["2027-01-04T12:00:00Z", "2026-12-28T08:00:00.000Z", "2027-01-04T08:00:00.000Z"]
  ])("handles DST and year boundaries at %s", (at, startAt, endExclusiveAt) => {
    expect(calculate([], [], at).weeks[0]).toMatchObject({ startAt, endExclusiveAt, totalCents: 0 });
  });

  it("does not advance the reporting week until Monday in Los Angeles", () => {
    expect(previousClosedSalesMonday("2026-09-14T06:59:59Z")).toBe("2026-08-31");
    expect(previousClosedSalesMonday("2026-09-14T07:00:00Z")).toBe("2026-09-07");
  });

  it("uses the signed snapshot despite quote edits and deduplicates linked contracts", () => {
    const records = [contract(), contract({ id: "snapshot", total_amount: 2000, meta: { contract_snapshot: { schema: "805_signed_quote_contract_v1", signedAt: "2026-09-09T12:00:00Z", totals: { total: 1350.27 } } } })];
    const report = calculate([signed({ quote_total: 9000, status: "installed", balance_due: 0 })], records);
    expect(report.weeks[0].totalCents).toBe(135027);
    expect(report.weeks[0].sales).toHaveLength(1);
    expect(report.weeks[0].sales[0].signedAt).toBe("2026-09-09T12:00:00.000Z");
  });

  it("ignores zero-valued imported contract shells when the signed sale total is recorded", () => {
    const report = calculate([signed({ quote_total: 1202.40 })], [contract({ id: "a-shell", total_amount: 0 }), contract({ id: "b-sale", total_amount: 1202.40 })]);
    expect(report.weeks[0].totalCents).toBe(120240);
    expect(calculate([signed({ quote_total: 1202.40 })], [contract({ total_amount: 0 })]).weeks[0].totalCents).toBe(120240);
    expect(calculate([signed()], [contract({ meta: { contract_snapshot: { schema: "805_signed_quote_contract_v1", totals: { total: 0 } } } })]).weeks[0].totalCents).toBe(0);
  });

  it("falls back from contract totals to accepted quote selection totals", () => {
    expect(calculate([signed({ quote_total: 9000 })], [contract()]).weeks[0].totalCents).toBe(150000);
    expect(calculate([signed({ quote_total: 9000, meta: { signed_selection: { total: 1200.25 } } })]).weeks[0].totalCents).toBe(120025);
  });

  it("counts one accepted alternative while retaining separate purchases by the same customer", () => {
    const report = calculate([
      signed({ id: "first", quote_group_id: "group", signed_at: "2026-09-08T12:00:00Z", quote_total: 100 }),
      signed({ id: "duplicate-alternative", quote_group_id: "group", quote_total: 200 }),
      quote({ id: "unsigned-alternative", quote_group_id: "group", quote_total: 5000 }),
      signed({ id: "separate-purchase", quote_total: 300 })
    ]);
    expect(report.weeks[0].totalCents).toBe(40000);
    expect(report.weeks[0].sales).toHaveLength(2);
  });

  it("keeps historical gross revenue after status and payment changes", () => {
    for (const status of ["sold", "ordered", "installed", "archived"] as const) {
      expect(calculate([signed({ status, quote_total: 725.55, balance_due: 0 })]).weeks[0].totalCents).toBe(72555);
    }
  });

  it("ignores fabricated display dates and reports undated signature evidence", () => {
    const report = calculate([signed({ source_signed_at: null, customer_signature: "signature", sold_at: "2026-09-10T18:00:00Z" })]);
    expect(report.weeks[0].totalCents).toBe(0);
    expect(report.review[0].reason).toContain("signing date");
  });

  it("does not turn invalid or missing amounts into zero or use a lower-priority edited amount", () => {
    for (const amount of [NaN, -1, "", "invalid"] as unknown as number[]) {
      const report = calculate([signed()], [contract({ total_amount: amount })]);
      expect(report.weeks[0].sales).toEqual([]);
      expect(report.review[0].reason).toContain("amount");
    }
    expect(calculate([signed({ quote_total: 0 })]).weeks[0].sales).toHaveLength(1);
  });

  it("matches token-only contracts and includes standalone signed contracts", () => {
    const report = calculate([signed({ share_token: "same-sale" })], [contract({ quote_id: null, share_token: "same-sale" }), contract({ id: "standalone", quote_id: null, job_id: null, total_amount: 500 })]);
    expect(report.weeks[0].totalCents).toBe(200000);
    expect(report.weeks[0].sales).toHaveLength(2);
  });

  it("includes empty intervening weeks for history navigation and sums every detail row", () => {
    const report = calculate([signed({ signed_at: "2026-08-25T12:00:00Z" })]);
    expect(report.weeks.map(week => [week.startDate, week.totalCents])).toEqual([["2026-09-07", 0], ["2026-08-31", 0], ["2026-08-24", 100000]]);
    for (const week of report.weeks) expect(week.totalCents).toBe(week.sales.reduce((sum, sale) => sum + sale.amountCents, 0));
  });

  it("flags ambiguous job-only contracts instead of counting them as another purchase", () => {
    const report = calculate([signed(), quote({ id: "alternative" })], [contract({ quote_id: null })]);
    expect(report.weeks[0].totalCents).toBe(100000);
    expect(report.review[0].reason).toContain("exact quote link");
  });

  it.each(["2026-02-30", "invalid", "2026-09-10T12:00:00"])("rejects unreliable signing dates: %s", signed_at => {
    expect(calculate([signed({ signed_at })]).review).toHaveLength(1);
  });

  it("treats a recorded date-only signature as a Los Angeles calendar date", () => {
    expect(calculate([], [contract({ signed_at: "2026-09-07" })]).weeks[0].totalCents).toBe(150000);
  });
});
