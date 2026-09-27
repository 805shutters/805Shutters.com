import { CrmAuthError } from "./auth";

export type QuoteDeliverySelection = { selectedQuoteIds?: string[]; multipleQuotesApproved?: boolean };
/** Missing selection always means the quote that opened Send. Never infer a group. */
export function selectedDeliveryQuoteIds(activeId: string, options: QuoteDeliverySelection): string[] {
  const ids = options.selectedQuoteIds ?? [activeId];
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length || !ids.includes(activeId)) {
    throw new CrmAuthError(400, "Select the current quote and any additional quotes to send.");
  }
  if (ids.length > 1 && options.multipleQuotesApproved !== true) throw new CrmAuthError(400, "Approve sending multiple quotes before sending.");
  return [...ids].sort();
}
export function selectDeliveryQuotes<T extends { id?: unknown; quote_group_id?: unknown; account_id?: unknown; archived_at?: unknown; status?: unknown }>(active: T, candidates: T[], ids: string[]): T[] {
  return ids.map(id => {
    const quote = id === active.id ? active : candidates.find(candidate => candidate.id === id);
    if (!quote || (id !== active.id && (!active.quote_group_id || quote.quote_group_id !== active.quote_group_id || quote.account_id !== active.account_id)) || quote.archived_at || ["archived", "lost"].includes(String(quote.status))) {
      throw new CrmAuthError(409, "A selected quote is unavailable or belongs to another project. Reload the quotes.");
    }
    return quote;
  });
}
