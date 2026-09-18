import { describe, expect, it } from "vitest";
import { buildOperationsItems, buildPerformanceMetrics, formatOperationsDate, productCompletionSourceLinks, workflowSummary } from "./operations-overview";
import type { CrmBookkeepingRow, CrmCustomerContract, CrmCustomerFile, CrmCustomerProduct, CrmDashboardData, CrmJob, CrmQuote } from "./types";

const quote = (overrides: Partial<CrmQuote> = {}): CrmQuote => ({ id: "q1", job_id: "j1", created_at: "2026-09-01T12:00:00Z", status: "sent", sent_at: "2026-09-14T18:00:00Z", quote_total: 1000, meta: {}, ...overrides } as CrmQuote);
const data = (overrides: Partial<CrmDashboardData> = {}): CrmDashboardData => ({ jobs: [], quotes: [], bookkeepingRows: [], customerFiles: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [], bookkeepingPayments: [], ...overrides } as CrmDashboardData);
const product = (overrides: Partial<CrmCustomerProduct> = {}): CrmCustomerProduct => ({ id: "p1", quote_id: "q1", job_id: "j1", bookkeeping_entry_id: null, product_type: "Shutters", status: "ordered", meta: {}, ...overrides } as CrmCustomerProduct);
const contract = (overrides: Partial<CrmCustomerContract> = {}): CrmCustomerContract => ({
  id: "c1", quote_id: "q1", job_id: "j1", bookkeeping_entry_id: null, signed_at: "2026-09-15T18:00:00Z", status: "sold", meta: {}, ...overrides
} as CrmCustomerContract);
const snapshot = (lines: Array<{ lineItemId: string; productName: string; quantity: number }>) => ({
  schema: "805_signed_quote_contract_v1", signedAt: "2026-09-15T18:00:00Z", lines
});
const now = new Date("2026-09-16T19:00:00Z");

