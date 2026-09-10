import type { SalesQuote } from "@mts/types/quote";
import { isQuotePriceLocked } from "./quotePriceLock";

type PricedDesign = {
  unit_price?: number | null;
  options_json?: Record<string, unknown> | null;
};

/** A saved partial subtotal is not a customer-ready amount. Locked quotes retain their history. */
export function isSavedQuotePricingIncomplete(quote: Partial<SalesQuote> | null | undefined): boolean {
  return quote?.quote_v2_backend === true && quote.status === "draft" &&
    !isQuotePriceLocked({ status: quote.status, sent_at: quote.sent_at ?? null }) &&
    quote.quote_v2_status !== "priced";
}

/** Staff explanation for persisted failures, including rows saved without an error string. */
export function authoritativeDesignPriceIssue(design: PricedDesign | null | undefined): string | null {
  const options = design?.options_json;
  const status = options?.authoritative_price_status;
  if (status === "authoritative" && design?.unit_price != null &&
      Number.isFinite(Number(design.unit_price)) && Number(design.unit_price) >= 0) return null;
  const explanation = options?.authoritative_price_error;
  if (typeof explanation === "string" && explanation.trim()) return explanation.trim();
  if (status === "stale") return "This selection changed and needs authoritative repricing.";
  if (status === "blocked") return "Pricing is blocked for this saved selection. Review its configuration and manufacturer pricing requirements before sending.";
  if (status === "unpriceable") return "No verified price is available for this saved selection. Review its product, options and dimensions.";
  return "This line does not have a verified price yet. Complete its selections and reprice before sending.";
}
