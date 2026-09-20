import { describe, expect, it } from 'vitest';
import type { OperationsItem } from '@/lib/crm/operations-overview';
import { orderCostParent } from './ProductOrderEditor';

const itemWithSource = (source: OperationsItem['source']): OperationsItem => ({ source } as OperationsItem);

describe('orderCostParent', () => {
  it('prefers a cost record over a loaded quote and quote-backed row metadata', () => {
    const costMeta = { product_order_costs: { cost: 'cost-record' } };
    const quoteMeta = { product_order_costs: { quote: 'loaded-quote' } };
    const rowMeta = { product_order_costs: { row: 'quote-row' } };
    const jobMeta = { product_order_costs: { job: 'linked-job' } };
    const item = itemWithSource({
      row: {
        costRecordId: 'cost-1',
        costRecordUpdatedAt: '2026-09-17T16:00:00.000Z',
        costMeta,
        source: 'crm_quote',
        sourceUpdatedAt: '2026-09-17T15:00:00.000Z',
        meta: rowMeta,
      },
      quote: { id: 'quote-1', meta: quoteMeta, updated_at: '2026-09-17T14:00:00.000Z' },
      job: { id: 'job-1', meta: jobMeta, updated_at: '2026-09-17T13:00:00.000Z' },
    } as unknown as OperationsItem['source']);

    expect(orderCostParent(item)).toEqual({
      meta: costMeta,
      updated_at: '2026-09-17T16:00:00.000Z',
    });
  });

  it('prefers a loaded quote over quote-backed row metadata', () => {
    const quote = { id: 'quote-1', meta: { owner: 'quote' }, updated_at: '2026-09-17T14:00:00.000Z' };
    const item = itemWithSource({
      row: {
        source: 'crm_quote',
        sourceUpdatedAt: '2026-09-17T15:00:00.000Z',
        meta: { owner: 'row' },
      },
      quote,
      job: { id: 'job-1', meta: { owner: 'job' }, updated_at: '2026-09-17T13:00:00.000Z' },
    } as unknown as OperationsItem['source']);

    expect(orderCostParent(item)).toBe(quote);
  });

  it('uses quote-backed row metadata when the quote is not loaded instead of linked job metadata', () => {
    const rowMeta = { owner: 'quote-backed-row' };
    const job = { id: 'job-1', meta: { owner: 'linked-job' }, updated_at: '2026-09-17T13:00:00.000Z' };
    const item = itemWithSource({
      row: {
        source: 'crm_quote',
        sourceUpdatedAt: '2026-09-17T15:00:00.000Z',
        meta: rowMeta,
      },
      job,
    } as unknown as OperationsItem['source']);

    expect(orderCostParent(item)).toEqual({
      meta: rowMeta,
      updated_at: '2026-09-17T15:00:00.000Z',
    });
    expect(orderCostParent(item)).not.toBe(job);
  });
});

// These fixtures cover saved manual invoices and legacy job-level costs without
// assigning a mixed sale's full COGS to any one product.
import { displayedOrderAmount } from './ProductOrderEditor';
import type { ProductProgress } from '@/lib/crm/operations-overview';

const orderedProduct: ProductProgress = { id: 'roller', name: 'roller shades', ordered: true, shipped: false, installed: false, records: [{ id: 'product-1', updatedAt: '2026-09-20T00:00:00Z' }] };
function orderedItem(meta: Record<string, unknown> = {}, cogs: number | null = 3842.34): OperationsItem {
  return { source: { cogs, quote: { meta } }, products: [orderedProduct], headerProducts: [{ id: 'roller', name: 'Roller Shades', quantity: 6 }] } as unknown as OperationsItem;
}

describe('displayedOrderAmount', () => {
  it('shows a persisted manual invoice amount instead of the job total', () => {
    const meta = { product_order_costs: { 'product-1': { amount: 675.50, records: ['product-1'], emailId: null } } };
    expect(displayedOrderAmount(orderedItem(JSON.parse(JSON.stringify(meta))), orderedProduct)).toEqual({ amount: 675.50, source: 'invoice' });
  });
  it('preserves an explicitly recorded zero-dollar invoice', () => {
    expect(displayedOrderAmount(orderedItem({ product_order_costs: { 'product-1': { amount: 0, records: ['product-1'] } } }), orderedProduct)).toEqual({ amount: 0, source: 'invoice' });
  });
  it('shows legacy single-product COGS as job cost, not as a recorded invoice', () => {
    expect(displayedOrderAmount(orderedItem(), orderedProduct)).toEqual({ amount: 3842.34, source: 'job' });
  });
  it('does not assign shared COGS when another product is in the signed contract', () => {
    const item = orderedItem();
    item.headerProducts.push({ id: 'shutters', name: 'Shutters', quantity: 2 });
    expect(displayedOrderAmount(item, orderedProduct)).toBeNull();
  });
  it('does not assign shared COGS across manufacturer groups', () => {
    const item = orderedItem();
    item.products.push({ ...orderedProduct, id: 'other-manufacturer' });
    expect(displayedOrderAmount(item, orderedProduct)).toBeNull();
  });
  it('does not resurrect superseded allocations or copy a different product invoice', () => {
    for (const cost of [{ amount: 3842.34, records: ['product-1'], supersededAt: '2026-09-20' }, { amount: 20, records: ['other'] }]) {
      expect(displayedOrderAmount(orderedItem({ product_order_costs: { other: cost } }), orderedProduct)).toBeNull();
    }
  });
  it('requires order evidence and a positive recorded job cost for the legacy fallback', () => {
    expect(displayedOrderAmount(orderedItem(), { ...orderedProduct, ordered: false })).toBeNull();
    for (const total of [null, 0, -1, NaN]) expect(displayedOrderAmount(orderedItem({}, total), orderedProduct)).toBeNull();
  });
  it('supports a whole-job order without claiming a product-specific allocation', () => {
    const item = orderedItem();
    item.products = [];
    item.headerProducts = [];
    expect(displayedOrderAmount(item, { ...orderedProduct, wholeJob: true })).toEqual({ amount: 3842.34, source: 'job' });
  });
});
