import { describe, expect, it } from "vitest";
import type { CrmDashboardData, CrmJob, CrmQuote, CrmBookkeepingRow, CrmCustomerProduct } from "./types";
import { buildMobileJobStatus } from "./mobile-job-status";
function fixture({ balance = 500, open = false, statuses = ["shipped"], status = "sold" } = {}) {
  return {
    jobs: [{ id: "j1", customer_name: "Ada Customer", phone: "8055551212", email: "ada@example.com", meta: open ? { job_closure_override: { closed: false } } : {} } as unknown as CrmJob],
    quotes: [{ id: "q1", job_id: "j1", status, quote_total: 1000, deposit_required: 500, balance_due: balance, created_at: "2026-09-01", share_token: "contract-token" } as CrmQuote],
    bookkeepingRows: [{ id: "q1", source: "crm_quote", quoteId: "q1", jobId: "j1", customerName: "Ada Customer", quoteTotal: 1000, depositDue: 500, depositPaid: 500, balancePaid: 500 - balance, balance, soldDate: "2026-09-01", meta: {} } as unknown as CrmBookkeepingRow],
    customerFiles: [], customerProducts: statuses.map((s, i) => ({ id: `p${i}`, quote_id: "q1", job_id: "j1", product_type: i ? "Roller Shades" : "Shutters", status: s, meta: {} } as CrmCustomerProduct)),
    orderCogsEmails: [], installationInvoiceEmails: [], bookkeepingPayments: [],
  } as unknown as CrmDashboardData;
}

describe("mobile Job Status desktop parity", () => {
  it("requires every product shipped and never infers ordering from later stages", () => {
    const row = buildMobileJobStatus(fixture({ statuses: ["shipped", "ordered"] }))[0];
    expect(row.milestones.find(step => step.label === "Shipped")?.complete).toBe(false);
    expect(row.milestones.find(step => step.label === "Ordered")?.complete).toBe(false);
    expect(row.shippedAndDue).toBe(false);
    expect(row.products.map(product => product.shipped)).toEqual([true, false]);
    expect(row).not.toHaveProperty("source");
  });
  it("keeps paid but open jobs distinct from closed jobs", () => {
    const open = buildMobileJobStatus(fixture({ balance: 0, open: true }))[0];
    expect(open.filters).toContain("paid");
    expect(open.filters).toContain("active");
    expect(open.closed).toBe(false);
    const closed = buildMobileJobStatus(fixture({ balance: 0 }))[0];
    expect(closed.closed).toBe(true);
    expect(closed.filters).not.toContain("active");
    expect(closed.filters).toContain("closed");
  });
  it("loads shipped unpaid jobs and original contracts without requiring a search", () => {
    const row = buildMobileJobStatus(fixture())[0];
    expect(row.shippedAndDue).toBe(true);
    expect(row.filters).toContain("shipment_complete");
    expect(row.contractUrl).toBe("/quote/contract-token");
    expect(row.balance).toBe(500);
  });
});
