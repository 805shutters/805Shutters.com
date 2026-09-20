import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JobStatusOverview } from '@/components/crm/OperationsOverview';
import type { CrmCustomerFile, CrmDashboardData, CrmQuote } from '@/lib/crm/types';
const at = '2026-09-19T12:00:00Z';
const makeFile = (name: string, status: string, id: string) => {
  const quote = { id, quote_number: `805-${id}`, customer_name: name, status, sold_at: status === 'sold' ? at : null, created_at: at, updated_at: at, quote_total: 2400, meta: {} } as CrmQuote;
  return { id, customerName: name, customer: null, quotes: [quote], jobs: [], bookkeepingRows: [], contracts: [], products: [], notes: [] } as unknown as CrmCustomerFile;
};
const initial = [makeFile('Unsold sample customer', 'sent', 'DEMO-1'), makeFile('Sold sample customer', 'sold', 'DEMO-2')];
function Preview() {
  const [files, setFiles] = useState(initial);
  const [message, setMessage] = useState('');
  const data = { jobs: [], quotes: files.flatMap(file => file.quotes), customerFiles: files, bookkeepingRows: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData;
  return <main style={{maxWidth:1500,margin:'24px auto',padding:16}}><p>LOCAL PREVIEW · SAMPLE DATA ONLY</p><p role="status">{message}</p><JobStatusOverview data={data} busy={false} onOpen={()=>{}} onSaveCost={async()=>true} onAction={async()=>{}} onDelete={async file=>{
    if (!window.confirm(`Delete the customer file for "${file.customerName}"?\n\nThis hides the customer, related jobs, quotes, and bookkeeping rows from the CRM. The records are kept in history.`)) return;
    setFiles(current=>current.filter(item=>item.id!==file.id)); setMessage(`Deleted the sample file for ${file.customerName}.`);
  }} /><button onClick={()=>{setFiles(initial);setMessage('');}}>Reset samples</button></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
