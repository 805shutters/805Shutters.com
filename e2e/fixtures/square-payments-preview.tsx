// Local-only visual fixture; all payments are synthetic and no provider is called.
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { SquareFinanceWorkspace } from '../../src/components/crm/SquareFinanceWorkspace';
import { CrmNavigation } from '../../src/components/crm/CrmNavigation';
import '../../src/app/globals.css';
import '../../src/components/crm/crm-platinum.css';
const names = ['Alex Sample', 'Jordan Example', 'Morgan Preview', 'Taylor Demo'];
const data = {
  environment: 'sandbox', canReview: true,
  objects: names.map((_, i) => ({id:`test-payment-${i}`,kind:'payment',status:i===3?'FAILED':'COMPLETED',occurred_at:new Date(Date.now()-i*3600000).toISOString(),amount_cents:[210377,358442,76500,31550][i],fee_cents:i===3?null:6100,details:{}})),
  allocations:names.map((_,i)=>({id:`a${i}`,square_payment_id:`test-payment-${i}`,ledger_payment_id:`credit-${i}`,amount_cents:[210377,358442,76500,0][i],evidence:'Synthetic fixture'})),
  payments:names.map((_,i)=>({id:`credit-${i}`,quote_id:`q${i}`,amount:0})), quotes:names.map((name,i)=>({id:`q${i}`,customer_name:name,quote_total:0,meta:{}})),
  bankMatches:[],classifications:[],events:[],requests:[],credits:[],entries:[],alerts:[],smsConfigured:false,
  sync:{history_from:'2020-01-01T00:00:00Z',last_finished_at:new Date().toISOString(),state:{}},
  totals:{completedGrossCents:645319,assignedGrossCents:645319,knownFeeCents:18300,feesPending:0,completedRefundCents:0,pendingCount:0},webhook:{configured:false,url:null},
};
window.fetch = async () => new Response(JSON.stringify(data),{status:200});
createRoot(document.getElementById('root')!).render(<div className="crm-platinum-shell"><CrmNavigation activeTab="square" onNavigate={()=>{}} onRefresh={()=>{}} onSignOut={()=>{}} busy={false}/><main className="crm-platinum-main"><div className="crm-platinum-topbar">Workspace / Square Payments · Local preview</div><div className="crm-platinum-content"><SquareFinanceWorkspace session={{access_token:'fixture'} as Session}/></div></main></div>);
