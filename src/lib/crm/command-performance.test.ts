import { describe, expect, it } from "vitest";
import { buildCommandPerformanceMetrics, formatCloseRate } from "@/lib/crm/command-performance";
import type { CrmBookkeepingRow, CrmCustomerFile, CrmJob } from "@/lib/crm/types";

function job(id: string, created_at: string, status: CrmJob["status"]): CrmJob {
  return { id, created_at, updated_at: created_at, source: "crm", lead_id: null, status, priority: "normal", customer_name: id, phone: "", email: `${id}@customer.com`, address: null, city: null, product_interest: "", sales_owner: "", next_action: null, next_action_due: null, appointment_start: null, appointment_end: null, estimated_total: 0, deposit_paid: 0, notes: null };
}

function appointmentJob(id: string, appointment_start: string, status: CrmJob["status"]): CrmJob {
  return { ...job(id, "2026-08-07T09:00:00-07:00", status), appointment_start };
}

function row(id: string, soldDate: string | null, total: number, jobStatus: CrmJob["status"] = "sold"): CrmBookkeepingRow {
  return { id, source: "crm_quote", quoteId: id, jobId: id, customerName: id, customerPhone: null, quoteNumber: null, soldDate, total, jobStatus } as CrmBookkeepingRow;
}

describe("buildCommandPerformanceMetrics", () => {
  const now = new Date(2026, 7, 7, 12);

  it("calculates close rates from every customer opportunity in each cohort", () => {
    const metrics = buildCommandPerformanceMetrics([
      appointmentJob("won-recent", "2026-08-06T10:00:00-07:00", "sold"),
      appointmentJob("lost-recent", "2026-08-05T10:00:00-07:00", "lost"),
      appointmentJob("not-sold-recent", "2026-08-01T10:00:00-07:00", "quoted"),
      appointmentJob("future-open", "2026-08-08T10:00:00-07:00", "quoted"),
      appointmentJob("won-45", "2026-06-25T10:00:00-07:00", "closed"),
      appointmentJob("not-sold-old", "2025-12-01T10:00:00-08:00", "follow_up")
    ], [], now);

    expect(metrics.closeRate30Days).toBe(33);
    expect(metrics.closeRate30DaysWon).toBe(1);
    expect(metrics.closeRate30DaysTotal).toBe(3);
    expect(metrics.closeRate60Days).toBe(50);
    expect(metrics.closeRate60DaysWon).toBe(2);
    expect(metrics.closeRate60DaysTotal).toBe(4);
    expect(metrics.currentCrmSalesRate).toBe(40);
    expect(metrics.currentCrmSalesWon).toBe(2);
    expect(metrics.currentCrmSalesTotal).toBe(5);
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
    expect(metrics.currentCrmSalesRate).toBe(50);
  });

  it("deduplicates unlinked quote-version jobs with validated identity fields", () => {
    const soldVersion = { ...job("quote-v1", "2026-08-01T10:00:00-07:00", "sold"), customer_name: "Jane Doe", phone: "(805) 806-0100", email: null };
    const lostVersion = { ...job("quote-v2", "2026-08-02T10:00:00-07:00", "lost"), customer_name: " jane  doe ", phone: "805-806-0100", email: null };
    const otherLost = { ...job("other", "2026-08-03T10:00:00-07:00", "lost"), customer_name: "Other Person", phone: "805-806-0100", email: null };

    const metrics = buildCommandPerformanceMetrics([soldVersion, lostVersion, otherLost], [], now);

    expect(metrics.closeRate30Days).toBe(50);
    expect(metrics.currentCrmSalesRate).toBe(50);
  });

  it("excludes blank, placeholder, test, and contactless quote records", () => {
    const metrics = buildCommandPerformanceMetrics([
      { ...job("real", "2026-08-01T10:00:00-07:00", "lost"), customer_name: "Real Customer", email: "real@customer.com" },
      { ...job("blank", "2026-08-01T10:00:00-07:00", "sold"), customer_name: "", email: "blank@customer.com" },
      { ...job("placeholder", "2026-08-01T10:00:00-07:00", "sold"), customer_name: "Quote", email: "quote@customer.com" },
      { ...job("test-name", "2026-08-01T10:00:00-07:00", "sold"), customer_name: "Codex Test Customer", email: "codex@customer.com" },
      { ...job("test-source", "2026-08-01T10:00:00-07:00", "sold"), source: "e2e_test" },
      { ...job("no-contact", "2026-08-01T10:00:00-07:00", "sold"), customer_name: "No Contact", email: null, phone: "" },
      { ...job("fake-email", "2026-08-01T10:00:00-07:00", "sold"), customer_name: "Fake Email", email: "fake@example.com", phone: "" },
      { ...job("fake-phone", "2026-08-01T10:00:00-07:00", "sold"), customer_name: "Fake Phone", email: null, phone: "805-555-0100" }
    ], [], now);

    expect(metrics.closeRate30Days).toBe(0);
    expect(metrics.closeRate30DaysWon).toBe(0);
    expect(metrics.closeRate30DaysTotal).toBe(1);
    expect(metrics.currentCrmSalesTotal).toBe(1);
  });

  it("uses an official contact from the canonical customer file", () => {
    const linkedJobs = [
      { ...job("linked-quote-1", "2026-08-01T10:00:00-07:00", "lost"), email: null, phone: "" },
      { ...job("linked-quote-2", "2026-08-02T10:00:00-07:00", "sold"), email: null, phone: "" }
    ];
    const customerFiles = [{
      id: "file-real-customer",
      customer: { id: "real-customer", display_name: "Real Customer", email: "real@customer.com", phone: null },
      customerName: "Real Customer",
      phone: null,
      email: "real@customer.com",
      jobs: linkedJobs
    }] as CrmCustomerFile[];

    const metrics = buildCommandPerformanceMetrics(linkedJobs, [], now, customerFiles);

    expect(metrics.closeRate30Days).toBe(100);
    expect(metrics.closeRate30DaysWon).toBe(1);
    expect(metrics.closeRate30DaysTotal).toBe(1);
  });

  it("uses all customer records for the outcome after cohorting the customer", () => {
    const recentLost = { ...appointmentJob("recent", "2026-08-01T10:00:00-07:00", "lost"), customer_name: "Same Customer", email: "same@customer.com" };
    const oldSold = { ...appointmentJob("old", "2026-01-01T10:00:00-08:00", "sold"), customer_name: "Same Customer", email: "same@customer.com" };
    const otherLost = appointmentJob("other-lost", "2026-08-02T10:00:00-07:00", "lost");

    const metrics = buildCommandPerformanceMetrics([recentLost, oldSold, otherLost], [], now);

    expect(metrics.closeRate30Days).toBe(50);
    expect(metrics.currentCrmSalesRate).toBe(50);
  });

  it("uses appointment dates instead of migration-time created dates", () => {
    const metrics = buildCommandPerformanceMetrics([
      appointmentJob("old-won", "2026-01-15T10:00:00-08:00", "sold"),
      appointmentJob("recent-not-sold", "2026-08-01T10:00:00-07:00", "quoted")
    ], [], now);

    expect(metrics.closeRate30Days).toBe(0);
    expect(metrics.closeRate60Days).toBe(0);
    expect(metrics.currentCrmSalesRate).toBe(50);
  });

  it("falls back to created time for opportunities without appointments", () => {
    const metrics = buildCommandPerformanceMetrics([
      job("decided-without-appointment", "2026-08-01T10:00:00-07:00", "sold"),
      job("open-without-appointment", "2026-08-01T10:00:00-07:00", "quoted")
    ], [], now);

    expect(metrics.closeRate30Days).toBe(50);
  });

  it("excludes future-dated records from current windows", () => {
    const metrics = buildCommandPerformanceMetrics([
      job("today-lost", "2026-08-07T10:00:00-07:00", "lost"),
      job("future-sold", "2026-08-08T10:00:00-07:00", "sold")
    ], [], now);

    expect(metrics.closeRate30Days).toBe(0);
    expect(metrics.currentCrmSalesRate).toBe(0);
  });

  it("keeps open opportunities in the conversion denominator when loss history is absent", () => {
    const metrics = buildCommandPerformanceMetrics([
      job("won", "2026-08-01T10:00:00-07:00", "sold"),
      job("open", "2026-08-02T10:00:00-07:00", "quoted")
    ], [], now);

    expect(metrics.closeRate30Days).toBe(50);
    expect(metrics.closeRate30DaysWon).toBe(1);
    expect(metrics.closeRate30DaysTotal).toBe(2);
    expect(formatCloseRate(metrics.closeRate30Days)).toBe("50%");
  });

  it("excludes deleted opportunities from the cohort", () => {
    const deletedLost = { ...job("deleted-lost", "2026-08-01T10:00:00-07:00", "lost"), meta: { deleted_at: "2026-08-02T10:00:00-07:00" } };
    const metrics = buildCommandPerformanceMetrics([
      job("won", "2026-08-01T10:00:00-07:00", "sold"),
      deletedLost
    ], [], now);

    expect(metrics.closeRate30Days).toBe(100);
    expect(metrics.closeRate30DaysTotal).toBe(1);
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

  it("counts only signed CRM contracts in revenue metrics", () => {
    const metrics = buildCommandPerformanceMetrics([], [
      row("signed", "2026-08-07", 10_000, "sold"),
      row("sent-quote", "2026-08-07", 1_222, "quoted"),
      { ...row("manual", "2026-08-07", 933, "sold"), source: "manual" }
    ], now);

    expect(metrics.revenue30Days).toBe(10_000);
  });
});
