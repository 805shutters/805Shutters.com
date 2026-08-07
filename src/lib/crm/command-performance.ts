import type { CrmBookkeepingRow, CrmCustomerFile, CrmJob } from "@/lib/crm/types";

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

function normalizedText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedPhone(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function customerIdentityKeys(jobs: CrmJob[], files: CrmCustomerFile[]) {
  const canonicalByJobId = new Map<string, string>();
  for (const file of files) {
    if (!file.customer?.id) continue;
    for (const job of file.jobs) canonicalByJobId.set(job.id, `customer:${file.customer.id}`);
  }

  return new Map(jobs.map((job) => {
    const canonical = canonicalByJobId.get(job.id);
    if (canonical) return [job.id, canonical];

    const email = normalizedText(job.email);
    if (email) return [job.id, `email:${email}`];

    const name = normalizedText(job.customer_name);
    const phone = normalizedPhone(job.phone);
    const address = normalizedText(job.address);
    if (name && phone) return [job.id, `name-phone:${name}:${phone}`];
    if (name && address) return [job.id, `name-address:${name}:${address}`];

    // A name-only match is intentionally exact after normalization. Never merge
    // on phone alone: shared household and business numbers are common in CRM data.
    return [job.id, name ? `name:${name}` : `job:${job.id}`];
  }));
}

export function customerCloseRate(jobs: CrmJob[], files: CrmCustomerFile[], since?: Date, through?: Date) {
  const identityKeys = customerIdentityKeys(jobs, files);
  const outcomes = new Map<string, boolean>();
  for (const job of jobs) {
    // Close rate is based on completed customer opportunities, not the day an
    // imported CRM row happened to be created. Appointment time is the closest
    // durable lead-cohort date; decided rows without one fall back to created_at.
    const appointmentAt = validDate(job.appointment_start);
    const isDecided = wonStatuses.has(job.status) || job.status === "lost";
    const opportunityAt = appointmentAt || (isDecided ? validDate(job.created_at) : null);
    if (!opportunityAt || (since && opportunityAt < since) || (through && opportunityAt > through)) continue;

    const key = identityKeys.get(job.id) || `job:${job.id}`;
    outcomes.set(key, Boolean(outcomes.get(key)) || wonStatuses.has(job.status));
  }
  if (outcomes.size === 0) return 0;
  return Math.round(([...outcomes.values()].filter(Boolean).length / outcomes.size) * 100);
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
  now = new Date(),
  customerFiles: CrmCustomerFile[] = []
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
    closeRate30Days: customerCloseRate(jobs, customerFiles, start30, through),
    closeRate60Days: customerCloseRate(jobs, customerFiles, start60, through),
    closeRateAllTime: customerCloseRate(jobs, customerFiles, undefined, through),
    revenue30Days: soldRevenue(rows, start30, through),
    revenue60Days: soldRevenue(rows, start60, through),
    yearToDateRevenue,
    currentYearForecast: Math.round((yearToDateRevenue / elapsedDays) * daysInYear)
  };
}
