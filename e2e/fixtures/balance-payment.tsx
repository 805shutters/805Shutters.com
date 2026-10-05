import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JobStatusOverview } from '@/components/crm/OperationsOverview';
import { JobTrackingWorkspace, type JobTrackingSavePatch, type JobTrackingViewItem } from '@/components/crm/JobTrackingWorkspace';
import { buildBookkeepingRows } from '@/lib/crm/bookkeeping';
import { buildOperationsItems } from '@/lib/crm/operations-overview';
import type { CrmDashboardData, CrmQuote, CrmBookkeepingPayment } from '@/lib/crm/types';
const quote = { id:'test-quote', job_id:null, quote_number:'805-TEST', customer_name:'Balance regression sample', status:'sent', quote_total:1222.14, materials_cost:792.21, deposit_required:611.07, balance_due:611.07, signed_at:null, sold_at:null, approved_at:null, installed_at:'2026-10-05', created_at:'2026-07-30', meta:{} } as unknown as CrmQuote;
const deposit = {id:'deposit',quote_id:quote.id,amount:611.07,payment_label:'Deposit',payment_type:'credit_card',paid_at:'2026-07-30',created_at:'2026-07-30',meta:{}} as CrmBookkeepingPayment;
function Preview() {
 const [payments,setPayments]=useState([deposit]);
 const [focused,setFocused]=useState(false);
 const [quick,setQuick]=useState<{requestId:string;kind:'payment';paymentType:'balance'}|null>(null);
 const [last,setLast]=useState<Record<string,unknown>|null>(null);
 const rows=buildBookkeepingRows({quotes:[quote],entries:[],payments});
 const data={jobs:[],quotes:[quote],bookkeepingRows:rows,bookkeepingPayments:payments,customerFiles:[],customerProducts:[],orderCogsEmails:[],installationInvoiceEmails:[]} as unknown as CrmDashboardData;
 const item=buildOperationsItems(data)[0];
 const save=async (_:JobTrackingViewItem,patch:JobTrackingSavePatch)=>{
  const body=patch.quote||patch.row||{};
  setLast(body);
  const amount=Number(body.payment_amount);
  if(amount>0)setPayments(old=>[...old,{...deposit,id:String(body.payment_request_id),amount,payment_label:String(body.payment_label),payment_type:String(body.payment_type) as CrmBookkeepingPayment['payment_type'],paid_at:String(body.paid_at)}]);
  return true;
 };
 return <main style={{padding:24,maxWidth:1700,margin:'auto'}}>
  <p>LOCAL TEST · Synthetic records · No database, charge, refund or message</p>
  <div style={{display:'flex',gap:12,marginBottom:20}}>
   <button onClick={()=>{setPayments([deposit]);setFocused(false);setQuick(null);setLast(null);}}>Reset to deposit only</button>
   <button onClick={()=>{setPayments([deposit,{...deposit,id:'balance1',payment_label:'Balance payment'},{...deposit,id:'balance2',payment_label:'Balance payment'}]);setFocused(false);}}>Load duplicate receipts</button>
   {focused&&<button onClick={()=>setFocused(false)}>Back to job status</button>}
  </div>
  {!focused&&<JobStatusOverview data={data} busy={false} onOpen={()=>setFocused(true)} onSaveCost={save} onAction={async(_,step)=>{if(step==='paid'&&!item.paid){setQuick({requestId:crypto.randomUUID(),kind:'payment',paymentType:'balance'});}else setFocused(true);}}/>}
  {(focused||quick)&&<JobTrackingWorkspace jobs={[]} quotes={[quote]} rows={rows} files={[]} orderCogsEmails={[]} installationInvoiceEmails={[]} busy={false} focusedItemId={item.source.id} editorOnly={!focused} quickAction={quick} onQuickClose={()=>setQuick(null)} onSave={save} onStage={async()=>true} onSendSquare={async()=>{throw Error('No messages in test fixture');}} onOpenCustomer={()=>{}} onPullInstallInvoices={()=>{}}/>}
  <p>Net recorded payments: ${(payments.reduce((sum,p)=>sum+p.amount,0)).toFixed(2)} · Receipt count: {payments.length}</p>
  {last&&<pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(last,null,2)}</pre>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
