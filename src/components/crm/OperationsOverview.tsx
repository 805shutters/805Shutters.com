"use client";

import { ProductShipmentEditor } from "./ProductShipmentEditor";
import { isOpenJob, type ActiveJobsSnapshot } from "@/lib/crm/active-jobs";
import { shipmentDateLabel, type ShipmentEvidence } from "@/lib/crm/shipment-evidence";
import { installationCost } from "@/lib/crm/installation-estimate";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Circle, FileText, LoaderCircle, Search, Trash2 } from "lucide-react";
import { canDeleteCustomerFile } from "@/lib/crm/customer-file-deletion";
import type { CrmCustomerFile, CrmDashboardData } from "@/lib/crm/types";
import { performancePeriods, type PerformancePeriod, attentionDetail, buildOperationsItems, buildPerformanceMetrics, currency, formatOperationsDate, stepComplete, workflowLabels, workflowSteps, workflowSummary, type OperationsItem, type ProductProgress, type WorkflowStep } from "@/lib/crm/operations-overview";
import type { JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import { jobContractPreviewUrl } from "@/lib/crm/job-contract-preview";
import { type SaveJobCost } from "./InlineJobCost";
import { InlineJobContract } from "./InlineJobContract";
import { ProductOrderEditor, orderCostParent, orderCostTotal } from "./ProductOrderEditor";
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
  const [period, setPeriod] = useState<PerformancePeriod>("weekly");
  const [step, setStep] = useState<WorkflowStep>("ordered");
  const [metric, setMetric] = useState<"close" | "quoted" | "gross" | "cash" | null>(null);
  const items = useMemo(() => data ? buildOperationsItems(data) : [], [data]);
  const metrics = useMemo(() => data ? buildPerformanceMetrics(data) : null, [data]);
  if (!data || !metrics) return <section className={styles.workspace} role="status">{busy ? "Loading dashboard…" : "Dashboard records are unavailable. Refresh to try again."}</section>;
  const attention = items.filter(item => !item.archived && (["quote", "sold"].includes(step) || item.sold) && !stepComplete(item, step));
  const selected = metrics.periods[period];
  const selectedPeriod = performancePeriods.find(option => option.id === period)!;
  const dateRange = `${displayDate(selected.start)} – ${displayDate(selected.end)}`;
  const definitions = {
    close: "Customers first sent a quote in this period who have a dated sale, divided by all customers first sent a quote in this period. Each customer counts once; quote alternatives do not inflate the rate.",
    quoted: "Unique customers first sent a quote in this period. Repeat quotes and quote alternatives count once per customer.",
    gross: "Signed contract value in the selected period, using the existing signed-sales report. Deposits and balance receipts are reported separately.",
    cash: "Recorded customer payments received in the selected period, including deposits and balances, less recorded refunds. Credits and invoices are not cash receipts. This is not profit."
  };
  const cohort = metric === "close" || metric === "quoted" ? selected.cohort : null;
  return <section className={styles.workspace} aria-label="Dashboard" aria-busy={busy}>
    <header className={styles.heading}><div><p>Sales performance & workflow</p></div><span>{displayDate(metrics.today)}<small>{selectedPeriod.description} · Los Angeles</small></span></header>
    {data.loadWarnings?.map(warning => <p className={styles.warning} role="status" key={warning}>{warning}</p>)}
    <div className={styles.periodToolbar}>
      <div className={styles.periodTabs} role="tablist" aria-label="Dashboard time period">{performancePeriods.map((option, index) => <button type="button" role="tab" id={`period-${option.id}`} aria-controls="dashboard-period-metrics" aria-selected={period === option.id} tabIndex={period === option.id ? 0 : -1} key={option.id} onClick={() => setPeriod(option.id)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % performancePeriods.length : event.key === "ArrowLeft" ? (index + performancePeriods.length - 1) % performancePeriods.length : event.key === "Home" ? 0 : event.key === "End" ? performancePeriods.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); setPeriod(performancePeriods[next].id);
        document.getElementById(`period-${performancePeriods[next].id}`)?.focus();
      }}>{option.label}</button>)}</div>
      <span>{dateRange}</span>
    </div>
    <div id="dashboard-period-metrics" role="tabpanel" aria-labelledby={`period-${period}`} aria-live="polite">
    <div className={styles.metrics}>
      <button type="button" className={styles.metric} aria-expanded={metric === "close"} onClick={() => setMetric(metric === "close" ? null : "close")}><span>Close rate</span><div><strong>{selected.cohort.percent === null ? "—" : `${selected.cohort.percent.toFixed(1)}%`}</strong><Ring value={selected.cohort.percent} /></div><small>{selected.cohort.sold} sold / {selected.cohort.quoted} quoted customers</small><small>{dateRange}</small></button>
      <button type="button" className={styles.metric} aria-expanded={metric === "quoted"} onClick={() => setMetric(metric === "quoted" ? null : "quoted")}><span>Quoted customers</span><div><strong>{selected.cohort.quoted}</strong></div><small>Unique customers first quoted</small><small>{dateRange}</small></button>
      <button type="button" className={styles.metric} aria-expanded={metric === "gross"} onClick={() => setMetric(metric === "gross" ? null : "gross")}><span>Gross sales</span><div><strong>{selected.grossCents === null ? "Unavailable" : currency(selected.grossCents / 100)}</strong></div><small>Signed contract value</small><small>{dateRange}</small></button>
      <button type="button" className={styles.metric} aria-expanded={metric === "cash"} onClick={() => setMetric(metric === "cash" ? null : "cash")}><span>Payments collected</span><div><strong>{currency(selected.cashCents / 100)}</strong></div><small>Deposits + balances, less refunds</small><small>{dateRange}</small></button>
    </div>
    {metric && <section className={styles.explanation}><p>{definitions[metric]}</p>{cohort && <><p>{metrics.missingQuoteDates} quote records lack a valid sent date and cannot establish a cohort.</p>{cohort.customers.length ? <ul>{cohort.customers.map(person => <li key={person.id}>{person.name} · {person.sold ? "Sold" : "Sale pending"}</li>)}</ul> : <p>No dated quoted customers in this period.</p>}</>}{metric === "gross" && <>{selected.grossCents === null ? <p>Signed sales history is unavailable.</p> : selected.sales.length ? <ul>{selected.sales.map(sale => <li key={sale.id}>{sale.customerName} · {sale.reference} · {currency(sale.amountCents / 100)}</li>)}</ul> : <p>No signed sales in this period.</p>}<button type="button" onClick={onSales}>Open signed sales history <ArrowRight size={14} /></button></>}{metric === "cash" && <><p>{selected.receipts.length} dated receipts in this period · {metrics.missingPaymentDates} receipt records have missing, invalid, or future dates.</p><button type="button" onClick={onBookkeeping}>Open payment records <ArrowRight size={14} /></button></>}</section>}
    </div>
    <div className={styles.sectionHeading}><h2>Workflow completion</h2><span>Select a step to see what needs attention</span></div>
    <div className={styles.stages}>{workflowSteps.map(id => { const value = workflowSummary(items, id); return <button key={id} type="button" aria-pressed={step === id} className={styles.stage} onClick={() => setStep(id)}><div><span>{workflowLabels[id]}</span><CompletionMark done={value.total > 0 && value.done === value.total && value.unknown === 0} /></div><strong>{value.done}<small> / {value.total}</small></strong><small>{value.unit}</small><span>{value.total ? `${Math.round(value.done / value.total * 100)}% complete` : "No records"}</span>{value.unknown > 0 && <small>{value.unknown} jobs need product details</small>}</button>; })}</div>
    <section className={styles.attention} aria-live="polite"><header><div><h2>Needs attention · {workflowLabels[step]}</h2><p>Review the customer record to complete the next step.</p></div><span>{attention.length} jobs</span></header>{attention.length ? attention.map(item => <div className={styles.attentionRow} key={item.source.id}><span className={styles.initials} aria-hidden="true">{item.source.customerName.split(" ").map(part => part[0]).slice(0, 2).join("")}</span><div><strong>{item.source.customerName}</strong><small>{attentionDetail(item, step)}</small></div><button type="button" onClick={() => onOpen(item.source)}>Review job <ArrowRight size={14} /></button></div>) : <p className={styles.empty}><CompletionMark done={true} /> No unfinished jobs in this step.</p>}</section>
    <footer className={styles.footer}><span>{items.filter(item => !item.archived && item.complete).length} jobs installed and paid</span><button type="button" onClick={onStatus}>Open job status <ArrowRight size={14} /></button></footer>
  </section>;
}

