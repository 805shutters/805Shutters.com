// Quote lifecycle (status machine). Ported from the MTS quote builder
// (src/lib/quoteStatus.ts) and adapted to the 805 CrmQuoteStatus set.
//
// The quote is the source of truth: advancing a quote's status sets the matching
// timestamp column and drives the parent job's status (see getJobStatusForQuote).

import { crmJobStatuses, type CrmJobStatus, type CrmQuoteStatus } from "@/lib/crm/types";

/** Linear sales pipeline order (side states `approved`/`lost` excluded). */
export const STATUS_ORDER: CrmQuoteStatus[] = [
  "draft",
  "sent",
  "sold",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid",
  "archived",
];

export const STATUS_LABELS: Record<CrmQuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  sold: "Sold",
  ordered: "Ordered",
  received: "Received",
  installed: "Installed",
  invoiced: "Invoiced",
  paid: "Paid",
  archived: "Archived",
  lost: "Lost",
};

export const STATUS_DESCRIPTIONS: Record<CrmQuoteStatus, string> = {
  draft: "Being built — not yet sent to the customer",
  sent: "Sent to the customer — awaiting their decision",
  approved: "Customer approved — preparing the order",
  sold: "Customer signed — ready to order from the manufacturer",
  ordered: "Order placed with the manufacturer — awaiting product",
  received: "Product arrived — ready to schedule install",
  installed: "Install complete",
  invoiced: "Invoiced",
  paid: "Paid in full",
  archived: "Hidden from the main pipeline",
  lost: "Customer declined",
};

/** Tailwind classes for the status pill. */
export const STATUS_COLORS: Record<CrmQuoteStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  approved: "bg-teal-100 text-teal-700 border-teal-200",
  sold: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ordered: "bg-amber-100 text-amber-800 border-amber-200",
  received: "bg-cyan-100 text-cyan-800 border-cyan-200",
  installed: "bg-purple-100 text-purple-700 border-purple-200",
  invoiced: "bg-indigo-100 text-indigo-700 border-indigo-200",
  paid: "bg-green-100 text-green-800 border-green-200",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
  lost: "bg-rose-100 text-rose-700 border-rose-200",
};

/** Next status in the linear lifecycle (null if terminal / off-pipeline). */
export const NEXT_STATUS: Record<CrmQuoteStatus, CrmQuoteStatus | null> = {
  draft: "sent",
  sent: "sold",
  approved: "ordered",
  sold: "ordered",
  ordered: "received",
  received: "installed",
  installed: "invoiced",
  invoiced: "paid",
  paid: "archived",
  archived: null,
  lost: null,
};

/** Label for the "advance" button at each state. */
export const ADVANCE_LABELS: Record<CrmQuoteStatus, string> = {
  draft: "Mark as Sent",
  sent: "Mark as Sold",
  approved: "Mark as Ordered",
  sold: "Mark as Ordered",
  ordered: "Mark as Received",
  received: "Mark as Installed",
  installed: "Mark as Invoiced",
  invoiced: "Mark as Paid",
  paid: "Archive",
  archived: "",
  lost: "",
};

/**
 * Which crm_quotes timestamp column to set when entering each state.
 * (invoiced/paid/lost have no dedicated column.) `signed_at` is set by the
 * customer-signing flow when transitioning to `sold`.
 */
export const STATUS_TIMESTAMP_COLUMN: Partial<Record<CrmQuoteStatus, string>> = {
  sent: "sent_at",
  approved: "approved_at",
  sold: "sold_at",
  ordered: "ordered_at",
  received: "received_at",
  installed: "installed_at",
  archived: "archived_at",
};

export function getStatusLabel(status: CrmQuoteStatus): string {
  return STATUS_LABELS[status] ?? status;
}
export function getNextStatus(status: CrmQuoteStatus): CrmQuoteStatus | null {
  return NEXT_STATUS[status] ?? null;
}
export function getAdvanceLabel(status: CrmQuoteStatus): string {
  return ADVANCE_LABELS[status] ?? "";
}
export function statusRank(status: CrmQuoteStatus): number {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? STATUS_ORDER.length : i;
}

// ---- Quote status → Job status (the job is a projection of the quote) ----

/** Canonical mapping from a quote's status to the parent job's status. */
export function jobStatusForQuote(status: CrmQuoteStatus): CrmJobStatus {
  if (status === "ordered" || status === "received") return "ordered";
  if (status === "installed" || status === "invoiced" || status === "paid") return "installed";
  if (status === "sold" || status === "approved") return "sold";
  if (status === "lost") return "lost";
  return "quoted"; // draft, sent, archived
}

const JOB_RANK: Record<string, number> = Object.fromEntries(
  crmJobStatuses.map((s, i) => [s, i]),
);

export function jobStatusRank(status: CrmJobStatus): number {
  return JOB_RANK[status] ?? -1;
}

/**
 * Move a job's status forward to `target` but never downgrade it (a sold job
 * shouldn't drop back to "quoted"). `lost` is terminal and always wins.
 */
export function advanceJobStatus(current: CrmJobStatus, target: CrmJobStatus): CrmJobStatus {
  if (target === "lost") return "lost";
  if (current === "lost" || current === "closed") return current;
  return jobStatusRank(target) > jobStatusRank(current) ? target : current;
}
