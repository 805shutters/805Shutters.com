import type { SalesQuote } from "@mts-v1/types/quote";

type QuotePriceLockInput = Pick<SalesQuote, "status" | "sent_at"> | null | undefined;

export function isQuotePriceLocked(quote: QuotePriceLockInput): boolean {
  if (!quote) return false;
  return Boolean(quote.sent_at) || quote.status !== "draft";
}
