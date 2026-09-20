import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JobStatusOverview } from '@/components/crm/OperationsOverview';
import { orderCostKey, productOrderCosts, nextProductCogs, allocatedOrderCost } from '@/lib/crm/product-order-cost';
import type { CrmDashboardData } from '@/lib/crm/types';

const at='2026-09-19T12:00:00Z';
const initialProducts=[['Shutters','Norman'],['Roller Shades','Onyx'],['Roller Shades','Norman']].map(([name,supplier],index)=>({id:`${index+1}1111111-1111-4111-8111-111111111111`,quote_id:'q1',job_id:'j1',bookkeeping_entry_id:null,product_type:name,supplier,status:index<2?'ordered':'pending',quantity:2,updated_at:at,meta:index===0?{shipped_at:at}:{}}));
const initialCosts=Object.fromEntries(initialProducts.slice(0,2).map((p,index)=>[p.id,{amount:index===0?1080.28:700,reference:'SAMPLE',emailId:null,records:[p.id],at,by:'preview',requestId:p.id}]));
function Preview(){
 const [products,setProducts]=useState(initialProducts);
 const [costs,setCosts]=useState(initialCosts);
 const [total,setTotal]=useState(1780.28);
 const data={jobs:[],quotes:[{id:'q1',job_id:'j1',customer_name:'Sample customer',quote_number:'805-DEMO',created_at:at,updated_at:at,status:'sold',sold_at:at,quote_total:6000,deposit_paid:3000,materials_cost:total,meta:{product_order_costs:costs}}],bookkeepingRows:[],customerFiles:[],customerProducts:products,orderCogsEmails:[],installationInvoiceEmails:[],bookkeepingPayments:[]} as unknown as CrmDashboardData;
 return <main style={{maxWidth:1500,margin:'24px auto',padding:16,fontFamily:'Arial,sans-serif'}}><p>LOCAL PREVIEW · SAMPLE DATA</p><JobStatusOverview data={data} busy={false} onOpen={()=>{}} onSaveCost={async()=>true} onAction={async(_,step,product,invoice,shipment)=>{
   if(!product)return;
   if(step==='ordered'&&invoice){const key=orderCostKey(product.records);setTotal(nextProductCogs(total,productOrderCosts({product_order_costs:costs})[key]?.amount,invoice.amount,invoice.includedInCogs,allocatedOrderCost({product_order_costs:costs})));setCosts({...costs,[key]:{...invoice,emailId:null,records:product.records.map(r=>r.id),at,by:'preview'}});}
   setProducts(old=>old.map(p=>product.records.some(r=>r.id===p.id)?{...p,meta:{...p.meta,[`${step}_at`]:at,...(shipment?{shipping_confirmation:shipment}:{})}}:p));
 }} /><button style={{padding:12,marginTop:12,color:'#111',background:'#eee'}} onClick={()=>{setProducts(initialProducts);setCosts(initialCosts);setTotal(1780.28);}}>Reset sample</button></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
