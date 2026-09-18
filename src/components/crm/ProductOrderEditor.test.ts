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
