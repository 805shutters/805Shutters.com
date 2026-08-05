import { describe, expect, it } from "vitest";
import { buildSalesIntelligenceReport, precedingCalendarDayRange, trailingCalendarDayRange } from "@/lib/crm/sales-intelligence";
import type { CrmJob, CrmQuote } from "@/lib/crm/types";

function job(overrides: Partial<CrmJob>): CrmJob {
  return {
    id: "job-1", created_at: "2026-07-10T12:00:00Z", updated_at: "2026-07-11T12:00:00Z",
    source: "crm", lead_id: null, status: "new", priority: "normal", customer_name: "Test Lead",
    phone: "805-555-0100", email: null, address: null, city: "Camarillo", product_interest: "Shutters",
    sales_owner: "Jessica", next_action: null, next_action_due: null, appointment_start: null,
    appointment_end: null, estimated_total: 2500, deposit_paid: 0, notes: null, ...overrides
  };
}

function quote(overrides: Partial<CrmQuote>): CrmQuote {
  return {
    id: "quote-1", created_at: "2026-07-11T12:00:00Z", updated_at: "2026-07-12T12:00:00Z",
    job_id: "job-1", quote_number: "805-1", status: "sold", quote_total: 4200, materials_cost: 0,
    labor_cost: 0, discount: 0, tax: 0, deposit_required: 0, balance_due: 0, sold_by: "Jessica",
    sent_at: null, approved_at: null, sold_at: "2026-07-12T12:00:00Z", ordered_at: null,
    received_at: null, installed_at: null, archived_at: null, manufacturer_name: null,
    manufacturer_order_ref: null, manufacturer_order_url: null, manufacturer_document_url: null,
    customer_email: null, customer_phone: null, customer_address: null, share_token: null,
    customer_signature: null, customer_printed_name: null, signed_at: null, quote_group_id: null,
    quote_label: null, meta: {}, notes: null, ...overrides
  };
}

describe("buildSalesIntelligenceReport", () => {
  it("uses an inclusive trailing 30 local-calendar-day window across a month boundary", () => {
    expect(trailingCalendarDayRange(30, new Date(2026, 2, 1, 23, 30))).toEqual({
      start: "2026-01-31",
      end: "2026-03-01"
    });
  });

  it("keeps 60-day presets rolling across months and handles leap-year dates", () => {
    expect(trailingCalendarDayRange(60, new Date(2026, 2, 1, 1, 15))).toEqual({
      start: "2026-01-01",
      end: "2026-03-01"
    });
    expect(trailingCalendarDayRange(30, new Date(2024, 2, 1, 12))).toEqual({
      start: "2024-02-01",
      end: "2024-03-01"
    });
  });

  it("compares against the immediately preceding equal calendar-day window", () => {
    expect(precedingCalendarDayRange({ start: "2026-01-31", end: "2026-03-01" })).toEqual({
      start: "2026-01-01",
      end: "2026-01-30"
    });
  });

  it("builds attributable cohort funnel, revenue, rep, and follow-up totals", () => {
    const jobs = [
      job({ lead_source: "Google Ads", status: "sold" }),
      job({ id: "job-2", customer_name: "Second Lead", lead_source: null, sales_owner: "Mike", next_action: "Call", next_action_due: "2026-07-15" })
    ];
    const report = buildSalesIntelligenceReport(jobs, [quote({})], [], { start: "2026-07-01", end: "2026-07-31" }, new Date("2026-07-20T12:00:00Z"));
    expect(report.totals).toMatchObject({ leads: 2, attributed: 1, won: 1, revenue: 4200, overdue: 1, missingFollowUp: 1 });
    expect(report.sources.find((item) => item.source === "Google Ads")?.won).toBe(1);
    expect(report.reps.find((item) => item.owner === "Jessica")?.revenue).toBe(4200);
  });

  it("keeps jobs outside the selected cohort out of the report", () => {
    const report = buildSalesIntelligenceReport(
      [job({ created_at: "2026-05-01T12:00:00Z" })],
      [],
      [],
      { start: "2026-07-01", end: "2026-07-31" }
    );
    expect(report.totals.leads).toBe(0);
  });
});
