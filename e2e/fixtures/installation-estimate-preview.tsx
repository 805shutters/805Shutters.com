import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JobFinancialStrip } from '@/components/crm/OperationsOverview';
import { installationEstimate } from '@/lib/crm/installation-estimate';
import type { OperationsItem } from '@/lib/crm/operations-overview';
import type { CrmQuote } from '@/lib/crm/types';
const quote = {id:'sample',meta:{},lineItems:[
 {id:'shutters',room:'Living room',quantity:2,width_in:48,height_in:60,selected_design_id:'s',designs:[{id:'s',product_id:'norman_shutters',details:{track_type:'bifold'}}]},
 {id:'shade',room:'Bedrooms',quantity:3,width_in:36,height_in:48,selected_design_id:'r',designs:[{id:'r',product_id:'roller',details:{}}]}
]} as unknown as CrmQuote;
function Preview(){
 const [invoice,setInvoice]=useState(false);
 const item={source:{id:'sample',customerName:'Sample customer',total:6000,cogs:2400,depositReceived:3000,balanceOutstanding:3000,quote,row:{installationInvoiceAmount:invoice?425:0,installationInvoiceDocumentId:invoice?'sample-invoice':null,installationMatchStatus:invoice?'matched':null,installationEstimate:installationEstimate(quote),meta:{}}}} as unknown as OperationsItem;
 return <main style={{maxWidth:1500,margin:'48px auto',fontFamily:'Arial,sans-serif',color:'#eff1ed'}}><p style={{color:'#aeb5b0'}}>LOCAL PREVIEW · SAMPLE DATA</p><article style={{border:'1px solid #414740',borderRadius:20,background:'#202321',overflow:'hidden'}}><header style={{padding:'24px'}}><h2>Sample customer</h2><span>2 tracked shutters · 3 roller shades</span></header><JobFinancialStrip item={item}/></article><button style={{marginTop:24,padding:16,borderRadius:12,background:'#76dcb1',border:0,fontWeight:600}} onClick={()=>setInvoice(!invoice)}>{invoice?'Show estimate':'Preview actual MTS invoice · $425.00'}</button></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
