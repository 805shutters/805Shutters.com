import { describe, expect, it } from "vitest";
import { buildQuoteWorkspaceBuckets } from "@/lib/crm/quote-workspace";
import type { CrmJob, CrmQuote } from "@/lib/crm/types";

function job(overrides: Partial<CrmJob>): CrmJob {
  return {
    id: "job-1",
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
    source: "crm",
    lead_id: null,
    status: "scheduled",
    priority: "normal",
    customer_name: "Customer",
    phone: "805-000-0000",
    email: null,
    address: null,
    city: null,
    product_interest: "Window Treatments",
    sales_owner: "Unassigned",
    next_action: null,
    next_action_due: null,
    appointment_start: null,
    appointment_end: null,
    estimated_total: 0,
    deposit_paid: 0,
    notes: null,
    ...overrides,
  };
}

function quote(overrides: Partial<CrmQuote>): CrmQuote {
  return {
    id: "quote-1",
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
    job_id: "job-1",
    quote_number: "805-1001",
    status: "draft",
    quote_total: 0,
    materials_cost: 0,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 0,
    balance_due: 0,
    sold_by: null,
    sent_at: null,
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
    ...overrides,
  };
}

describe("buildQuoteWorkspaceBuckets", () => {
  const now = new Date("2026-06-20T09:53:34-07:00");

  it("does not call past scheduled consultations upcoming", () => {
    const buckets = buildQuoteWorkspaceBuckets(
      [
        job({ id: "may-12", customer_name: "Karen Gorback", appointment_start: "2026-05-12T13:00:00-07:00" }),
        job({ id: "today", customer_name: "Today Customer", appointment_start: "2026-06-20T08:00:00-07:00" }),
        job({ id: "future", customer_name: "Future Customer", appointment_start: "2026-06-21T09:00:00-07:00" }),
      ],
      [],
      now,
    );

    expect(buckets.consultationsNeedingQuote.map((item) => item.id)).toEqual(["may-12"]);
    expect(buckets.upcomingConsultations.map((item) => item.id)).toEqual(["today", "future"]);
  });

  it("keeps jobs with active quotes out of consultation buckets", () => {
    const buckets = buildQuoteWorkspaceBuckets(
      [job({ id: "quoted-job", appointment_start: "2026-05-12T13:00:00-07:00" })],
      [quote({ id: "quote-quoted-job", job_id: "quoted-job", status: "draft" })],
      now,
    );

    expect(buckets.consultationsNeedingQuote).toHaveLength(0);
    expect(buckets.upcomingConsultations).toHaveLength(0);
    expect(buckets.activeQuotes.map((item) => item.id)).toEqual(["quote-quoted-job"]);
    expect(buckets.quoteByJobId.get("quoted-job")?.id).toBe("quote-quoted-job");
  });

  it("separates unscheduled leads from consultations", () => {
    const buckets = buildQuoteWorkspaceBuckets(
      [
        job({ id: "new-lead", status: "new", appointment_start: null }),
        job({ id: "follow-up", status: "follow_up", next_action_due: "2026-06-19", appointment_start: null }),
        job({ id: "closed", status: "closed", appointment_start: null }),
      ],
      [],
      now,
    );

    expect(buckets.leadsToSchedule.map((item) => item.id)).toEqual(["follow-up", "new-lead"]);
    expect(buckets.upcomingConsultations).toHaveLength(0);
    expect(buckets.consultationsNeedingQuote).toHaveLength(0);
  });
});
