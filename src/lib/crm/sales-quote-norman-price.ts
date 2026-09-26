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
    throw new CrmAuthError(400, "Catalog pricing accepts an empty object; prices and selections are read from the saved quote.");
  }
}

function isServerCatalogDesign(design: SalesQuoteDesign): boolean {
  return ["norman", "sundance"].includes(design.supplier?.trim().toLowerCase() ?? "");
}

function isAutomatic(design: SalesQuoteDesign): boolean {
  const options = design.options_json ?? {};
  return options.manual_price_override !== true && !options.sent_price_snapshot &&
    options.custom_mode !== true && options.custom_pricing_mode !== true;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function sameMoney(saved: unknown, calculated: unknown): boolean {
  if (saved === null || saved === undefined || saved === "" || calculated === null || calculated === undefined) return false;
  const left = Number(saved);
  const right = Number(calculated);
  return Number.isFinite(left) && Number.isFinite(right) && Math.round(left * 100) === Math.round(right * 100);
}

function sameCustomerCharges(saved: unknown, calculated: unknown): boolean {
  const left = record(saved);
  const right = record(calculated);
  return Object.keys(left).length === Object.keys(right).length &&
    Object.entries(right).every(([key, value]) => left[key] === value);
}

/** A saved selection can reach send before its debounced automatic price does. */
export function assertCurrentNormanLegacyPricing(
  state: NormanQuotePricingState,
  serverDate = quoteV2ServerCatalogDate(),
): void {
  if (!state.quote || state.quote.quote_v2_backend === true || isQuotePriceLocked(state.quote)) return;
  const selected = state.lines.filter(line => !line.archived_at).flatMap(line => {
    const candidates = state.designs.filter(design => design.line_item_id === line.id);
    const design = line.selected_design_id
      ? candidates.find(candidate => candidate.id === line.selected_design_id)
      : candidates.find(candidate => candidate.variant === "A") ?? candidates[0];
    return design && isServerCatalogDesign(design) && isAutomatic(design) && design.options_json?.norman_grid_pricing === true
      ? [{ line, design }] : [];
  });
  if (!selected.length) return;
  const stale = (room?: string | null): never => {
    throw new CrmAuthError(409, `${room || "Quote line"}: Catalog pricing is missing or stale. Refresh pricing for the current selections before sending.`);
  };
  let prepared: ReturnType<typeof prepareNormanLegacyPricing>;
  try {
    // Keep all selected Norman rows in the calculation: shared accessories and
    // assemblies can change a line's price when another selected line changes.
    prepared = prepareNormanLegacyPricing(state, serverDate);
  } catch (error) {
    if (error instanceof CrmAuthError && error.status === 422) stale(selected[0].line.room_name);
    throw error;
  }
  for (const { line, design } of selected) {
    const current = prepared.find(entry => entry.designId === design.id);
    const options = design.options_json ?? {};
    const expectedSnapshot = record(current?.rpcResult.authoritativeSnapshot);
    const expected = record(expectedSnapshot.retail);
    const snapshot = record(options.authoritative_v2_snapshot);
    const retail = record(snapshot.retail);
    const breakdown = record(options.authoritative_price_breakdown);
    const fingerprint = current?.rpcResult.selectionFingerprint;
    const catalogVersion = current?.rpcResult.catalogVersion;
    if (current?.priceStatus !== "authoritative" || !fingerprint || !catalogVersion ||
      design.quote_v2_price_status !== "authoritative" || options.authoritative_price_status !== "authoritative" ||
      design.quote_v2_selection_fingerprint !== fingerprint || options.priced_selection_fingerprint !== fingerprint ||
      snapshot.selectionFingerprint !== fingerprint ||
      design.quote_v2_priced_catalog_version !== catalogVersion || options.priced_catalog_version !== catalogVersion ||
      snapshot.catalogVersion !== catalogVersion ||
      !sameMoney(design.unit_price, expected.unitPrice) || !sameMoney(options.authoritative_once_total, expected.onceTotal) ||
      ![retail, breakdown].every(saved =>
        ["unitPrice", "onceTotal", "total"].every(key => sameMoney(saved[key], expected[key])) &&
        saved.quantity === expected.quantity &&
        sameCustomerCharges(saved.customerCharges, expected.customerCharges)
      )) stale(line.room_name);
  }
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
    if (!selected || !isServerCatalogDesign(selected)) continue;
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
  if (error) throw new CrmAuthError(502, "The saved catalog pricing state could not be loaded.");
  const state = data as NormanQuotePricingState;
  if (data === null) throw new CrmAuthError(404, "Quote not found.");
  if (!state || !Array.isArray(state.lines) || !Array.isArray(state.designs)) throw new CrmAuthError(502, "The saved catalog pricing state is invalid.");
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
      throw new CrmAuthError(409, "The quote changed while catalog pricing was calculated. Reload the current selections and try again.");
    }
    throw new CrmAuthError(502, "Catalog pricing could not be saved. Your selections have been preserved.");
  }
  const result = saved.data as JsonRecord;
  if (!result || result.quoteId !== input.quoteId || !Number.isFinite(Number(result.total))) throw new CrmAuthError(502, "Catalog pricing returned an invalid saved result.");
  return {
    quoteId: input.quoteId,
    pricedDesignCount: Number(result.pricedDesignCount),
    blockedDesignCount: Number(result.blockedDesignCount),
    total: Number(result.total),
  };
}
