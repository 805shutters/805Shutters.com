import { deriveJobProgress, type JobProgress, type InstallerOutcomeEvidence, type ProgressSourceHealth } from "./job-progress";
import type { CrmBookkeepingRow, CrmCustomerContract, CrmCustomerFile, CrmInstallationInvoiceEmail, CrmJob, CrmOrderCogsEmail, CrmQuote } from "@/lib/crm/types";
import { getMeasureNeededMeta, objectMeta } from "@/lib/crm/measure-needed-state";

export const JOB_TRACKING_STAGES = [
  { id: "attention", label: "Needs Attention", color: "#ad4f2f" },
  { id: "scheduled", label: "Scheduled", color: "#236c77" },
  { id: "need_follow_up", label: "Follow Up", color: "#85631c" },
  { id: "sold_need_deposit", label: "Sold / Deposit Needed", color: "#ad4f2f" },
  { id: "need_measure", label: "Measure Needed", color: "#7353a0" },
  { id: "need_to_order", label: "Need to Order", color: "#317b48" },
  { id: "ordered", label: "Ordered", color: "#28689b" },
  { id: "shipped", label: "Receipt Recorded", color: "#007f77" },
  { id: "balance_needed", label: "Balance Needed", color: "#9a3d57" },
  { id: "complete", label: "Complete", color: "#485448" },
  { id: "lost", label: "Lost", color: "#756b67" },
  { id: "archived", label: "Archived", color: "#767b80" },
] as const;

export type JobTrackingStageId = (typeof JOB_TRACKING_STAGES)[number]["id"];
export type JobTrackingFilter = JobTrackingStageId | "all" | "active" | "archive";
export type JobTrackingSavePatch = { job?: Record<string, unknown>; row?: Record<string, unknown>; quote?: Record<string, unknown>; message?: string };
export type JobTrackingViewItem = {
  id: string; job?: CrmJob; quote?: CrmQuote; row?: CrmBookkeepingRow; file?: CrmCustomerFile;
  progress: JobProgress; stageId: JobTrackingStageId; customerName: string; soldDate: string | null; isSale: boolean;
  phone: string | null; email: string | null; address: string | null; project: string;
  total: number | null; depositRequired: number | null; depositReceived: number | null;
  depositOutstanding: number | null; squareBalanceOutstanding: number | null; balanceReceived: number | null; balanceOutstanding: number | null; cogs: number | null;
  signedAt: string | null; signatureRecorded: boolean; contractUrl: string | null; contracts: CrmCustomerContract[];
  orderEmails: CrmOrderCogsEmail[]; installEmails: CrmInstallationInvoiceEmail[]; pendingQuotes: CrmQuote[];
  vendor: string | null; orderReference: string | null; orderedAt: string | null; installedAt: string | null;
  measureStatus: string; notes: string; nextAction: string; manualStage: boolean;
};

export type JobTrackingViewInput = { ownedActions?: import("./owned-actions").OwnedAction[]; jobs: CrmJob[]; quotes: CrmQuote[]; rows: CrmBookkeepingRow[]; files: CrmCustomerFile[]; installerOutcomes?: InstallerOutcomeEvidence[]; sourceHealth?: ProgressSourceHealth[]; orderCogsEmails?: CrmOrderCogsEmail[]; installationInvoiceEmails?: CrmInstallationInvoiceEmail[] };
const SOLD_STATUSES = new Set(["sold", "approved", "ordered", "received", "installed", "invoiced", "paid", "closed", "manual", "legacy"]);
const TERMINAL = new Set(["complete", "lost", "archived"]);
const finiteMoney = (value: unknown): number | null => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const validDate = (value: unknown): string | null => typeof value === "string" && value && Number.isFinite(Date.parse(value)) ? value : null;
const unique = <T extends { id: string }>(items: T[]): T[] => [...new Map(items.map((item) => [item.id, item])).values()];
const isDeleted = (meta: unknown) => Boolean(objectMeta(meta).deleted_at || objectMeta(meta).bookkeeping_deleted_at);
export const quoteIsTrackingSale = (quote: CrmQuote) => SOLD_STATUSES.has(quote.live_status || quote.status) || Boolean(quote.sold_at || quote.signed_at || quote.customer_signature);

