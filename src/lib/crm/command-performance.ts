import type { CrmBookkeepingRow, CrmJob } from "@/lib/crm/types";

const wonStatuses = new Set<CrmJob["status"]>(["sold", "ordered", "installed", "invoiced", "closed"]);

export type CommandPerformanceMetrics = {
  closeRate30Days: number;
  closeRate60Days: number;
  closeRateAllTime: number;
  revenue30Days: number;
  revenue60Days: number;
  yearToDateRevenue: number;
  currentYearForecast: number;
};

function startOfRollingWindow(now: Date, days: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function closeRate(jobs: CrmJob[], since?: Date) {
  const decided = jobs.filter((job) => {
    const createdAt = validDate(job.created_at);
    if (!createdAt || (since && createdAt < since)) return false;
    return wonStatuses.has(job.status) || job.status === "lost";
  });
  if (decided.length === 0) return 0;
  return Math.round((decided.filter((job) => wonStatuses.has(job.status)).length / decided.length) * 100);
}

function soldRevenue(rows: CrmBookkeepingRow[], since: Date, through: Date) {
  return rows.reduce((total, row) => {
    const soldAt = validDate(row.soldDate);
    const amount = Number(row.total);
    if (!soldAt || soldAt < since || soldAt > through || !Number.isFinite(amount) || amount <= 0) return total;
    return total + amount;
  }, 0);
}

export function buildCommandPerformanceMetrics(
  jobs: CrmJob[],
  rows: CrmBookkeepingRow[],
  now = new Date()
): CommandPerformanceMetrics {
  const through = new Date(now);
  through.setHours(23, 59, 59, 999);
  const start30 = startOfRollingWindow(now, 30);
  const start60 = startOfRollingWindow(now, 60);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const nextYearStart = new Date(now.getFullYear() + 1, 0, 1);
  const daysInYear = Math.round((nextYearStart.getTime() - yearStart.getTime()) / 86_400_000);
  const elapsedDays = Math.max(1, Math.floor((through.getTime() - yearStart.getTime()) / 86_400_000) + 1);
  const yearToDateRevenue = soldRevenue(rows, yearStart, through);

  return {
    closeRate30Days: closeRate(jobs, start30),
    closeRate60Days: closeRate(jobs, start60),
    closeRateAllTime: closeRate(jobs),
    revenue30Days: soldRevenue(rows, start30, through),
    revenue60Days: soldRevenue(rows, start60, through),
    yearToDateRevenue,
    currentYearForecast: Math.round((yearToDateRevenue / elapsedDays) * daysInYear)
  };
}
