import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PayablesWorkspace, type OwnerPaymentRequest } from '@/components/crm/PayablesWorkspace';
import { buildOwnerPayablesLedger } from '@/lib/crm/owner-payables';
import type { CrmPaymentPerson, CrmCommissionPayment, CrmKenPayment } from '@/lib/crm/types';
import { payableFixtureRow } from './payables-data';

function Preview() {
  const [rows, setRows] = useState([
    payableFixtureRow({ id:'sample-1', customerName:'Sample completed job', quoteNumber:'DEMO-101', total:10000, cogs:4000, installationInvoiceAmount:1000 }),
    payableFixtureRow({ id:'sample-2', customerName:'Sample pending job', quoteNumber:'DEMO-102', total:6000, cogs:2000, installationInvoiceAmount:500, isPaidInFull:false, status:'sold', liveStatus:'sold' }),
  ]);
  const [commissionPayments, setCommissionPayments] = useState<CrmCommissionPayment[]>([]);
  const [kenPayments, setKenPayments] = useState<CrmKenPayment[]>([]);
  const [person, setPerson] = useState<CrmPaymentPerson>('mike');
  const [readOnly, setReadOnly] = useState(false);
  const [fail, setFail] = useState(false);
  const ledger = buildOwnerPayablesLedger({rows, commissionPayments, kenPayments});
  async function pay(request: OwnerPaymentRequest) {
    if(fail) throw new Error('Sample save failure. No payment recorded.');
    const now = new Date().toISOString();
    const meta = {advancePayment:request.advance, selectedItemAllocations:(request.item_ids || []).map(item_key=>({item_key, person:request.person, source:'manual', amount:request.amount, customer_name:rows.find(row=>item_key.endsWith(row.id))?.customerName}))};
    const payment = {id:crypto.randomUUID(),created_at:now,updated_at:now,amount:request.amount,paid_on:request.paid_on,period_month:null,note:request.note,created_by_email:'sample@example.test',meta};
    if(request.person==='ken') setKenPayments(current=>[...current,payment]);
    else setCommissionPayments(current=>[...current,{...payment,recipient:request.person as 'mike'|'jessica'}]);
  }
  return <><aside style={{padding:'10px 28px',color:'#bbb',font:'13px Arial'}}>Local QA · sample data only <label style={{marginLeft:20}}><input type="checkbox" checked={readOnly} onChange={event=>setReadOnly(event.target.checked)}/> Read only</label><label style={{marginLeft:20}}><input type="checkbox" checked={fail} onChange={event=>setFail(event.target.checked)}/> Simulate save failure</label></aside><PayablesWorkspace rows={rows} ledger={ledger} busy={false} canEdit={!readOnly} activePerson={person} onPersonChange={setPerson} onPay={pay} onReadiness={async request=>{
    if(fail) throw new Error('Sample save failure. No readiness change recorded.');
    setRows(current=>current.map(row=>row.id===request.id?{...row,meta:{...row.meta,ownerPayableReadiness:{ready:request.ready,reason:request.reason,updatedAt:new Date().toISOString()}}}:row));
  }}/></>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
