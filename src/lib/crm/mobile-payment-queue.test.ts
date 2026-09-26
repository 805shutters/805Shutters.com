import { describe, expect, it } from "vitest";
import { buildMobilePaymentQueue, filterMobilePaymentCustomers } from "./mobile-payment-queue";
import type { CrmDashboardData, CrmJob, CrmQuote, CrmBookkeepingRow, CrmCustomerProduct } from "./types";

function fixture({ balance = 500, open = false, statuses = ["shipped"], status = "sold" } = {}) {
  return {
    jobs: [{ id: "j1", customer_name: "Ada Customer", phone: "8055551212", email: "ada@example.com", meta: open ? { job_closure_override: { closed: false } } : {} } as unknown as CrmJob],
    quotes: [{ id: "q1", job_id: "j1", status, quote_total: 1000, deposit_required: 500, balance_due: balance, created_at: "2026-09-01", share_token: "contract-token" } as CrmQuote],
    bookkeepingRows: [{ id: "q1", source: "crm_quote", quoteId: "q1", jobId: "j1", customerName: "Ada Customer", quoteTotal: 1000, depositDue: 500, depositPaid: 500, balancePaid: 500 - balance, balance, soldDate: "2026-09-01", meta: {} } as unknown as CrmBookkeepingRow],
    customerFiles: [], customerProducts: statuses.map((s, i) => ({ id: `p${i}`, quote_id: "q1", job_id: "j1", product_type: i ? "Roller Shades" : "Shutters", status: s, meta: {} } as CrmCustomerProduct)),
    orderCogsEmails: [], installationInvoiceEmails: [], bookkeepingPayments: [],
  } as unknown as CrmDashboardData;
}

describe("mobile next-payment queue", () => {
  it("loads shipped and due jobs without a search and keeps only customer-facing fields", () => {
    const result = buildMobilePaymentQueue(fixture());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ priority: true, shipped: true, outstanding: 500, dueType: "balance", amountDue: 500, contractUrl: "/quote/contract-token" });
    expect(result[0]).not.toHaveProperty("source");
    expect(result[0]).not.toHaveProperty("meta");
  });
  it("does not prioritize partial shipments or guess shipment from payment", () => {
    expect(buildMobilePaymentQueue(fixture({ statuses: ["shipped", "ordered"] }))[0].priority).toBe(false);
    expect(buildMobilePaymentQueue(fixture({ statuses: ["ordered"] }))[0].shipped).toBe(false);
  });
  it("hides paid and closed by default but retrieves them through manual search", () => {
    const rows = buildMobilePaymentQueue(fixture({ balance: 0 }));
    expect(rows[0]).toMatchObject({ closed: true, activePayment: false, priority: false });
    expect(filterMobilePaymentCustomers(rows)).toEqual([]);
    expect(filterMobilePaymentCustomers(rows, "Ada")).toHaveLength(1);
  });
  it("includes sold work needing a deposit before shipment", () => {
    const data = fixture({ statuses: ["ordered"] });
    data.bookkeepingRows[0].depositPaid = 0;
    const rows = buildMobilePaymentQueue(data);
    expect(filterMobilePaymentCustomers(rows)[0]).toMatchObject({ activePayment: true, priority: false, dueType: "deposit", amountDue: 500 });
  });
  it("excludes zero balances, closed jobs, archived work and unsold quotes until searched", () => {
    const paid = fixture({ balance: 0, open: true });
    const closed = fixture({ balance: 0 });
    const archived = fixture({ status: "archived" });
    const unsold = fixture({ status: "draft" });
    unsold.bookkeepingRows = [];
    for (const [label, data] of Object.entries({ paid, closed, archived, unsold })) {
      const rows = buildMobilePaymentQueue(data);
      expect(rows[0].activePayment, label).toBe(false);
      if (label === "unsold") expect(rows[0].sold).toBe(false);
      expect(rows[0].priority).toBe(false);
      expect(filterMobilePaymentCustomers(rows, "  ")).toEqual([]);
      expect(filterMobilePaymentCustomers(rows, "Ada")).toHaveLength(1);
    }
  });
  it("retains paid work with the same explicit open override as desktop Job Status", () => {
    expect(buildMobilePaymentQueue(fixture({ balance: 0, open: true }))[0]).toMatchObject({ outstanding: 0, priority: false, closed: false, dueType: null });
  });
  it("retains an unpaid quote even when its legacy status says closed", () => {
    expect(buildMobilePaymentQueue(fixture({ status: "closed" }))[0]).toMatchObject({ outstanding: 500, closed: false });
  });
  it("updates priority from fresh ledger amounts after partial and full payments", () => {
    expect(buildMobilePaymentQueue(fixture({ balance: 100 }))[0]).toMatchObject({ amountDue: 100, priority: true });
    expect(buildMobilePaymentQueue(fixture({ balance: 0, open: true }))[0].priority).toBe(false);
  });
  it("does not revive orphaned quotes whose customer job is missing or deleted", () => {
    const data = fixture(); data.jobs = [];
    expect(buildMobilePaymentQueue(data)).toEqual([]);
  });
  it("does not call a zero-value draft paid", () => {
    const data = fixture({ balance: 0, status: "draft", open: true });
    data.bookkeepingRows = [];
    data.quotes[0].quote_total = 0;
    expect(buildMobilePaymentQueue(data)[0]).toMatchObject({ paidInFull: false, outstanding: 0 });
  });
  it("searches linked customer contacts and preserves archived scope without a cap", () => {
    const rows = buildMobilePaymentQueue(fixture());
    expect(filterMobilePaymentCustomers(rows, "805555")).toHaveLength(1);
    expect(filterMobilePaymentCustomers(rows, "missing")).toEqual([]);
    expect(filterMobilePaymentCustomers(rows, "", "A")).toHaveLength(1);
    expect(filterMobilePaymentCustomers(rows, "", "", "archived")).toEqual([]);
  });
});
