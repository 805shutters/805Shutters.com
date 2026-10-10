import { losAngelesDateString } from "../booking/availability";
import type { CrmClosedSalesReport } from "./types";
import { WEEKLY_SALES_GOAL_START_DATE } from "./weekly-sales-average";

// Start with the first full calendar month after the owner-selected baseline.
const baseline = new Date(`${WEEKLY_SALES_GOAL_START_DATE}T12:00:00Z`);
if (baseline.getUTCDate() !== 1) baseline.setUTCMonth(baseline.getUTCMonth() + 1, 1);
export const MONTHLY_SALES_START_DATE = baseline.toISOString().slice(0, 10);
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
function shiftMonth(start: string, offset: number) {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}
function datedSales(report: CrmClosedSalesReport | undefined) {
  return [...new Map((report?.weeks.flatMap(week => week.sales) || []).map(sale => [sale.id, sale])).values()].flatMap(sale => {
    const date = new Date(sale.signedAt);
    if (!Number.isFinite(date.getTime())) return [];
    const day = /^\d{4}-\d{2}-\d{2}$/.test(sale.signedAt) ? sale.signedAt : losAngelesDateString(date);
    return [{ sale, day }];
  });
}

export function monthlyGrossSales(report: CrmClosedSalesReport | undefined, today: string) {
  const sales = datedSales(report);
  const months = [];
  const current = monthStart(today);
  for (let start = current; start >= MONTHLY_SALES_START_DATE; start = shiftMonth(start, -1)) {
    const last = new Date(`${shiftMonth(start, 1)}T12:00:00Z`);
    last.setUTCDate(0);
    const end = last.toISOString().slice(0, 10);
    const selected = sales.filter(item => item.day >= start && item.day <= end && item.day <= today).map(item => item.sale);
    months.push({ start, end, isCurrent: start === current, sales: selected,
      grossCents: report ? selected.reduce((total, sale) => total + sale.amountCents, 0) : null });
  }
  return months;
}

/** Calendar-year average of completed full months, including zero-sales months. */
export function monthlySalesAverage(report: CrmClosedSalesReport | undefined, year: number, today: string) {
  const months = monthlyGrossSales(report, today).filter(month => !month.isCurrent && Number(month.start.slice(0, 4)) === year);
  const totalCents = months.reduce((total, month) => total + (month.grossCents || 0), 0);
  return { monthCount: months.length, averageCents: report && months.length ? Math.round(totalCents / months.length) : null };
}
