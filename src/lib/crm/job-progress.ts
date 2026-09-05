import type { CrmBookkeepingRow, CrmJob, CrmQuote } from "./types";
import { getMeasureNeededMeta, objectMeta } from "./measure-needed-state";

/** Deliberately excludes bearer tokens, signatures, customer snapshots and COD projections. */
export type InstallerOutcomeEvidence = {
  id: string; job_id: string | null; quote_id: string | null; status: string;
  signed_at: string | null; updated_at?: string; created_at?: string;
  issues: Array<{ lineId: string; notInstalled: boolean; details: string }>;
  meta?: Record<string, unknown>;
};
export type ProgressSourceHealth = { source: string; state: "complete" | "unavailable"; loadedAt: string; message?: string };
export type JobProgress = {
  identity: { jobId: string | null; quoteId: string | null; bookkeepingId: string | null };
  commercial: "accepted" | "open" | "cancelled";
  product: "unprepared" | "ordered" | "received";
  installation: "unverified" | "partial" | "complete";
  service: "open" | "none_known";
  payment: "unknown" | "deposit_needed" | "balance_open" | "settled" | "overpaid";
  stage: "scheduled" | "need_follow_up" | "sold_need_deposit" | "need_measure" | "need_to_order" | "ordered" | "shipped" | "balance_needed" | "complete" | "lost" | "archived" | "attention";
  active: boolean; confidence: "confirmed" | "needs_verification";
  evidence: Array<{ source: string; id: string; occurredAt: string | null }>;
  blockers: string[]; conflicts: string[]; nextAction: string; recordedStage: string | null;
  freshness: ProgressSourceHealth[];
};
type Input = {
  job?: CrmJob; quote?: CrmQuote; row?: CrmBookkeepingRow; isSale: boolean;
  installedAt: string | null; orderedAt: string | null; balanceOutstanding: number | null;
  depositOutstanding: number | null; signedAt: string | null; signatureRecorded: boolean;
  recordedStage?: string; unambiguousJob: boolean;
  installerOutcomes?: InstallerOutcomeEvidence[]; sourceHealth?: ProgressSourceHealth[];
};
const terminal = new Set(["complete", "closed", "lost", "archived"]);

