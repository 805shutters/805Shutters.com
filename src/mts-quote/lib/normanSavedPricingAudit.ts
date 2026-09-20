import type { SelectionContext, SelectionRecord } from '@/lib/quote-v2/core';
import { validateSelection } from '@/lib/quote-v2/rules';
import type { SalesQuoteDesign } from '@mts/types/quote';

/** Staff display of the server-saved selection, never a replacement for repricing. */
export function normanSavedPricingAudit(design: SalesQuoteDesign | undefined): string[] {
  const raw = design?.quote_v2_selection;
  if (!raw || String(raw.manufacturerId).toLowerCase() !== 'norman' ||
      !['authoritative', 'blocked', 'unpriceable'].includes(String(design?.options_json?.authoritative_price_status)) ||
      typeof raw.productId !== 'string' || typeof raw.catalogVersion !== 'string' ||
      typeof raw.catalogAsOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.catalogAsOf) ||
      typeof raw.widthInches !== 'number' || typeof raw.heightInches !== 'number' ||
      typeof raw.quantity !== 'number' || !raw.configuration || typeof raw.configuration !== 'object' ||
      Array.isArray(raw.configuration) || !raw.options || typeof raw.options !== 'object' || Array.isArray(raw.options)) return [];
  const selection = raw as unknown as SelectionContext;
  const rows: string[] = [];
  const savedOrder = selection.configuration.norman_order_record_v1;
  if (savedOrder && typeof savedOrder === 'object' && !Array.isArray(savedOrder)) {
    const order = savedOrder as SelectionRecord;
    if (order.adapterWatts === 36 || order.adapterWatts === 65) rows.push(`Saved order adapter: ${order.adapterWatts}W${Array.isArray(order.adapterLineIds) ? ` across ${order.adapterLineIds.length} quote lines` : ''}.`);
    if (typeof order.totalConnections === 'number' && typeof order.capacity === 'number') rows.push(`Shared panel: ${order.totalConnections} of ${order.capacity} motor connections; ${order.chargePanel === true ? 'panel charged on this line' : 'panel charged on another connected line'}.`);
  }
  if (design?.options_json.authoritative_price_status !== 'authoritative') {
    rows.push(...validateSelection(selection).filter(issue => issue.severity === 'hard_block').map(issue => issue.explanation));
  }
  return [...new Set(rows)];
}
