import type { SalesQuote } from "@mts/types/quote";
import { isQuotePriceLocked } from "./quotePriceLock";
import { storedCustomerCharges } from "@/lib/quote/customer-charges";

type PricedDesign = {
  unit_price?: number | null;
  quote_v2_price_status?: string | null;
  options_json?: Record<string, unknown> | null;
};

/** A saved partial subtotal is not a customer-ready amount. Locked quotes retain their history. */
export function isSavedQuotePricingIncomplete(quote: Partial<SalesQuote> | null | undefined): boolean {
  return quote?.status === "draft" && !quote.signed_at && !quote.customer_signature &&
    !isQuotePriceLocked({ status: quote.status, sent_at: quote.sent_at ?? null }) &&
    (quote.persisted_line_pricing_incomplete === true ||
      (quote.quote_v2_backend === true && quote.quote_v2_status !== "priced"));
}

/** Staff explanation for persisted failures, including rows saved without an error string. */
export function authoritativeDesignPriceIssue(design: PricedDesign | null | undefined): string | null {
  const options = design?.options_json;
  const status = options?.authoritative_price_status ?? design?.quote_v2_price_status;
  if (status === "authoritative" && design?.unit_price != null &&
      Number.isFinite(Number(design.unit_price)) && Number(design.unit_price) >= 0) return null;
  const explanation = options?.authoritative_price_error;
  if (typeof explanation === "string" && explanation.trim()) return explanation.trim();
  if (status === "stale") return "This selection changed and needs authoritative repricing.";
  if (status === "blocked") return "Pricing is blocked for this saved selection. Review its configuration and manufacturer pricing requirements before sending.";
  if (status === "unpriceable") return "No verified price is available for this saved selection. Review its product, options and dimensions.";
  return "This line does not have a verified price yet. Complete its selections and reprice before sending.";
}

/** New manual entries exclude fixed charges; old manual records retain their original basis. */
export function manualMerchandisePriceForDisplay(design: PricedDesign | null | undefined, displayedUnitPrice: number): number {
  const options = design?.options_json;
  const merchandise = options?.manual_merchandise_unit_price;
  return options?.manual_customer_charge_policy === "blind-shade-install-ship-v1" &&
    typeof merchandise === "number" && Number.isFinite(merchandise) && merchandise >= 0
    ? merchandise : displayedUnitPrice;
}

/** The editor sends merchandise; an unchanged save must not add fixed fees twice. */
export function quoteMerchandisePriceForEditor(design: PricedDesign): number {
  const unitPrice = Number(design.unit_price) || 0;
  const merchandise = Math.max(0, unitPrice - (storedCustomerCharges(design.options_json)?.perWindowTotal ?? 0));
  return manualMerchandisePriceForDisplay(design, merchandise);
}
