import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Toaster} from 'sonner';
import {setMeasurementDatabase} from './measurement-client';
import {SendQuoteDialog} from '../../src/mts-quote/components/crm/quote-builder/SendQuoteDialog';
import '../../src/app/globals.css';
import '../../src/mts-quote/mts-quote.css';
const mode=new URLSearchParams(location.search).get('mode')||'sent';
setMeasurementDatabase({auth:{getSession:async()=>({data:{session:{access_token:'local-fixture'}}})}});
const requests:object[]=[];
window.fetch=async (_url,options)=>{
 if(options?.method==='POST'){
  requests.push(JSON.parse(String(options.body)));
  document.getElementById('requests')!.textContent=JSON.stringify(requests,null,2);
  return new Response(JSON.stringify(mode==='failure'?{email:{sent:false,error:'Provider rejected recipient'}}:mode==='replay'?{email:{sent:false,alreadySent:true}}:{email:{sent:true}}));
 }
 return new Response(JSON.stringify({enabled:true,native:true,supportsResend:true,canSend:mode!=='uncertain',reservation:{requestKey:'fixture-previous-request',state:mode==='pending'?'pending':mode==='uncertain'?'uncertain':'sent',request:{email:['customer@example.invalid','additional@example.invalid'],sms:[],note:'Here is your quote.',measureDecision:null}}}));
};
function Fixture(){const[open,setOpen]=useState(true);return <QueryClientProvider client={new QueryClient()}><main style={{padding:24}}><h1>Local quote resend verification — no emails sent</h1><button onClick={()=>setOpen(true)}>Open send dialog</button><pre id="requests" aria-label="Fixture requests"/><SendQuoteDialog open={open} onClose={()=>setOpen(false)} quote={{id:'fixture',quote_number:'TEST-RESEND',customer_name:'Synthetic Customer',customer_email:'customer@example.invalid',quote_v2_backend:true,quote_v2_revision:1,status:'sent',share_token:'fixture'} as any}/><Toaster/></main></QueryClientProvider>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
