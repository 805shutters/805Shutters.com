import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JobStatusOverview } from '@/components/crm/OperationsOverview';
import { CrmNavigation } from '@/components/crm/CrmNavigation';
import type { CrmDashboardData, CrmCustomerProduct } from '@/lib/crm/types';
const initial = ['Shutters','Roller Shades','Blinds'].map((name,index)=>({id:`${index+1}1111111-1111-4111-8111-111111111111`,quote_id:'q1',job_id:'j1',bookkeeping_entry_id:null,product_type:name,status:'ordered',quantity:2,updated_at:'2026-09-19T12:00:00Z',meta:index===1?{shipped_at:'2026-09-18',shipping_confirmation:{shippedOn:'2026-09-17',mailbox:'805@805shutters.com',messageId:'samplemail1',orderReference:'WO-001'}}:index===2?{shipped_at:'2026-09-18'}:{}}));
function Preview(){
 const [products,setProducts]=useState<CrmCustomerProduct[]>(initial as CrmCustomerProduct[]);
 const data={jobs:[],quotes:[{id:'q1',job_id:'j1',customer_name:'Sample customer',quote_number:'805-DEMO',created_at:'2026-09-01T12:00:00Z',status:'sold',sold_at:'2026-09-01T12:00:00Z',quote_total:6000,deposit_paid:3000,materials_cost:2000,meta:{}}],bookkeepingRows:[],customerFiles:[],customerProducts:products,orderCogsEmails:[],installationInvoiceEmails:[],bookkeepingPayments:[]} as unknown as CrmDashboardData;
 return <main style={{maxWidth:1500,margin:'24px auto',padding:16,fontFamily:'Arial,sans-serif'}}><p>LOCAL PREVIEW · SAMPLE DATA</p><JobStatusOverview data={data} busy={false} onOpen={()=>{}} onSaveCost={async()=>true} onAction={async(_,step,product,invoice,shipment)=>{if(step==='shipped')setProducts(old=>old.map(p=>product?.records.some(r=>r.id===p.id)?{...p,meta:{...p.meta,shipped_at:'2026-09-19',...(shipment?{shipping_confirmation:shipment}:{})}}:p));}} /><button style={{padding:12,marginTop:12,color:'#111',background:'#eee'}} onClick={()=>setProducts(initial as CrmCustomerProduct[])}>Reset sample</button><details><summary>Navigation preview</summary><CrmNavigation activeTab="tracking" onNavigate={()=>{}} onRefresh={()=>{}} onSignOut={()=>{}} busy={false}/></details></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
