import { describe, expect, it } from "vitest";
import { weeklySalesAverage } from "./weekly-sales-average";
import { buildClosedSalesReport } from "./dashboard-metrics";
import type { CrmQuote } from "./types";

function report(sales: [string, number][], now = "2026-09-26T19:00:00Z") {
  return buildClosedSalesReport({ jobs: [], contracts: [], now, includeCurrentWeek: true,
    quotes: sales.map(([signed_at, quote_total], index) => ({ id: `q${index}`, job_id: `j${index}`, signed_at, quote_total, meta: {} }) as CrmQuote) });
}

describe("calendar year weekly gross sales average", () => {
  it("includes January onward and zero weeks, excludes the current partial week and older years", () => {
    const history = report([["2025-12-31T20:00:00Z", 90000], ["2026-01-01T20:00:00Z", 18000], ["2026-09-20T20:00:00Z", 20000], ["2026-09-21T07:00:00Z", 99999]]);
    expect(weeklySalesAverage(history, 2026, "2026-09-21")).toEqual({ year: 2026, start: "2026-01-01", end: "2026-09-20", weekCount: 38, totalCents: 3800000, averageCents: 100000 });
  });
  it("uses Los Angeles boundaries and deduplicates sales across loaded weeks", () => {
    const history = report([["2026-01-01T07:59:59Z", 999], ["2026-01-01T08:00:00Z", 380], ["2026-09-21T06:59:59Z", 380], ["2026-09-21T07:00:00Z", 999]]);
    history.weeks.push(history.weeks[1]);
    expect(weeklySalesAverage(history, 2026, "2026-09-21")).toMatchObject({ totalCents: 76000, averageCents: 2000 });
  });
  it("includes every sale of a previous calendar year, including both partial boundary weeks", () => {
    const history = report([["2025-01-01T20:00:00Z", 100], ["2025-12-31T20:00:00Z", 430], ["2026-01-01T20:00:00Z", 999]]);
    expect(weeklySalesAverage(history, 2025, "2026-09-21")).toMatchObject({ start: "2025-01-01", end: "2025-12-31", weekCount: 53, totalCents: 53000, averageCents: 1000 });
  });
  it("distinguishes unavailable history, no completed weeks, and a real zero", () => {
    expect(weeklySalesAverage(undefined, 2026, "2026-09-21").averageCents).toBeNull();
    expect(weeklySalesAverage(report([]), 2026, "2025-12-29")).toMatchObject({ weekCount: 0, averageCents: null });
    expect(weeklySalesAverage(report([]), 2026, "2026-09-21")).toMatchObject({ weekCount: 38, averageCents: 0 });
  });
  it("handles leap years, DST and cent rounding", () => {
    const history = report([["2024-02-29T20:00:00Z", 100.01]], "2024-03-11T07:00:00Z");
    expect(weeklySalesAverage(history, 2024, "2024-03-11")).toMatchObject({ weekCount: 10, averageCents: 1000 });
    const fall = report([["2026-11-02T07:59:59Z", 440]], "2026-11-02T08:00:00Z");
    expect(weeklySalesAverage(fall, 2026, "2026-11-02")).toMatchObject({ weekCount: 44, totalCents: 44000, averageCents: 1000 });
  });
});
