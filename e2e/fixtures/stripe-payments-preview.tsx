// Synthetic local fixture: all finance responses stay in this browser, without provider calls.
import React from 'react';
import {createRoot} from 'react-dom/client';
import type {Session} from '@supabase/supabase-js';
import {StripeFinanceWorkspace} from '../../src/components/crm/StripeFinanceWorkspace';
import '../../src/app/globals.css';
const flags=new URLSearchParams(location.search);
const data={account:'acct_LOCAL_PREVIEW',livemode:!flags.has('test'),canReview:!flags.has('staff'),truncated:false,requests:[{id:'request-local-deposit',purpose:'deposit',amount_cents:150000,status:'paid'},{id:'request-local-review',purpose:'balance',amount_cents:50000,status:'review',error:'Refund requires a reviewed ledger adjustment.'}],objects:[{id:'pi_local_example',kind:'payment',amount_cents:150000,fee_cents:4380,status:'succeeded',details:{}},{id:'po_local_example',kind:'payout',amount_cents:145620,status:'paid',details:{automatic:true,composition_complete:true}},{id:'re_local_example',kind:'refund',amount_cents:10000,status:'succeeded',details:{}}],events:[{id:'evt_local',processed_at:null}],sync:[{id:'sync',last_finished_at:'2026-11-20T18:00:00Z'}],bank_matches:[] as {payout_id:string}[],alerts:[{id:'alert-local-example',status:'queued'}]};
window.fetch=async(_url,init)=>{
 if(flags.has('load-error')&&!init?.method)return new Response(JSON.stringify({message:'Stripe evidence is unavailable. Please retry.'}),{status:503});
 if(init?.method==='POST'){
  const body=JSON.parse(String(init.body));
  if(flags.has('save-error'))return new Response(JSON.stringify({message:'Exact bank evidence did not match.'}),{status:409});
  if(body.action==='bank')data.bank_matches.push({payout_id:body.payoutId});
  if(body.action==='sync')data.events=[];
 }
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
createRoot(document.getElementById('root')!).render(<><div style={{padding:'10px',background:'#e5edf5',textAlign:'center'}}>Local preview · fictional records · no money moves</div><StripeFinanceWorkspace session={{access_token:'fixture'}as Session}/></>);
