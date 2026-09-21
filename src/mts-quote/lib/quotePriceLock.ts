import type { SalesQuote } from "@mts/types/quote";

type QuotePriceLockInput = Pick<SalesQuote, "status" | "sent_at"> & Partial<Pick<SalesQuote, "signed_at" | "customer_signature" | "quote_v2_status">> | null | undefined;

export function isQuotePriceLocked(quote: QuotePriceLockInput): boolean {
  if (!quote) return false;
  return Boolean(quote.sent_at || quote.signed_at || quote.customer_signature) || quote.quote_v2_status === "sent" || quote.status !== "draft";
}
