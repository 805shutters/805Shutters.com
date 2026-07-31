import { describe, expect, it } from "vitest";
import type { CrmBookkeepingRow, CrmJob, CrmQuote } from "@/lib/crm/types";
import { buildMarketingIntelligence } from "./sales-intelligence";

const job = (patch: Partial<CrmJob>): CrmJob => ({
  id: "job-1", created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
  source: "website", lead_id: null, status: "new", priority: "normal", customer_name: "Test Person",
  phone: "", email: null, address: null, city: "Ventura", product_interest: "Shutters", sales_owner: "Mike",
  next_action: null, next_action_due: null, appointment_start: null, appointment_end: null,
  estimated_total: 0, deposit_paid: 0, notes: null, meta: {}, ...patch
});

describe("Sales Intelligence marketing model", () => {
  it("shows safe missing states instead of zero performance", () => {
    const view = buildMarketingIntelligence([job({})], [], []);
    expect(view.channels.every((channel) => channel.leads === null)).toBe(true);
    expect(view.unattributedJobCount).toBe(1);
  });

  it("counts only exact lead IDs with explicit primary-channel evidence", () => {
    const jobs = [
      job({ id: "google-job", lead_id: "lead-google", source: "website", status: "sold", appointment_start: "2026-07-02T00:00:00Z", meta: { utm_source: "google", utm_campaign: "ventura-shutters" } }),
      job({ id: "ambiguous-job", lead_id: "lead-unknown", source: "website" })
    ];
    const quotes = [{ id: "quote-1", job_id: "google-job" } as CrmQuote];
    const rows = [{ jobId: "google-job", paidTotal: 100 } as CrmBookkeepingRow];
    const view = buildMarketingIntelligence(jobs, quotes, rows);
    const google = view.channels.find((channel) => channel.channel === "google");
    expect(google).toMatchObject({ leads: 1, appointments: 1, quotes: 1, sales: 1, paidCustomers: 1 });
    expect(view.unattributedJobCount).toBe(1);
  });

  it("does not fuzzy-match channel names or customer identity", () => {
    const view = buildMarketingIntelligence([job({ lead_id: "lead-1", source: "website", meta: { note: "called from Google maybe" } })], [], []);
    expect(view.attributedLeadCount).toBe(0);
  });
});
