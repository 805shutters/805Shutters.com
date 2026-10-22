export type QuoteType = "residential" | "commercial";

/** Old quotes and every new quote without an explicit choice stay residential.
 * Reuse the quote's existing metadata envelope; no schema migration is needed.
 */
export function getQuoteType(quote: { installer_notes?: unknown } | null | undefined): QuoteType {
  if (typeof quote?.installer_notes !== "string") return "residential";
  try {
    const meta = JSON.parse(quote.installer_notes);
    return meta?.__quoteType === "commercial" ? "commercial" : "residential";
  } catch {
    return "residential";
  }
}

/** Keep the existing residential insert unchanged. Commercial is opt-in only. */
export function newQuoteTypeFields(quoteType: QuoteType) {
  return quoteType === "commercial"
    ? { installer_notes: JSON.stringify({ __quoteType: "commercial" }) }
    : {};
}
