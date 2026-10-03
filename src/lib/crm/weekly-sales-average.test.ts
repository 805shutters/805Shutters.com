import { describe, expect, it } from "vitest";
import { weeklySalesAverage } from "./weekly-sales-average";
import { buildClosedSalesReport } from "./dashboard-metrics";
import type { CrmQuote } from "./types";

function report(sales: [string, number][], now = "2026-09-26T19:00:00Z") {
  return buildClosedSalesReport({ jobs: [], contracts: [], now, includeCurrentWeek: true,
    quotes: sales.map(([signed_at, quote_total], index) => ({ id: `q${index}`, job_id: `j${index}`, signed_at, quote_total, meta: {} }) as CrmQuote) });
}

describe("calendar year weekly gross sales average", () => {
  it("starts June 29, excludes earlier sales and weeks, includes subsequent zero weeks, and excludes this partial week", () => {
    const history = report([["2026-04-28T12:00:00Z", 814], ["2026-06-28T20:00:00Z", 99999], ["2026-06-29T07:00:00Z", 14000], ["2026-09-20T20:00:00Z", 2000], ["2026-09-21T07:00:00Z", 99999]]);
    expect(weeklySalesAverage(history, 2026, "2026-09-21")).toMatchObject({ start: "2026-06-29", end: "2026-09-20", weekCount: 12, totalCents: 1600000, averageCents: 133333 });
  });
  it("counts every completed week from the fixed start even if the first sale arrives later", () => {
    const history = report([["2026-07-13T07:00:00Z", 14000]]);
    expect(weeklySalesAverage(history, 2026, "2026-09-21")).toMatchObject({ start: "2026-06-29", weekCount: 12, averageCents: 116667 });
  });
  it("counts the screenshot week as Week 1 only after Sunday completes", () => {
    const history = report([["2026-06-29T18:00:00Z", 21227.07]], "2026-07-06T07:00:00Z");
    expect(weeklySalesAverage(history, 2026, "2026-06-29")).toMatchObject({ start: "2026-06-29", weekCount: 0, averageCents: null });
    expect(weeklySalesAverage(history, 2026, "2026-07-06")).toMatchObject({ start: "2026-06-29", end: "2026-07-05", weekCount: 1, totalCents: 2122707, averageCents: 2122707 });
    expect(weeklySalesAverage(history, 2026, "2026-07-13")).toMatchObject({ weekCount: 2, averageCents: 1061354 });
  });
  it("uses Los Angeles boundaries and deduplicates sales across loaded weeks", () => {
    const history = report([["2026-06-29T06:59:59Z", 999], ["2026-06-29T07:00:00Z", 160], ["2026-09-21T06:59:59Z", 160], ["2026-09-21T07:00:00Z", 999]]);
    history.weeks.push(history.weeks[1]);
    expect(weeklySalesAverage(history, 2026, "2026-09-21")).toMatchObject({ start: "2026-06-29", weekCount: 12, totalCents: 32000, averageCents: 2667 });
  });
  it("starts subsequent calendar years on January 1 and includes zero-sales weeks before that year's first sale", () => {
    const history = report([["2026-05-01T20:00:00Z", 999], ["2027-01-20T20:00:00Z", 400]], "2027-01-25T20:00:00Z");
    expect(weeklySalesAverage(history, 2027, "2027-01-25")).toMatchObject({ start: "2027-01-01", end: "2027-01-24", weekCount: 4, totalCents: 40000, averageCents: 10000 });
    expect(weeklySalesAverage(history, 2025, "2027-01-25")).toMatchObject({ weekCount: 0, averageCents: null });
  });
  it("distinguishes unavailable history, no completed weeks, and zero-sales completed weeks", () => {
    expect(weeklySalesAverage(undefined, 2026, "2026-09-21").averageCents).toBeNull();
    expect(weeklySalesAverage(report([]), 2026, "2026-09-21")).toMatchObject({ weekCount: 12, averageCents: 0 });
    expect(weeklySalesAverage(report([["2026-09-22T20:00:00Z", 100]]), 2026, "2026-09-21")).toMatchObject({ weekCount: 12, averageCents: 0 });
    expect(weeklySalesAverage(report([["2026-05-01T20:00:00Z", 100]], "2027-01-11T20:00:00Z"), 2027, "2027-01-11")).toMatchObject({ weekCount: 2, averageCents: 0 });
  });
  it("handles leap years, DST and cent rounding", () => {
    const history = report([["2026-05-01T20:00:00Z", 999], ["2028-02-29T20:00:00Z", 100.01]], "2028-03-13T07:00:00Z");
    expect(weeklySalesAverage(history, 2028, "2028-03-13")).toMatchObject({ weekCount: 11, averageCents: 909 });
    const fall = report([["2026-10-26T07:00:00Z", 220], ["2026-11-02T07:59:59Z", 220]], "2026-11-02T08:00:00Z");
    expect(weeklySalesAverage(fall, 2026, "2026-11-02")).toMatchObject({ weekCount: 18, totalCents: 44000, averageCents: 2444 });
  });
});
