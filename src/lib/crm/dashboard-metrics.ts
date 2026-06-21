import { isPaidInFullBookkeepingRow } from "@/lib/crm/bookkeeping";
import {
  CrmBookkeepingRow,
  CrmInstallationInvoiceEmail,
  CrmJob,
  CrmOrderCogsEmail,
  CrmQuote
} from "@/lib/crm/types";

const SOLD_PIPELINE_STATUSES = new Set<CrmBookkeepingRow["status"]>([
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid",
  "legacy",
  "manual"
]);

const SOLD_JOB_STATUSES = new Set<CrmBookkeepingRow["status"]>([
  ...SOLD_PIPELINE_STATUSES,
  "closed"
]);

export function distinctRowsByJob(rows: CrmBookkeepingRow[]) {
  const seenJobIds = new Set<string>();
  const result: CrmBookkeepingRow[] = [];

  for (const row of rows) {
    if (row.jobId) {
      if (seenJobIds.has(row.jobId)) continue;
      seenJobIds.add(row.jobId);
    }
    result.push(row);
  }

  return result;
}

export function openSoldRows(rows: CrmBookkeepingRow[]) {
  return rows.filter(
    (row) =>
      row.total > 0 &&
      !isPaidInFullBookkeepingRow(row) &&
      row.balance > 0 &&
      SOLD_PIPELINE_STATUSES.has(row.status)
  );
}

export function soldRows(rows: CrmBookkeepingRow[]) {
  return rows.filter((row) => row.total > 0 && SOLD_JOB_STATUSES.has(row.status));
}

export function needToOrderRows(rows: CrmBookkeepingRow[]) {
  return rows.filter(
    (row) =>
      row.total > 0 &&
      !isPaidInFullBookkeepingRow(row) &&
      (row.status === "sold" || row.status === "approved")
  );
}

export function awaitingProductRows(rows: CrmBookkeepingRow[]) {
  return rows.filter((row) => row.total > 0 && !isPaidInFullBookkeepingRow(row) && row.status === "ordered");
}

export function missingCogsRows(rows: CrmBookkeepingRow[]) {
  return rows.filter((row) => row.total > 0 && row.cogs <= 0);
}

export function openBalanceRows(rows: CrmBookkeepingRow[]) {
  return rows.filter((row) => !isPaidInFullBookkeepingRow(row) && row.balance > 0);
}

export function quotedPipelineQuotes(quotes: CrmQuote[], now: Date | string = new Date()) {
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  const cutoffMs = nowMs - 60 * 86_400_000;
  const byGroup = new Map<string, CrmQuote>();

  for (const quote of quotes) {
    if (quote.status !== "sent" || !quote.sent_at) continue;
    const sentMs = Date.parse(quote.sent_at);
    if (!Number.isFinite(sentMs) || sentMs < cutoffMs || sentMs > nowMs) continue;
    const key = quote.quote_group_id || quote.job_id || quote.id;
    const existing = byGroup.get(key);
    if (!existing || Number(quote.quote_total) > Number(existing.quote_total)) {
      byGroup.set(key, quote);
    }
  }

  return [...byGroup.values()];
}

export function orderAndInstallReviewCount(
  installationInvoices: CrmInstallationInvoiceEmail[] = [],
  orderCogsEmails: CrmOrderCogsEmail[] = []
) {
  const installReview = installationInvoices.filter(
    (invoice) => invoice.match_status === "needs_review" || invoice.match_status === "error"
  ).length;
  const cogsReview = orderCogsEmails.filter(
    (email) => email.match_status === "needs_review" || email.match_status === "error"
  ).length;
  return installReview + cogsReview;
}

export function buildDashboardSummaryMetrics({
  jobs,
  quotes,
  rows,
  installationInvoiceEmails = [],
  orderCogsEmails = [],
  now = new Date()
}: {
  jobs: CrmJob[];
  quotes: CrmQuote[];
  rows: CrmBookkeepingRow[];
  installationInvoiceEmails?: CrmInstallationInvoiceEmail[];
  orderCogsEmails?: CrmOrderCogsEmail[];
  now?: Date | string;
}) {
  const quotedQuotes = quotedPipelineQuotes(quotes, now);
  const openRows = openSoldRows(rows);
  const needOrder = needToOrderRows(rows);
  const missingCogs = missingCogsRows(rows);
  const awaitingProduct = awaitingProductRows(rows);
  const openBalances = openBalanceRows(rows);

  return {
    openJobs: distinctRowsByJob(openRows).length,
    scheduledJobs: jobs.filter((job) => job.status === "scheduled").length,
    quotedJobs: jobs.filter((job) => job.status === "quoted").length,
    soldJobs: distinctRowsByJob(soldRows(rows)).length,
    quotedPipeline: quotedQuotes.reduce((total, quote) => total + (Number(quote.quote_total) || 0), 0),
    soldPipeline: openRows.reduce((total, row) => total + (Number(row.total) || 0), 0),
    depositCollected: jobs.reduce((total, job) => total + (Number(job.deposit_paid) || 0), 0),
    openBalance: openBalances.reduce((total, row) => total + Math.max(Number(row.balance) || 0, 0), 0),
    needsOrder: distinctRowsByJob(needOrder).length,
    missingCogs: missingCogs.length,
    awaitingProduct: distinctRowsByJob(awaitingProduct).length,
    installReview: orderAndInstallReviewCount(installationInvoiceEmails, orderCogsEmails)
  };
}