describe("operations overview source integrity", () => {
  it("projects exact signed snapshot quantities into separate header products", () => {
    const signed = contract({ meta: { contract_snapshot: snapshot([
      { lineItemId: "line-1", productName: "Plantation Shutters", quantity: 2 },
      { lineItemId: "line-2", productName: "Plantation Shutters", quantity: 1 },
      { lineItemId: "line-3", productName: "Roller Shades", quantity: 4 }
    ]) } });
    const file = { id: "file-1", customer: null, customerName: "Avery", jobs: [], quotes: [quote()], bookkeepingRows: [], products: [], contracts: [signed], notes: [] } as unknown as CrmCustomerFile;
    const item = buildOperationsItems(data({ quotes: [quote()], customerFiles: [file], customerContracts: [signed] }))[0];

    expect(item.headerProducts).toEqual([
      { id: "plantation shutters", name: "Plantation Shutters", quantity: 3 },
      { id: "roller shades", name: "Roller Shades", quantity: 4 }
    ]);
    expect(item.headerProductSource).toBe("signed_snapshot");
    expect(item.products).toEqual([]);
  });

  it("prefers the signed snapshot and never adds duplicate quote or customer-product fallback", () => {
    const signed = contract({ meta: { contract_snapshot: snapshot([
      { lineItemId: "line-1", productName: "Shutters", quantity: 2 }
    ]) } });
    const quoted = quote({ status: "sold", signed_at: "2026-09-15", meta: { signed_selection: { lineItemIds: ["line-1"] } }, lineItems: [{ id: "line-1", quantity: 2, selected_design_id: "design-a", designs: [{ id: "design-a", product_id: "shutters" }] }] } as unknown as Partial<CrmQuote>);
    const file = { id: "file-1", customer: null, customerName: "Avery", jobs: [], quotes: [quoted], bookkeepingRows: [], products: [], contracts: [signed], notes: [] } as unknown as CrmCustomerFile;
    const item = buildOperationsItems(data({ quotes: [quoted], customerFiles: [file], customerContracts: [signed], customerProducts: [product({ quantity: 9 })] }))[0];

    expect(item.headerProducts).toEqual([{ id: "shutters", name: "Shutters", quantity: 2 }]);
    expect(item.products[0].quantity).toBe(9);
  });

  it("uses only accepted units from a legacy signed quote and ignores design alternatives", () => {
    const quoted = quote({
      status: "sold", signed_at: "2026-09-15",
      meta: { signed_selection: { lineItemIds: ["shade-line#2", "shutter-line"] } },
      lineItems: [
        { id: "shade-line", quantity: 3, selected_design_id: "shade-a", designs: [{ id: "shade-a", product_id: "roller" }, { id: "shade-b", product_id: "honeycomb" }] },
        { id: "shutter-line", quantity: 1, selected_design_id: "shutter-a", designs: [{ id: "shutter-a", product_id: "onyx_shutters" }] }
      ]
    } as unknown as Partial<CrmQuote>);
    const item = buildOperationsItems(data({ quotes: [quoted] }))[0];

    expect(item.headerProducts).toEqual([
      { id: "roller shades", name: "Roller Shades", quantity: 1 },
      { id: "shutters", name: "Shutters", quantity: 1 }
    ]);
    expect(item.headerProductSource).toBe("accepted_quote_lines");
  });

  it("sums every expanded snapshot row when lineItemId repeats", () => {
    const signed = contract({ meta: { contract_snapshot: snapshot([
      { lineItemId: "shade-line", productName: "Roller Shades", quantity: 1 },
      { lineItemId: "shade-line", productName: "Roller Shades", quantity: 1 },
      { lineItemId: "shade-line", productName: "Roller Shades", quantity: 1 }
    ]) } });
    const file = { id: "file-1", customer: null, customerName: "Avery", jobs: [], quotes: [quote()], bookkeepingRows: [], products: [], contracts: [signed], notes: [] } as unknown as CrmCustomerFile;
    const item = buildOperationsItems(data({ quotes: [quote()], customerFiles: [file], customerContracts: [signed] }))[0];

    expect(item.headerProducts).toEqual([{ id: "roller shades", name: "Roller Shades", quantity: 3 }]);
  });

  it("does not let native customer notes override selected product identity", () => {
    const quoted = quote({
      status: "sold", signed_at: "2026-09-15",
      lineItems: [{ id: "line-1", quantity: 1, notes: "Customer wants the cord on the left", selected_design_id: "design-a", designs: [{ id: "design-a", product_id: "roller" }] }]
    } as unknown as Partial<CrmQuote>);

    expect(buildOperationsItems(data({ quotes: [quoted] }))[0].headerProducts).toEqual([
      { id: "roller shades", name: "Roller Shades", quantity: 1 }
    ]);
  });

  it("does not invent a label from an unknown product id", () => {
    const quoted = quote({
      status: "sold", signed_at: "2026-09-15",
      lineItems: [{ id: "line-1", quantity: 1, selected_design_id: "design-a", designs: [{ id: "design-a", product_id: "unknown_product" }] }]
    } as unknown as Partial<CrmQuote>);

    expect(buildOperationsItems(data({ quotes: [quoted] }))[0].headerProducts).toEqual([]);
  });

  it("uses legacy MTS productType before catalog identity and permits legacy product notes", () => {
    const mtsDesign = { id: "design-a", product_id: "roller", price_breakdown: { source: "mts_805_bookkeeping", productType: "Legacy Woven Woods" } };
    const breakdownQuote = quote({ status: "sold", signed_at: "2026-09-15", meta: { mts_quote_id: "mts-1" }, lineItems: [{ id: "line-1", quantity: 1, selected_design_id: "design-a", designs: [mtsDesign] }] } as unknown as Partial<CrmQuote>);
    const notesQuote = quote({ id: "q2", status: "sold", signed_at: "2026-09-15", meta: { legacy_quote_system: "mts_sales_quote" }, lineItems: [{ id: "line-2", quantity: 1, notes: "Legacy Solar Shades", selected_design_id: "design-b", designs: [{ id: "design-b", product_id: "unknown-product" }] }] } as unknown as Partial<CrmQuote>);

    expect(buildOperationsItems(data({ quotes: [breakdownQuote, notesQuote] })).map(item => item.headerProducts)).toEqual([
      [{ id: "legacy woven woods", name: "Legacy Woven Woods", quantity: 1 }],
      [{ id: "legacy solar shades", name: "Legacy Solar Shades", quantity: 1 }]
    ]);
  });

  it.each([
    ["duplicate", ["shade-line#1", "shade-line#1"]],
    ["unknown", ["missing-line"]],
    ["suffix outside quantity", ["shade-line#4"]],
    ["zero suffix", ["shade-line#0"]],
    ["malformed suffix", ["shade-line#two"]],
    ["unsuffixed expanded line", ["shade-line"]]
  ])("fails closed for %s stored selections", (_case, lineItemIds) => {
    const quoted = quote({
      status: "sold", signed_at: "2026-09-15", meta: { signed_selection: { lineItemIds } },
      lineItems: [{ id: "shade-line", quantity: 3, selected_design_id: "shade-a", designs: [{ id: "shade-a", product_id: "roller" }] }]
    } as unknown as Partial<CrmQuote>);

    const item = buildOperationsItems(data({ quotes: [quoted] }))[0];
    expect(item.headerProducts).toEqual([]);
    expect(item.headerProductSource).toBeNull();
  });

  it("ignores an unselected malformed alternative before requiring its design or quantity", () => {
    const quoted = quote({
      status: "sold", signed_at: "2026-09-15", meta: { signed_selection: { lineItemIds: ["good-line"] } },
      lineItems: [
        { id: "bad-line", quantity: null, selected_design_id: null, designs: [] },
        { id: "good-line", quantity: 1, selected_design_id: "good-design", designs: [{ id: "good-design", product_id: "onyx_shutters" }] }
      ]
    } as unknown as Partial<CrmQuote>);

    expect(buildOperationsItems(data({ quotes: [quoted] }))[0].headerProducts).toEqual([
      { id: "shutters", name: "Shutters", quantity: 1 }
    ]);
  });

  it("bypasses stale stored selection only for a materialized current partition", () => {
    const quoted = quote({
      status: "sold", signed_at: "2026-09-15",
      meta: { signed_selection: { lineItemIds: ["stale-expanded-id"] }, partial_acceptance: { role: "current" } },
      lineItems: [{ id: "current-line", quantity: 1, selected_design_id: "design-a", designs: [{ id: "design-a", product_id: "roller" }] }]
    } as unknown as Partial<CrmQuote>);

    expect(buildOperationsItems(data({ quotes: [quoted] }))[0].headerProducts).toEqual([
      { id: "roller shades", name: "Roller Shades", quantity: 1 }
    ]);
  });

  it("skips future, deleted, and malformed contract evidence instead of inventing quantities", () => {
    const future = contract({ id: "future", signed_at: null, meta: { contract_snapshot: { schema: "805_future_quote_contract_v1", lines: [{ lineItemId: "future-line", productName: "Blinds", quantity: 8 }] } } });
    const deleted = contract({ id: "deleted", meta: { deleted_at: "2026-09-16", contract_snapshot: snapshot([{ lineItemId: "deleted-line", productName: "Shades", quantity: 5 }]) } });
    const malformed = contract({ id: "malformed", meta: { contract_snapshot: snapshot([{ lineItemId: "bad-line", productName: "Shutters", quantity: 0 }]) } });
    const file = { id: "file-1", customer: null, customerName: "Avery", jobs: [], quotes: [quote()], bookkeepingRows: [], products: [], contracts: [future, deleted, malformed], notes: [] } as unknown as CrmCustomerFile;
    const item = buildOperationsItems(data({ quotes: [quote()], customerFiles: [file], customerContracts: [future, deleted, malformed], customerProducts: [product({ quantity: 1, meta: { source: "crm_job" } })] }))[0];

    expect(item.headerProducts).toEqual([]);
    expect(item.headerProductSource).toBeNull();
    expect(item.products[0].quantity).toBeNull();
  });

  it("does not treat an unsold quote attached to a ledger row as an accepted contract", () => {
    const quoted = quote({ status: "sent", signed_at: null, sold_at: null, approved_at: null, lineItems: [{ id: "line-1", quantity: 6, product_type: "Shutters" }] } as unknown as Partial<CrmQuote>);
    const row = {
      id: "q1", source: "crm_quote", quoteId: "q1", jobId: "j1", customerName: "Avery", soldDate: null,
      total: 1000, depositDue: 0, depositPaid: 0, balancePaid: 0, paidTotal: 0, creditIn: 0, creditOut: 0,
      cogs: 0, balance: 1000, kenCut: 0, kenCutOverride: null, advertisingReserve: 0, mikeProfit: 0
    } as unknown as CrmBookkeepingRow;
    const item = buildOperationsItems(data({ quotes: [quoted], bookkeepingRows: [row] }))[0];

    expect(item.headerProducts).toEqual([]);
    expect(item.headerProductSource).toBeNull();
  });

  it("groups linked records by exact product type and sums known quantities once", () => {
    const shutters = product({ quantity: 2 });
    const blinds = product({ id: "p2", product_type: "Shutters / Blinds", quantity: 3 });
    const file = { id: "file-1", customer: null, customerName: "Avery", jobs: [], quotes: [], bookkeepingRows: [], products: [shutters], contracts: [], notes: [] } as unknown as CrmCustomerFile;
    const items = buildOperationsItems(data({ quotes: [quote()], customerFiles: [file], customerProducts: [shutters, blinds] }));
    expect(items[0].products).toMatchObject([
      { name: "Shutters", quantity: 2, records: [{ id: "p1" }] },
      { name: "Shutters / Blinds", quantity: 3, records: [{ id: "p2" }] }
    ]);
  });
  it("deduplicates records before summing two same-type products and retains the combined name", () => {
    const first = product({ product_type: "Plantation Shutters, Roller Shades", quantity: 2 });
    const second = product({ id: "p2", product_type: "Plantation Shutters, Roller Shades", quantity: 3 });
    const file = { id: "file-1", customer: null, customerName: "Avery", jobs: [], quotes: [], bookkeepingRows: [], products: [first], contracts: [], notes: [] } as unknown as CrmCustomerFile;
    const items = buildOperationsItems(data({ quotes: [quote()], customerFiles: [file], customerProducts: [first, second] }));

    expect(items[0].products).toEqual([
      expect.objectContaining({
        name: "Plantation Shutters, Roller Shades",
        quantity: 5,
        records: [expect.objectContaining({ id: "p1" }), expect.objectContaining({ id: "p2" })]
      })
    ]);
  });
  it("reports unknown quantity for self-booking placeholders with absent or null window counts", () => {
    const items = buildOperationsItems(data({ quotes: [quote()], customerProducts: [
      product({ quantity: 1, meta: { source: "self_booking" } }),
      product({ id: "p2", product_type: "Blinds", quantity: 1, meta: { source: "self_booking", windowCount: null } })
    ] }));

    expect(items[0].products).toMatchObject([
      { name: "Shutters", quantity: null },
      { name: "Blinds", quantity: null }
    ]);
  });
  it("reports unknown quantity for missing invalid or synthetic job-product counts", () => {
    const items = buildOperationsItems(data({ quotes: [quote()], customerProducts: [
      product({ quantity: undefined as unknown as number }),
      product({ id: "p2", product_type: "Blinds", quantity: -1 }),
      product({ id: "p3", product_type: "Shades", quantity: 1, meta: { source: "crm_job" } })
    ] }));
    expect(items[0].products).toMatchObject([
      { name: "Shutters", quantity: null },
      { name: "Blinds", quantity: null },
      { name: "Shades", quantity: null }
    ]);
  });
  it("makes a grouped quantity unknown when any linked record count is unknown", () => {
    const items = buildOperationsItems(data({ quotes: [quote()], customerProducts: [product({ quantity: 4 }), product({ id: "p2", quantity: Number.NaN })] }));
    expect(items[0].products[0].quantity).toBeNull();
  });
  it("formats date-only sale dates without shifting and timestamps in Los Angeles", () => {
    expect(formatOperationsDate("2026-09-12")).toBe("Sep 12, 2026");
    expect(formatOperationsDate("2026-09-12T06:30:00Z")).toBe("Sep 11, 2026");
    expect(formatOperationsDate("not-a-date")).toBeNull();
  });
  it("counts grouped products only when every linked product has that milestone", () => {
    const items = buildOperationsItems(data({ quotes: [quote({ status: "sold", sold_at: "2026-09-15T18:00:00Z" })], customerProducts: [product(), product({ id: "p2", status: null }), product({ id: "p3", product_type: "Blinds", status: "shipped", meta: { ordered_at: "2026-09-15" } })] }));
    expect(items[0].products).toMatchObject([{ name: "Shutters", ordered: false, shipped: false }, { name: "Blinds", ordered: true, shipped: true }]);
    expect(workflowSummary(items, "ordered")).toMatchObject({ done: 1, total: 2 });
  });
  it("rejects contradictory exact quote links even when job IDs match", () => {
    const items = buildOperationsItems(data({ quotes: [quote()], customerProducts: [product({ quote_id: "another-quote" })] }));
    expect(items[0].products).toHaveLength(0);
  });
  it("uses an actual source order date for a productless fallback without inferring shipment or installation", () => {
    const items = buildOperationsItems(data({ quotes: [quote({ status: "paid", balance_due: 0, ordered_at: "2026-09-15", meta: { job_tracking: { stage: "complete" } } })] }));
    expect(items[0]).toMatchObject({ products: [], wholeJob: { ordered: true, shipped: false }, installed: false, paid: true });
    expect(workflowSummary(items, "ordered")).toMatchObject({ done: 1, total: 1, unknown: 0 });
  });
  it("keeps a real product group unconfirmed even when the parent has an existing order date", () => {
    const items = buildOperationsItems(data({
      quotes: [quote({ status: "sold", sold_at: "2026-09-15", ordered_at: "2026-09-15" })],
      customerProducts: [product({ status: null, meta: {} })]
    }));
    expect(items[0]).toMatchObject({ products: [{ ordered: false }], wholeJob: { ordered: true } });
    expect(workflowSummary(items, "ordered")).toMatchObject({ done: 0, total: 1 });
  });
  it("builds an exact quote fallback from a crm_quote row when the quote payload is absent", () => {
    const quoteId = "31111111-1111-4111-8111-111111111111";
    const updatedAt = "2026-09-16T12:00:00.000Z";
    const row = {
      id: quoteId, source: "crm_quote", quoteId, jobId: "41111111-1111-4111-8111-111111111111",
      sourceUpdatedAt: updatedAt, meta: { whole_job_workflow_checks: { shipped: { at: "2026-09-16" } } },
      customerName: "Row customer", soldDate: "2026-09-01", total: 1000, depositDue: 0, depositPaid: 0,
      balancePaid: 0, paidTotal: 0, creditIn: 0, creditOut: 0, cogs: 0, balance: 1000, kenCut: 0,
      kenCutOverride: null, advertisingReserve: 0, mikeProfit: 0
    } as unknown as CrmBookkeepingRow;
    const item = buildOperationsItems(data({ bookkeepingRows: [row] }))[0];
    expect(item.wholeJob).toMatchObject({ id: `whole-job-quote-${quoteId}`, shipped: true, records: [{ updatedAt }] });
  });
  it("builds a job-only fallback without requiring a quote", () => {
    const jobId = "41111111-1111-4111-8111-111111111111";
    const job = { id: jobId, status: "sold", customer_name: "Job customer", product_interest: null, created_at: "2026-09-01T12:00:00.000Z", updated_at: "2026-09-16T12:00:00.000Z", meta: { whole_job_workflow_checks: { ordered: { at: "2026-09-16" } } } } as unknown as CrmJob;
    const item = buildOperationsItems(data({ jobs: [job] }))[0];
    expect(item.wholeJob).toMatchObject({ id: `whole-job-job-${jobId}`, ordered: true, records: [{ updatedAt: job.updated_at }] });
    expect(productCompletionSourceLinks(item, item.wholeJob)).toEqual({ jobId });
  });
  it("does not send an inferred sole quote link for a standalone ledger whole-job target", () => {
    const quoteId = "31111111-1111-4111-8111-111111111111";
    const jobId = "41111111-1111-4111-8111-111111111111";
    const entryId = "51111111-1111-4111-8111-111111111111";
    const row = { id: entryId, source: "manual", quoteId: null, jobId, costRecordUpdatedAt: "2026-09-16T12:00:00.000Z", meta: {}, customerName: "Ledger customer", soldDate: "2026-09-01", total: 1000, depositDue: 0, depositPaid: 0, balancePaid: 0, paidTotal: 0, creditIn: 0, creditOut: 0, cogs: 0, balance: 1000, kenCut: 0, kenCutOverride: null, advertisingReserve: 0, mikeProfit: 0 } as unknown as CrmBookkeepingRow;
    const item = buildOperationsItems(data({ bookkeepingRows: [row], quotes: [quote({ id: quoteId, job_id: jobId, status: "sold", sold_at: "2026-09-01" })] }))[0];
    expect(item.source.quote?.id).toBe(quoteId);
    expect(productCompletionSourceLinks(item, item.wholeJob)).toEqual({ jobId, bookkeepingEntryId: entryId });
  });
  it("keeps partial installations and open service obligations active despite paid historical completion", () => {
    const items = buildOperationsItems(data({ quotes: [quote({status:"paid", balance_due:0, installed_at:"2026-09-14"})], installerOutcomes:[{id:"report",job_id:"j1",quote_id:"q1",status:"partially_installed",signed_at:"2026-09-16",issues:[{lineId:"line",notInstalled:true,details:"Missing blind"}]}] }));
    expect(items[0]).toMatchObject({installed:false,paid:true,complete:false});
    expect(items[0].source.progress.stage).toBe("attention");
  });
  it("counts people once across quote alternatives and uses source sale evidence", () => {
    const quotes = [quote({ source_sold_at: null, sold_at: "2026-09-15", status: "sold" }), quote({ id: "q2", sent_at: "2026-09-15T12:00:00Z", source_sold_at: "2026-09-16" })];
    const file = { id: "person-1", customerName: "Avery", quotes } as CrmCustomerFile;
    const metrics = buildPerformanceMetrics(data({ quotes, customerFiles: [file] }), now);
    expect(metrics.weekly).toMatchObject({ quoted: 1, sold: 1, percent: 100 });
    expect(buildPerformanceMetrics(data({ quotes: [quotes[0]] }), now).weekly.sold).toBe(0);
  });
  it("does not count repeated quotes as a new weekly cohort", () => {
    const quotes = [quote({ sent_at: "2026-09-02" }), quote({ id: "q2" })];
    const metrics = buildPerformanceMetrics(data({ quotes, customerFiles: [{ id: "p1", customerName: "Avery", quotes } as CrmCustomerFile] }), now);
    expect(metrics.weekly.quoted).toBe(0);
    expect(metrics.monthly.quoted).toBe(1);
  });
  it("uses Los Angeles Monday boundary and receipt dates, excludes future and invalid dates", () => {
    const payments = [
      { id: "p1", paid_at: "2026-09-14T06:59:59Z", amount: 100 },
      { id: "p2", paid_at: "2026-09-14T07:00:00Z", amount: 125.12 },
      { id: "p3", paid_at: "2026-09-16", amount: -25.10 },
      { id: "p4", paid_at: null, amount: 999 },
      { id: "p5", paid_at: "2026-09-17", amount: 999 }
    ] as CrmDashboardData["bookkeepingPayments"];
    const metrics = buildPerformanceMetrics(data({ bookkeepingPayments: [...payments, payments[1]] }), now);
    expect(metrics.weekStart).toBe("2026-09-14");
    expect(metrics.cashCents).toBe(10002);
    expect(metrics.missingPaymentDates).toBe(2);
  });
  it("returns no percentage for an empty cohort and no fabricated sales total", () => {
    const metrics = buildPerformanceMetrics(data({ quotes: [quote({ sent_at: null })] }), now);
    expect(metrics.weekly.percent).toBeNull();
    expect(metrics.grossCents).toBeNull();
    expect(metrics.missingQuoteDates).toBe(1);
  });
});
