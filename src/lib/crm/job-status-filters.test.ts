import { describe, expect, it } from 'vitest';
import { buildOperationsItems, type OperationsItem } from './operations-overview';
import { jobStatusFilters, matchesJobStatusFilter as matches } from './job-status-filters';
import { JOB_TRACKING_STAGES } from './job-tracking-view';
import type { CrmDashboardData } from './types';

const base = buildOperationsItems({ jobs: [], quotes: [{ id: 'q', customer_name: 'Test', status: 'sold', quote_total: 1000, balance_due: 500, created_at: '2026-09-01', meta: {} }], bookkeepingRows: [], customerFiles: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData)[0];
const item = (patch: Partial<OperationsItem> = {}): OperationsItem => ({ ...base, ...patch });

describe('job status filters', () => {
  it('keeps a paid shipped job open without inventing installation or closure', () => {
    const shipped = item({ sold: true, paid: true, installed: false, closed: false, complete: false, wholeJob: { ...base.wholeJob, shipped: true } });
    expect(matches(shipped, 'paid')).toBe(true);
    expect(matches(shipped, 'shipment_complete')).toBe(true);
    expect(matches(shipped, 'installation_needed')).toBe(true);
    expect(matches(shipped, 'active')).toBe(true);
    for (const filter of ['closed', 'completed', 'installed'] as const) expect(matches(shipped, filter)).toBe(false);
  });
  it('keeps partial product groups in pending queues until every manufacturer is complete', () => {
    const mixed = item({ products: [{ ...base.wholeJob, id: 'a', ordered: true, shipped: true }, { ...base.wholeJob, id: 'b', ordered: false, shipped: false }] });
    expect(matches(mixed, 'ordered')).toBe(true);
    expect(matches(mixed, 'shipped')).toBe(true);
    expect(matches(mixed, 'order_complete')).toBe(false);
    expect(matches(mixed, 'shipment_complete')).toBe(false);
  });
  it('does not classify an unknown deposit as paid or due', () => {
    const unknown = item({ source: { ...base.source, depositOutstanding: null } });
    expect(matches(unknown, 'deposit_paid')).toBe(false);
    expect(matches(unknown, 'deposit_needed')).toBe(false);
    expect(matches(item({ source: { ...base.source, depositOutstanding: 200 } }), 'deposit_needed')).toBe(true);
    expect(matches(item({ source: { ...base.source, depositOutstanding: 0 } }), 'deposit_paid')).toBe(true);
  });
  it('makes all derived stages reachable, including lost and archived records', () => {
    for (const stage of JOB_TRACKING_STAGES) {
      const record = item({ source: { ...base.source, stageId: stage.id, progress: { ...base.source.progress, product: stage.id === 'shipped' ? 'received' : 'unprepared' } }, archived: ['lost', 'archived'].includes(stage.id), complete: stage.id === 'complete' });
      expect(jobStatusFilters.some(filter => !['all', 'active'].includes(filter.id) && matches(record, filter.id))).toBe(true);
    }
    const archived = item({ archived: true, source: { ...base.source, stageId: 'archived' } });
    expect(matches(archived, 'archived')).toBe(true);
    expect(matches(archived, 'all')).toBe(true);
    expect(matches(archived, 'sold')).toBe(true);
    expect(matches(archived, 'ordered')).toBe(false);
  });
});