/** Never turn a javascript/data URL from a source record into an actionable link. */
export function trackingSafeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

function manualStage(meta: unknown): JobTrackingStageId | undefined {
  const stage = objectMeta(objectMeta(meta).job_tracking).stage;
  return JOB_TRACKING_STAGES.find((item) => item.id === stage)?.id;
}

/** Exact, most-specific source identity wins. A job match cannot override a contradictory quote match. */
function matchesEvidence(source: { matched_bookkeeping_entry_id: string | null; matched_quote_id: string | null; matched_job_id: string | null }, row?: CrmBookkeepingRow, quote?: CrmQuote, job?: CrmJob, unambiguousJob = false) {
  if (row?.source === "crm_quote" || (!row && quote)) {
    // Quote-backed row.id is the quote ID, not the optional metadata ledger entry ID.
    if (source.matched_quote_id) return source.matched_quote_id === (quote?.id || row?.quoteId);
    if (source.matched_bookkeeping_entry_id) return false;
  }
  if (source.matched_bookkeeping_entry_id) return source.matched_bookkeeping_entry_id === row?.id;
  if (source.matched_quote_id) return source.matched_quote_id === (quote?.id || row?.quoteId);
  return unambiguousJob && Boolean(source.matched_job_id && source.matched_job_id === (job?.id || row?.jobId));
}

