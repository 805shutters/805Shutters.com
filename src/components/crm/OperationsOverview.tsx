"use client";

import { installationCost } from "@/lib/crm/installation-estimate";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Circle, FileText, LoaderCircle, Search } from "lucide-react";
import type { CrmDashboardData } from "@/lib/crm/types";
import { attentionDetail, buildOperationsItems, buildPerformanceMetrics, currency, formatOperationsDate, stepComplete, workflowLabels, workflowSteps, workflowSummary, type OperationsItem, type ProductProgress, type WorkflowStep } from "@/lib/crm/operations-overview";
import type { JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import { jobContractPreviewUrl } from "@/lib/crm/job-contract-preview";
import { type SaveJobCost } from "./InlineJobCost";
import { InlineJobContract } from "./InlineJobContract";
import { ProductOrderEditor, orderCostParent } from "./ProductOrderEditor";
import { productOrderCosts, orderCostKey, allocatedOrderCost, type ProductOrderInvoiceInput } from "@/lib/crm/product-order-cost";
import styles from "./OperationsOverview.module.css";

function displayDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }

type Props = { data: CrmDashboardData | null; busy: boolean; onOpen: (item: JobTrackingViewItem) => void; onStatus?: () => void; onSales?: () => void; onBookkeeping?: () => void };
export function CompletionMark({ done }: { done: boolean }) {
  return <span className={`${styles.mark} ${done ? styles.done : ""}`} role="img" aria-label={done ? "Complete" : "Not confirmed"}>{done ? <Check size={17} strokeWidth={3} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}</span>;
}
function Ring({ value }: { value: number | null }) {
  return <svg className={styles.ring} viewBox="0 0 48 48" role="img" aria-label={value === null ? "No quoted customers in this period" : `${value.toFixed(1)} percent closed`}><circle cx="24" cy="24" r="20" fill="none" stroke="var(--op-line)" strokeWidth="4" /><circle cx="24" cy="24" r="20" fill="none" stroke="var(--op-silver)" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray={`${value || 0} 100`} transform="rotate(-90 24 24)" /></svg>;
}
export function OperationsDashboard({ data, busy, onOpen, onStatus, onSales, onBookkeeping }: Props) {
  const [step, setStep] = useState<WorkflowStep>("ordered");
  const [metric, setMetric] = useState<"weekly" | "monthly" | "gross" | "cash" | null>(null);
  const items = useMemo(() => data ? buildOperationsItems(data) : [], [data]);
  const metrics = useMemo(() => data ? buildPerformanceMetrics(data) : null, [data]);
  if (!data || !metrics) return <section className={styles.workspace} role="status">{busy ? "Loading dashboard…" : "Dashboard records are unavailable. Refresh to try again."}</section>;
  const attention = items.filter(item => !item.archived && (["quote", "sold"].includes(step) || item.sold) && !stepComplete(item, step));
  const definitions = {
    weekly: "Customers first sent a quote this week who have a dated sale, divided by all customers first sent a quote this week. Each customer counts once; quote alternatives do not inflate the rate.",
    monthly: "Customers first sent a quote this month who have a dated sale, divided by all customers first sent a quote this month. Each customer counts once.",
    gross: "Signed contract value for this week, using the existing signed-sales report. Deposits and balance receipts are reported separately.",
    cash: "Recorded customer payments received this week, including deposits and balances, less recorded refunds. Credits and invoices are not cash receipts. This is not profit."
  };
  const cohort = metric === "weekly" || metric === "monthly" ? metrics[metric] : null;
  return <section className={styles.workspace} aria-labelledby="operations-dashboard-title" aria-busy={busy}>
    <header className={styles.heading}><div><h1 id="operations-dashboard-title">Dashboard</h1><p>Sales performance & workflow</p></div><span>{displayDate(metrics.today)}<small>Week to date · Los Angeles</small></span></header>
    {data.loadWarnings?.map(warning => <p className={styles.warning} role="status" key={warning}>{warning}</p>)}
    <div className={styles.metrics}>
      {(["weekly", "monthly"] as const).map(period => <button type="button" className={styles.metric} key={period} aria-expanded={metric === period} onClick={() => setMetric(metric === period ? null : period)}><span>{period === "weekly" ? "Weekly" : "Monthly"} close rate</span><div><strong>{metrics[period].percent === null ? "—" : `${metrics[period].percent!.toFixed(1)}%`}</strong><Ring value={metrics[period].percent} /></div><small>{metrics[period].sold} sold / {metrics[period].quoted} quoted customers</small><small>{displayDate(period === "weekly" ? metrics.weekStart : metrics.monthStart)} – {displayDate(metrics.today)}</small></button>)}
      <button type="button" className={styles.metric} aria-expanded={metric === "gross"} onClick={() => setMetric(metric === "gross" ? null : "gross")}><span>Weekly gross sales</span><div><strong>{metrics.grossCents === null ? "Unavailable" : currency(metrics.grossCents / 100)}</strong></div><small>Signed contract value</small><small>{displayDate(metrics.weekStart)} – {displayDate(metrics.today)}</small></button>
      <button type="button" className={styles.metric} aria-expanded={metric === "cash"} onClick={() => setMetric(metric === "cash" ? null : "cash")}><span>Weekly payments collected</span><div><strong>{currency(metrics.cashCents / 100)}</strong></div><small>Deposits + balances received</small><small>{displayDate(metrics.weekStart)} – {displayDate(metrics.today)}</small></button>
    </div>
    {metric && <section className={styles.explanation} aria-live="polite"><p>{definitions[metric]}</p>{cohort && <><p>{metrics.missingQuoteDates} quote records lack a valid sent date and cannot establish a cohort.</p>{cohort.customers.length ? <ul>{cohort.customers.map(person => <li key={person.id}>{person.name} · {person.sold ? "Sold" : "Sale pending"}</li>)}</ul> : <p>No dated quoted customers in this period.</p>}</>}{metric === "gross" && <button type="button" onClick={onSales}>Open signed sales history <ArrowRight size={14} /></button>}{metric === "cash" && <><p>{metrics.receipts.length} dated receipts · {metrics.missingPaymentDates} receipt records have missing, invalid, or future dates.</p><button type="button" onClick={onBookkeeping}>Open payment records <ArrowRight size={14} /></button></>}</section>}
    <div className={styles.sectionHeading}><h2>Workflow completion</h2><span>Select a step to see what needs attention</span></div>
    <div className={styles.stages}>{workflowSteps.map(id => { const value = workflowSummary(items, id); return <button key={id} type="button" aria-pressed={step === id} className={styles.stage} onClick={() => setStep(id)}><div><span>{workflowLabels[id]}</span><CompletionMark done={value.total > 0 && value.done === value.total && value.unknown === 0} /></div><strong>{value.done}<small> / {value.total}</small></strong><small>{value.unit}</small><span>{value.total ? `${Math.round(value.done / value.total * 100)}% complete` : "No records"}</span>{value.unknown > 0 && <small>{value.unknown} jobs need product details</small>}</button>; })}</div>
    <section className={styles.attention} aria-live="polite"><header><div><h2>Needs attention · {workflowLabels[step]}</h2><p>Review the customer record to complete the next step.</p></div><span>{attention.length} jobs</span></header>{attention.length ? attention.map(item => <div className={styles.attentionRow} key={item.source.id}><span className={styles.initials} aria-hidden="true">{item.source.customerName.split(" ").map(part => part[0]).slice(0, 2).join("")}</span><div><strong>{item.source.customerName}</strong><small>{attentionDetail(item, step)}</small></div><button type="button" onClick={() => onOpen(item.source)}>Review job <ArrowRight size={14} /></button></div>) : <p className={styles.empty}><CompletionMark done={true} /> No unfinished jobs in this step.</p>}</section>
    <footer className={styles.footer}><span>{items.filter(item => !item.archived && item.complete).length} jobs installed and paid</span><button type="button" onClick={onStatus}>Open job status <ArrowRight size={14} /></button></footer>
  </section>;
}

