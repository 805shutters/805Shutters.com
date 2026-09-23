import { QUOTE_V2_SELECTED_DESIGN_MARKER } from '@/lib/quote-v2/selected-design';
import { authoritativeDesignPriceIssue } from '@/mts-quote/lib/quotePricingDisplay';

type Design = { line_item_id?: string | null; variant?: string | null; unit_price?: number | null; options_json?: Record<string, unknown> | null; [QUOTE_V2_SELECTED_DESIGN_MARKER]?: boolean };
type Quote = { status?: string; sent_at?: string | null; signed_at?: string | null; total_amount?: number | null };

/** Historical opens stay unchanged; edited drafts opt into complete selected prices. */
export function shouldCheckQuoteCompleteness(quote: Quote | null | undefined, designs: Design[], authoritativeV2 = false): boolean {
  if (!quote || quote.status !== 'draft' || quote.sent_at || quote.signed_at) return false;
  return authoritativeV2 || !Number(quote.total_amount) || designs.some(d =>
    d[QUOTE_V2_SELECTED_DESIGN_MARKER] === true || !!d.options_json?.pricing_block_reason || !!d.options_json?.authoritative_price_error || ['blocked','stale','unpriceable'].includes(String(d.options_json?.authoritative_price_status)));
}

export function incompleteQuoteLineIds(lines: {id:string}[], designs: Design[], authoritativeV2 = false): string[] {
  return lines.filter(line => {
    const rows=designs.filter(d=>d.line_item_id===line.id);
    const d=rows.find(d=>d[QUOTE_V2_SELECTED_DESIGN_MARKER]) ?? rows.find(d=>d.variant==='A') ?? rows[0];
    if (d?.options_json?.manual_price_override === true && d.unit_price != null && Number.isFinite(Number(d.unit_price)) && Number(d.unit_price)>=0) return false;
    if (authoritativeV2 || d?.options_json?.norman_grid_pricing === true) return authoritativeDesignPriceIssue(d)!==null;
    return !d || !!d.options_json?.pricing_block_reason || !!d.options_json?.authoritative_price_error ||
      ['blocked','stale','unpriceable'].includes(String(d.options_json?.authoritative_price_status)) ||
      d.unit_price == null || !Number.isFinite(Number(d.unit_price)) || Number(d.unit_price)<=0;
  }).map(line=>line.id);
}
