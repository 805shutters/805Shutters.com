import { describe, expect, it } from "vitest";
import { weeklySalesAverage } from "./weekly-sales-average";
import { buildClosedSalesReport } from "./dashboard-metrics";
import type { CrmQuote } from "./types";

function report(sales: [string, number][], now = "2026-09-26T19:00:00Z") {
  return buildClosedSalesReport({ jobs: [], contracts: [], now, includeCurrentWeek: true,
    quotes: sales.map(([signed_at, quote_total], index) => ({ id: `q${index}`, job_id: `j${index}`, signed_at, quote_total, meta: {} }) as CrmQuote) });
}

describe("calendar year weekly gross sales average", () => {
  it("starts at actual CRM sales history, includes subsequent zero weeks, and excludes this partial week", () => {
    const history = report([["2026-04-28T12:00:00Z", 814], ["2026-09-20T20:00:00Z", 20186], ["2026-09-21T07:00:00Z", 99999]]);
    expect(weeklySalesAverage(history, 2026, "2026-09-21")).toMatchObject({ start: "2026-04-28", end: "2026-09-20", weekCount: 21, totalCents: 2100000, averageCents: 100000 });
  });
  it("uses the first actual sale date rather than assuming May 1 or a rolling four-month window", () => {
    const history = report([["2026-05-18T07:00:00Z", 18000]]);
    expect(weeklySalesAverage(history, 2026, "2026-09-21")).toMatchObject({ start: "2026-05-18", weekCount: 18, averageCents: 100000 });
  });
  it("uses Los Angeles boundaries and deduplicates sales across loaded weeks", () => {
    const history = report([["2026-05-04T06:59:59Z", 210], ["2026-09-21T06:59:59Z", 210], ["2026-09-21T07:00:00Z", 999]]);
    history.weeks.push(history.weeks[1]);
    expect(weeklySalesAverage(history, 2026, "2026-09-21")).toMatchObject({ start: "2026-05-03", weekCount: 21, totalCents: 42000, averageCents: 2000 });
  });
  it("starts subsequent calendar years on January 1 and includes zero-sales weeks before that year's first sale", () => {
    const history = report([["2026-05-01T20:00:00Z", 999], ["2027-01-20T20:00:00Z", 400]], "2027-01-25T20:00:00Z");
    expect(weeklySalesAverage(history, 2027, "2027-01-25")).toMatchObject({ start: "2027-01-01", end: "2027-01-24", weekCount: 4, totalCents: 40000, averageCents: 10000 });
    expect(weeklySalesAverage(history, 2025, "2027-01-25")).toMatchObject({ weekCount: 0, averageCents: null });
  });
  it("distinguishes unavailable or empty history, no completed weeks, and an actual zero after inception", () => {
    expect(weeklySalesAverage(undefined, 2026, "2026-09-21").averageCents).toBeNull();
    expect(weeklySalesAverage(report([]), 2026, "2026-09-21")).toMatchObject({ weekCount: 0, averageCents: null });
    expect(weeklySalesAverage(report([["2026-09-22T20:00:00Z", 100]]), 2026, "2026-09-21")).toMatchObject({ weekCount: 0, averageCents: null });
    expect(weeklySalesAverage(report([["2026-05-01T20:00:00Z", 100]], "2027-01-11T20:00:00Z"), 2027, "2027-01-11")).toMatchObject({ weekCount: 2, averageCents: 0 });
  });
  it("handles leap years, DST and cent rounding", () => {
    const history = report([["2024-02-29T20:00:00Z", 100.01]], "2024-03-11T07:00:00Z");
    expect(weeklySalesAverage(history, 2024, "2024-03-11")).toMatchObject({ weekCount: 2, averageCents: 5001 });
    const fall = report([["2026-10-26T07:00:00Z", 220], ["2026-11-02T07:59:59Z", 220]], "2026-11-02T08:00:00Z");
    expect(weeklySalesAverage(fall, 2026, "2026-11-02")).toMatchObject({ weekCount: 1, totalCents: 44000, averageCents: 44000 });
  });
});
