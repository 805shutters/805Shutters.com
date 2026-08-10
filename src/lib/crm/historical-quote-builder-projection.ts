import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHistoricalCrmMirrorPricing } from "@/lib/crm/historical-sales-quote-pricing";
import { loadQuoteBuilder } from "@/lib/crm/quote-builder";
import type { CrmQuoteDesign, CrmQuoteLineItem, CrmQuoteWithItems } from "@/lib/crm/types";

type HistoricalBuilderProjection = {
  total: number;
  lineItems: Array<Record<string, unknown>>;
  designsByLineItemId: Map<string, Array<Record<string, unknown>>>;
};

export function applyHistoricalQuoteBuilderProjection(
  quote: CrmQuoteWithItems,
  historical: HistoricalBuilderProjection | null,
): CrmQuoteWithItems {
  if (!historical) return quote;
  return {
    ...quote,
    quote_total: historical.total,
    lineItems: historical.lineItems.map((line) => ({
      ...line,
      designs: historical.designsByLineItemId.get(String(line.id)) ?? [],
    })) as CrmQuoteLineItem[],
  };
}

/** Read-only builder projection. Mutation paths continue to load stored rows. */
export async function loadProjectedQuoteBuilder(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<CrmQuoteWithItems> {
  const quote = await loadQuoteBuilder(supabase, quoteId);
  const historical = await loadHistoricalCrmMirrorPricing(
    supabase,
    quote,
    quote.lineItems,
    new Map(quote.lineItems.map((line) => [line.id, line.designs as CrmQuoteDesign[]])),
  );
  return applyHistoricalQuoteBuilderProjection(quote, historical);
}
