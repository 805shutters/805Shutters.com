"use client";

import { CustomerEmailStatus } from "./CustomerEmailStatus";
import { trackingJobClosed, trackingPaymentSettled } from "@/lib/crm/job-closure";
import { useState } from "react";
import { Check, ChevronDown, FileText, Package, Wallet, LayoutGrid, ExternalLink } from "lucide-react";
import { JOB_TRACKING_STAGES, trackingSafeUrl, type JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import { jobContractPreviewUrl } from "@/lib/crm/job-contract-preview";
import { InlineJobContract } from "./InlineJobContract";
import type { JobRecordEditKind } from "./JobTrackingWorkspace";
import styles from "./JobRecordDetail.module.css";

const money = (n: number | null) => n === null ? "Not recorded" : n.toLocaleString("en-US", {style:"currency",currency:"USD"});
const date = (s: string | null | undefined) => s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "Not recorded";
function Link({url,children}:{url?:string|null;children:React.ReactNode}) { const href=trackingSafeUrl(url); return href ? <a href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={13}/></a> : null; }
const views = [{id:"overview",label:"Overview",Icon:LayoutGrid},{id:"contract",label:"Contract",Icon:FileText},{id:"vendor",label:"Vendor items",Icon:Package},{id:"payments",label:"Payments & adjustments",Icon:Wallet}] as const;

export function JobRecordDetail({item,disabled,onEdit,onFulfillment}:{item:JobTrackingViewItem;disabled:boolean;onEdit:(kind:JobRecordEditKind,paymentType?:"deposit"|"balance")=>void;onFulfillment:()=>void}) {
  const [view,setView]=useState<(typeof views)[number]["id"]>("overview");
  const stage=JOB_TRACKING_STAGES.find(s=>s.id===item.stageId)!;
  const canEdit=Boolean(item.row||(item.quote&&item.isSale));
  const canSend=canEdit&&item.isSale&&Boolean(item.email);
  const paymentSettled=trackingPaymentSettled(item);
  const financiallyClosed=trackingJobClosed(item);
  const net=(item.row?.creditOut||0)-(item.row?.creditIn||0);
  const adjusted=item.total===null?null:Math.round((item.total+net)*100)/100;
  const products=(item.file?.products||[]).filter(p=>p.quote_id ? p.quote_id===(item.quote?.id||item.row?.quoteId) : p.bookkeeping_entry_id ? item.row?.source!=="crm_quote"&&p.bookkeeping_entry_id===item.row?.id : false);
  const credits=[...(item.row?.creditsIn||[]).map(c=>({...c,direction:"Credit",sign:"−"})),...(item.row?.creditsOut||[]).map(c=>({...c,direction:c.note?.startsWith("Added charge:")?"Added charge":"Transfer / balance increase",sign:"+"}))].sort((a,b)=>(b.credit_date||b.created_at).localeCompare(a.credit_date||a.created_at));
  return <article className={styles.record} aria-label={`Job for ${item.customerName}`}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>CUSTOMER FILE · {item.project}</span><h2>{item.customerName}</h2><div className={styles.contact}><span>{item.phone||"Phone not recorded"}</span><button disabled={disabled} onClick={()=>onEdit("email")}>{item.email||"Add customer email"}</button></div></div>
      <div className={styles.status}>{financiallyClosed&&<span className={styles.complete}><Check size={15}/>Closed · Paid in full</span>}{paymentSettled&&!financiallyClosed&&<span>Active · Paid in full</span>}<button disabled={disabled} onClick={()=>onEdit("stage")}>{stage.label}<ChevronDown size={15}/></button><button disabled={disabled||!item.isSale} onClick={()=>onEdit("sold_date")}>{item.isSale?`Sold ${date(item.soldDate)}`:"Not sold"}</button></div>
    </header>
    <div className={styles.metrics}>
      <section><span>{net?"Adjusted total":"Sale total"}</span><strong>{money(adjusted)}</strong><small>{net?`Contract ${money(item.total)} · Net adjustments ${money(net)}`:"Original contract value"}</small></section>
      <section><span>Cost of goods</span><button className={styles.amount} disabled={disabled||!canEdit} onClick={()=>onEdit("cogs")}>{money(item.cogs)}</button><small>Press amount to edit vendor cost</small></section>
      <section><span>Deposit remaining</span><strong>{money(item.depositOutstanding)}</strong><small>Received {money(item.depositReceived)} / {money(item.depositRequired)}</small>{item.depositOutstanding===0&&<span className={styles.complete}><Check size={15}/>Deposit covered</span>}</section>
      <section><span>Total outstanding</span><strong>{money(item.balanceOutstanding)}</strong><small>Includes any unpaid deposit</small>{paymentSettled&&<span className={styles.complete}><Check size={15}/>Paid in full</span>}</section>
    </div>
    <div className={styles.actions}>
      <button className={styles.primary} disabled={disabled||!canEdit} onClick={()=>onEdit("payment",item.depositOutstanding&&item.depositOutstanding>0?"deposit":"balance")}>Record payment</button>
      <button disabled={disabled||!canEdit||item.balanceOutstanding===null} onClick={()=>onEdit("adjustment")}>Credit / Add charge</button>
      <button disabled={disabled||!canSend||!item.depositOutstanding||item.depositOutstanding<=0} onClick={()=>onEdit("square","deposit")}>Send deposit link <b>{money(item.depositOutstanding)}</b></button>
      <button disabled={disabled||!canSend||!item.squareBalanceOutstanding||item.squareBalanceOutstanding<=0} onClick={()=>onEdit("square","balance")}>Send balance link <b>{money(item.squareBalanceOutstanding)}</b></button>
    </div>
    {!canSend&&<p className={styles.hint}>{!canEdit?"A sold quote or bookkeeping sale is needed for payments.":!item.email?"Add a verified customer email to send payment links.":"Record the sale to enable payment links."}</p>}
    {item.job?.id && <CustomerEmailStatus jobId={item.job.id} />}
    <nav className={styles.views} aria-label="Customer file views">{views.map(({id,label,Icon})=><button key={id} aria-pressed={view===id} aria-controls="job-record-panel" onClick={()=>setView(id)}><Icon size={17}/>{label}</button>)}</nav>
    <section id="job-record-panel" className={styles.panel} aria-label={views.find(v=>v.id===view)!.label}>
      {view==="overview"&&<div className={styles.columns}>
        <section className={styles.box}><h3>Next action</h3><p className={styles.lead}>{item.nextAction}</p>{item.job?.next_action_due&&<p>Due {date(item.job.next_action_due)}</p>}{item.progress.blockers.map(b=><p key={b}>{b}</p>)}<button disabled={disabled} onClick={()=>onEdit("notes")}>Edit notes & next action</button><h3>Job notes</h3><p className={styles.notes}>{item.notes||"No notes recorded."}</p></section>
        <section className={styles.box}><h3>Job details</h3><dl><dt>Address</dt><dd>{item.address||"Not recorded"}</dd><dt>Contract</dt><dd className={item.signatureRecorded?styles.complete:undefined}>{item.signatureRecorded?<><Check size={15}/>Signature recorded · {date(item.signedAt)}</>:"No signature evidence"}</dd><dt>Technical measure</dt><dd>{item.measureStatus}</dd><dt>Installation</dt><dd>{item.progress.installation==="complete"?"Completion recorded":item.progress.installation==="partial"?"Partially installed":"Needs verification"}</dd></dl><div className={styles.inlineActions}><button onClick={()=>setView("contract")}>View contract</button><button disabled={disabled||!canEdit} onClick={()=>onEdit("install")}>Record installed</button></div><Link url={item.row?.installationInvoiceUrl}>Installation invoice</Link></section>
      </div>}
      {view==="overview"&&<details className={styles.corrections}><summary>Documents & source records</summary><div className={styles.documents}>{item.contracts.map(c=><Link key={c.id} url={c.contract_url||(c.share_token?`/quote/${encodeURIComponent(c.share_token)}`:null)}>{c.title}</Link>)}{item.installEmails.map(m=><Link key={m.id} url={m.email_url}>{m.subject||"Installation email"}</Link>)}</div><p>Job: {item.job?.id||item.row?.jobId||"—"}<br/>Quote: {item.quote?.id||item.row?.quoteId||"—"}<br/>Ledger: {item.row?.id||"—"}</p>{item.pendingQuotes.map(q=><p key={q.id}>Pending Quote · {q.quote_number||q.quote_label||q.id} · {money(q.quote_total)}</p>)}</details>}
      {view==="contract"&&<><div className={styles.panelHeading}><div><h3>Customer contract</h3><p>{item.signatureRecorded?`Signature recorded · ${date(item.signedAt)}`:"No signature evidence recorded"}</p></div><button disabled={disabled||(!item.quote&&!item.row)} onClick={()=>onEdit("contract")}>Record signed contract</button></div><InlineJobContract key={item.id} url={jobContractPreviewUrl(item)} customerName={item.customerName} onClose={()=>setView("overview")}/></>}
      {view==="vendor"&&<><div className={styles.panelHeading}><div><h3>{item.vendor||"Vendor / order"}</h3><p>{item.orderReference||"No order reference"} · {item.orderedAt?`Ordered ${date(item.orderedAt)}`:"Order date not recorded"}</p></div><div className={styles.inlineActions}><button disabled={disabled||!canEdit} onClick={()=>onEdit("order")}>Record order</button><button disabled={!item.progress.identity.quoteId||!item.progress.identity.jobId} onClick={onFulfillment}>Orders, receipts & visits</button></div></div>
        <div className={styles.products}>{products.length?products.map(p=><section className={styles.box} key={p.id}><h3>{p.room||"Room not recorded"}</h3><p className={styles.lead}>{p.product_type} · Qty {p.quantity}</p><p>{p.description}</p><dl><dt>Vendor</dt><dd>{p.supplier||"Not recorded"}</dd><dt>Size</dt><dd>{p.width||"—"} × {p.height||"—"}</dd><dt>Finish</dt><dd>{[p.material,p.fabric,p.color].filter(Boolean).join(" · ")||"Not recorded"}</dd></dl></section>):<p>No product records are directly linked to this order. Open the contract or Orders, receipts & visits for its line items.</p>}</div>
        <div className={styles.documents}><Link url={item.row?.manufacturerOrderUrl||item.quote?.manufacturer_order_url}>Vendor order</Link><Link url={item.row?.manufacturerDocumentUrl||item.quote?.manufacturer_document_url}>Vendor document</Link>{item.orderEmails.map(m=><Link key={m.id} url={m.email_url}>{m.subject||"Order email"}</Link>)}</div>
      </>}
      {view==="payments"&&<><div className={styles.panelHeading}><div><h3>Payments & adjustments</h3><p>Every payment, credit and added charge for this job.</p></div><button disabled={disabled||!canEdit||item.balanceOutstanding===null} onClick={()=>onEdit("adjustment")}>Credit / Add charge</button></div><div className={styles.columns}>
        <section className={styles.box}><h3>Payments received</h3>{item.row?.payments.length?<ul className={styles.history}>{item.row.payments.map(p=><li key={p.id}><div><strong>{p.payment_label}</strong><b>{money(p.amount)}</b></div><small>{date(p.paid_at)} · {p.payment_type.replaceAll("_"," ")}</small>{p.notes&&<p>{p.notes}</p>}</li>)}</ul>:<p>No payment entries available.</p>}</section>
        <section className={styles.box}><h3>Credits & added charges</h3>{credits.length?<ul className={styles.history}>{credits.map(c=><li key={`${c.direction}-${c.id}`}><div><strong>{c.direction}</strong><b>{c.sign}{money(c.amount)}</b></div><small>{date(c.credit_date)}</small><p>{c.note||"No note recorded"}</p></li>)}</ul>:<p>No adjustments recorded.</p>}</section>
      </div><details className={styles.corrections}><summary>Payment corrections</summary><div className={styles.inlineActions}>{([['deposit_required','Set required deposit'],['deposit_paid_target','Correct deposit received'],['balance_paid_target','Correct balance received'],['balance_due_target','Correct outstanding balance']] as const).map(([kind,label])=><button key={kind} disabled={disabled||!canEdit} onClick={()=>onEdit(kind)}>{label}</button>)}</div></details></>}
    </section>
  </article>;
}
