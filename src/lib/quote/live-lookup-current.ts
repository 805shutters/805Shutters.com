/**
 * Readers of a stored live price compare it to `price_record_line_spec_hash`.
 * `live_lookup_spec_hash` (md5 of quote id and revision, including revision 3)
 * is not a current hash. Those stored values stay in the table and are ignored.
 */
export function liveLookupStoredSpecIsCurrent(
  storedHash: string | null | undefined,
  lineSpecHash: string | null | undefined,
): boolean {
  if (!storedHash || !lineSpecHash) return false;
  return storedHash === lineSpecHash;
}

/**
 * Norman session and draft ids are stored on the receipt JSON at `portal_draft_id`.
 * That is the path `record_vendor_price_receipt` read before 805-price-record/v1
 * stopped copying it onto the column. The whole receipt is still saved in `receipt`.
 */
export function portalDraftIdFromReceipt(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return null;
  const value = (receipt as { portal_draft_id?: unknown }).portal_draft_id;
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
  return trimmed === "" ? null : trimmed;
}

/** Exact system placeholder. Any other design note is a human note. */
export const UNPRICED_PENDING_NORMAN_LIVE_LOOKUP_NOTE = "Unpriced pending Norman live lookup";

export function designNoteAfterLivePrice(note: string | null | undefined): string | null {
  if (note === UNPRICED_PENDING_NORMAN_LIVE_LOOKUP_NOTE) return null;
  return note ?? null;
}

/**
 * After a live price is saved, every line that has a current price
 * (live site hash match, or a manual price) makes the quote priced.
 * A line that is still open makes the quote blocked.
 */
export function quoteStatusAfterSuccessfulLivePrice(input: {
  backend: boolean;
  lineCount: number;
  linesWithCurrentPrice: number;
}): "priced" | "blocked" | null {
  if (!input.backend) return null;
  if (input.lineCount > 0 && input.linesWithCurrentPrice === input.lineCount) return "priced";
  return "blocked";
}

/**
 * Backfill predicate. A stale draft becomes priced only when every line has a
 * current live site price. A line priced only by hand, a line whose stored hash
 * is the old revision hash, or a line with no price keeps the quote stale.
 * Non-draft and non-stale quotes are left alone.
 */
export function staleQuoteStatusBackfillApplies(input: {
  quoteV2Status: string | null;
  quoteStatus: string | null;
  backend: boolean;
  lineCount: number;
  linesWithCurrentLivePrice: number;
}): boolean {
  return input.backend
    && input.quoteStatus === "draft"
    && input.quoteV2Status === "stale"
    && input.lineCount > 0
    && input.linesWithCurrentLivePrice === input.lineCount;
}
