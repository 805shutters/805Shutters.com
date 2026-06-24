import type { QuoteStatus } from "@mts/types/quote";

/**
 * Canonical lifecycle order for sales quotes.
 *
 * Transitions are mostly event-driven (email send, signature, manufacturer
 * confirmation, COD collected). Manual advance is available as a fallback.
 */
export const STATUS_ORDER: QuoteStatus[] = [
  "draft",
  "sent",
  "sold",
  "ordered",
  "received",
  "installed",
  "archived",
];

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  sold: "Sold",
  ordered: "Ordered",
  received: "Received",
  installed: "Installed",
  archived: "Archived",
};

/**
 * One-line description of what this state means, shown in tooltips and
 * empty-state messages on each status tab.
 */
export const STATUS_DESCRIPTIONS: Record<QuoteStatus, string> = {
  draft: "Being built — not yet sent to customer",
  sent: "Emailed or texted to customer — awaiting decision",
  sold: "Customer signed — ready to order from manufacturer",
  ordered: "Order placed with manufacturer — awaiting product",
  received: "Product arrived — ready to schedule install",
  installed: "Install complete — COD collected",
  archived: "Hidden from main views",
};

/**
 * Tailwind classes for the status pill. Distinct hue per state so the
 * dashboard reads at a glance.
 */
export const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  sold: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ordered: "bg-amber-100 text-amber-800 border-amber-200",
  received: "bg-cyan-100 text-cyan-800 border-cyan-200",
  installed: "bg-purple-100 text-purple-700 border-purple-200",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
};

/**
 * Background tint for status-filtered list views (softer than pill).
 */
export const STATUS_TINT: Record<QuoteStatus, string> = {
  draft: "bg-gray-50",
  sent: "bg-blue-50",
  sold: "bg-emerald-50",
  ordered: "bg-amber-50",
  received: "bg-cyan-50",
  installed: "bg-purple-50",
  archived: "bg-slate-50",
};

/**
 * Next status in the linear lifecycle (null if terminal / archived).
 * Used for the manual "advance" action on each quote row.
 */
export const NEXT_STATUS: Record<QuoteStatus, QuoteStatus | null> = {
  draft: "sent",
  sent: "sold",
  sold: "ordered",
  ordered: "received",
  received: "installed",
  installed: "archived",
  archived: null,
};

/**
 * Label for the advance button at each state.
 */
export const ADVANCE_LABELS: Record<QuoteStatus, string> = {
  draft: "Mark as Sent",
  sent: "Mark as Sold",
  sold: "Mark as Ordered",
  ordered: "Mark as Received",
  received: "Mark as Installed",
  installed: "Archive",
  archived: "",
};

/**
 * Which DB timestamp column to set when entering each state.
 * `signed_at` is already set by the signing flow when transitioning to sold.
 */
export const STATUS_TIMESTAMP_COLUMN: Partial<Record<QuoteStatus, string>> = {
  sent: "sent_at",
  sold: "signed_at",
  ordered: "ordered_at",
  received: "received_at",
  installed: "installed_at",
  archived: "archived_at",
};

export function getStatusLabel(status: QuoteStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function getStatusColor(status: QuoteStatus): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS.draft;
}

export function getNextStatus(status: QuoteStatus): QuoteStatus | null {
  return NEXT_STATUS[status] ?? null;
}

export function getAdvanceLabel(status: QuoteStatus): string {
  return ADVANCE_LABELS[status] ?? "";
}

/**
 * Narrowing guard — safer than `as QuoteStatus` when reading DB strings.
 */
export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === "string" && STATUS_ORDER.includes(value as QuoteStatus);
}
