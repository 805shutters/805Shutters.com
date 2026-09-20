import { queryKeys } from "./queryKeys";
import type { SalesQuote } from "../types/quote";

type QuoteVersion = Pick<SalesQuote, "id" | "quote_group_id" | "quote_v2_revision" | "updated_at">;

/** A child query must change when its parent IDs or persisted pricing revision change. */
export function contractGroupQueryKeys(
  groupId: string | undefined | null,
  siblings: readonly QuoteVersion[],
  active: QuoteVersion | undefined,
) {
  const quotes = new Map(siblings.map(quote => [quote.id, quote]));
  // The detail query is refreshed by Builder saves; the group list may still be cached.
  if (active && groupId && active.quote_group_id === groupId) quotes.set(active.id, active);
  const versions = [...quotes.values()].sort((a, b) => a.id.localeCompare(b.id))
    .map(quote => [quote.id, quote.quote_v2_revision ?? null, quote.updated_at ?? null] as const);
  return {
    quoteIds: versions.map(([id]) => id),
    lines: [...queryKeys.salesQuotes.all, "group-line-items", groupId, versions] as const,
    designs: (lineIds: readonly string[]) => [
      ...queryKeys.salesQuotes.all, "group-designs", groupId, versions, [...lineIds].sort(),
    ] as const,
  };
}

export function contractDesignQueryKey(quoteId: string, lineIds: readonly string[]) {
  return [...queryKeys.salesQuotes.detail(quoteId), "designs", [...lineIds].sort()] as const;
}
