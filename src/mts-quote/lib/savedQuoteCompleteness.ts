import { collectCrmPages } from "@/lib/crm/pagination";
import { incompleteQuoteLineIds, shouldCheckQuoteCompleteness } from "@/lib/quote/quote-completeness";
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";
import type { SalesQuote } from "@mts/types/quote";

export type SavedPricingLine = {
  id: string;
  quote_id: string;
  selected_design_id?: string | null;
  sales_quote_designs: {
    id: string;
    line_item_id: string;
    variant?: string | null;
    unit_price?: number | null;
    options_json?: Record<string, unknown> | null;
  }[];
};

type Quote = Pick<SalesQuote, "id" | "status" | "total_amount"> & Partial<SalesQuote>;
type ReadLines = (quoteIds: string[], from: number, to: number) => PromiseLike<{
  data: SavedPricingLine[] | null;
  error: { message: string } | null;
}>;

/** Hydrate display evidence from saved draft lines; never rewrite stored totals or history. */
export async function loadSavedQuoteCompleteness<T extends Quote>(quotes: T[], read: ReadLines): Promise<T[]> {
  const drafts = quotes.filter(q => q.status === "draft" && !q.sent_at && !q.signed_at && !q.customer_signature);
  const byQuote = new Map<string, SavedPricingLine[]>();
  for (let offset = 0; offset < drafts.length; offset += 100) {
    const ids = drafts.slice(offset, offset + 100).map(q => q.id);
    const result = await collectCrmPages<SavedPricingLine>((from, to) => read(ids, from, to));
    if (result.error) throw new Error(`Quote pricing status could not be loaded: ${result.error.message}`);
    for (const line of result.data ?? []) {
      const lines = byQuote.get(line.quote_id) ?? [];
      lines.push(line);
      byQuote.set(line.quote_id, lines);
    }
  }
  const draftIds = new Set(drafts.map(q => q.id));
  return quotes.map(quote => {
    if (!draftIds.has(quote.id)) return quote;
    const lines = byQuote.get(quote.id) ?? [];
    const designs = lines.flatMap(line => line.sales_quote_designs.map(design => ({
      ...design,
      [QUOTE_V2_SELECTED_DESIGN_MARKER]: line.selected_design_id === design.id,
    })));
    const brokenSelection = lines.some(line => line.selected_design_id &&
      !line.sales_quote_designs.some(design => design.id === line.selected_design_id));
    const check = shouldCheckQuoteCompleteness(quote, designs, quote.quote_v2_backend === true);
    return { ...quote, persisted_line_pricing_incomplete: brokenSelection ||
      (check && incompleteQuoteLineIds(lines, designs, quote.quote_v2_backend === true).length > 0) };
  });
}
