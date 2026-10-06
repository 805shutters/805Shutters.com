import type { CrmQuote } from "./types";

/** A saved group is the association; names and phone numbers never grant access. */
export function customerQuoteOptionRows(current: CrmQuote, rows: CrmQuote[]): CrmQuote[] {
  if (!current.quote_group_id || !/^[A-Z]+$/.test(current.quote_label || "")) return [];
  const eligible = rows.filter(row => row.quote_group_id === current.quote_group_id &&
    row.share_token && /^[A-Z]+$/.test(row.quote_label || "") &&
    (row.id === current.id || (row.status !== "draft" && row.status !== "archived" && row.status !== "lost" && Boolean(row.sent_at || row.signed_at))) &&
    !row.meta?.deleted_at &&
    !(typeof row.meta?.partial_acceptance === "object" && row.meta.partial_acceptance !== null &&
      (row.meta.partial_acceptance as Record<string, unknown>).role === "future"));
  eligible.sort((a, b) => {
    if (a.id === current.id) return -1;
    if (b.id === current.id) return 1;
    return Number(Boolean(b.meta?.native_delivery_id)) - Number(Boolean(a.meta?.native_delivery_id)) ||
      Date.parse(b.updated_at) - Date.parse(a.updated_at);
  });
  const labels = new Set<string>();
  return eligible.filter(row => {
    if (labels.has(row.quote_label!)) return false;
    labels.add(row.quote_label!);
    return true;
  }).sort((a, b) => a.quote_label!.length - b.quote_label!.length || a.quote_label!.localeCompare(b.quote_label!));
}