const statusColumns = ["Quote", "Sold", "Deposit", "Ordered", "Shipped", "Installed", "Balance paid"];

type WorkflowActionStep = WorkflowStep | "deposit";
export type WorkflowAction = (item: OperationsItem, step: WorkflowActionStep, product?: ProductProgress, invoice?: ProductOrderInvoiceInput) => Promise<string | void>;
function CompletionButton({ done, label, disabled, saving, onClick }: { done: boolean; label: string; disabled: boolean; saving?: boolean; onClick: () => void }) {
  return <button type="button" className={styles.completionButton} aria-label={label} title={label} aria-pressed={done} aria-busy={saving || undefined} disabled={disabled} onClick={onClick}>{saving ? <LoaderCircle className={styles.savingMark} size={24} aria-hidden="true" /> : <CompletionMark done={done} />}</button>;
}
export function ProductChecks({ item, step, disabled, pending, onAction }: { item: OperationsItem; step: "ordered" | "shipped"; disabled: boolean; pending: string | null; onAction: (item: OperationsItem, step: WorkflowActionStep, product?: ProductProgress) => void }) {
  const checks = item.products.length ? item.products : [item.wholeJob];
  return <div className={styles.productChecks}>{checks.map(product => <div className={styles.product} key={product.id}><CompletionButton done={product[step]} label={`${product[step] ? "Review" : "Mark"} ${product.wholeJob ? "whole job" : product.name} ${step} for ${item.source.customerName}`} disabled={disabled} saving={pending === `${item.source.id}:${step}:${product.id}`} onClick={() => onAction(item, step, product)} /><span className={product[step] ? styles.completeText : undefined}>{product.wholeJob ? "Whole job" : product.name}</span>{step === "ordered" ? <small>{productOrderCosts(orderCostParent(item)?.meta)[orderCostKey(product.records)] ? currency(productOrderCosts(orderCostParent(item)?.meta)[orderCostKey(product.records)].amount) : "Enter invoice"}</small> : <small aria-hidden="true" style={{visibility:"hidden"}}>Shipment</small>}</div>)}{item.products.length ? <small className={styles.productCount}>{`${checks.filter(product => product[step]).length} of ${checks.length} complete`}</small> : null}</div>;
}
export function JobStatusOverview({ data, busy, onOpen, onAction }: Props & { onAction: WorkflowAction; onSaveCost: SaveJobCost }) {
  const [orderEditor, setOrderEditor] = useState<{item:OperationsItem;product:ProductProgress} | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const contractButtons = useRef(new Map<string, HTMLButtonElement>());
  function closeContract() {
    if (contractId) contractButtons.current.get(contractId)?.focus();
    setContractId(null);
  }
  function toggleContract(itemId: string, trigger?: HTMLButtonElement) {
    if (trigger) contractButtons.current.set(itemId, trigger);
    setContractId(current => current === itemId ? null : itemId);
  }
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const lock = useRef(false);
  async function act(item: OperationsItem, step: WorkflowActionStep, product?: ProductProgress) {
    if (lock.current || busy) return;
    if (step === "ordered" && product) { setOrderEditor({item,product}); return; }
    setFeedbackId(item.source.id);
    lock.current = true; setPending(`${item.source.id}:${step}:${product?.id || ""}`); setError(""); setNotice("");
    try { const message = await onAction(item, step, product); if (message) setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Update failed. Refresh and try again."); }
    finally { lock.current = false; setPending(null); }
  }
  const disabled = busy || pending !== null;
  const mark = (item: OperationsItem, step: WorkflowActionStep) => {
    const done = step === "deposit" ? item.sold && item.source.depositOutstanding !== null && item.source.depositOutstanding <= 0.005 : stepComplete(item, step);
    const label = step === "deposit" ? "Deposit" : workflowLabels[step];
    return <CompletionButton done={done} label={`${done ? "Review" : step === "quote" ? "Open" : ["sold", "paid", "deposit"].includes(step) ? "Record" : "Mark"} ${label} for ${item.source.customerName}`} disabled={disabled} saving={pending === `${item.source.id}:${step}:`} onClick={() => void act(item, step)} />;
  };
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  useEffect(() => { const jobId = new URLSearchParams(window.location.search).get("jobId"); if (jobId) { setSearch(jobId); setFilter("all"); } }, []);
  const items = useMemo(() => data ? buildOperationsItems(data) : [], [data]);
  const visible = items.filter(item => {
    if (filter === "active" && (item.archived || (item.complete))) return false;
    if (filter === "completed" && !(item.complete)) return false;
    if ((filter === "ordered" || filter === "shipped") && (item.archived || !item.sold || stepComplete(item, filter))) return false;
    return !search || [item.source.id, item.source.job?.id, item.source.quote?.id, item.source.row?.jobId, item.source.customerName, item.source.project, item.source.phone, ...item.products.map(product => product.name)].join(" ").toLowerCase().includes(search.toLowerCase());
  });
  return <section className={styles.workspace} aria-labelledby="job-status-title" aria-busy={busy}>
    <header className={styles.heading}><div><h1 id="job-status-title">Job status</h1><p>Every customer. Every product. Every completed step.</p></div><span><CompletionMark done={true} /> Completed<small>Click a circle to update</small></span></header>
    <div className={styles.toolbar}><nav aria-label="Job status filters">{[["active", "Active"], ["all", "All jobs"], ["ordered", "Orders needed"], ["shipped", "Shipping"], ["completed", "Completed"]].map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</nav><label><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search jobs" placeholder="Search customers or products" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {data?.loadWarnings?.map(warning => <p className={styles.warning} key={warning}>{warning}</p>)}
    <div className={styles.jobList}>{visible.map(item => {
      const saleDate = formatOperationsDate(item.source.soldDate);
      const contactLine = `${item.source.phone || "Phone needed"} · ${item.source.email || "Email needed"}`;
      return <article className={styles.jobCard} key={item.source.id} aria-label={`Job status for ${item.source.customerName}`}>
      <header className={styles.jobHeader}>
        <div className={styles.jobHeaderContent}>
          <div className={styles.jobIdentity}>
            <button type="button" className={styles.customerLink} title={item.source.customerName} onClick={() => onOpen(item.source)}>{item.source.customerName}</button>
            <small title={item.source.project || "Project needed"}>{item.source.project || "Project needed"}</small>
            {item.source.progress.stage === "attention" && <small className={styles.attentionLine} title={`Needs review · ${item.source.progress.nextAction || "Next action needed"}`}>Needs review · {item.source.progress.nextAction || "Next action needed"}</small>}
          </div>
          <div className={styles.headerContact}>
            <span title={item.source.address || "Address needed"}>{item.source.address || "Address needed"}</span>
            <span title={contactLine}>{contactLine}</span>
          </div>
          <div className={styles.headerDate}>
            <span className={styles.headerLabel}>Sale date</span>
            <strong title={saleDate || "Sale date needed"}>{saleDate || "Sale date needed"}</strong>
          </div>
          <div className={styles.headerProducts}>
            <span className={styles.headerLabel}>Product quantities</span>
            <div className={styles.productPills}>{item.headerProducts.length ? item.headerProducts.map(product => <button type="button" className={styles.productPill} key={product.id} title={`${product.quantity} · ${product.name} · Open contract`} aria-label={`Open contract for ${item.source.customerName}: ${product.quantity} ${product.name}`} aria-expanded={contractId === item.source.id} aria-controls={`job-contract-${item.source.id}`} onClick={event => toggleContract(item.source.id, event.currentTarget)}><b>{product.quantity}</b><span>{product.name}</span></button>) : <button type="button" className={`${styles.productPill} ${styles.unknownPill}`} aria-label={`Review contract quantities for ${item.source.customerName}`} aria-expanded={contractId === item.source.id} aria-controls={`job-contract-${item.source.id}`} onClick={event => toggleContract(item.source.id, event.currentTarget)}>Review contract</button>}</div>
          </div>
          <div className={styles.jobLinks}><button type="button" className={styles.openLink} onClick={() => onOpen(item.source)}>Open job <ArrowRight size={13} /></button><button type="button" className={styles.openLink} aria-label={`Contract for ${item.source.customerName}`} aria-expanded={contractId === item.source.id} aria-controls={`job-contract-${item.source.id}`} onClick={event => toggleContract(item.source.id, event.currentTarget)}><FileText size={14} aria-hidden="true" />Contract</button></div>
        </div>
      </header>
      {feedbackId === item.source.id && (error || notice) && <p className={styles.rowFeedback} role={error ? "alert" : "status"}>{error || notice}</p>}
      <JobFinancialStrip item={item} />
      <table className={styles.statusTable}><caption className={styles.srOnly}>Job completion by product type for {item.source.customerName}.</caption><thead><tr>{statusColumns.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody><tr>
      <td data-label="Quote">{mark(item, "quote")}<small>{item.source.quote?.quote_number || (item.quote ? "Quote recorded" : "Not recorded")}</small></td>
      <td data-label="Sold">{mark(item, "sold")}</td>
      <td data-label="Deposit">{mark(item, "deposit")}<small>{item.source.depositRequired === null ? "—" : currency(item.source.depositRequired)}</small></td>
      <td data-label="Ordered"><ProductChecks item={item} step="ordered" disabled={disabled} pending={pending} onAction={act} /></td><td data-label="Shipped"><ProductChecks item={item} step="shipped" disabled={disabled} pending={pending} onAction={act} /></td>
      <td data-label="Installed">{mark(item, "installed")}<small>{item.installed ? "Complete" : "Not confirmed"}</small></td>
      <td data-label="Balance paid">{mark(item, "paid")}<small>{item.paid ? "Paid in full" : !item.sold ? "Not sold" : item.source.balanceOutstanding === null ? "Verify balance" : currency(item.source.balanceOutstanding)}</small></td>

      </tr></tbody></table>
      {contractId === item.source.id && <div className={styles.contractRow} id={`job-contract-${item.source.id}`}><InlineJobContract key={jobContractPreviewUrl(item.source)} url={jobContractPreviewUrl(item.source)} customerName={item.source.customerName} onClose={closeContract} /></div>}
    </article>;
    })}</div>
    {!visible.length && <p className={styles.empty} role="status">{busy ? "Loading jobs…" : !data ? "Job records are unavailable. Refresh to try again." : "No jobs match this view."}</p>}
    {orderEditor && <ProductOrderEditor orderEmails={data?.orderCogsEmails || []} item={orderEditor.item} product={orderEditor.product} onSave={onAction} onClose={()=>setOrderEditor(null)} />}
    <footer className={styles.footer}>{visible.length} jobs shown · Checks reflect recorded evidence</footer>
  </section>;
}

export function BackToStatus({ onClick }: { onClick: () => void }) { return <button className={styles.back} type="button" onClick={onClick}><ArrowLeft size={16} /> Back to job status</button>; }

export function JobFinancialStrip({item}:{item:OperationsItem}) {
  const source=item.source; const costs=productOrderCosts(orderCostParent(item)?.meta); const assigned=allocatedOrderCost(orderCostParent(item)?.meta);
  const cogs=source.cogs ?? (source.row || source.quote ? null : assigned);const installation=installationCost(source.row, source.quote); const install=installation.amount;
  const profit=source.total!==null && cogs!==null && install!==null ? source.total-cogs-install : null;
  const margin=source.total!==null && source.total>0 && cogs!==null ? (source.total-cogs)/source.total*100 : null;
  const values:[string,string,string?][]=[['Contract total',source.total===null?'—':currency(source.total)],['Deposit collected',source.depositReceived===null?'—':currency(source.depositReceived)],['Balance due',source.balanceOutstanding===null?'—':currency(source.balanceOutstanding)],['Cost of goods',cogs===null?'—':currency(cogs)],['Installation cost',install===null?'—':currency(install),installation.source==='invoice'?'MTS invoice':install===null?'Estimate needs details':'Estimate'],['Profit',profit===null?'—':currency(profit),'Before buyout'],['Margin',margin===null?'—':`${margin.toFixed(1)}%`,'Contract less COGS'],['10% buyout',source.total===null?'—':currency(source.total*.1),'Of contract total']];
  return <section aria-label={`Finances for ${source.customerName}`} className={styles.financialStrip}><div className={styles.financialMetrics}>{values.map(([label,value,note])=><div key={label}><span>{label}</span><strong className={label==='Profit'?styles.completeText:undefined}>{value}</strong>{note&&<small>{note}</small>}</div>)}</div>{installation.estimate && <details className={styles.unassignedCost}><summary>Installation estimate · View calculation</summary>{installation.estimate.lines.map(line=><div key={line.id}>{line.room} · {line.quantity} × {line.product} · {line.squareFeet===null?`${line.quantity} × $25`:`${line.squareFeet.toFixed(2)} sq ft × $4.50`}{line.trackFee>0?` + ${currency(line.trackFee)} track fee`:""} = {currency(line.amount)}</div>)}{installation.estimate.issues.map(issue=><div key={issue}>{issue}</div>)}<div>Replaced by the actual MTS invoice when received.</div></details>}{cogs!==null && cogs-assigned>.005 && <small className={styles.unassignedCost}>{currency(cogs-assigned)} existing COGS not yet assigned to products</small>}{Object.keys(costs).length>0 && <small className={styles.unassignedCost}>Product invoices: {currency(assigned)} · Profit = contract − COGS − installation cost</small>}</section>;
}
