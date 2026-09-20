import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import { OperationsReports } from '@/components/crm/OperationsReports';
import { SalesIntelligencePage } from '@/components/crm/SalesIntelligencePage';
import type { CrmDashboardData, CrmJob, CrmQuote } from '@/lib/crm/types';
const stamp = new Date().toISOString();
const jobs = ['Morgan Ellis','Jamie Rivera','Taylor Brooks','Avery Chen','Casey Reed','Jordan Bell'].map((name,i)=>({id:`demo-job-${i}`,customer_name:name,status:i<3?'sold':'quoted',created_at:stamp,updated_at:stamp,source:'crm',lead_source:i%2?'Referral':'Google Ads',sales_owner:i%2?'Jessica':'Mike',phone:'(805) 555-0100',city:'Camarillo',estimated_total:6800+i*345,product_interest:'Shutters',meta:{},next_action:i<3?'Schedule installation':'Follow up on quote',next_action_due:'2026-09-15'}) as CrmJob);
const quotes=jobs.map((job,i)=>({id:`demo-quote-${i}`,job_id:job.id,quote_number:`805-DEMO-${i+1}`,status:i<3?'sold':'sent',quote_total:6800+i*345,materials_cost:2200,deposit_required:3400,balance_due:3400,created_at:stamp,updated_at:stamp,sent_at:stamp,sold_at:i<3?stamp:null,signed_at:i<3?stamp:null,meta:{}}) as CrmQuote);
const data={asOf:stamp,jobs,quotes,bookkeepingRows:[],bookkeepingPayments:[],bookkeepingCredits:[],customerFiles:[],sourceHealth:[],ownedActions:[]} as unknown as CrmDashboardData;
function Preview(){const [page,setPage]=useState('reports');return <><nav style={{display:'flex',gap:12,padding:16,color:'#bbb'}}><button onClick={()=>setPage('reports')}>Operations reports preview</button><button onClick={()=>setPage('sales')}>Sales intelligence preview</button><span>Sample data · no CRM changes</span></nav>{page==='reports'?<OperationsReports data={data} activity={null}/>:<SalesIntelligencePage jobs={jobs} quotes={quotes} events={[]} rows={[]} onOpenCustomer={job=>alert(`Sample customer: ${job.customer_name}`)}/>}</>}
createRoot(document.getElementById('root')!).render(<Preview/>);
