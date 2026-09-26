import { losAngelesDateString } from "../booking/availability";
import type { CrmClosedSalesReport } from "./types";

const DAY_MS = 86_400_000;
const date = (day: string) => new Date(`${day}T12:00:00Z`);
const monday = (day: Date) => day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS;

/** Calendar-year average of recorded signed gross sales, including zero-sales weeks.
 * Current year ends at the last completed Sunday; prior years include Jan 1–Dec 31.
 * Boundary weeks count once per year, with only that year's sales in the numerator.
 */
export function weeklySalesAverage(report: CrmClosedSalesReport | undefined, year: number, currentWeekStart: string) {
  const start = `${year}-01-01`;
  const lastCompleted = new Date(date(currentWeekStart).getTime() - DAY_MS).toISOString().slice(0, 10);
  const end = `${year}-12-31` < lastCompleted ? `${year}-12-31` : lastCompleted;
  const weekCount = end < start ? 0 : Math.round((monday(date(end)) - monday(date(start))) / (7 * DAY_MS)) + 1;
  // A sale can appear in more than one loaded week; count its durable identity once.
  const sales = new Map(report?.weeks.flatMap(week => week.sales).map(sale => [sale.id, sale]) ?? []);
  let totalCents = 0;
  for (const sale of sales.values()) {
    const signed = new Date(sale.signedAt);
    if (!Number.isFinite(signed.getTime())) continue;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(sale.signedAt) ? sale.signedAt : losAngelesDateString(signed);
    if (day >= start && day <= end) totalCents += sale.amountCents;
  }
  return { year, start, end, weekCount, totalCents: report ? totalCents : null,
    averageCents: report && weekCount > 0 ? Math.round(totalCents / weekCount) : null };
}
