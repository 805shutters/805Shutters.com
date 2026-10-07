import { describe, expect, it } from 'vitest';
import { buildJobStatusQueues } from './job-status-queues';
import { buildOperationsItems } from './operations-overview';
import type { CrmCalendarEvent, CrmDashboardData, CrmJob, CrmQuote } from './types';

const now = new Date('2026-10-06T23:00:00Z');
const job = (id: string, meta: Record<string, unknown> = {}) => ({ id, status: 'sold', customer_name: id, created_at: '2026-10-01', meta } as CrmJob);
const quote = (id: string, overrides: Partial<CrmQuote> = {}) => ({ id: `q-${id}`, job_id: id, status: 'sold', customer_name: id, quote_total: 1000, balance_due: 500, created_at: '2026-10-01', meta: {}, ...overrides } as CrmQuote);
const event = (id: string, overrides: Partial<CrmCalendarEvent> = {}) => ({ id, job_id: id, event_type: 'sales_consult', status: 'scheduled', start_at: '2026-10-05T17:00:00Z', end_at: '2026-10-05T18:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...overrides } as CrmCalendarEvent);
const data = (overrides: Partial<CrmDashboardData> = {}) => ({ jobs: [], quotes: [], events: [], customerFiles: [], customerProducts: [], bookkeepingRows: [], orderCogsEmails: [], installationInvoiceEmails: [], ...overrides } as CrmDashboardData);

describe('job status queues', () => {
  it('moves a sold job from measure-needed to order-needed, then clears both when the order is placed', () => {
    const dashboard = data({ jobs: [job('a', { measure_needed: { status: 'needed', form_status: 'draft' } })], quotes: [quote('a')] });
    expect(buildJobStatusQueues(dashboard, undefined, now)).toMatchObject({ active_jobs: ['a'], measures_needed: ['a'], need_to_order: [] });
    dashboard.jobs[0].meta = { measure_needed: { status: 'needed', form_status: 'awaiting_signature' } };
    expect(buildJobStatusQueues(dashboard).measures_needed).toEqual(['a']);
    dashboard.jobs[0].meta = { measure_needed: { status: 'measured', measured_at: now.toISOString(), form_status: 'submitted' } };
    expect(buildJobStatusQueues(dashboard)).toMatchObject({ measures_needed: [], need_to_order: ['a'] });
    dashboard.quotes[0].ordered_at = now.toISOString();
    expect(buildJobStatusQueues(dashboard)).toMatchObject({ active_jobs: ['a'], measures_needed: [], need_to_order: [] });
  });

  it('uses submitted form evidence when the job flag is stale, without requiring a vendor-preparation task', () => {
    const dashboard = data({ jobs: [job('a', { measure_needed: { status: 'needed' } })], quotes: [quote('a')], technicalMeasureSubmissions: [{ formId: 'f', jobId: 'a', quoteId: 'q-a', submittedAt: now.toISOString() }] });
    expect(buildJobStatusQueues(dashboard)).toMatchObject({ measures_needed: [], need_to_order: ['a'] });
    dashboard.technicalMeasureSubmissions![0].quoteId = 'another-quote';
    expect(buildJobStatusQueues(dashboard)).toMatchObject({ measures_needed: ['a'], need_to_order: [] });
  });

  it('removes an ordered job even if its measure flag still says needed, and retains partially ordered product groups', () => {
    const dashboard = data({ jobs: [job('a', { measure_needed: { status: 'needed' } })], quotes: [quote('a', { ordered_at: now.toISOString() })] });
    expect(buildJobStatusQueues(dashboard).measures_needed).toEqual([]);
    dashboard.jobs[0].meta = { measure_needed: { status: 'measured', measured_at: now.toISOString() } };
    dashboard.quotes[0].ordered_at = null;
    const item = buildOperationsItems(dashboard)[0];
    item.products = [{ ...item.wholeJob, id: 'one', ordered: true }, { ...item.wholeJob, id: 'two', ordered: false }];
    expect(buildJobStatusQueues(dashboard, [item]).need_to_order).toEqual(['a']);
    item.products[1].shipped = true; // Shipment proves its order was placed.
    expect(buildJobStatusQueues(dashboard, [item]).need_to_order).toEqual([]);
  });

  it('counts explicit jobs once, keeps unrelated names separate, and excludes unsold and closed jobs', () => {
    const dashboard = data({ jobs: [job('a'), job('b')], quotes: [quote('a'), quote('a', { id: 'q-a2' }), quote('b'), quote('unsold', { status: 'sent' }), quote('closed', { balance_due: 0 })] });
    expect(buildJobStatusQueues(dashboard).active_jobs).toEqual(['a', 'b']);
  });

  it('distinguishes scheduled appointments from elapsed visits, ignores canceled/rescheduled and non-sales events, and uses exact quote send evidence', () => {
    const dashboard = data({
      jobs: ['future', 'draft', 'sent', 'sibling', 'canceled', 'measure', 'rescheduled'].map(id => ({ ...job(id), status: 'scheduled' })),
      quotes: [quote('draft', { status: 'draft' }), quote('sent', { status: 'sent', sent_at: now.toISOString() }), quote('draft', { id: 'draft-alternative', status: 'draft' })],
      events: [event('future', { start_at: '2026-10-07T17:00:00Z', end_at: '2026-10-07T18:00:00Z' }), event('draft'), event('sent'), event('sibling', { quote_sent_at: now.toISOString() }), event('canceled', { status: 'canceled' }), event('measure', { event_type: 'measure' }), event('rescheduled', { status: 'rescheduled' })]
    });
    const before = JSON.stringify(dashboard);
    const queues = buildJobStatusQueues(dashboard, undefined, now);
    expect(queues.upcoming_quotes.map(event => event.id)).toEqual(['future']);
    expect(queues.pending_quotes.map(event => event.id)).toEqual(['draft', 'sibling']);
    expect(JSON.stringify(dashboard)).toBe(before);
  });

  it('does not report a visit as pending before it ends, and observes LA timestamp boundaries', () => {
    const dashboard = data({ events: [event('ongoing', { start_at: '2026-10-06T22:30:00Z', end_at: '2026-10-06T23:30:00Z' }), event('bad', { start_at: 'invalid' })] });
    expect(buildJobStatusQueues(dashboard, undefined, now).upcoming_quotes.map(event => event.id)).toEqual(['ongoing']);
    expect(buildJobStatusQueues(dashboard, undefined, new Date('2026-10-06T23:30:00Z')).pending_quotes.map(event => event.id)).toEqual(['ongoing']);
  });

  it('limits pending visits to seven elapsed days, including the exact cutoff', () => {
    const dashboard = data({ quotes: [quote('stale', { status: 'draft', created_at: now.toISOString(), updated_at: now.toISOString() })], events: [
      event('stale', { status: 'complete', start_at: '2026-09-29T21:59:59.999Z', end_at: '2026-09-29T22:59:59.999Z', updated_at: now.toISOString() }),
      event('cutoff', { start_at: '2026-09-29T22:00:00Z', end_at: '2026-09-29T23:00:00Z' }),
      event('recent'),
      event('just-completed', { start_at: '2026-10-06T22:00:00Z', end_at: now.toISOString() }),
      event('future-complete', { status: 'complete', start_at: '2026-10-07T17:00:00Z', end_at: '2026-10-07T18:00:00Z' }),
    ] });
    const before = JSON.stringify(dashboard);
    expect(buildJobStatusQueues(dashboard, undefined, now).pending_quotes.map(event => event.id)).toEqual(['cutoff', 'recent', 'just-completed']);
    expect(buildJobStatusQueues(dashboard, undefined, new Date(now.getTime() + 1)).pending_quotes.map(event => event.id)).toEqual(['recent', 'just-completed']);
    expect(JSON.stringify(dashboard)).toBe(before);
  });

  it('uses elapsed time across the Los Angeles daylight-saving change', () => {
    const afterFallback = new Date('2026-11-03T18:00:00-08:00');
    const dashboard = data({ events: [
      event('too-old', { start_at: '2026-10-27T17:00:00-07:00', end_at: '2026-10-27T18:00:00-07:00' }),
      event('cutoff', { start_at: '2026-10-27T18:00:00-07:00', end_at: '2026-10-27T19:00:00-07:00' }),
    ] });
    expect(buildJobStatusQueues(dashboard, undefined, afterFallback).pending_quotes.map(event => event.id)).toEqual(['cutoff']);
  });

  it('deduplicates mirror records, counts pending quote opportunities once, and resolves legacy quote IDs', () => {
    const dashboard = data({ quotes: [quote('sent', { external_id: 'quote:legacy', status: 'sent' })], events: [
      event('mirror', { meta: { sales_805_appointment_id: 'visit' }, start_at: '2026-10-07T17:00:00Z', end_at: '2026-10-07T18:00:00Z' }),
      event('sales-805:visit', { meta: { sales_805_appointment_id: 'visit' }, start_at: '2026-10-07T17:00:00Z', end_at: '2026-10-07T18:00:00Z' }),
      event('old', { job_id: 'pending' }), event('latest', { job_id: 'pending', start_at: '2026-10-06T17:00:00Z', end_at: '2026-10-06T18:00:00Z' }),
      event('linked-legacy', { job_id: null, meta: { mts_quote_id: 'legacy' } }),
    ] });
    const queues = buildJobStatusQueues(dashboard, undefined, now);
    expect(queues.upcoming_quotes).toHaveLength(1);
    expect(queues.pending_quotes.map(event => event.id)).toEqual(['latest']);
  });
});