const statusColumns = ["Quote", "Sold", "Deposit", "Ordered", "Shipped", "Installed", "Balance paid"];

type WorkflowActionStep = WorkflowStep | "deposit";
export type WorkflowAction = (item: OperationsItem, step: WorkflowActionStep, product?: ProductProgress, invoice?: ProductOrderInvoiceInput, shipment?: ShipmentEvidence) => Promise<string | void>;
function CompletionButton({ done, label, disabled, saving, onClick }: { done: boolean; label: string; disabled: boolean; saving?: boolean; onClick: () => void }) {
  return <button type="button" className={styles.completionButton} aria-label={label} title={label} aria-pressed={done} aria-busy={saving || undefined} disabled={disabled} onClick={onClick}>{saving ? <LoaderCircle className={styles.savingMark} size={24} aria-hidden="true" /> : <CompletionMark done={done} />}</button>;
}
export function ProductChecks({ item, step, disabled, pending, onAction }: { item: OperationsItem; step: "ordered" | "shipped"; disabled: boolean; pending: string | null; onAction: (item: OperationsItem, step: WorkflowActionStep, product?: ProductProgress) => void }) {
  const checks = item.products.length ? item.products : [item.wholeJob];
  return <div className={styles.productChecks}>{checks.map(product => <div className={styles.product} key={product.id} style={{minHeight: 140 + Math.max(0, new Set((product.shipments || []).map(shipment => shipment.shippedOn)).size - 1) * 36 + ((product.shipments?.length && (!product.shipped || product.undatedShipments)) ? 32 : 0)}}><CompletionButton done={product[step]} label={`${product[step] ? "Review" : "Mark"} ${product.wholeJob ? "whole job" : [product.name, product.manufacturer].filter(Boolean).join(" · ")} ${step} for ${item.source.customerName}`} disabled={disabled} saving={pending === `${item.source.id}:${step}:${product.id}`} onClick={() => onAction(item, step, product)} /><span title={product.name} className={product[step] ? styles.completeText : undefined}>{product.wholeJob ? "Whole job" : product.name}</span><small title={product.manufacturer || "Manufacturer not recorded"} className={styles.productManufacturer}>{product.wholeJob ? "" : product.manufacturer || "Manufacturer not recorded"}</small>{step === "ordered" ? <small>{productOrderCosts(orderCostParent(item)?.meta)[orderCostKey(product.records)] ? currency(productOrderCosts(orderCostParent(item)?.meta)[orderCostKey(product.records)].amount) : "Enter invoice"}</small> : <ShipmentDates product={product} />}</div>)}{item.products.length ? <small className={styles.productCount}>{`${checks.filter(product => product[step]).length} of ${checks.length} complete`}</small> : null}</div>;
}
export function ShipmentDates({ product }: { product: ProductProgress }) {
  const dates = [...new Set((product.shipments || []).map(shipment => shipment.shippedOn))].sort();
  return <small className={styles.shipmentDates}>{dates.map(date => <time key={date} dateTime={date}>Shipped {shipmentDateLabel(date)}</time>)}{dates.length > 0 && (product.undatedShipments || 0) > 0 ? "Some ship dates unconfirmed" : product.shipped && !dates.length ? "Ship date unconfirmed" : !product.shipped ? dates.length ? "Partially shipped" : "Awaiting shipment" : null}</small>;
}
export function JobStatusOverview({ data, activeSnapshot, onLoadAll, onDeleteFileId, busy, onOpen, onAction, onDelete }: Props & { activeSnapshot?: ActiveJobsSnapshot | null; onLoadAll?: () => Promise<unknown>; onDeleteFileId?: (id: string) => Promise<void>; onAction: WorkflowAction; onSaveCost: SaveJobCost; onDelete?: (file: CrmCustomerFile) => Promise<void> }) {
  const [shipmentEditor, setShipmentEditor] = useState<{item:OperationsItem;product:ProductProgress} | null>(null);
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
    if (step === "shipped" && product && product.records.every(record => /^[a-f\d-]{36}$/i.test(record.id))) { setShipmentEditor({item,product}); return; }
    setFeedbackId(item.source.id);
    lock.current = true; setPending(`${item.source.id}:${step}:${product?.id || ""}`); setError(""); setNotice("");
    try { const message = await onAction(item, step, product); if (message) setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Update failed. Refresh and try again."); }
    finally { lock.current = false; setPending(null); }
  }
  const [loadingAll, setLoadingAll] = useState(false);
  const disabled = busy || pending !== null || loadingAll;
  const mark = (item: OperationsItem, step: WorkflowActionStep) => {
    const done = step === "deposit" ? item.sold && item.source.depositOutstanding !== null && item.source.depositOutstanding <= 0.005 : stepComplete(item, step);
    const label = step === "deposit" ? "Deposit" : workflowLabels[step];
    return <CompletionButton done={done} label={`${done ? "Review" : step === "quote" ? "Open" : ["sold", "paid", "deposit"].includes(step) ? "Record" : "Mark"} ${label} for ${item.source.customerName}`} disabled={disabled} saving={pending === `${item.source.id}:${step}:`} onClick={() => void act(item, step)} />;
  };
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  useEffect(() => { const jobId = new URLSearchParams(window.location.search).get("jobId"); if (jobId) { setSearch(jobId); setFilter("all"); } }, []);
  const items = useMemo(() => data ? buildOperationsItems(data) : activeSnapshot?.items || [], [data, activeSnapshot]);
  async function selectFilter(next: string) {
    if (loadingAll) return;
    if (next !== "active" && !data && onLoadAll) {
      setLoadingAll(true); setError(""); setFeedbackId(null);
      try { await onLoadAll(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Jobs could not be loaded. Try again."); return; }
      finally { setLoadingAll(false); }
    }
    setFilter(next);
  }
  const visible = items.filter(item => {
    if (filter === "active" && !isOpenJob(item)) return false;
    if (filter === "closed" && !item.closed) return false;
    if (filter === "completed" && !(item.complete)) return false;
    if ((filter === "ordered" || filter === "shipped") && (item.archived || !item.sold || stepComplete(item, filter))) return false;
    return !search || [item.source.id, item.source.job?.id, item.source.quote?.id, item.source.row?.jobId, item.source.customerName, item.source.project, item.source.phone, ...item.products.map(product => product.name)].join(" ").toLowerCase().includes(search.toLowerCase());
  });
  return <section className={styles.workspace} aria-labelledby="job-status-title" aria-busy={busy}>
    <header className={styles.heading}><div><h1 id="job-status-title">Job status</h1><p>Every customer. Every product. Every completed step.</p></div><span><CompletionMark done={true} /> Completed<small>Click a circle to update</small></span></header>
    <div className={styles.toolbar}><nav aria-label="Job status filters">{[["active", "Active"], ["all", "All jobs"], ["ordered", "Orders needed"], ["shipped", "Shipping"], ["closed", "Closed"], ["completed", "Completed"]].map(([id, label]) => <button type="button" key={id} disabled={loadingAll} aria-pressed={filter === id} onClick={() => void selectFilter(id)}>{label}</button>)}</nav><label><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search jobs" placeholder="Search customers or products" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {loadingAll && <p role="status">Loading all jobs…</p>}
    {error && !feedbackId && <p role="alert" className={styles.warning}>{error}</p>}
    {(data?.loadWarnings || activeSnapshot?.loadWarnings)?.map(warning => <p className={styles.warning} key={warning}>{warning}</p>)}
    <div className={styles.jobList}>{visible.map(item => {
      const saleDate = formatOperationsDate(item.source.soldDate);
      const contactLine = `${item.source.phone || "Phone needed"} · ${item.source.email || "Email needed"}`;
      return <article className={styles.jobCard} key={item.source.id} aria-label={`Job status for ${item.source.customerName}`}>
      <header className={styles.jobHeader}>
        <div className={styles.jobHeaderContent}>
          <div className={styles.jobIdentity}>
            <button type="button" className={styles.customerLink} title={item.source.customerName} onClick={() => onOpen(item.source)}>{item.source.customerName}</button>
            <small title={item.source.project || "Project needed"}>{item.source.project || "Project needed"}</small>
            {item.closed && <small className={styles.completeText}>Closed · Paid in full</small>}
            {!item.closed && item.paid && <small>Active · Paid in full</small>}
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
      {onDelete && item.source.file && !item.sold && canDeleteCustomerFile(item.source.file) && <div className={styles.cardActions}><button type="button" className={styles.deleteFile} aria-label={`Delete customer file for ${item.source.customerName}`} title="Delete customer file" disabled={disabled} onClick={() => onDelete(item.source.file!)}><Trash2 size={17} strokeWidth={1.7} aria-hidden="true" /></button></div>}
      {!data && onDeleteFileId && activeSnapshot?.deletableFiles[item.source.id] && <div className={styles.cardActions}><button type="button" className={styles.deleteFile} aria-label={`Delete customer file for ${item.source.customerName}`} title="Delete customer file" disabled={disabled} onClick={() => { void onDeleteFileId(activeSnapshot.deletableFiles[item.source.id]).catch(cause => { setFeedbackId(null); setError(cause instanceof Error ? cause.message : "Customer file could not be loaded."); }); }}><Trash2 size={17} strokeWidth={1.7} aria-hidden="true" /></button></div>}
    </article>;
    })}</div>
    {!visible.length && <p className={styles.empty} role="status">{busy ? "Loading jobs…" : !data && !activeSnapshot ? "Job records are unavailable. Refresh to try again." : "No jobs match this view."}</p>}
    {shipmentEditor && <ProductShipmentEditor item={shipmentEditor.item} product={shipmentEditor.product} onSave={onAction} onClose={() => setShipmentEditor(null)} />}
    {orderEditor && <ProductOrderEditor orderEmails={data?.orderCogsEmails || orderEditor.item.source.orderEmails} item={orderEditor.item} product={orderEditor.product} onSave={onAction} onClose={()=>setOrderEditor(null)} />}
    <footer className={styles.footer}>{visible.length} jobs shown · Checks reflect recorded evidence</footer>
  </section>;
}

export function BackToStatus({ onClick }: { onClick: () => void }) { return <button className={styles.back} type="button" onClick={onClick}><ArrowLeft size={16} /> Back to job status</button>; }

export function JobFinancialStrip({item}:{item:OperationsItem}) {
  const source=item.source;
  const cogs=orderCostTotal(item) ?? (source.row || source.quote ? null : allocatedOrderCost(orderCostParent(item)?.meta));const installation=installationCost(source.row, source.quote); const install=installation.amount;
  const profit=source.total!==null && cogs!==null && install!==null ? source.total-cogs-install : null;
  const margin=source.total!==null && source.total>0 && cogs!==null ? (source.total-cogs)/source.total*100 : null;
  const values:[string,string,string?][]=[['Contract total',source.total===null?'—':currency(source.total)],['Deposit collected',source.depositReceived===null?'—':currency(source.depositReceived)],['Balance due',source.balanceOutstanding===null?'—':currency(source.balanceOutstanding)],['Cost of goods',cogs===null?'—':currency(cogs)],['Installation cost',install===null?'—':currency(install),installation.source==='invoice'?'MTS invoice':install===null?'Estimate needs details':'Estimate'],['Profit',profit===null?'—':currency(profit),'Before buyout'],['Margin',margin===null?'—':`${margin.toFixed(1)}%`,'Contract less COGS'],['10% buyout',source.total===null?'—':currency(source.total*.1),'Of contract total']];
  return <section aria-label={`Finances for ${source.customerName}`} className={styles.financialStrip}><div className={styles.financialMetrics}>{values.map(([label,value,note])=><div key={label}><span>{label}</span><strong className={label==='Profit'?styles.completeText:undefined}>{value}</strong>{note&&<small>{note}</small>}</div>)}</div></section>;
}
