import { isOpenJob } from './active-jobs';
import { stepComplete, type OperationsItem } from './operations-overview';

export const jobStatusFilters = [
  { id: 'quote', label: 'Quote', description: 'Jobs with a quote on file' },
  { id: 'sold', label: 'Sold', description: 'All sold jobs' },
  { id: 'deposit_paid', label: 'Deposit', description: 'Sold jobs with their deposit requirement satisfied' },
  { id: 'order_complete', label: 'Ordered', description: 'Sold jobs with every product marked ordered' },
  { id: 'shipment_complete', label: 'Shipped', description: 'Sold jobs with every product marked shipped' },
  { id: 'installed', label: 'Installed', description: 'Jobs with installation confirmed complete' },
  { id: 'paid', label: 'Balance paid', description: 'Sold jobs with the customer balance paid; this does not mean the job is closed' },
] as const;
// Other workflow queries remain available internally without adding toolbar buttons.
export type JobStatusFilter = typeof jobStatusFilters[number]['id']
  | 'active' | 'all' | 'scheduled' | 'need_follow_up' | 'deposit_needed'
  | 'need_measure' | 'ordered' | 'shipped' | 'received' | 'installation_needed'
  | 'balance_needed' | 'closed' | 'completed' | 'attention' | 'lost' | 'archived';

export function matchesJobStatusFilter(item: OperationsItem, filter: JobStatusFilter): boolean {
  const deposit = item.source.depositOutstanding;
  switch (filter) {
    case 'all': return true;
    case 'sold': return item.sold;
    case 'active': return isOpenJob(item);
    case 'closed': return item.closed;
    case 'completed': return item.complete;
    case 'lost': case 'archived': return item.source.stageId === filter;
    // Historical/lost records remain available above, not in active workflow queues.
    default: if (item.archived) return false;
  }
  switch (filter) {
    case 'quote': return item.quote;
    case 'deposit_needed': return item.sold && deposit !== null && deposit > 0.005;
    case 'deposit_paid': return item.sold && deposit !== null && deposit <= 0.005;
    case 'ordered': case 'shipped': return item.sold && !stepComplete(item, filter);
    case 'order_complete': return item.sold && stepComplete(item, 'ordered');
    case 'shipment_complete': return item.sold && stepComplete(item, 'shipped');
    case 'received': return item.source.progress.product === 'received';
    case 'installation_needed': return item.sold && !item.installed;
    case 'installed': return item.installed;
    case 'balance_needed': return item.sold && ['deposit_needed', 'balance_open'].includes(item.source.progress.payment);
    case 'paid': return item.paid;
    default: return item.source.stageId === filter;
  }
}
