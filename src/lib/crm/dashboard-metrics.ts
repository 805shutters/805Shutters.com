import { losAngelesDateString, zonedTimeToUtc } from "@/lib/booking/availability";
import type { CrmClosedSale, CrmClosedSalesReport, CrmClosedSalesWeek, CrmCustomerContract, CrmBookkeepingEntry, CrmCustomer } from "@/lib/crm/types";
import { currentOfferedQuotes } from "./quote-opportunities";
import { businessDate } from "./business-date";
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
  const through=businessDate(typeof now === "string" ? now : now.toISOString())!;
  const from=new Date(Date.parse(through)-59*86400000).toISOString().slice(0,10);
  return currentOfferedQuotes(quotes,from,through);
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


function shiftSalesDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function previousClosedSalesMonday(now: Date | string = new Date()) {
  const today = losAngelesDateString(new Date(now));
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return shiftSalesDate(today, -((weekday + 6) % 7) - 7);
}

function closedSalesWeek(startDate: string, throughDate?: string): CrmClosedSalesWeek {
  const endDate = throughDate || shiftSalesDate(startDate, 6);
  const labelDate = (date: string, includeYear = true) => new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric", ...(includeYear ? { year: "numeric" as const } : {})
  }).format(new Date(`${date}T12:00:00Z`));
  return {
    startDate, endDate,
    ...(throughDate ? { isCurrentWeek: true } : {}),
    startAt: zonedTimeToUtc(startDate, "00:00").toISOString(),
    endExclusiveAt: zonedTimeToUtc(shiftSalesDate(endDate, 1), "00:00").toISOString(),
    label: `${labelDate(startDate, startDate.slice(0, 4) !== endDate.slice(0, 4))}–${labelDate(endDate)}`,
    totalCents: 0, sales: []
  };
}

function salesRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function salesTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  // A recorded date without a time is a local business date, never UTC midnight.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOnly && !/(Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  const day = value.slice(0, 10);
  const calendarDate = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== day) return null;
  const date = dateOnly ? zonedTimeToUtc(value, "00:00") : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Derive the ledger from original records, never from projected sold/created dates. */
