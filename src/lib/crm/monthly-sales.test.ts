import { describe, expect, it } from "vitest";
import { buildClosedSalesReport } from "./dashboard-metrics";
import { monthlyGrossSales, monthlySalesAverage } from "./monthly-sales";
import type { CrmQuote } from "./types";

function report(sales: [string, number][], now = "2026-10-10T20:00:00Z") {
  return buildClosedSalesReport({ jobs: [], contracts: [], now, includeCurrentWeek: true,
    quotes: sales.map(([signed_at, quote_total], index) => ({ id: `q${index}`, job_id: `j${index}`, signed_at, quote_total, meta: {} }) as CrmQuote) });
}

describe("monthly gross revenue", () => {
  it("groups by calendar month across week boundaries, deduplicates and excludes future sales", () => {
    const history = report([["2026-09-30T20:00:00Z", 100], ["2026-10-01T06:59:59Z", 200], ["2026-10-01T07:00:00Z", 300], ["2026-10-10", 50], ["2026-10-11", 999]]);
    history.weeks.push(history.weeks[1]);
    const months = monthlyGrossSales(history, "2026-10-10");
    expect(months.map(month => month.start)).toEqual(["2026-10-01", "2026-09-01", "2026-08-01", "2026-07-01"]);
    expect(months[0]).toMatchObject({ end: "2026-10-31", grossCents: 35000, isCurrent: true });
    expect(months[1]).toMatchObject({ end: "2026-09-30", grossCents: 30000, isCurrent: false });
  });
  it("averages completed full months, including zero months and excluding June and the partial current month", () => {
    const history = report([["2026-06-29", 999], ["2026-07-01", 100], ["2026-09-30", 200], ["2026-10-01", 999]]);
    expect(monthlySalesAverage(history, 2026, "2026-10-10")).toEqual({ monthCount: 3, averageCents: 10000 });
    expect(monthlySalesAverage(history, 2026, "2026-07-15").averageCents).toBeNull();
  });
  it("distinguishes missing history from completed zero-sales months", () => {
    expect(monthlyGrossSales(undefined, "2026-10-10")[0].grossCents).toBeNull();
    expect(monthlySalesAverage(undefined, 2026, "2026-10-10").averageCents).toBeNull();
    expect(monthlySalesAverage(report([]), 2026, "2026-10-10").averageCents).toBe(0);
  });
  it("resets the average each calendar year, handles leap months and rounds cents", () => {
    const history = report([["2026-12-31", 999], ["2028-02-29", 100.01]], "2028-03-02T20:00:00Z");
    expect(monthlySalesAverage(history, 2028, "2028-03-02")).toEqual({ monthCount: 2, averageCents: 5001 });
    expect(monthlyGrossSales(history, "2028-03-02")[1]).toMatchObject({ start: "2028-02-01", end: "2028-02-29", grossCents: 10001 });
    expect(monthlySalesAverage(history, 2027, "2028-03-02")).toEqual({ monthCount: 12, averageCents: 0 });
  });
});
