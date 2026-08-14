import type { CrmBookkeepingRow, CrmCustomerFile, CrmJob } from "@/lib/crm/types";

const wonStatuses = new Set<CrmJob["status"]>(["sold", "ordered", "installed", "invoiced", "closed"]);

export type CommandPerformanceMetrics = {
  closeRate30Days: number | null;
  closeRate30DaysWon: number;
  closeRate30DaysTotal: number;
  closeRate60Days: number | null;
  closeRate60DaysWon: number;
  closeRate60DaysTotal: number;
  currentCrmSalesRate: number | null;
  currentCrmSalesWon: number;
  currentCrmSalesTotal: number;
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

function officialCustomerEmail(value: string | null | undefined) {
  const email = (value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  if (/@(?:example|test|invalid)\.(?:com|net|org)$/i.test(email)) return "";
  return email;
}

function officialCustomerPhone(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "");
  const phone = digits.length >= 10 ? digits.slice(-10) : "";
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(phone)) return "";
  if (phone === "1234567890" || phone.slice(3, 6) === "555") return "";
  return phone;
}

function isRealCustomerName(value: string | null | undefined) {
  const name = normalizedText(value);
  if (!name || !/[a-z]/.test(name)) return false;
  if (/\b(test|testing|dummy|sample|placeholder|fake|codex|e2e)\b/.test(name)) return false;
  return !/^(quote|customer|unknown|unnamed|no name|n a|na|none|abc)( \d+)?$/.test(name);
}

function isTestSource(value: string | null | undefined) {
  return /\b(test|testing|dummy|sample|placeholder|fake|codex|e2e)\b/.test(normalizedText(value));
}

function firstOfficialEmail(values: Array<string | null | undefined>) {
  for (const value of values) {
    const email = officialCustomerEmail(value);
    if (email) return email;
  }
  return "";
}

function firstOfficialPhone(values: Array<string | null | undefined>) {
  for (const value of values) {
    const phone = officialCustomerPhone(value);
    if (phone) return phone;
  }
  return "";
}

function customerIdentityKeys(jobs: CrmJob[], files: CrmCustomerFile[]) {
  const identityByJobId = new Map<string, string>();
  for (const file of files) {
    const name = [file.customer?.display_name, file.customerName, ...file.jobs.map((job) => job.customer_name)]
      .find(isRealCustomerName);
    if (!name) continue;

    const email = firstOfficialEmail([file.email, file.customer?.email, ...file.jobs.map((job) => job.email)]);
    const phone = firstOfficialPhone([file.phone, file.customer?.phone, ...file.jobs.map((job) => job.phone)]);
    if (!email && !phone) continue;

    const key = file.customer?.id ? `customer:${file.customer.id}` : `customer-file:${file.id}`;
    for (const job of file.jobs) {
      if (!isTestSource(job.source)) identityByJobId.set(job.id, key);
    }
  }

  for (const job of jobs) {
    if (identityByJobId.has(job.id) || isTestSource(job.source) || !isRealCustomerName(job.customer_name)) continue;

    const name = normalizedText(job.customer_name);
    const email = officialCustomerEmail(job.email);
    const phone = officialCustomerPhone(job.phone);
    if (email) {
      identityByJobId.set(job.id, `name-email:${name}:${email}`);
    } else if (phone) {
      // Never merge on phone alone: household and business numbers are often shared.
      identityByJobId.set(job.id, `name-phone:${name}:${phone}`);
    }
  }

  return identityByJobId;
}

export function customerSalesSummary(jobs: CrmJob[], files: CrmCustomerFile[], since?: Date, through?: Date) {
  const identityKeys = customerIdentityKeys(jobs, files);
  const outcomes = new Map<string, { inCohort: boolean; won: boolean }>();
  for (const job of jobs) {
    if (job.meta?.deleted_at) continue;

    // Close rates are customer conversion metrics, not quote/job row metrics.
    // Blank, placeholder, test, and contactless records cannot represent an
    // independently verifiable customer and therefore never enter the cohort.
    const key = identityKeys.get(job.id);
    if (!key) continue;
    const outcome = outcomes.get(key) || { inCohort: false, won: false };

    // Cohort membership is based on the customer's opportunity date.
    // Appointment time is the durable lead date; imported rows without one
    // fall back to created_at. Future appointments never count yet.
    const appointmentAt = validDate(job.appointment_start);
    const opportunityAt = appointmentAt || validDate(job.created_at);
    if (opportunityAt && (!since || opportunityAt >= since) && (!through || opportunityAt <= through)) {
      outcome.inCohort = true;
    }

    // A customer is counted once. Any non-future sale makes the customer a win;
    // unresolved opportunities remain in the denominator so the live dashboard
    // continues to show a conversion rate even when explicit lost rows are not
    // recorded in the CRM.
    if (!opportunityAt || !through || opportunityAt <= through) {
      if (wonStatuses.has(job.status)) outcome.won = true;
    }

    outcomes.set(key, outcome);
  }

  const cohort = [...outcomes.values()].filter((outcome) => outcome.inCohort);
  const won = cohort.filter((outcome) => outcome.won).length;
  const total = cohort.length;
  return {
    won,
    total,
    rate: total ? Math.round((won / total) * 100) : null
  };
}

export function customerCloseRate(jobs: CrmJob[], files: CrmCustomerFile[], since?: Date, through?: Date) {
  return customerSalesSummary(jobs, files, since, through).rate;
}

export function formatCloseRate(rate: number | null) {
  return rate === null ? "Unavailable" : `${rate}%`;
}

function soldRevenue(rows: CrmBookkeepingRow[], since: Date, through: Date) {
  return rows.reduce((total, row) => {
    const soldAt = validDate(row.soldDate);
    const amount = Number(row.total);
    // Revenue on the Command Center is booked only when a CRM contract is
    // signed. Manual ledger entries and open/sent quotes must not inflate the
    // signed-contract figure.
    if (
      row.source !== "crm_quote" ||
      !wonStatuses.has(row.jobStatus || "new") ||
      !soldAt ||
      soldAt < since ||
      soldAt > through ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) return total;
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
  const sales30Days = customerSalesSummary(jobs, customerFiles, start30, through);
  const sales60Days = customerSalesSummary(jobs, customerFiles, start60, through);
  const currentCrmSales = customerSalesSummary(jobs, customerFiles, undefined, through);

  return {
    closeRate30Days: sales30Days.rate,
    closeRate30DaysWon: sales30Days.won,
    closeRate30DaysTotal: sales30Days.total,
    closeRate60Days: sales60Days.rate,
    closeRate60DaysWon: sales60Days.won,
    closeRate60DaysTotal: sales60Days.total,
    currentCrmSalesRate: currentCrmSales.rate,
    currentCrmSalesWon: currentCrmSales.won,
    currentCrmSalesTotal: currentCrmSales.total,
    revenue30Days: soldRevenue(rows, start30, through),
    revenue60Days: soldRevenue(rows, start60, through),
    yearToDateRevenue,
    currentYearForecast: Math.round((yearToDateRevenue / elapsedDays) * daysInYear)
  };
}
