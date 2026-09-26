import { losAngelesDateString } from "../booking/availability";
import type { CrmClosedSalesReport } from "./types";

const DAY_MS = 86_400_000;
const date = (day: string) => new Date(`${day}T12:00:00Z`);
const monday = (day: Date) => day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS;

/** Calendar-year average of recorded signed gross sales, including zero-sales weeks.
 * Start no earlier than the first dated CRM sale. Subsequent years start January 1.
 * Current year ends at the last completed Sunday; prior years end December 31.
 * Boundary weeks count once per year, with only that year's sales in the numerator.
 */
export function weeklySalesAverage(report: CrmClosedSalesReport | undefined, year: number, currentWeekStart: string) {
  const sales = new Map(report?.weeks.flatMap(week => week.sales).map(sale => [sale.id, sale]) ?? []);
  const datedSales = [...sales.values()].flatMap(sale => {
    const signed = new Date(sale.signedAt);
    if (!Number.isFinite(signed.getTime())) return [];
    const day = /^\d{4}-\d{2}-\d{2}$/.test(sale.signedAt) ? sale.signedAt : losAngelesDateString(signed);
    return [{ day, amountCents: sale.amountCents }];
  });
  const firstRecordedDate = datedSales.reduce<string | null>((first, sale) => !first || sale.day < first ? sale.day : first, null);
  const yearStart = `${year}-01-01`;
  const start = firstRecordedDate && firstRecordedDate > yearStart ? firstRecordedDate : yearStart;
  const lastCompleted = new Date(date(currentWeekStart).getTime() - DAY_MS).toISOString().slice(0, 10);
  const end = `${year}-12-31` < lastCompleted ? `${year}-12-31` : lastCompleted;
  const weekCount = !firstRecordedDate || end < start ? 0 : Math.round((monday(date(end)) - monday(date(start))) / (7 * DAY_MS)) + 1;
  // Count each durable sale once; do not add empty weeks before CRM history starts.
  const totalCents = datedSales.filter(sale => sale.day >= start && sale.day <= end)
    .reduce((total, sale) => total + sale.amountCents, 0);
  return { year, start, end, weekCount, firstRecordedDate, totalCents: report ? totalCents : null,
    averageCents: report && weekCount > 0 ? Math.round(totalCents / weekCount) : null };
}