/** Payment and invoice projections never establish physical completion. Latest exact report wins. */
export function deriveJobProgress(input: Input): JobProgress {
  const { job, quote, row } = input;
  const jobId = job?.id || row?.jobId || quote?.job_id || null;
  const quoteId = quote?.id || row?.quoteId || null;
  const jobLifecycle = input.unambiguousJob && !quote && job?.status !== "closed" ? (row?.jobStatus || job?.status) : undefined;
  const status = quote?.status || jobLifecycle || row?.status || job?.status || "new";
  const sourceJobStatus = job?.source_status || row?.jobStatus || job?.status;
  const recordedStage = input.recordedStage || (terminal.has(status) ? status : sourceJobStatus && terminal.has(sourceJobStatus) ? sourceJobStatus : null);
  const evidence: JobProgress["evidence"] = [];
  const blockers: string[] = [], conflicts: string[] = [];
  const reports = (input.installerOutcomes || []).filter((report) => {
    if (report.quote_id) return report.quote_id === quoteId;
    return input.unambiguousJob && Boolean(jobId && report.job_id === jobId);
  }).filter((report) => Boolean(report.signed_at) || ["completed", "partially_installed"].includes(report.status));
  const reportTime = (report: InstallerOutcomeEvidence) => Date.parse(String(objectMeta(report.meta?.workflow).updatedAt || report.updated_at || report.signed_at || report.created_at || "")) || 0;
  reports.sort((a, b) => reportTime(b) - reportTime(a) || a.id.localeCompare(b.id));
  const completedMeta = [quote?.meta, row?.meta, ...(input.unambiguousJob ? [job?.meta] : [])].find((meta) => meta?.completedServiceReportSource === "gmail" && meta.completedServiceReportMessageId && meta.completedServiceReportAppliedAt);
  if (completedMeta) reports.push({ id: String(completedMeta.completedServiceReportMessageId), quote_id: quoteId, job_id: jobId, status: "completed", signed_at: null, updated_at: String(completedMeta.completedServiceReportAppliedAt), issues: [], meta: { workflow: { outcome: "completed", updatedAt: completedMeta.completedServiceReportAppliedAt }, evidence_source: "completed_service_report" } });
  reports.sort((a, b) => reportTime(b) - reportTime(a) || a.id.localeCompare(b.id));
  const latest = reports[0];
  const workflow = objectMeta(latest?.meta?.workflow);
  const outcome = workflow.outcome || latest?.status;
  const partial = Boolean(latest && (["partially_completed", "partially_installed", "incomplete"].includes(String(outcome)) || latest.issues?.some((issue) => issue.notInstalled)));
  const serviceOpen = Boolean(latest?.issues?.some((issue) => issue.notInstalled || issue.details?.trim()));
  // A historical date / explicit installed status is weaker than an exact submitted report.
  // isInstallationComplete may be inferred from an installer invoice and is not sufficient.
  const explicitCompletion = Boolean(input.installedAt || quote?.status === "installed" || (!quote && row?.status === "installed"));
  const complete = !partial && (outcome === "completed" || explicitCompletion);
  const installation = partial ? "partial" : complete ? "complete" : "unverified";
  if (latest) evidence.push({ source: latest.meta?.evidence_source === "completed_service_report" ? "completed_service_report" : "installer_report", id: latest.id, occurredAt: String(workflow.updatedAt || latest.signed_at || latest.updated_at || "") || null });
  if (input.installedAt) evidence.push({ source: "recorded_installation", id: quoteId || row?.id || jobId || "unknown", occurredAt: input.installedAt });
  if (input.signedAt) evidence.push({ source: "signed_contract", id: quoteId || row?.id || jobId || "unknown", occurredAt: input.signedAt });
  const product = quote?.received_at || status === "received" ? "received" : input.orderedAt || status === "ordered" ? "ordered" : "unprepared";
  const payment = input.balanceOutstanding === null ? "unknown" : input.balanceOutstanding < -0.005 ? "overpaid" : input.balanceOutstanding <= 0.005 ? "settled" : input.depositOutstanding === null || input.depositOutstanding > 0.005 ? "deposit_needed" : "balance_open";
  const measure = getMeasureNeededMeta(job?.meta);
  const missingSources = (input.sourceHealth || []).filter((source) => source.state !== "complete");
  for (const source of missingSources) blockers.push(`${source.source} unavailable`);
  if (partial) blockers.push("Installation is partial or incomplete");
  if (serviceOpen) blockers.push("Installer reported an unresolved issue");
  if (input.isSale && !input.signatureRecorded) blockers.push("Signed scope needs verification");
  if (input.isSale && payment === "deposit_needed") blockers.push("Deposit prerequisite outstanding");
  if (input.isSale && payment === "unknown") blockers.push("Payment evidence unavailable");
  if (input.isSale && measure.status === "needed") blockers.push("Required technical measure incomplete");
  if (partial && explicitCompletion) conflicts.push("Recorded completion conflicts with the latest partial report");
  const cleanComplete = complete && !serviceOpen && payment === "settled" && missingSources.length === 0 && measure.status !== "needed";
  if (recordedStage && terminal.has(recordedStage) && input.isSale && !cleanComplete) conflicts.push(`Recorded ${recordedStage}; purchased work, service or settlement still needs verification`);
  let stage: JobProgress["stage"];
  if (partial || serviceOpen || conflicts.length) stage = "attention";
  else if (status === "lost" || status === "archived") stage = status;
  else if (cleanComplete) stage = "complete";
  else if (complete) stage = payment === "balance_open" || payment === "deposit_needed" ? "balance_needed" : "attention";
  else if (product === "received") stage = "shipped";
  else if (product === "ordered") stage = "ordered";
  else if (input.isSale) stage = payment === "deposit_needed" || payment === "unknown" ? "sold_need_deposit" : measure.status === "needed" ? "need_measure" : "need_to_order";
  else stage = job?.status === "scheduled" || job?.appointment_start ? "scheduled" : "need_follow_up";
  if (input.recordedStage && input.recordedStage !== stage && !terminal.has(input.recordedStage)) conflicts.push(`Recorded ${input.recordedStage}; evidence indicates ${stage}`);
  const actions: Record<JobProgress["stage"], string> = {
    attention: partial || serviceOpen ? "Review installer issues and arrange return visit" : "Verify conflicting or incomplete evidence",
    sold_need_deposit: payment === "unknown" || input.depositOutstanding === null ? "Verify payment ledger and deposit terms" : "Collect required deposit",
    need_measure: "Complete required technical measure", need_to_order: input.signatureRecorded ? "Review and prepare vendor order" : "Verify signed purchased scope",
    ordered: "Confirm vendor promise and remaining product", shipped: "Verify complete physical receipt and installation readiness",
    balance_needed: "Review balance and contractual due date", complete: "No open obligations identified", lost: "Review cancellation obligations", archived: "Archived",
    scheduled: "Attend consultation and record outcome", need_follow_up: "Follow up on the opportunity",
  };
  const nextAction = stage === "attention" ? actions.attention
    : input.isSale && !complete && payment === "deposit_needed" ? actions.sold_need_deposit
    : input.isSale && !complete && measure.status === "needed" ? actions.need_measure
    : actions[stage];
  return { identity: { jobId, quoteId, bookkeepingId: row?.source !== "crm_quote" ? row?.id || null : null }, commercial: input.isSale ? "accepted" : ["lost", "archived"].includes(status) ? "cancelled" : "open", product, installation, service: serviceOpen ? "open" : "none_known", payment, stage, active: !terminal.has(stage), confidence: latest && !missingSources.length && !conflicts.length ? "confirmed" : "needs_verification", evidence, blockers, conflicts, nextAction, recordedStage, freshness: input.sourceHealth || [] };
}
