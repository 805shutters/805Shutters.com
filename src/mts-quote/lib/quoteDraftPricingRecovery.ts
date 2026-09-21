import type { SalesQuote, SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { isQuotePriceLocked } from "./quotePriceLock";
import { authoritativeDesignPriceIssue } from "./quotePricingDisplay";

type Draft = Partial<SalesQuote>;
type Line = Pick<SalesQuoteLineItem, "id" | "selected_design_id">;
type Design = Pick<SalesQuoteDesign, "id" | "line_item_id" | "unit_price" | "options_json" | "quote_v2_price_status" | "quote_v2_priced_catalog_version">;
export type DraftPricingRecoveryRequest = { quoteId: string; lineItemId: string; designId: string; expectedRevision: number };

/** Reopening may recover failed automatic prices, never historical or staff-priced snapshots. */
export function draftPricingRecoveryRequest(quote: Draft | undefined, lines: readonly Line[], designs: readonly Design[]): DraftPricingRecoveryRequest | null {
  if (!quote?.id || !quote.quote_v2_backend || quote.status !== "draft" || quote.quote_v2_status === "sent" ||
      quote.sent_at || quote.signed_at || quote.customer_signature || quote.deleted_at || quote.quote_v2_accepted_selection ||
      isQuotePriceLocked({ status: quote.status, sent_at: quote.sent_at ?? null }) ||
      !Number.isSafeInteger(quote.quote_v2_revision) || Number(quote.quote_v2_revision) < 1 || !lines.length) return null;
  const selected: Design[] = [];
  for (const line of lines) {
    const design = designs.find(row => row.id === line.selected_design_id && row.line_item_id === line.id);
    if (!design) return null;
    const options = design.options_json;
    const snapshot = options?.authoritative_v2_snapshot;
    if (options?.manual_price_override === true ||
        design.quote_v2_priced_catalog_version === "custom-override-v1" ||
        options?.priced_catalog_version === "custom-override-v1" ||
        snapshot && typeof snapshot === "object" && (snapshot as Record<string, unknown>).catalogVersion === "custom-override-v1") return null;
    selected.push(design);
  }
  const incomplete = selected.find(design => authoritativeDesignPriceIssue(design) !== null);
  return incomplete ? { quoteId: quote.id, lineItemId: incomplete.line_item_id, designId: incomplete.id, expectedRevision: Number(quote.quote_v2_revision) } : null;
}

const key = (quoteId: string, revision: number) => `${quoteId}:${revision}`;

/** Remember the resulting revision too: a still-blocked result must not start a reprice loop. */
export function createDraftPricingRecovery() {
  const attempted = new Set<string>();
  return {
    async run<T extends { revision: number }>(request: DraftPricingRecoveryRequest, callbacks: {
      isCurrent: () => boolean;
      price: (input: DraftPricingRecoveryRequest & { idempotencyKey: string }) => Promise<T>;
      saved: (response: T) => void;
      refresh: () => Promise<void>;
    }): Promise<void> {
      const attemptKey = key(request.quoteId, request.expectedRevision);
      if (!callbacks.isCurrent() || attempted.has(attemptKey)) return;
      attempted.add(attemptKey);
      try {
        const result = await callbacks.price({ ...request, idempotencyKey: `draft-open:${crypto.randomUUID()}` });
        attempted.add(key(request.quoteId, result.revision));
        // The request may finish after navigating away; do not update that view.
        if (callbacks.isCurrent()) callbacks.saved(result);
      } finally {
        // Invalidate the captured quote's caches even after navigation so a later
        // reopen cannot reuse the pre-request error or amount.
        await callbacks.refresh();
      }
    },
  };
}
