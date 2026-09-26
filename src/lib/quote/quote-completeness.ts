import { QUOTE_V2_SELECTED_DESIGN_MARKER } from '@/lib/quote-v2/selected-design';
import { authoritativeDesignPriceIssue } from '@/mts-quote/lib/quotePricingDisplay';

type Design = { line_item_id?: string | null; variant?: string | null; unit_price?: number | null; options_json?: Record<string, unknown> | null; [QUOTE_V2_SELECTED_DESIGN_MARKER]?: boolean };
type Quote = { status?: string; sent_at?: string | null; signed_at?: string | null; total_amount?: number | null };

/** Every editable draft needs complete pricing; sent and signed terms stay frozen. */
export function shouldCheckQuoteCompleteness(quote: Quote | null | undefined, _designs: Design[], _authoritativeV2 = false): boolean {
  return !!quote && quote.status === 'draft' && !quote.sent_at && !quote.signed_at;
}

/** Legacy rows without a selected design bill every saved option. */
export function billableQuoteDesigns<T extends Design>(rows: T[], authoritativeV2 = false): T[] {
  const selected = rows.find(design => design[QUOTE_V2_SELECTED_DESIGN_MARKER]);
  if (selected) return [selected];
  if (authoritativeV2) {
    const preferred = rows.find(design => design.variant === 'A') ?? rows[0];
    return preferred ? [preferred] : [];
  }
  return rows;
}

export function incompleteQuoteLineIds(lines: {id:string}[], designs: Design[], authoritativeV2 = false): string[] {
  return lines.filter(line => {
    const rows = billableQuoteDesigns(designs.filter(design => design.line_item_id === line.id), authoritativeV2);
    return !rows.length || rows.some(d => {
      if (d.options_json?.manual_price_override === true && d.unit_price != null && Number.isFinite(Number(d.unit_price)) && Number(d.unit_price) >= 0) return false;
      if (authoritativeV2 || d.options_json?.norman_grid_pricing === true) return authoritativeDesignPriceIssue(d) !== null;
      return !!d.options_json?.pricing_block_reason || !!d.options_json?.authoritative_price_error ||
        ['blocked','stale','unpriceable'].includes(String(d.options_json?.authoritative_price_status)) ||
        d.unit_price == null || !Number.isFinite(Number(d.unit_price)) || Number(d.unit_price) <= 0;
    });
  }).map(line => line.id);
}
