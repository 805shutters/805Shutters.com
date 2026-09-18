import { describe, expect, it } from "vitest";
import { buildOperationsItems, buildPerformanceMetrics, formatOperationsDate, workflowSummary } from "./operations-overview";
import type { CrmCustomerFile, CrmCustomerProduct, CrmDashboardData, CrmQuote } from "./types";

const quote = (overrides: Partial<CrmQuote> = {}): CrmQuote => ({ id: "q1", job_id: "j1", created_at: "2026-09-01T12:00:00Z", status: "sent", sent_at: "2026-09-14T18:00:00Z", quote_total: 1000, meta: {}, ...overrides } as CrmQuote);
const data = (overrides: Partial<CrmDashboardData> = {}): CrmDashboardData => ({ jobs: [], quotes: [], bookkeepingRows: [], customerFiles: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [], bookkeepingPayments: [], ...overrides } as CrmDashboardData);
const product = (overrides: Partial<CrmCustomerProduct> = {}): CrmCustomerProduct => ({ id: "p1", quote_id: "q1", job_id: "j1", bookkeeping_entry_id: null, product_type: "Shutters", status: "ordered", meta: {}, ...overrides } as CrmCustomerProduct);
const now = new Date("2026-09-16T19:00:00Z");

describe("operations overview source integrity", () => {
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
  it("never paints unknown product groups complete from a whole-job order or payment", () => {
    const items = buildOperationsItems(data({ quotes: [quote({ status: "paid", balance_due: 0, ordered_at: "2026-09-15", meta: { job_tracking: { stage: "complete" } } })] }));
    expect(items[0]).toMatchObject({ products: [], installed: false, paid: true });
    expect(workflowSummary(items, "ordered")).toMatchObject({ total: 0, unknown: 1 });
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
