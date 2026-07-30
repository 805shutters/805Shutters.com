"use client";
import {FormEvent,useEffect,useState} from "react";
import {ArrowLeft,Loader2,MapPin,Phone} from "lucide-react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {mobileMapTarget,mobilePhoneTarget,type MobileCustomerResult,type MobileCustomerScope} from "@/lib/crm/mobile-customers";

async function api(path:string,init?:RequestInit){
  const client=getSupabaseBrowserClient(); const {data}=await client!.auth.getSession();
  const response=await fetch(path,{...init,headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session?.access_token}`,...init?.headers}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body.message||"Request failed.");
  return body;
}
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);

export function MobileCustomersApp(){
  const [scope,setScope]=useState<MobileCustomerScope>("active"),[query,setQuery]=useState(""),[letter,setLetter]=useState(""),[rows,setRows]=useState<MobileCustomerResult[]>([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[action,setAction]=useState<{row:MobileCustomerResult;type:"deposit"|"balance";key:string}|null>(null);
  const [channel,setChannel]=useState<"text"|"email">("text"),[sending,setSending]=useState(false),[notice,setNotice]=useState("");
  useEffect(()=>{if(query.trim().length<2&&!letter){setRows([]);return;} const timer=setTimeout(async()=>{setLoading(true);setError("");try{setRows((await api(`/api/crm/mobile/customers?q=${encodeURIComponent(query)}&letter=${letter}&scope=${scope}`)).results)}catch(e){setError(e instanceof Error?e.message:"Search failed.")}finally{setLoading(false)}},250);return()=>clearTimeout(timer)},[query,letter,scope]);
  async function send(e:FormEvent){e.preventDefault();if(!action)return;setSending(true);setError("");try{await api("/api/crm/mobile/customers",{method:"POST",body:JSON.stringify({quoteId:action.row.quoteId,jobId:action.row.jobId,paymentType:action.type,channel,idempotencyKey:action.key})});setNotice(`${action.type==="deposit"?"Deposit":"Balance"} link sent by ${channel==="text"?"text":"email"}.`);setAction(null)}catch(e){setError(e instanceof Error?e.message:"Link could not be sent.")}finally{setSending(false)}}
  return <main className="mobile-customer-payments">
    <header><a href="/crm/mobile" aria-label="Back to mobile app"><ArrowLeft/></a><div><small>805 SHUTTERS CRM</small><h1>Customer Info / Payments</h1></div></header>
    <div className="mobile-customer-scopes" role="group" aria-label="Job search scope"><button className={scope==="active"?"active":""} onClick={()=>setScope("active")}>Active Jobs</button><button className={scope==="archived"?"active":""} onClick={()=>setScope("archived")}>Archived Jobs</button></div>
    <label className="mobile-customer-search">Search customers<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, phone, email, or address" autoFocus/></label>
    <div className="mobile-customer-letter-index" role="group" aria-label="Browse customers by first or last name">{Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ").map(value=><button key={value} type="button" aria-pressed={letter===value} className={letter===value?"active":""} onClick={()=>setLetter(current=>current===value?"":value)}>{value}</button>)}</div>
    {loading&&<p role="status"><Loader2 className="spin"/> Searching…</p>}{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success">{notice}</p>}
    {!loading&&(query.length>=2||letter)&&!error&&!rows.length&&<p>No {scope} customer jobs matched {letter?`the letter ${letter}`:"this search"}.</p>}
    <section>{rows.map(row=>{const tel=mobilePhoneTarget(row.phone),map=mobileMapTarget(row.address);return <article key={row.id}>
      <h2>{row.name}</h2>
      {tel?<a href={tel} aria-label={`Call ${row.name} at ${row.phone}`}><Phone/> {row.phone}</a>:<span>Phone unavailable</span>}
      {map?<a href={map} target="_blank" rel="noreferrer" aria-label={`Open directions to ${row.address}`}><MapPin/> {row.address}</a>:<span>Address unavailable</span>}
      <dl><div><dt>Deposit</dt><dd>{money(row.deposit)}</dd><button disabled={!row.quoteId||row.deposit<=0} onClick={()=>setAction({row,type:"deposit",key:crypto.randomUUID()})}>Send deposit link</button></div><div><dt>Balance</dt><dd>{money(row.balance)}</dd><button disabled={!row.quoteId||row.balance<=0} onClick={()=>setAction({row,type:"balance",key:crypto.randomUUID()})}>Send balance link</button></div><div><dt>Contract total</dt><dd>{money(row.contractTotal)}</dd></div></dl>
    </article>})}</section>
    {action&&<div className="mobile-payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title"><form onSubmit={send}><h2 id="payment-title">Send {action.type} link</h2><p>{action.row.name} · {money(action.type==="deposit"?action.row.deposit:action.row.balance)}</p><div><button type="button" className={channel==="text"?"active":""} disabled={!mobilePhoneTarget(action.row.phone)} onClick={()=>setChannel("text")}>Text {action.row.phone||"(missing)"}</button><button type="button" className={channel==="email"?"active":""} disabled={!action.row.email} onClick={()=>setChannel("email")}>Email {action.row.email||"(missing)"}</button></div><p>Confirm sending this Square payment link to the exact contact shown above.</p><button disabled={sending}>{sending?"Sending…":"Confirm and send"}</button><button type="button" onClick={()=>setAction(null)}>Cancel</button></form></div>}
  </main>
}