export function buildJobTrackingView(input: JobTrackingViewInput): JobTrackingViewItem[] {
  const jobs = unique([...input.files.flatMap((file) => file.jobs), ...input.jobs]).filter((job) => !isDeleted(job.meta));
  const quotes = unique([...input.files.flatMap((file) => file.quotes), ...input.quotes]).filter((quote) => !isDeleted(quote.meta));
  const rows = unique([...input.files.flatMap((file) => file.bookkeepingRows), ...input.rows]).filter((row) => !isDeleted((row as CrmBookkeepingRow & { meta?: unknown }).meta));
  const jobMap = new Map(jobs.map((job) => [job.id, job]));
  const quoteMap = new Map(quotes.map((quote) => [quote.id, quote]));
  const representedQuotes = new Set<string>();
  const representedJobs = new Set<string>();
  const sources: { row?: CrmBookkeepingRow; quote?: CrmQuote; job?: CrmJob }[] = [];
  // The financial ledger already unifies payment/expense history. Link quote and job into that row.
  const orderedRows = [...rows].sort((a, b) => Number(a.source === "crm_quote") - Number(b.source === "crm_quote"));
  for (const row of orderedRows) {
    if (row.quoteId && representedQuotes.has(row.quoteId)) continue;
    // A sole ledger entry and sole sold quote on the same explicit job are one sale.
    // Ambiguous multi-order jobs require their specific quote IDs; never guess by name.
    const jobQuotes = row.jobId && !row.quoteId ? quotes.filter((candidate) => candidate.job_id === row.jobId && quoteIsTrackingSale(candidate)) : [];
    const quote = row.quoteId ? quoteMap.get(row.quoteId) : jobQuotes.length === 1 && rows.filter((candidate) => candidate.jobId === row.jobId).length === 1 ? jobQuotes[0] : undefined;
    const jobId = row.jobId || quote?.job_id;
    if (row.quoteId || quote?.id) representedQuotes.add(row.quoteId || quote!.id);
    if (jobId) representedJobs.add(jobId);
    sources.push({ row, quote, job: jobId ? jobMap.get(jobId) : undefined });
  }
  for (const quote of quotes) {
    if (representedQuotes.has(quote.id) || !quoteIsTrackingSale(quote)) continue;
    representedQuotes.add(quote.id);
    if (quote.job_id) representedJobs.add(quote.job_id);
    sources.push({ quote, job: jobMap.get(quote.job_id) });
  }
  for (const job of jobs) {
    if (representedJobs.has(job.id)) continue;
    const latest = quotes.filter((quote) => quote.job_id === job.id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    sources.push({ job, quote: latest });
    representedJobs.add(job.id);
    if (latest) representedQuotes.add(latest.id);
  }
  // Orphaned unsold quotes are one opportunity per explicit job/group, never per name.
  const orphanGroups = new Set<string>();
  for (const quote of quotes) {
    const key = quote.job_id || quote.quote_group_id || quote.id;
    if (representedQuotes.has(quote.id) || representedJobs.has(quote.job_id) || orphanGroups.has(key)) continue;
    orphanGroups.add(key);
    sources.push({ quote });
  }
  const jobCounts = new Map<string, number>();
  for (const source of sources) { const id = source.job?.id || source.row?.jobId || source.quote?.job_id; if (id) jobCounts.set(id, (jobCounts.get(id) || 0) + 1); }
  return sources.map(({ row, quote, job }): JobTrackingViewItem => {
    const jobId = job?.id || row?.jobId || quote?.job_id;
    const unambiguousJob = Boolean(jobId && jobCounts.get(jobId) === 1);
    const file = input.files.find((candidate) => row ? candidate.bookkeepingRows.some((item) => item.id === row.id) : quote ? candidate.quotes.some((item) => item.id === quote.id) : candidate.jobs.some((item) => item.id === job?.id));
    const rowExtra = row as (CrmBookkeepingRow & { meta?: unknown; sourceSoldDate?: string | null }) | undefined;
    const quoteExtra = quote as (CrmQuote & { source_sold_at?: string | null; source_signed_at?: string | null }) | undefined;
    const contractMarker = { ...objectMeta(objectMeta(rowExtra?.meta).job_tracking_contract), ...objectMeta(objectMeta(quote?.meta).job_tracking_contract) };
    const recordedDates = objectMeta(objectMeta(rowExtra?.meta).job_tracking_dates);
    const override = manualStage(quote?.meta) || manualStage(rowExtra?.meta) || (unambiguousJob ? manualStage(job?.meta) : undefined);
    const contracts = (file?.contracts || []).filter((contract) => {
      if (contract.bookkeeping_entry_id) return contract.bookkeeping_entry_id === row?.id;
      if (contract.quote_id) return contract.quote_id === (quote?.id || row?.quoteId);
      return unambiguousJob && Boolean(contract.job_id && contract.job_id === jobId);
    });
    const quoteSignedAt = quoteExtra && Object.hasOwn(quoteExtra, "source_signed_at") ? quoteExtra.source_signed_at : quote?.signed_at;
    const quoteSoldAt = quoteExtra && Object.hasOwn(quoteExtra, "source_sold_at") ? quoteExtra.source_sold_at : quote?.sold_at;
    const signedAt = validDate(contractMarker.signed_at) || (quoteExtra && Object.hasOwn(quoteExtra, "source_signed_at") ? validDate(quoteSignedAt) : validDate(quoteSignedAt) || validDate(contracts.find((contract) => contract.signed_at)?.signed_at));
    const explicitRowDate = rowExtra && Object.hasOwn(rowExtra, "sourceSoldDate");
    const soldDate = explicitRowDate ? validDate(rowExtra.sourceSoldDate) : quote ? validDate(quoteSoldAt) || validDate(quoteSignedAt) || validDate(quote.approved_at) : row ? (row.source === "crm_quote" ? null : validDate(row.soldDate)) : validDate(objectMeta(job?.meta).sold_at);
    const isSale = Boolean(row || (quote && quoteIsTrackingSale(quote)) || (!quote && job && SOLD_STATUSES.has(job.status)));
    const total = finiteMoney(row?.total ?? quote?.quote_total ?? job?.estimated_total);
    const depositRequired = finiteMoney(row?.depositDue ?? quote?.deposit_required);
    const depositReceived = finiteMoney(row?.depositPaid ?? (unambiguousJob ? job?.deposit_paid : null));
    const balanceOutstanding = finiteMoney(row?.balance ?? quote?.balance_due);
    const depositOutstanding = depositRequired === null || depositReceived === null || (!quote && depositRequired === 0 && depositReceived === 0 && (balanceOutstanding ?? 0) > 0) ? null : Math.max(0, Math.min(depositRequired - depositReceived, balanceOutstanding ?? Infinity));
    const orderEmails = (input.orderCogsEmails || []).filter((mail) => (mail.match_status === "matched" || mail.applied_at) && matchesEvidence(mail, row, quote, job, unambiguousJob));
    const installEmails = (input.installationInvoiceEmails || []).filter((mail) => (mail.match_status === "matched" || mail.applied_at) && matchesEvidence(mail, row, quote, job, unambiguousJob));
    const measure = getMeasureNeededMeta(job?.meta);
    const base: Omit<JobTrackingViewItem, "stageId" | "progress"> = {
      id: row ? `row:${row.id}` : quote && quoteIsTrackingSale(quote) ? `quote:${quote.id}` : job ? `job:${job.id}` : `quote:${quote!.id}`,
      row, quote, job, file, customerName: row?.customerName || quote?.customer_name || job?.customer_name || "Customer not recorded", soldDate, isSale,
      phone: quote?.customer_phone || row?.customerPhone || job?.phone || null,
      email: row?.customerEmail || quote?.customer_email || job?.email || null, address: quote?.customer_address || job?.address || null,
      project: row?.quoteNumber || quote?.quote_number || job?.product_interest || (quote ? `Quote ${quote.id.slice(0, 8)}` : "Job"),
      total, depositRequired, depositReceived,
      depositOutstanding,
      squareBalanceOutstanding: balanceOutstanding === null || depositOutstanding === null ? null : Math.max(0, balanceOutstanding - depositOutstanding),
      balanceReceived: finiteMoney(row?.balancePaid), balanceOutstanding, cogs: finiteMoney(row?.cogs ?? quote?.materials_cost),
      signedAt, signatureRecorded: Boolean(signedAt || quote?.customer_signature),
      contractUrl: trackingSafeUrl(typeof contractMarker.url === "string" ? contractMarker.url : null) || trackingSafeUrl(quote?.share_token ? `/quote/${encodeURIComponent(quote.share_token)}` : contracts.find((contract) => contract.contract_url && objectMeta(contract.meta).source !== "bookkeeping_row")?.contract_url), contracts,
      orderEmails, installEmails,
      pendingQuotes: quotes.filter((candidate) => candidate.id !== quote?.id && !quoteIsTrackingSale(candidate) && (jobId ? candidate.job_id === jobId : Boolean(quote?.quote_group_id && candidate.quote_group_id === quote.quote_group_id))),
      vendor: row?.manufacturerName || quote?.manufacturer_name || null,
      orderReference: row?.manufacturerOrderRef || quote?.manufacturer_order_ref || null,
      orderedAt: validDate(recordedDates.ordered_at) || validDate(quote?.ordered_at), installedAt: validDate(recordedDates.installed_at) || validDate(quote?.installed_at),
      measureStatus: measure.status === "measured" ? "Measured" : measure.status === "not_needed" ? "Not needed" : measure.status === "needed" ? "Needed" : "Not recorded",
      notes: [...new Set([row?.notes, quote?.notes, job?.notes].filter(Boolean))].join("\n"), nextAction: job?.next_action || "", manualStage: Boolean(override),
    };
    const progress = deriveJobProgress({ ...base, recordedStage: override, unambiguousJob, ownedActions: input.ownedActions, installerOutcomes: input.installerOutcomes, sourceHealth: input.sourceHealth });
    return { ...base, progress, nextAction: progress.nextAction, stageId: progress.stage };
  }).sort((a, b) => (b.soldDate ? Date.parse(b.soldDate) : -Infinity) - (a.soldDate ? Date.parse(a.soldDate) : -Infinity) || a.id.localeCompare(b.id));
}

export function filterJobTrackingView(items: JobTrackingViewItem[], filter: JobTrackingFilter, search = "") {
  const needle = search.trim().toLocaleLowerCase();
  return items.filter((item) => (filter === "all" || (filter === "active" ? !TERMINAL.has(item.stageId) : filter === "archive" ? TERMINAL.has(item.stageId) : item.stageId === filter)) && (!needle || [item.customerName, item.phone, item.email, item.address, item.project, item.vendor, item.orderReference, item.job?.id, item.quote?.id, item.row?.id].some((value) => value?.toLocaleLowerCase().includes(needle))));
}
