import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JobStatusOverview } from '@/components/crm/OperationsOverview';
import type { CrmDashboardData } from '@/lib/crm/types';

const stamp = '2026-10-01T12:00:00Z';
const examples = [
  { id: 'closed', name: 'Closed sample', total: 1254, balance: 0 },
  { id: 'reopened', name: 'Reopened paid sample', total: 2300, balance: 0 },
  { id: 'unpaid', name: 'Unpaid sample', total: 3400, balance: 1700 }
];
const data = {
  jobs: examples.map(({ id }) => ({ id: `job-${id}`, meta: id === 'reopened' ? { job_closure_override: { closed: false } } : {} })),
  quotes: examples.map(({ id, name, total, balance }) => ({ id, job_id: `job-${id}`, customer_name: name, quote_number: `805-${id}`, status: 'sold', sold_at: stamp, signed_at: stamp, created_at: stamp, updated_at: stamp, quote_total: total, deposit_required: total / 2, balance_due: balance, meta: {} })),
  bookkeepingRows: examples.map(({ id, name, total, balance }) => ({ id, quoteId: id, jobId: `job-${id}`, customerName: name, source: 'crm_quote', status: 'sold', total, depositDue: total / 2, depositPaid: total / 2, balancePaid: total / 2 - balance, paidTotal: total - balance, balance })),
  customerFiles: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [], bookkeepingPayments: []
} as unknown as CrmDashboardData;
function Preview() {
  const [opened, setOpened] = useState('');
  return <main><JobStatusOverview data={data} busy={false} onOpen={item => setOpened(item.customerName)} onAction={async () => {}} onSaveCost={async () => true} /><p role="status">{opened && `Opened ${opened}`}</p></main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
