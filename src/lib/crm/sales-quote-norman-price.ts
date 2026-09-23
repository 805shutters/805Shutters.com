import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesQuote, SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { CrmAuthError } from "@/lib/crm/auth";
import { isQuotePriceLocked } from "@mts/lib/quotePriceLock";
import {
  prepareSalesQuoteV2PricingBatch,
  quoteV2ServerCatalogDate,
} from "./sales-quote-v2-price-save";

type JsonRecord = Record<string, unknown>;
export type NormanQuotePricingState = {
  quote: SalesQuote | null;
  lines: SalesQuoteLineItem[];
  designs: SalesQuoteDesign[];
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only identities are accepted over HTTP; all price inputs come from saved rows. */
export function parseNormanPriceRequest(body: unknown): void {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
    throw new CrmAuthError(400, "Norman pricing accepts an empty object; prices and selections are read from the saved quote.");
  }
}

function isNorman(design: SalesQuoteDesign): boolean {
  return design.supplier?.trim().toLowerCase() === "norman";
}

function isAutomatic(design: SalesQuoteDesign): boolean {
  const options = design.options_json ?? {};
  return options.manual_price_override !== true && !options.sent_price_snapshot &&
    options.custom_mode !== true && options.custom_pricing_mode !== true;
}

/** Reuse the same calculator as V2 without promoting or rewriting the quote. */
export function prepareNormanLegacyPricing(state: NormanQuotePricingState, serverDate: string) {
  const quote = state.quote;
  if (!quote) throw new CrmAuthError(404, "Quote not found.");
  if (quote.quote_v2_backend === true) throw new CrmAuthError(409, "This quote already uses the V2 pricing endpoint.");
  if (isQuotePriceLocked(quote)) throw new CrmAuthError(409, "This quote is locked. Price changes belong in an editable revision.");

  const lines: SalesQuoteLineItem[] = [];
  const selectedDesigns: SalesQuoteDesign[] = [];
  const writable = new Set<string>();
  for (const line of state.lines) {
    if (line.archived_at) continue;
    const candidates = state.designs.filter(design => design.line_item_id === line.id);
    // A dangling explicit selection is not permission to price another variant.
    const selected = line.selected_design_id
      ? candidates.find(design => design.id === line.selected_design_id)
      : candidates.find(design => design.variant === "A") ?? candidates[0];
    if (!selected || !isNorman(selected)) continue;
    // Older drafts can have null measurement fields. Zero means unmeasured to
    // the calculator; keep the original saved rows untouched for the CAS save.
    lines.push({
      ...line,
      selected_design_id: selected.id,
      width_whole: line.width_whole ?? 0,
      height_whole: line.height_whole ?? 0,
      width_fraction: line.width_fraction ?? "0",
      height_fraction: line.height_fraction ?? "0",
    });
    selectedDesigns.push({ ...selected, options_json: { ...selected.options_json, quote_v2_backend: true } });
    if (isAutomatic(selected)) writable.add(selected.id);
  }
  if (!writable.size) return [];
  const batch = prepareSalesQuoteV2PricingBatch({ lines, selectedDesigns, serverDate });
  // Manual/locked Norman selections remain context for shared assemblies, but
  // never receive an automatic price or a replacement snapshot.
  return batch.prepared.filter(entry => writable.has(entry.designId));
}

export async function saveNormanLegacyPricing(
  supabase: SupabaseClient,
  input: { quoteId: string; actorId: string; serverDate?: string },
): Promise<{ quoteId: string; pricedDesignCount: number; blockedDesignCount: number; total: number }> {
  if (!UUID.test(input.quoteId) || !UUID.test(input.actorId)) throw new CrmAuthError(400, "Invalid quote or actor identity.");
  const { data, error } = await supabase.rpc("read_norman_quote_pricing_state", { p_quote_id: input.quoteId });
  if (error) throw new CrmAuthError(502, "The saved Norman pricing state could not be loaded.");
  const state = data as NormanQuotePricingState;
  if (data === null) throw new CrmAuthError(404, "Quote not found.");
  if (!state || !Array.isArray(state.lines) || !Array.isArray(state.designs)) throw new CrmAuthError(502, "The saved Norman pricing state is invalid.");
  if (state.quote && state.quote.id !== input.quoteId) throw new CrmAuthError(502, "The saved quote identity does not match.");
  const prepared = prepareNormanLegacyPricing(state, input.serverDate ?? quoteV2ServerCatalogDate());
  if (!prepared.length) return { quoteId: input.quoteId, pricedDesignCount: 0, blockedDesignCount: 0, total: Number(state.quote?.total_amount ?? 0) };
  const saved = await supabase.rpc("save_norman_quote_pricing", {
    p_quote_id: input.quoteId,
    p_expected_state: data,
    p_results: prepared.map(entry => entry.rpcResult),
    p_actor_id: input.actorId,
  });
  if (saved.error) {
    if (saved.error.code === "40001" || /changed|conflict|locked|revision/i.test(saved.error.message)) {
      throw new CrmAuthError(409, "The quote changed while Norman pricing was calculated. Reload the current selections and try again.");
    }
    throw new CrmAuthError(502, "Norman pricing could not be saved. Your selections have been preserved.");
  }
  const result = saved.data as JsonRecord;
  if (!result || result.quoteId !== input.quoteId || !Number.isFinite(Number(result.total))) throw new CrmAuthError(502, "Norman pricing returned an invalid saved result.");
  return {
    quoteId: input.quoteId,
    pricedDesignCount: Number(result.pricedDesignCount),
    blockedDesignCount: Number(result.blockedDesignCount),
    total: Number(result.total),
  };
}
