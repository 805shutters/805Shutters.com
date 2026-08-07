import { describe, expect, it } from "vitest";
import { buildCommandPerformanceMetrics } from "@/lib/crm/command-performance";
import type { CrmBookkeepingRow, CrmCustomerFile, CrmJob } from "@/lib/crm/types";

function job(id: string, created_at: string, status: CrmJob["status"]): CrmJob {
  return { id, created_at, updated_at: created_at, source: "test", lead_id: null, status, priority: "normal", customer_name: id, phone: "", email: null, address: null, city: null, product_interest: "", sales_owner: "", next_action: null, next_action_due: null, appointment_start: null, appointment_end: null, estimated_total: 0, deposit_paid: 0, notes: null };
}

function row(id: string, soldDate: string | null, total: number): CrmBookkeepingRow {
  return { id, source: "manual", quoteId: null, jobId: id, customerName: id, customerPhone: null, quoteNumber: null, soldDate, total } as CrmBookkeepingRow;
}

describe("buildCommandPerformanceMetrics", () => {
  const now = new Date(2026, 7, 7, 12);

  it("calculates close rates from decided lead-created cohorts", () => {
    const metrics = buildCommandPerformanceMetrics([
      job("won-recent", "2026-08-06T10:00:00-07:00", "sold"),
      job("lost-recent", "2026-08-01T10:00:00-07:00", "lost"),
      job("open-recent", "2026-08-01T10:00:00-07:00", "quoted"),
      job("won-45", "2026-06-25T10:00:00-07:00", "closed"),
      job("lost-old", "2025-12-01T10:00:00-08:00", "lost")
    ], [], now);

    expect(metrics.closeRate30Days).toBe(50);
    expect(metrics.closeRate60Days).toBe(67);
    expect(metrics.closeRateAllTime).toBe(50);
  });

  it("counts a customer once and treats any sold outcome as the customer outcome", () => {
    const jobs = [
      job("customer-a-lost", "2026-08-01T10:00:00-07:00", "lost"),
      job("customer-a-sold", "2026-08-02T10:00:00-07:00", "sold"),
      job("customer-b-lost", "2026-08-03T10:00:00-07:00", "lost")
    ];
    const customerFiles = [{
      customer: { id: "customer-a" },
      jobs: jobs.slice(0, 2)
    }] as CrmCustomerFile[];

    const metrics = buildCommandPerformanceMetrics(jobs, [], now, customerFiles);

    expect(metrics.closeRate30Days).toBe(50);
    expect(metrics.closeRate60Days).toBe(50);
    expect(metrics.closeRateAllTime).toBe(50);
  });

  it("deduplicates unlinked quote-version jobs with validated identity fields", () => {
    const soldVersion = { ...job("quote-v1", "2026-08-01T10:00:00-07:00", "sold"), customer_name: "Jane Doe", phone: "(805) 555-0100" };
    const lostVersion = { ...job("quote-v2", "2026-08-02T10:00:00-07:00", "lost"), customer_name: " jane  doe ", phone: "805-555-0100" };
    const otherLost = { ...job("other", "2026-08-03T10:00:00-07:00", "lost"), customer_name: "Other Person", phone: "805-555-0100" };

    const metrics = buildCommandPerformanceMetrics([soldVersion, lostVersion, otherLost], [], now);

    expect(metrics.closeRate30Days).toBe(50);
    expect(metrics.closeRateAllTime).toBe(50);
  });

  it("uses only records created inside each rolling cohort", () => {
    const recentLost = { ...job("recent", "2026-08-01T10:00:00-07:00", "lost"), customer_name: "Same Customer", email: "same@example.com" };
    const oldSold = { ...job("old", "2026-01-01T10:00:00-08:00", "sold"), customer_name: "Same Customer", email: "same@example.com" };

    const metrics = buildCommandPerformanceMetrics([recentLost, oldSold], [], now);

    expect(metrics.closeRate30Days).toBe(0);
    expect(metrics.closeRateAllTime).toBe(100);
  });

  it("excludes future-dated records from current windows", () => {
    const metrics = buildCommandPerformanceMetrics([
      job("today-lost", "2026-08-07T10:00:00-07:00", "lost"),
      job("future-sold", "2026-08-08T10:00:00-07:00", "sold")
    ], [], now);

    expect(metrics.closeRate30Days).toBe(0);
    expect(metrics.closeRateAllTime).toBe(0);
  });

  it("uses sold-date ledger revenue and annualizes current-year actuals", () => {
    const metrics = buildCommandPerformanceMetrics([], [
      row("today", "2026-08-07", 10_000),
      row("day-29", "2026-07-09", 5_000),
      row("day-45", "2026-06-23", 4_000),
      row("old-year", "2025-12-31", 99_000),
      row("invalid", null, 50_000),
      row("credit", "2026-08-01", -500)
    ], now);

    expect(metrics.revenue30Days).toBe(15_000);
    expect(metrics.revenue60Days).toBe(19_000);
    expect(metrics.yearToDateRevenue).toBe(19_000);
    expect(metrics.currentYearForecast).toBe(Math.round((19_000 / 219) * 365));
  });
});