export function buildClosedSalesReport({ jobs, quotes, contracts, entries = [], customers = [], now = new Date(), includeCurrentWeek = false }: {
  jobs: CrmJob[]; quotes: CrmQuote[]; contracts: CrmCustomerContract[];
  entries?: CrmBookkeepingEntry[]; customers?: CrmCustomer[]; now?: Date | string; includeCurrentWeek?: boolean;
}): CrmClosedSalesReport {
  const latestWeekStart = shiftSalesDate(previousClosedSalesMonday(now), includeCurrentWeek ? 7 : 0);
  const currentMonday = shiftSalesDate(latestWeekStart, 7);
  const report: CrmClosedSalesReport = { latestWeekStart, weeks: [], review: [] };
  const jobsById = new Map(jobs.map(job => [job.id, job]));
  const customersById = new Map(customers.map(customer => [customer.id, customer]));
  const quoteById = new Map(quotes.map(quote => [quote.id, quote]));
  const quoteByToken = new Map(quotes.filter(quote => quote.share_token).map(quote => [quote.share_token!, quote]));
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  const quotesByJob = new Map<string, CrmQuote[]>();
  for (const quote of quotes) quotesByJob.set(quote.job_id, [...(quotesByJob.get(quote.job_id) || []), quote]);
  const contractsBySale = new Map<string, CrmCustomerContract[]>();
  for (const contract of contracts) {
    const entry = contract.bookkeeping_entry_id ? entryById.get(contract.bookkeeping_entry_id) : undefined;
    const jobQuotes = contract.job_id ? quotesByJob.get(contract.job_id) || [] : [];
    const linkedQuote = (contract.quote_id ? quoteById.get(contract.quote_id) : undefined)
      || (contract.share_token ? quoteByToken.get(contract.share_token) : undefined)
      || (entry?.quote_id ? quoteById.get(entry.quote_id) : undefined)
      || (!contract.quote_id && !contract.bookkeeping_entry_id && jobQuotes.length === 1 ? jobQuotes[0] : undefined);
    if (!linkedQuote && !contract.quote_id && !contract.bookkeeping_entry_id && !contract.share_token && jobQuotes.length > 1 && contract.signed_at) {
      report.review.push({ id: `contract:${contract.id}`, customerName: jobsById.get(contract.job_id!)?.customer_name || contract.title,
        reason: "Signed contract needs an exact quote link; this job has multiple quotes", signedAt: salesTimestamp(contract.signed_at) });
      continue;
    }
    const key = linkedQuote ? `quote:${linkedQuote.id}` : contract.quote_id ? `quote:${contract.quote_id}`
      : contract.bookkeeping_entry_id ? `entry:${contract.bookkeeping_entry_id}`
      : contract.share_token ? `token:${contract.share_token}` : `contract:${contract.id}`;
    contractsBySale.set(key, [...(contractsBySale.get(key) || []), contract]);
  }
  // Include explicitly recorded standalone contract evidence from job tracking.
  for (const entry of entries) {
    if (salesRecord(entry.meta).deleted_at) continue;
    const evidence = salesRecord(salesRecord(entry.meta).job_tracking_contract);
    const key = entry.quote_id ? `quote:${entry.quote_id}` : `entry:${entry.id}`;
    if (!evidence.signed_at || contractsBySale.has(key)) continue;
    contractsBySale.set(key, [{ id: `entry:${entry.id}`, quote_id: entry.quote_id,
      job_id: entry.job_id, customer_id: null, bookkeeping_entry_id: entry.id,
      signed_at: String(evidence.signed_at), total_amount: entry.total_amount,
      title: entry.customer_name, meta: {}, share_token: null
    } as CrmCustomerContract]);
  }
  const keys = new Set([...quotes.map(quote => `quote:${quote.id}`), ...contractsBySale.keys()]);
  const accepted = new Map<string, CrmClosedSale>();
  for (const key of keys) {
    const quote = key.startsWith("quote:") ? quoteById.get(key.slice(6)) : undefined;
    const linked = (contractsBySale.get(key) || []).slice().sort((a, b) => a.id.localeCompare(b.id));
    const signedContracts = linked.filter(contract => contract.signed_at || salesRecord(salesRecord(contract.meta).contract_snapshot).signedAt);
    const quoteDate = quote && Object.prototype.hasOwnProperty.call(quote, "source_signed_at") ? quote.source_signed_at : quote?.signed_at;
    const hasSignal = Boolean(quoteDate || quote?.customer_signature || signedContracts.length);
    if (!hasSignal) continue;
    const contract = signedContracts.find(item => salesRecord(salesRecord(item.meta).contract_snapshot).schema === "805_signed_quote_contract_v1")
      || signedContracts.find(item => Number(item.total_amount) > 0) || signedContracts[0];
    const snapshot = salesRecord(salesRecord(contract?.meta).contract_snapshot);
    const signedAt = salesTimestamp(snapshot.signedAt ?? contract?.signed_at ?? quoteDate);
    const entry = contract?.bookkeeping_entry_id ? entryById.get(contract.bookkeeping_entry_id) : undefined;
    const jobId = quote?.job_id || contract?.job_id || entry?.job_id || null;
    const customerId = contract?.customer_id || null;
    const customerName = (customerId ? customersById.get(customerId)?.display_name : null)
      || (jobId ? jobsById.get(jobId)?.customer_name : null) || quote?.customer_name || entry?.customer_name || contract?.title || "Unknown customer";
    // Imported duplicate contract shells carry a default zero. A positive signed
    // quote is better evidence than that placeholder; an explicit snapshot zero is authoritative.
    const quoteAmount = salesRecord(salesRecord(quote?.meta).signed_selection).total ?? quote?.quote_total;
    const contractAmount = contract?.total_amount === 0 && Number(quoteAmount) > 0 ? undefined : contract?.total_amount;
    const amount = salesRecord(snapshot.totals).total ?? contractAmount ?? quoteAmount;
    const amountCents = (typeof amount === "number" || (typeof amount === "string" && amount.trim())) ? Math.round(Number(amount) * 100) : NaN;
    const reason = !signedAt ? "Missing or invalid contract signing date" : !Number.isSafeInteger(amountCents) || amountCents < 0 ? "Missing or invalid signed contract amount" : null;
    if (reason) { report.review.push({ id: key, customerName, reason, signedAt }); continue; }
    const sale: CrmClosedSale = { id: key, jobId, quoteId: quote?.id || contract?.quote_id || null,
      customerId, customerName, reference: quote?.quote_number || contract?.title || quote?.id || key,
      signedAt: signedAt!, amountCents };
    // Retained alternatives share a group. Earliest acceptance wins, matching the signing flow.
    const saleKey = quote?.quote_group_id ? `group:${quote.quote_group_id}` : key;
    const existing = accepted.get(saleKey);
    if (!existing || sale.signedAt < existing.signedAt || (sale.signedAt === existing.signedAt && sale.id < existing.id)) accepted.set(saleKey, sale);
  }
  const byWeek = new Map<string, CrmClosedSale[]>();
  let earliest = latestWeekStart;
  for (const sale of accepted.values()) {
    if (new Date(sale.signedAt).getTime() > new Date(now).getTime()) continue;
    const localDate = losAngelesDateString(new Date(sale.signedAt));
    if (localDate >= currentMonday) continue;
    const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
    const monday = shiftSalesDate(localDate, -((weekday + 6) % 7));
    earliest = monday < earliest ? monday : earliest;
    byWeek.set(monday, [...(byWeek.get(monday) || []), sale]);
  }
  for (let monday = latestWeekStart; monday >= earliest; monday = shiftSalesDate(monday, -7)) {
    const week = closedSalesWeek(monday, includeCurrentWeek && monday === latestWeekStart ? losAngelesDateString(new Date(now)) : undefined);
    week.sales = (byWeek.get(monday) || []).sort((a, b) => b.signedAt.localeCompare(a.signedAt) || a.id.localeCompare(b.id));
    week.totalCents = week.sales.reduce((total, sale) => total + sale.amountCents, 0);
    report.weeks.push(week);
  }
  return report;
}
