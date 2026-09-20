import { describe, expect, it } from "vitest";
import { buildActiveJobsSnapshot, isOpenJob } from "./active-jobs";
import { buildOperationsItems } from "./operations-overview";
import type { CrmDashboardData, CrmJob, CrmQuote } from "./types";

describe("active-first job loading", () => {
  it("excludes only closed jobs, keeping unsold, completed, archived, and reopened work", () => {
    for (const flags of [{ sold: false }, { complete: true }, { archived: true }, { paid: true }]) {
      expect(isOpenJob({ closed: false, ...flags })).toBe(true);
    }
    expect(isOpenJob({ closed: true })).toBe(false);
  });

  it("uses existing closure evidence and keeps a paid job with an explicit reopening", () => {
    const jobs = ["open", "closed", "reopened", "unsold"].map(id => ({
      id, customer_name: id, status: "quoted", created_at: "2026-09-01", updated_at: "2026-09-01",
      meta: id === "reopened" ? { job_closure_override: { closed: false } } : {}
    } as unknown as CrmJob));
    const quotes = jobs.map(job => ({
      id: `q-${job.id}`, job_id: job.id, customer_name: job.id,
      status: job.id === "unsold" ? "sent" : "sold", quote_total: 1000,
      balance_due: ["closed", "reopened"].includes(job.id) ? 0 : 1000,
      created_at: "2026-09-01", meta: {}
    } as unknown as CrmQuote));
    const dashboard = {
      jobs, quotes, bookkeepingRows: [], customerProducts: [], customerFiles: [],
      orderCogsEmails: [], installationInvoiceEmails: [], loadWarnings: ["A source is unavailable."]
    } as unknown as CrmDashboardData;
    const before = JSON.stringify(dashboard);
    const snapshot = buildActiveJobsSnapshot(dashboard);
    expect(snapshot.items.map(item => item.source.customerName).sort()).toEqual(["open", "reopened", "unsold"]);
    expect(snapshot.loadWarnings).toEqual(dashboard.loadWarnings);
    expect(snapshot.items.every(item => !item.source.file)).toBe(true);
    expect(JSON.stringify(dashboard)).toBe(before);
    expect(buildOperationsItems(dashboard)).toHaveLength(4);
  });
});
