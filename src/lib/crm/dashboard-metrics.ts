import { buildJobTrackingView } from "./job-tracking-view";
import type { JobProgress } from "./job-progress";
import { effectiveBookkeepingStatus, isPaidInFullBookkeepingRow } from "@/lib/crm/bookkeeping";
import { getMeasureNeededMeta } from "@/lib/crm/measure-needed-state";
import {
  CrmBookkeepingRow,
  CrmBookkeepingStatus,
  CrmInstallationInvoiceEmail,
  CrmJob,
  CrmJobStatus,
  CrmOrderCogsEmail,
  CrmQuote
} from "@/lib/crm/types";

const SOLD_PIPELINE_STATUSES = new Set<CrmBookkeepingStatus>([
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

const SOLD_JOB_STATUSES = new Set<CrmBookkeepingStatus>([
  ...SOLD_PIPELINE_STATUSES,
  "closed"
]);

const SOLD_CRM_JOB_STATUSES = new Set<CrmJobStatus>([
  "sold",
  "ordered",
  "installed",
  "invoiced",
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

function progressForRows(rows: CrmBookkeepingRow[], jobs: CrmJob[] = [], quotes: CrmQuote[] = []) {
  if (rows.every((row) => row.operationalProgress)) return (row: CrmBookkeepingRow) => row.operationalProgress!;
  const derived = new Map(buildJobTrackingView({ rows, jobs, quotes, files: [] }).filter((item) => item.row).map((item) => [item.row!.id, item.progress]));
  return (row: CrmBookkeepingRow): JobProgress | undefined => row.operationalProgress || derived.get(row.id);
}

export function openSoldRows(rows: CrmBookkeepingRow[]) {
  const progress = progressForRows(rows);
  return rows.filter((row) => row.total > 0 && progress(row)?.commercial === "accepted" && progress(row)?.active);
}

export function soldRows(rows: CrmBookkeepingRow[]) {
  return rows.filter((row) => row.total > 0 && SOLD_JOB_STATUSES.has(effectiveBookkeepingStatus(row)));
}

export function soldLifecycleJobs(jobs: CrmJob[]) {
  return jobs.filter((job) => SOLD_CRM_JOB_STATUSES.has(job.status));
}

export function needToOrderRows(rows: CrmBookkeepingRow[]) {
  const progress = progressForRows(rows);
  return rows.filter((row) => progress(row)?.stage === "need_to_order");
}

export function awaitingProductRows(rows: CrmBookkeepingRow[]) {
  const progress = progressForRows(rows);
  return rows.filter((row) => progress(row)?.stage === "ordered");
}

export function missingCogsRows(rows: CrmBookkeepingRow[]) {
  return rows.filter((row) => row.total > 0 && row.cogs <= 0);
}

export function openBalanceRows(rows: CrmBookkeepingRow[]) {
  return rows.filter((row) => !isPaidInFullBookkeepingRow(row) && row.balance > 0);
}

export function measureNeededJobs(jobs: CrmJob[]) {
  return jobs.filter((job) => getMeasureNeededMeta(job.meta).status === "needed");
}

export function measureScheduledJobs(jobs: CrmJob[]) {
  return measureNeededJobs(jobs).filter((job) => getMeasureNeededMeta(job.meta).schedule_status === "scheduled");
}

export function measureUnscheduledJobs(jobs: CrmJob[]) {
  return measureNeededJobs(jobs).filter((job) => getMeasureNeededMeta(job.meta).schedule_status !== "scheduled");
}

/** Sold jobs (sold/approved) where the required deposit hasn't been collected. */
export function depositNeededRows(rows: CrmBookkeepingRow[]) {
  const progress = progressForRows(rows);
  return rows.filter((row) => progress(row)?.stage === "sold_need_deposit");
}

/**
 * Tracking must keep newly sold work in the deposit queue even when an older
 * or incomplete quote has no configured deposit amount yet. A positive
 * configured deposit remains in the queue until that full amount is collected.
 */
export function trackingRowNeedsDeposit(row: CrmBookkeepingRow) {
  const status = effectiveBookkeepingStatus(row);
  if (status !== "sold" && status !== "approved") return false;

  const due = Math.max(Number(row.depositDue) || 0, 0);
  const paid = Math.max(Number(row.depositPaid) || 0, 0);
  return paid <= 0 || (due > 0 && paid < due);
}

/** Completion cohort with open balances; contractual due dates remain separate. */
export function balanceDueCompletedRows(rows: CrmBookkeepingRow[], jobs: CrmJob[], quotes: CrmQuote[] = []) {
  const progress = progressForRows(rows, jobs, quotes);
  return rows.filter((row) => progress(row)?.stage === "balance_needed");
}

export function quotedPipelineQuotes(quotes: CrmQuote[], now: Date | string = new Date()) {
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  const cutoffMs = nowMs - 60 * 86_400_000;
  const byGroup = new Map<string, CrmQuote>();

  for (const quote of quotes) {
    if ((quote.live_status || quote.status) !== "sent" || !quote.sent_at) continue;
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
  const depositNeeded = depositNeededRows(rows);
  const balanceDueCompleted = balanceDueCompletedRows(rows, jobs, quotes);
  const measureNeeded = measureUnscheduledJobs(jobs);
  const measureScheduled = measureScheduledJobs(jobs);

  return {
    openJobs: distinctRowsByJob(openRows).length,
    scheduledJobs: jobs.filter((job) => job.status === "scheduled").length,
    quotedJobs: jobs.filter((job) => job.status === "quoted").length,
    soldJobs: soldLifecycleJobs(jobs).length,
    quotedPipeline: quotedQuotes.reduce((total, quote) => total + (Number(quote.quote_total) || 0), 0),
    soldPipeline: openRows.reduce((total, row) => total + (Number(row.total) || 0), 0),
    depositCollected: jobs.reduce((total, job) => total + (Number(job.deposit_paid) || 0), 0),
    openBalance: openBalances.reduce((total, row) => total + Math.max(Number(row.balance) || 0, 0), 0),
    needsOrder: needOrder.length,
    depositNeeded: depositNeeded.length,
    depositNeededAmount: depositNeeded.reduce((total, row) => total + Math.max((Number(row.depositDue) || 0) - (Number(row.depositPaid) || 0), 0), 0),
    balanceDueCompleted: balanceDueCompleted.length,
    balanceDueCompletedAmount: balanceDueCompleted.reduce((total, row) => total + Math.max(Number(row.balance) || 0, 0), 0),
    missingCogs: missingCogs.length,
    awaitingProduct: awaitingProduct.length,
    measureNeeded: measureNeeded.length,
    measureScheduled: measureScheduled.length
  };
}
