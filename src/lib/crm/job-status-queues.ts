import { getMeasureNeededMeta, objectMeta } from './measure-needed-state';
import { buildOperationsItems, type OperationsItem } from './operations-overview';
import { quoteIsTrackingSale } from './job-tracking-view';
import type { CrmCalendarEvent, CrmDashboardData, CrmQuote } from './types';

export const jobStatusQueues = [
  { id: 'upcoming_quotes', label: 'Upcoming quotes', context: 'Appointments scheduled' },
  { id: 'pending_quotes', label: 'Pending quotes', context: 'Last 7 days · Quote unsent' },
  { id: 'measures_needed', label: 'Measures needed', context: 'Sold · Measure outstanding' },
  { id: 'need_to_order', label: 'Need to order', context: 'Measure submitted · Unordered' },
  { id: 'active_jobs', label: 'Active jobs', context: 'Sold · Not closed' },
] as const;
export type JobStatusQueueId = typeof jobStatusQueues[number]['id'];
export type JobStatusQueueSnapshot = {
  upcoming_quotes: CrmCalendarEvent[];
  pending_quotes: CrmCalendarEvent[];
  measures_needed: string[];
  need_to_order: string[];
  active_jobs: string[];
};
export const isJobStatusQueue = (id: string): id is JobStatusQueueId => jobStatusQueues.some(queue => queue.id === id);

/** Count an explicit job once even when it has multiple sold quote/ledger cards.
 * Unlinked sales retain their own record identity; never merge by name/phone.
 */
export function statusQueueJobKey(item: OperationsItem): string {
  return item.source.job?.id || item.source.row?.jobId || item.source.quote?.job_id || item.source.id;
}

function quoteMatchesId(quote: CrmQuote, id: string): boolean {
  const meta = objectMeta(quote.meta);
  return [quote.id, quote.external_id, quote.external_id?.replace(/^quote:/, ''), meta.sales_quote_id, meta.mts_quote_id, meta.source_sales_quote_id].includes(id);
}

function sentQuote(quote: CrmQuote): boolean {
  // Creating/saving a draft is not sending a quote. Retain durable send evidence
  // even if a sent quote is subsequently edited back into draft state.
  return Boolean(quote.sent_at || quoteIsTrackingSale(quote) || quote.status === 'sent');
}

export function buildJobStatusQueues(data: CrmDashboardData, items = buildOperationsItems(data), now = new Date()): JobStatusQueueSnapshot {
  const queues: JobStatusQueueSnapshot = { upcoming_quotes: [], pending_quotes: [], measures_needed: [], need_to_order: [], active_jobs: [] };
  const groups = new Map<string, OperationsItem[]>();
  for (const item of items) groups.set(statusQueueJobKey(item), [...(groups.get(statusQueueJobKey(item)) || []), item]);
  for (const [key, group] of groups) {
    const active = group.filter(item => item.sold && !item.closed && !item.archived);
    if (!active.length) continue;
    queues.active_jobs.push(key);
    const unordered = active.filter(item => !(item.products.length ? item.products : [item.wholeJob]).every(product => product.ordered || product.shipped || product.installed));
    if (!unordered.length) continue;
    const measure = getMeasureNeededMeta(unordered[0].source.job?.meta);
    const submitted = measure.form_status === 'submitted' || (measure.status === 'measured' && Boolean(measure.measured_at))
      || (data.technicalMeasureSubmissions || []).some(form => form.jobId === key && (!form.quoteId || unordered.some(item => (item.source.quote?.id || item.source.row?.quoteId) === form.quoteId)));
    // Draft and awaiting-signature forms stay in Measures needed. Legacy saved
    // measured completion is also durable evidence that the measure is done.
    if (submitted) queues.need_to_order.push(key);
    else if (measure.status === 'needed') queues.measures_needed.push(key);
  }

  const quotes = [...new Map([...(data.quotes || []), ...(data.customerFiles || []).flatMap(file => file.quotes)].map(quote => [quote.id, quote])).values()]
    .filter(quote => !objectMeta(quote.meta).deleted_at);
  const jobs = new Map([...(data.jobs || []), ...(data.customerFiles || []).flatMap(file => file.jobs)].map(job => [job.id, job]));
  const events = new Map<string, CrmCalendarEvent>();
  for (const event of data.events || []) {
    if (event.event_type !== 'sales_consult' || objectMeta(event.meta).deleted_at) continue;
    // A mirrored sales_805 record and its CRM event are one appointment.
    const appointmentId = objectMeta(event.meta).sales_805_appointment_id;
    const key = typeof appointmentId === 'string' ? `sales-805:${appointmentId}` : event.id;
    const current = events.get(key);
    if (!current || Date.parse(event.updated_at) > Date.parse(current.updated_at)) events.set(key, event);
  }
  const pending = new Map<string, CrmCalendarEvent>();
  const pendingCutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  for (const event of events.values()) {
    if (event.status === 'canceled' || event.status === 'rescheduled') continue;
    const job = event.job_id ? jobs.get(event.job_id) : undefined;
    if (job && (objectMeta(job.meta).deleted_at || ['lost', 'closed'].includes(job.source_status || job.status))) continue;
    const start = Date.parse(event.start_at);
    const end = Date.parse(event.end_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (event.status === 'scheduled' && end > now.getTime()) {
      queues.upcoming_quotes.push(event);
      continue;
    }
    if (!(event.status === 'complete' || end <= now.getTime())) continue;
    // Pending age starts when the visit ends. Editing an old appointment or
    // saving its draft quote must not return stale work to this queue.
    if (end < pendingCutoff || end > now.getTime()) continue;
    const meta = objectMeta(event.meta);
    const quoteId = [meta.crm_quote_id, meta.quote_id, meta.mts_quote_id].find(value => typeof value === 'string' && value) as string | undefined;
    const related = quoteId ? quotes.filter(quote => quoteMatchesId(quote, quoteId)) : event.job_id ? quotes.filter(quote => quote.job_id === event.job_id) : [];
    if (related.some(sentQuote)) continue;
    // A job-level sale is decisive even when no quote was linked to the visit.
    if (!quoteId && event.job_id && (groups.get(event.job_id)?.some(item => item.sold) || ['sold', 'ordered', 'installed', 'invoiced'].includes(job?.source_status || job?.status || ''))) continue;
    // No exact record link: use event-owned send evidence, never customer-name
    // matching or the cross-customer enrichment on a linked calendar event.
    if (!event.job_id && !quoteId && (event.quote_sent_at || event.quote_signed_at || event.customer_contract_signed_at)) continue;
    const key = event.job_id || quoteId || event.id;
    const current = pending.get(key);
    if (!current || Date.parse(current.start_at) < start) pending.set(key, event);
  }
  queues.upcoming_quotes.sort((a, b) => a.start_at.localeCompare(b.start_at));
  queues.pending_quotes = [...pending.values()].sort((a, b) => a.start_at.localeCompare(b.start_at));
  return queues;
}
