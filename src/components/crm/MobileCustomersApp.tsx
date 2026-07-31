"use client";
import {FormEvent,useEffect,useState} from "react";
import {ArrowLeft,Loader2,MapPin,MessageSquare,Phone} from "lucide-react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {mobileMapTarget,mobilePhoneTarget,mobileSmsTarget,type MobileCustomerResult,type MobileCustomerScope} from "@/lib/crm/mobile-customers";

async function api(path:string,init?:RequestInit){
  const client=getSupabaseBrowserClient(); const {data}=await client!.auth.getSession();
  const response=await fetch(path,{...init,headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session?.access_token}`,...init?.headers}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body.message||"Request failed.");
  return body;
}
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const maskedPhone=(phone:string|null)=>phone?`•••-•••-${phone.replace(/\D/g,"").slice(-4)}`:"unavailable";
const maskedEmail=(email:string|null)=>{if(!email)return "unavailable";const [local,domain]=email.split("@");return `${local.slice(0,1)}•••@${domain||""}`};

export function MobileCustomersApp(){
  const [scope,setScope]=useState<MobileCustomerScope>("active"),[query,setQuery]=useState(""),[letter,setLetter]=useState(""),[rows,setRows]=useState<MobileCustomerResult[]>([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[action,setAction]=useState<{row:MobileCustomerResult;type:"deposit"|"balance";key:string}|null>(null);
  const [channel,setChannel]=useState<"text"|"email">("text"),[sending,setSending]=useState(false),[notice,setNotice]=useState("");
  useEffect(()=>{setRows([]);if(query.trim().length<2&&!letter){setLoading(false);return;} const controller=new AbortController();const timer=setTimeout(async()=>{setLoading(true);setError("");try{setRows((await api(`/api/crm/mobile/customers?q=${encodeURIComponent(query)}&letter=${letter}&scope=${scope}`,{signal:controller.signal})).results)}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Search failed.")}finally{if(!controller.signal.aborted)setLoading(false)}},250);return()=>{clearTimeout(timer);controller.abort()}},[query,letter,scope]);
  function beginSend(row:MobileCustomerResult,type:"deposit"|"balance"){setError("");setNotice("");setChannel(mobilePhoneTarget(row.phone)?"text":"email");setAction({row,type,key:crypto.randomUUID()})}
  async function send(e:FormEvent){e.preventDefault();if(!action)return;setSending(true);setError("");try{const result=await api("/api/crm/mobile/customers",{method:"POST",body:JSON.stringify({quoteId:action.row.quoteId,jobId:action.row.jobId,paymentType:action.type,channel,idempotencyKey:action.key})});if(result.deliveryState!=="accepted")throw new Error("Provider acceptance was not confirmed. Review the audit before retrying.");setNotice(`${action.type==="deposit"?"Deposit":"Balance"} link created; ${channel==="text"?"text":"email"} provider accepted the request${result.replayed?" (same request, not sent again)":""}. Delivery is not yet confirmed.`);setAction(null)}catch(e){setError(e instanceof Error?e.message:"Link could not be sent. Do not retry until the audit is reviewed.")}finally{setSending(false)}}
  return <main className="mobile-customer-payments">
    <header><a href="/crm/mobile" aria-label="Back to mobile app"><ArrowLeft/></a><div><small>805 SHUTTERS CRM</small><h1>Customer Info / Payments</h1></div></header>
    <div className="mobile-customer-scopes" role="group" aria-label="Job search scope"><button className={scope==="active"?"active":""} onClick={()=>setScope("active")}>Active Jobs</button><button className={scope==="archived"?"active":""} onClick={()=>setScope("archived")}>Archived Jobs</button></div>
    <label className="mobile-customer-search">Search customers<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, phone, email, or address" autoFocus/></label>
    <div className="mobile-customer-letter-index" role="group" aria-label="Browse customers by first or last name">{Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ").map(value=><button key={value} type="button" aria-pressed={letter===value} className={letter===value?"active":""} onClick={()=>setLetter(current=>current===value?"":value)}>{value}</button>)}</div>
    {loading&&<p role="status"><Loader2 className="spin"/> Searching…</p>}{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success">{notice}</p>}
    {!loading&&(query.length>=2||letter)&&!error&&!rows.length&&<p>No {scope} customer jobs matched {letter?`the letter ${letter}`:"this search"}.</p>}
    <section>{rows.map(row=>{const tel=mobilePhoneTarget(row.phone),sms=mobileSmsTarget(row.phone),map=mobileMapTarget(row.address);return <article key={row.id}>
      <h2>{row.name}</h2>
      <div className="mobile-customer-contact-actions">
        {tel?<a href={tel} aria-label={`Call ${row.name} at ${row.phone}`}><Phone/> <span>{row.phone}</span></a>:<span aria-disabled="true">Phone unavailable</span>}
        {sms?<a href={sms} aria-label={`Text ${row.name} at ${row.phone}`}><MessageSquare/> <span>Text</span></a>:<span aria-disabled="true">Text unavailable</span>}
      </div>
      {map?<a href={map} target="_blank" rel="noreferrer" aria-label={`Open directions to ${row.address}`}><MapPin/> {row.address}</a>:<span>Address unavailable</span>}
      <dl><div><dt>Deposit</dt><dd>{money(row.deposit)}</dd><button disabled={!row.quoteId||row.deposit<=0} onClick={()=>beginSend(row,"deposit")}>Send deposit link</button></div><div><dt>Balance</dt><dd>{money(row.balance)}</dd><button disabled={!row.quoteId||row.balance<=0} onClick={()=>beginSend(row,"balance")}>Send balance link</button></div><div><dt>Contract total</dt><dd>{money(row.contractTotal)}</dd></div></dl>
    </article>})}</section>
    {action&&<div className="mobile-payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title"><form onSubmit={send}><h2 id="payment-title">Send {action.type} link</h2><p><strong>{action.row.name}</strong> · {money(action.type==="deposit"?action.row.deposit:action.row.balance)} · Order record ••••{action.row.quoteId?.slice(-4)}</p><p>Choose exactly one delivery channel:</p><div><button type="button" className={channel==="text"?"active":""} disabled={!mobilePhoneTarget(action.row.phone)} onClick={()=>setChannel("text")}>Text {maskedPhone(action.row.phone)}</button><button type="button" className={channel==="email"?"active":""} disabled={!action.row.email} onClick={()=>setChannel("email")}>Email {maskedEmail(action.row.email)}</button></div><p>Review: create one Square payment link and request one {channel==="text"?"text":"email"} to the selected destination. Provider acceptance does not mean delivery.</p><button disabled={sending||channel==="text"&&!mobilePhoneTarget(action.row.phone)||channel==="email"&&!action.row.email}>{sending?"Sending once…":`Confirm and send by ${channel}`}</button><button type="button" disabled={sending} onClick={()=>setAction(null)}>Cancel</button></form></div>}
  </main>
}
