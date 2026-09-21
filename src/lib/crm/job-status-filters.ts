import { isOpenJob } from './active-jobs';
import { stepComplete, type OperationsItem } from './operations-overview';

export const jobStatusFilters = [
  { id: 'active', label: 'Active', description: 'Jobs that have not been closed' },
  { id: 'all', label: 'All jobs', description: 'Every job, including closed and archived jobs' },
  { id: 'scheduled', label: 'Scheduled', description: 'Jobs in the scheduled stage' },
  { id: 'quote', label: 'Quoted', description: 'Jobs with a quote on file' },
  { id: 'need_follow_up', label: 'Follow up', description: 'Jobs awaiting sales follow-up' },
  { id: 'sold', label: 'Sold', description: 'All sold jobs' },
  { id: 'deposit_needed', label: 'Deposit needed', description: 'Sold jobs with a recorded deposit still outstanding' },
  { id: 'deposit_paid', label: 'Deposit paid', description: 'Sold jobs with their deposit requirement satisfied' },
  { id: 'need_measure', label: 'Measure needed', description: 'Jobs awaiting measurement' },
  { id: 'ordered', label: 'Orders needed', description: 'Sold jobs with at least one product not yet marked ordered' },
  { id: 'order_complete', label: 'Ordered', description: 'Sold jobs with every product marked ordered' },
  { id: 'shipped', label: 'Shipping', description: 'Sold jobs with at least one product awaiting shipment' },
  { id: 'shipment_complete', label: 'Shipped', description: 'Sold jobs with every product marked shipped' },
  { id: 'received', label: 'Received', description: 'Jobs with product receipt confirmed' },
  { id: 'installation_needed', label: 'Installation needed', description: 'Sold jobs whose installation is not complete' },
  { id: 'installed', label: 'Installed', description: 'Jobs with installation confirmed complete' },
  { id: 'balance_needed', label: 'Balance due', description: 'Sold jobs with a recorded customer balance outstanding' },
  { id: 'paid', label: 'Balance paid', description: 'Sold jobs with the customer balance paid; this does not mean the job is closed' },
  { id: 'closed', label: 'Closed', description: 'Jobs explicitly classified as closed' },
  { id: 'completed', label: 'Completed', description: 'Jobs confirmed complete by the existing workflow' },
  { id: 'attention', label: 'Needs attention', description: 'Jobs with missing evidence, conflicts, or service issues' },
  { id: 'lost', label: 'Lost', description: 'Jobs classified as lost' },
  { id: 'archived', label: 'Archived', description: 'Jobs classified as archived' },
] as const;
export type JobStatusFilter = typeof jobStatusFilters[number]['id'];

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
