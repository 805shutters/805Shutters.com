"use client";
import {FulfillmentWorkspace,type FulfillmentChange} from "./FulfillmentWorkspace";
import {emptyFulfillment,type FulfillmentData,type FulfillmentScope} from "@/lib/crm/fulfillment";
import {OwnedActionsWorkspace} from "./OwnedActionsWorkspace";
import type {OwnedAction,OwnedActionChange} from "@/lib/crm/owned-actions";
import type { IntegrationHealth } from "@/lib/crm/integration-health";
import type { InstallerOutcomeEvidence, ProgressSourceHealth } from "@/lib/crm/job-progress";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, Check, ChevronDown, ChevronRight, ExternalLink, Search, X } from "lucide-react";
import type { CrmBookkeepingRow, CrmCustomerFile, CrmInstallationInvoiceEmail, CrmJob, CrmOrderCogsEmail, CrmQuote } from "@/lib/crm/types";
import { buildJobTrackingView, filterJobTrackingView, JOB_TRACKING_STAGES, trackingSafeUrl, type JobTrackingFilter, type JobTrackingSavePatch, type JobTrackingStageId, type JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import styles from "./JobTrackingWorkspace.module.css";

export type { JobTrackingSavePatch, JobTrackingStageId, JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
export type JobTrackingWorkspaceProps = {
  fulfillment?: FulfillmentData; events?: import("@/lib/crm/types").CrmCalendarEvent[]; onLoadFulfillmentScope?: (id:string)=>Promise<FulfillmentScope>; onSaveFulfillment?: (c:FulfillmentChange)=>Promise<void>;
  ownedActions?: OwnedAction[]; onSaveOwnedAction?: (c:OwnedActionChange)=>Promise<void>;
  integrationHealth?: IntegrationHealth[];
  installerOutcomes?: InstallerOutcomeEvidence[]; sourceHealth?: ProgressSourceHealth[]; asOf?: string;
  jobs: CrmJob[]; quotes: CrmQuote[]; rows: CrmBookkeepingRow[]; files: CrmCustomerFile[];
  orderCogsEmails: CrmOrderCogsEmail[]; installationInvoiceEmails: CrmInstallationInvoiceEmail[]; busy: boolean; warnings?: string[];
  onSave: (item: JobTrackingViewItem, patch: JobTrackingSavePatch) => Promise<boolean>;
  onStage: (item: JobTrackingViewItem, stage: JobTrackingStageId, managerException?:string) => Promise<boolean>;
  onSendSquare: (item: JobTrackingViewItem, paymentType: "deposit" | "balance") => Promise<{ amount: number; recipient: string; url: string; warning?: string | null }>;
  onOpenCustomer: (name: string) => void; onPullInstallInvoices: () => void;
};
type EditKind = "cogs" | "deposit_required" | "deposit_paid_target" | "balance_paid_target" | "balance_due_target" | "sold_date" | "order" | "install" | "notes" | "email" | "contract" | "stage" | "payment" | "square";
type Editor = { item: JobTrackingViewItem; kind: EditKind; paymentType?: "deposit" | "balance"; paymentRequestId?: string };
const labels: Record<EditKind, string> = { cogs: "Record COGS", deposit_required: "Set required deposit", deposit_paid_target: "Correct deposit received", balance_paid_target: "Correct balance received", balance_due_target: "Adjust outstanding balance", sold_date: "Record sold date", order: "Record vendor order", install: "Record completed installation", notes: "Notes & next action", email: "Update customer email", contract: "Record existing signed contract", stage: "Change job stage", payment: "Record payment", square: "Send Square payment link" };
const money = (amount: number | null) => amount === null ? "Not recorded" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const date = (value: string | null | undefined) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not recorded";
const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateInput = (value: string | null) => value?.slice(0, 10) || "";
const financialSource = (item: JobTrackingViewItem) => Boolean(item.row || (item.quote && item.isSale));
function financialPatch(item: JobTrackingViewItem, patch: Record<string, unknown>): JobTrackingSavePatch { return item.row ? { row: patch } : { quote: patch }; }

function SafeLink({ url, children }: { url?: string | null; children: React.ReactNode }) {
  const href = trackingSafeUrl(url);
  return href ? <a className={styles.documentLink} href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={12} aria-hidden="true" /></a> : null;
}

export function JobTrackingWorkspace(props: JobTrackingWorkspaceProps) {
  const [fulfillmentItem,setFulfillmentItem] = useState<JobTrackingViewItem|null>(null);
  const items = useMemo(() => buildJobTrackingView(props), [props.jobs, props.quotes, props.rows, props.files, props.orderCogsEmails, props.installationInvoiceEmails, props.installerOutcomes, props.sourceHealth, props.ownedActions,props.fulfillment]);
  const [filter, setFilter] = useState<JobTrackingFilter>("active");
  const [search, setSearch] = useState("");
  useEffect(()=>{const id=new URLSearchParams(window.location.search).get("jobId");if(id){setSearch(id);setFilter("all");}},[]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [running, setRunning] = useState(false);
  const submitting = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [squareUrl, setSquareUrl] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState("");
  const visible = useMemo(() => filterJobTrackingView(items, filter, search), [items, filter, search]);
  const active = items.filter((item) => !["complete", "lost", "archived"].includes(item.stageId));
  const openBalance = active.reduce((sum, item) => sum + (item.isSale ? Math.max(0, item.balanceOutstanding || 0) : 0), 0);
  const counts = new Map(JOB_TRACKING_STAGES.map((stage) => [stage.id, items.filter((item) => item.stageId === stage.id).length]));
  const disabled = running || props.busy;
  const open = (item: JobTrackingViewItem, kind: EditKind, paymentType?: "deposit" | "balance") => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setError(""); setNotice(""); setSquareUrl(null); setActionWarning(""); setEditor({ item, kind, paymentType, ...(kind === "payment" ? { paymentRequestId: crypto.randomUUID() } : {}) }); };
  const close = () => { if (!submitting.current) { setEditor(null); setError(""); } };
  const toggle = (id: string) => setExpanded((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || submitting.current || props.busy) return;
    const { item, kind } = editor;
    const values = new FormData(event.currentTarget);
    const value = (name: string) => String(values.get(name) || "").trim();
    submitting.current = true; setRunning(true); setError("");
    try {
      let ok = true;
      if (kind === "stage") {
        const stage = value("stage") as JobTrackingStageId;
        if (stage === "attention") throw new Error("Needs Attention is calculated from evidence. Choose a recorded stage instead.");
        if (!JOB_TRACKING_STAGES.some((candidate) => candidate.id === stage)) throw new Error("Choose a valid stage.");
        ok = await props.onStage(item, stage, value("manager_exception")||undefined);
      } else if (kind === "square") {
        const paymentType = editor.paymentType || "deposit";
        const latest = items.find((candidate) => candidate.id === item.id);
        const expectedAmount = paymentType === "deposit" ? item.depositOutstanding : item.squareBalanceOutstanding;
        const currentAmount = paymentType === "deposit" ? latest?.depositOutstanding : latest?.squareBalanceOutstanding;
        if (!latest || latest.email !== item.email || currentAmount !== expectedAmount) throw new Error("This customer's payment details changed. Close and review the latest amount before sending.");
        const sent = await props.onSendSquare(item, paymentType);
        setNotice(`Square ${paymentType} link sent to ${sent.recipient} for ${money(sent.amount)}.`);
        setSquareUrl(trackingSafeUrl(sent.url));
        setActionWarning(sent.warning || "");
      } else {
        let patch: JobTrackingSavePatch;
        if (kind === "contract") {
          const signedDate = value("signed_date");
          const url = value("contract_url");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(signedDate) || !values.has("confirm_contract")) throw new Error("Confirm that you reviewed the actual signed contract and enter its signing date.");
          if (url && (!/^https?:\/\//i.test(url) || !trackingSafeUrl(url))) throw new Error("Use an http or https signed-document URL.");
          const signedAt = `${signedDate}T12:00:00Z`;
          patch = item.quote ? { quote: { signed_at: signedAt, meta: { job_tracking_contract: { signed_at: signedAt, url: url || null, evidence_attested: true } } } } : { row: { contract_signed_at: signedAt, contract_url: url || null } };
        } else if (kind === "install") {
          const installedDate = value("installed_date");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(installedDate)) throw new Error("Enter the actual completed installation date.");
          patch = financialPatch(item, { installed_at: `${installedDate}T12:00:00Z` });
        } else if (kind === "sold_date") {
          const soldDate = value("sold_date");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(soldDate)) throw new Error("Enter the actual sold date.");
          patch = item.row ? { row: { sold_date: soldDate } } : item.quote ? { quote: { sold_at: `${soldDate}T12:00:00Z` } } : { job: { sold_at: `${soldDate}T12:00:00Z` } };
        } else if (kind === "order") {
          const orderPatch = { manufacturer_name: value("vendor"), manufacturer_order_ref: value("reference"), manufacturer_order_url: value("url"), ...(value("ordered_at") ? { ordered_at: `${value("ordered_at")}T12:00:00Z` } : {}) };
          if (orderPatch.manufacturer_order_url && !trackingSafeUrl(orderPatch.manufacturer_order_url)) throw new Error("Use an http or https order URL.");
          patch = financialPatch(item, orderPatch);
        } else if (kind === "email") {
          const email = value("email");
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid, verified customer email.");
          patch = item.row && item.row.source !== "crm_quote" ? { row: { customer_email: email } } : item.quote ? { quote: { customer_email: email } } : { job: { email } };
        } else if (kind === "notes") {
          patch = item.row ? { row: { [item.row.source === "crm_quote" ? "bookkeeping_notes" : "notes"]: value("notes") } } : item.quote ? { quote: { notes: value("notes") } } : { job: { notes: value("notes") } };
          if (item.job) patch.job = { ...patch.job, next_action: value("next_action"), next_action_due: value("next_action_due") || null };
        } else {
          const amountText = value("amount");
          const amount = Number(amountText);
          if (!amountText || !Number.isFinite(amount) || amount < 0 || (kind === "payment" && amount <= 0)) throw new Error("Enter a valid amount; zero is different from a blank field.");
          if (kind === "payment") {
            if (!value("paid_at")) throw new Error("Enter the date the payment was received.");
            patch = financialPatch(item, { payment_amount: amount, payment_label: value("payment_label") === "deposit" ? "Deposit payment" : "Balance payment", payment_type: value("payment_type"), paid_at: value("paid_at"), payment_notes: value("note"), payment_request_id: editor.paymentRequestId });
          } else {
            const key = kind === "cogs" ? item.row && item.row.source !== "crm_quote" ? "cogs_amount" : "materials_cost" : kind;
            if (["balance_due_target", "deposit_paid_target", "balance_paid_target"].includes(kind) && !value("note")) throw new Error("Add a reason so the ledger correction is clear.");
            patch = financialPatch(item, { [key]: amount, ...(["balance_due_target", "deposit_paid_target", "balance_paid_target"].includes(kind) ? { balance_adjustment_note: value("note"), payment_notes: value("note") } : {}) });
          }
        }
        ok = await props.onSave(item, { ...patch, message: `${labels[kind]} saved.` });
      }
      if (!ok) throw new Error("The change could not be saved. Your entry is still here; check the error and try again.");
      if (kind !== "square") setNotice(`${labels[kind]} saved for ${item.customerName}.`);
      setEditor(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The change could not be saved. Please try again."); }
    finally { submitting.current = false; setRunning(false); }
  }

  const amountValue = editor ? ({ cogs: editor.item.cogs, deposit_required: editor.item.depositRequired, deposit_paid_target: editor.item.depositReceived, balance_paid_target: editor.item.balanceReceived, balance_due_target: editor.item.balanceOutstanding, payment: editor.paymentType === "balance" ? editor.item.balanceOutstanding : editor.item.depositOutstanding } as Partial<Record<EditKind, number | null>>)[editor.kind] : null;

  return <section className={styles.workspace} aria-labelledby="job-tracking-heading" aria-busy={props.busy}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>805 / Operations</span><h2 id="job-tracking-heading">Job tracking</h2><p>Every job. Every stage. One working record.</p></div>
      <button type="button" className={styles.secondary} onClick={props.onPullInstallInvoices} disabled={disabled}>Pull install invoices</button>
    </header>
    <div className={styles.summary}>
      <div><span>All order / opportunity records</span><strong>{items.length}</strong></div><div><span>Active order / opportunity records</span><strong>{active.length}</strong></div><div><span>Active order balances</span><strong>{money(openBalance)}</strong></div><div><span>Sold date missing</span><strong>{items.filter((item) => item.isSale && !item.soldDate).length}</strong></div>
    </div>
    <nav className={styles.filters} aria-label="Filter jobs by status">
      {[{ id: "active" as const, label: "All Active", count: active.length }, ...JOB_TRACKING_STAGES.filter((stage) => !["complete", "lost", "archived"].includes(stage.id)).map((stage) => ({ ...stage, count: counts.get(stage.id) || 0 })), { id: "archive" as const, label: "Archive", count: items.length - active.length }].map((stage) => <button key={stage.id} type="button" aria-pressed={filter === stage.id} onClick={() => setFilter(stage.id)} className={`${styles.filter} ${filter === stage.id ? styles.selected : ""}`}><span>{stage.label}</span><span className={styles.count}>{stage.count}</span></button>)}
    </nav>
    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={17} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, phone, quote, vendor or order…" aria-label="Search job tracking" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={16} /></button>}</label>
      <div className={styles.sort}><ArrowDown size={14} aria-hidden="true" /> Sold newest → oldest <span>· {visible.length} shown</span></div>
    </div>
    {notice && <div role="status" className={styles.success}><Check size={16} aria-hidden="true" /><span>{notice}</span>{squareUrl && <SafeLink url={squareUrl}>Open generated link</SafeLink>}</div>}
    {actionWarning && <p role="status" className={styles.warning}>{actionWarning}</p>}
    {props.warnings?.map((warning, index) => <p key={`${index}:${warning}`} role="status" className={styles.warning}>{warning}</p>)}
    {props.asOf && <p role="status">Snapshot: {new Date(props.asOf).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} Pacific · Source load time; importer freshness is separate.</p>}
    {props.busy && <p role="status" className={styles.loading}>Refreshing job records…</p>}
    {props.onSaveOwnedAction && <OwnedActionsWorkspace items={items} actions={props.ownedActions || []} busy={disabled} onSave={props.onSaveOwnedAction} onFocus={item=>{setFilter(item.progress.active ? "active" : "archive");setSearch(item.quote?.quote_number || item.customerName);setExpanded(new Set([item.id]));}}/>}
    {fulfillmentItem && props.onLoadFulfillmentScope && props.onSaveFulfillment && <FulfillmentWorkspace item={fulfillmentItem} data={props.fulfillment||emptyFulfillment} events={props.events||[]} reports={props.installerOutcomes||[]} actions={props.ownedActions||[]} onClose={()=>setFulfillmentItem(null)} onScope={props.onLoadFulfillmentScope} onSave={props.onSaveFulfillment}/>}
    <div className={styles.tableShell} tabIndex={0} role="region" aria-label="Job tracking table; scroll horizontally for all columns">
      <table className={styles.table}>
        <caption className={styles.srOnly}>All job records, sorted by actual sold date newest to oldest. Missing sold dates follow dated sales. Customer and column headings stay visible as you scroll.</caption>
        <thead><tr><th scope="col">Customer / job</th><th scope="col">Sold date ↓</th><th scope="col">Stage</th><th scope="col">Contract</th><th scope="col">Sale total</th><th scope="col">Deposit</th><th scope="col">Balance</th><th scope="col">COGS</th><th scope="col">Vendor / order</th><th scope="col">Measure</th><th scope="col">Install</th><th scope="col">Notes / next action</th><th scope="col">Payment actions</th></tr></thead>
        <tbody>
          {visible.map((item) => {
            const stage = JOB_TRACKING_STAGES.find((candidate) => candidate.id === item.stageId)!;
            const assigned = (props.ownedActions || []).filter(a => ["open","blocked"].includes(a.status) && (a.quote_id ? a.quote_id === item.progress.identity.quoteId : a.bookkeeping_entry_id ? a.bookkeeping_entry_id === item.progress.identity.bookkeepingId : Boolean(a.job_id) && a.job_id === item.progress.identity.jobId));
            const canEditMoney = financialSource(item);
            const paymentReason = canEditMoney ? "" : "A sold quote or bookkeeping sale is required.";
            const squareReason = !item.quote && !item.row ? "A sold quote or bookkeeping sale is required." : !item.isSale ? "Record the sale first." : !item.email ? "Add a verified customer email to this sale first." : "";
            return <Fragment key={item.id}>
              <tr>
                <th scope="row"><div className={styles.customer}><button type="button" className={styles.expand} onClick={() => toggle(item.id)} aria-label={`${expanded.has(item.id) ? "Hide" : "Show"} details for ${item.customerName}`} aria-expanded={expanded.has(item.id)} aria-controls={`tracking-detail-${item.id.replace(/[^\w-]/g, "-")}`}>{expanded.has(item.id) ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button><div><button type="button" className={styles.customerName} onClick={() => props.onOpenCustomer(item.customerName)}>{item.customerName}</button><span>{item.project}</span><small>{item.phone || "Phone not recorded"}</small>{(item.row || item.quote || item.job) && <button type="button" className={styles.contactButton} onClick={() => open(item, "email")} disabled={disabled} aria-label={`Edit customer email for ${item.customerName}`}>{item.email || "Add customer email"}</button>}</div></div></th>
                <td><button type="button" className={`${styles.valueButton} ${!item.soldDate ? styles.missing : ""}`} disabled={disabled || !item.isSale} onClick={() => open(item, "sold_date")} aria-label={`Edit sold date for ${item.customerName}`}>{item.soldDate ? date(item.soldDate) : item.isSale ? "Date needed" : "Not sold"}</button>{item.soldDate && <small>Sold</small>}</td>
                <td><button type="button" className={styles.stage} style={{ "--stage-color": stage.color } as CSSProperties} disabled={disabled} onClick={() => open(item, "stage")} aria-label={`Change stage for ${item.customerName}; currently ${stage.label}`}><span className={styles.dot} />{stage.label}<ChevronDown size={13} /></button><small>{item.nextAction}</small>{item.progress.recordedStage && <small>Recorded: {item.progress.recordedStage}</small>}{item.progress.conflicts.map((conflict) => <small key={conflict} className={styles.due}>{conflict}</small>)}</td>
                <td><span className={item.signatureRecorded ? styles.good : styles.muted}>{item.signatureRecorded ? "Signature recorded" : "Not signed / no evidence"}</span>{item.signedAt && <small>{date(item.signedAt)}</small>}{item.contractUrl ? <SafeLink url={item.contractUrl}>View contract</SafeLink> : <small>No contract link</small>}<button type="button" className={styles.textButton} disabled={disabled || (!item.quote && !item.row)} title={item.quote || item.row ? "Record an existing customer-signed contract" : "Link a quote or sale record first."} onClick={() => open(item, "contract")} aria-label={`Record signed contract for ${item.customerName}`}>Record signed contract</button></td>
                <td><strong className={styles.money}>{money(item.total)}</strong><small>{item.isSale ? "Sale value" : "Estimate / unsold"}</small></td>
                <td><button className={styles.valueButton} type="button" disabled={disabled || !canEditMoney} title={paymentReason || "Set required deposit"} onClick={() => open(item, "deposit_required")} aria-label={`Edit required deposit for ${item.customerName}`}><span className={styles.fieldLabel}>Required</span>{money(item.depositRequired)}</button><button className={styles.valueButton} type="button" disabled={disabled || !canEditMoney} onClick={() => open(item, "deposit_paid_target")} aria-label={`Correct deposit received for ${item.customerName}`}><span className={styles.fieldLabel}>Received</span>{money(item.depositReceived)}</button><span className={item.depositOutstanding === 0 ? styles.good : styles.due}>{item.depositOutstanding === null ? "Due not recorded" : item.depositOutstanding === 0 ? "Deposit covered" : `${money(item.depositOutstanding)} due`}</span></td>
                <td><button className={styles.valueButton} type="button" disabled={disabled || !canEditMoney} onClick={() => open(item, "balance_due_target")} aria-label={`Adjust outstanding balance for ${item.customerName}`}><span className={styles.fieldLabel}>Outstanding</span>{money(item.balanceOutstanding)}</button><button className={styles.valueButton} type="button" disabled={disabled || !canEditMoney} onClick={() => open(item, "balance_paid_target")} aria-label={`Correct balance received for ${item.customerName}`}><span className={styles.fieldLabel}>Received</span>{money(item.balanceReceived)}</button>{item.isSale && item.balanceOutstanding === 0 && <span className={styles.good}>Paid in full</span>}</td>
                <td><button type="button" className={styles.valueButton} disabled={disabled || !canEditMoney} title={paymentReason || "Record material cost"} onClick={() => open(item, "cogs")} aria-label={`Record COGS for ${item.customerName}`}>{money(item.cogs)}</button><small>Material / vendor cost</small></td>
                <td><strong>{item.vendor || "Vendor not recorded"}</strong><span>{item.orderReference || "No order reference"}</span><small>{item.orderedAt ? `Ordered ${date(item.orderedAt)}` : "Order date not recorded"}</small><button type="button" className={styles.textButton} disabled={disabled || !canEditMoney} onClick={() => open(item, "order")}>Record order</button><button type="button" disabled={!item.progress.identity.quoteId||!item.progress.identity.jobId} onClick={()=>setFulfillmentItem(item)}>Orders, receipts & visits</button><SafeLink url={item.row?.manufacturerOrderUrl || item.quote?.manufacturer_order_url}>Order link</SafeLink></td>
                <td><span className={item.measureStatus === "Needed" ? styles.due : styles.muted}>{item.measureStatus}</span><small>{item.job?.appointment_start && !item.isSale ? `Consult ${date(item.job.appointment_start)}` : "Technical measure"}</small></td>
                <td><span>{item.progress.installation === "partial" ? "Partial / incomplete" : item.progress.installation === "complete" ? "Completion recorded" : "Needs verification"}</span>{item.row && item.row.installationInvoiceAmount > 0 && <small>Installer {money(item.row.installationInvoiceAmount)}</small>}<SafeLink url={item.row?.installationInvoiceUrl}>Install invoice</SafeLink><button type="button" className={styles.textButton} disabled={disabled || !canEditMoney} onClick={() => open(item, "install")} aria-label={`Record completed installation for ${item.customerName}`}>Record installed</button></td>
                <td><span className={styles.notePreview}>{item.nextAction}</span>{assigned.length ? assigned.map(a => <small key={a.id}>{a.title} · {a.owner || "Unassigned"}{a.due_on ? ` · Due ${date(a.due_on)}` : " · Due date unknown"}</small>) : <small>Owner: unassigned legacy action</small>}{item.progress.blockers.map((blocker) => <small key={blocker} className={styles.due}>{blocker}</small>)}{item.job?.next_action_due && <small>Due {date(item.job.next_action_due)}</small>}<button type="button" className={styles.textButton} onClick={() => open(item, "notes")} disabled={disabled}>Edit notes / next action</button></td>
                <td><div className={styles.actions}><button type="button" className={styles.primarySmall} disabled={disabled || !canEditMoney} title={paymentReason} onClick={() => open(item, "payment", item.depositOutstanding && item.depositOutstanding > 0 ? "deposit" : "balance")}>Record payment</button><button type="button" className={styles.secondarySmall} disabled={disabled || Boolean(squareReason) || !item.depositOutstanding || item.depositOutstanding <= 0} title={squareReason || "Review and send the deposit link"} onClick={() => open(item, "square", "deposit")}>Send deposit link</button><button type="button" className={styles.secondarySmall} disabled={disabled || Boolean(squareReason) || !item.squareBalanceOutstanding || item.squareBalanceOutstanding <= 0} title={squareReason || "Review and send the outstanding balance link"} onClick={() => open(item, "square", "balance")}>Send balance link</button>{(squareReason || paymentReason) && <small>{squareReason || paymentReason}</small>}</div></td>
              </tr>
              {expanded.has(item.id) && <tr className={styles.detailRow}><td colSpan={13}><div id={`tracking-detail-${item.id.replace(/[^\w-]/g, "-")}`} className={styles.details}>
                <section><h3>Customer & source records</h3><p>{item.email || "Email not recorded"}<br />{item.address || "Address not recorded"}</p><small>Job: {item.job?.id || item.row?.jobId || "—"}<br />Quote: {item.quote?.id || item.row?.quoteId || "—"}<br />Ledger: {item.row?.id || "—"}</small>{item.pendingQuotes.length > 0 && <><h4>Pending quote alternatives · not additional jobs</h4>{item.pendingQuotes.map((quote) => <p key={quote.id}>{quote.quote_number || quote.quote_label || quote.id.slice(0, 8)} · {money(quote.quote_total)} · Pending Quote</p>)}</>}</section>
                <section><h3>Payment history</h3>{item.row?.payments.length ? <ul>{item.row.payments.map((payment) => <li key={payment.id}><strong>{money(payment.amount)}</strong> · {payment.payment_label}<small>{date(payment.paid_at)} · {payment.payment_type.replace("_", " ")}{payment.notes ? ` · ${payment.notes}` : ""}</small></li>)}</ul> : <p>No payment entries available.</p>}{item.row && <p>Credits in: {money(item.row.creditIn)} · credits out: {money(item.row.creditOut)}<br />Job expenses: {money(item.row.expensesTotal)}</p>}</section>
                <section><h3>Documents & matched evidence</h3>{item.contracts.map((contract) => <SafeLink key={contract.id} url={contract.contract_url || (contract.share_token ? `/quote/${encodeURIComponent(contract.share_token)}` : null)}>{contract.title}</SafeLink>)}<SafeLink url={item.row?.manufacturerDocumentUrl || item.quote?.manufacturer_document_url}>Vendor document</SafeLink>{item.orderEmails.map((mail) => <SafeLink key={mail.id} url={mail.email_url}>{mail.subject || "Matched order email"}</SafeLink>)}{item.installEmails.map((mail) => <SafeLink key={mail.id} url={mail.email_url}>{mail.subject || "Matched installation email"}</SafeLink>)}{!item.contracts.length && !item.orderEmails.length && !item.installEmails.length && <p>No exact-linked documents or inbox evidence.</p>}</section>
                <section><h3>Progress evidence</h3><p>{item.progress.confidence.replaceAll("_", " ")}</p>{item.progress.evidence.map((evidence) => <p key={`${evidence.source}:${evidence.id}`}>{evidence.source.replaceAll("_", " ")} · {evidence.id} · {date(evidence.occurredAt)}</p>)}<h3>Notes</h3><p className={styles.fullNotes}>{item.notes || "No notes recorded."}</p>{item.nextAction && <p><strong>Next:</strong> {item.nextAction}</p>}{item.job?.next_action && <p><strong>Staff note:</strong> {item.job.next_action}</p>}</section>
              </div></td></tr>}
            </Fragment>;
          })}
          {!visible.length && <tr><td colSpan={13} className={styles.empty}>{props.busy ? "Loading job records…" : items.length ? "No jobs match this status and search. Choose All Active, check Archive, or clear the search." : "No job records are available in the loaded CRM data."}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className={styles.cardList} role="region" aria-label="Job tracking cards">
      {visible.map((item) => {
        const stage = JOB_TRACKING_STAGES.find((candidate) => candidate.id === item.stageId)!;
        const assigned = (props.ownedActions || []).filter(a => ["open","blocked"].includes(a.status) && (a.quote_id ? a.quote_id === item.progress.identity.quoteId : a.bookkeeping_entry_id ? a.bookkeeping_entry_id === item.progress.identity.bookkeepingId : Boolean(a.job_id) && a.job_id === item.progress.identity.jobId));
            const canEditMoney = financialSource(item);
        const paymentReason = canEditMoney ? "" : "A sold quote or bookkeeping sale is required.";
        const squareReason = !item.quote && !item.row ? "A sold quote or bookkeeping sale is required." : !item.isSale ? "Record the sale first." : !item.email ? "Add a verified customer email to this sale first." : "";
        const cardId = item.id.replace(/[^\w-]/g, "-");
        const detailsOpen = expanded.has(item.id);
        return <article className={styles.jobCard} key={item.id} aria-label={`Job for ${item.customerName}`}>
          <header className={styles.cardHeader}>
            <div className={styles.cardIdentity}>
              <h3 id={`tracking-card-heading-${cardId}`}><button type="button" className={styles.customerName} onClick={() => props.onOpenCustomer(item.customerName)}>{item.customerName}</button></h3>
              <p>{item.project}</p>
              <div className={styles.cardContact}><span>{item.phone || "Phone not recorded"}</span><button type="button" className={styles.contactButton} onClick={() => open(item, "email")} disabled={disabled} aria-label={`Edit customer email for ${item.customerName}`}>{item.email || "Add customer email"}</button></div>
            </div>
            <div className={styles.cardStatus}>
              <button type="button" className={styles.stage} style={{ "--stage-color": stage.color } as CSSProperties} disabled={disabled} onClick={() => open(item, "stage")} aria-label={`Change stage for ${item.customerName}; currently ${stage.label}`}><span className={styles.dot} />{stage.label}<ChevronDown size={13} /></button>
              <button type="button" className={`${styles.valueButton} ${!item.soldDate ? styles.missing : ""}`} disabled={disabled || !item.isSale} onClick={() => open(item, "sold_date")} aria-label={`Edit sold date for ${item.customerName}`}><span className={styles.cardMuted}>{item.soldDate ? "Sold " : ""}</span>{item.soldDate ? date(item.soldDate) : item.isSale ? "Sold date needed" : "Not sold"}</button>
              {item.manualStage && <small>Stage manually set</small>}
            </div>
          </header>
          <div className={styles.cardFinancials}>
            <section><h4>{item.isSale ? "Sale total" : "Estimate / unsold"}</h4><strong className={styles.cardAmount}>{money(item.total)}</strong><small>Customer price</small></section>
            <section><h4>COGS</h4><button type="button" className={`${styles.valueButton} ${styles.cardAmount}`} disabled={disabled || !canEditMoney} title={paymentReason || "Record material cost"} onClick={() => open(item, "cogs")} aria-label={`Record COGS for ${item.customerName}`}>{money(item.cogs)}</button><small>Tap to record vendor cost</small></section>
            <section><h4>Deposit</h4><button type="button" className={styles.valueButton} disabled={disabled || !canEditMoney} onClick={() => open(item, "deposit_required")} aria-label={`Edit required deposit for ${item.customerName}`}><span className={styles.fieldLabel}>Required</span>{money(item.depositRequired)}</button><button type="button" className={styles.valueButton} disabled={disabled || !canEditMoney} onClick={() => open(item, "deposit_paid_target")} aria-label={`Correct deposit received for ${item.customerName}`}><span className={styles.fieldLabel}>Received</span>{money(item.depositReceived)}</button><span className={item.depositOutstanding === 0 ? styles.good : styles.due}>{item.depositOutstanding === null ? "Due not recorded" : item.depositOutstanding === 0 ? "Deposit covered" : `${money(item.depositOutstanding)} due`}</span></section>
            <section><h4>Balance</h4><button type="button" className={styles.valueButton} disabled={disabled || !canEditMoney} onClick={() => open(item, "balance_due_target")} aria-label={`Adjust outstanding balance for ${item.customerName}`}><span className={styles.fieldLabel}>Outstanding</span>{money(item.balanceOutstanding)}</button><button type="button" className={styles.valueButton} disabled={disabled || !canEditMoney} onClick={() => open(item, "balance_paid_target")} aria-label={`Correct balance received for ${item.customerName}`}><span className={styles.fieldLabel}>Received</span>{money(item.balanceReceived)}</button>{item.isSale && item.balanceOutstanding === 0 && <span className={styles.good}>Paid in full</span>}</section>
          </div>
          <div className={styles.cardOverview}>
            <section><h4>Contract</h4><span className={item.signatureRecorded ? styles.good : styles.muted}>{item.signatureRecorded ? "Signature recorded" : "Not signed / no evidence"}</span>{item.signedAt && <small>{date(item.signedAt)}</small>}{item.contractUrl ? <SafeLink url={item.contractUrl}>View contract</SafeLink> : <small>No contract link</small>}</section>
            <section><h4>Vendor / order</h4><strong>{item.vendor || "Vendor not recorded"}</strong><span>{item.orderReference || "No order reference"}</span><small>{item.orderedAt ? `Ordered ${date(item.orderedAt)}` : "Order date not recorded"}</small><button type="button" className={styles.textButton} disabled={disabled || !canEditMoney} onClick={() => open(item, "order")}>Record order</button></section>
            <section><h4>Next action</h4><p className={styles.notePreview}>{item.nextAction}</p>{item.job?.next_action_due && <small>Due {date(item.job.next_action_due)}</small>}<button type="button" className={styles.textButton} onClick={() => open(item, "notes")} disabled={disabled}>Edit notes / next action</button></section>
          </div>
          <div className={styles.cardActions}>
            <button type="button" className={styles.primarySmall} disabled={disabled || !canEditMoney} title={paymentReason} onClick={() => open(item, "payment", item.depositOutstanding && item.depositOutstanding > 0 ? "deposit" : "balance")}>Record payment</button>
            <button type="button" className={styles.secondarySmall} disabled={disabled || Boolean(squareReason) || !item.depositOutstanding || item.depositOutstanding <= 0} title={squareReason || "Review and send the deposit link"} onClick={() => open(item, "square", "deposit")}>Send deposit link</button>
            <button type="button" className={styles.secondarySmall} disabled={disabled || Boolean(squareReason) || !item.squareBalanceOutstanding || item.squareBalanceOutstanding <= 0} title={squareReason || "Review and send the outstanding balance link"} onClick={() => open(item, "square", "balance")}>Send balance link</button>
          </div>
          {(squareReason || paymentReason) && <p className={styles.cardPaymentReason}>{squareReason || paymentReason}</p>}
          <button type="button" className={styles.cardDetailsToggle} onClick={() => toggle(item.id)} aria-label={`${detailsOpen ? "Hide" : "Show"} details for ${item.customerName}`} aria-expanded={detailsOpen} aria-controls={`tracking-card-detail-${cardId}`}>{detailsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {detailsOpen ? "Hide job details" : "Job details, documents & history"}</button>
          {detailsOpen && <div id={`tracking-card-detail-${cardId}`} className={styles.cardDetails}>
            <section><h4>Contract & installation</h4><button type="button" className={styles.secondarySmall} disabled={disabled || (!item.quote && !item.row)} onClick={() => open(item, "contract")} aria-label={`Record signed contract for ${item.customerName}`}>Record signed contract</button><p>Measure: {item.measureStatus}</p><p>Installed: {item.progress.installation === "partial" ? "Partial / incomplete" : item.progress.installation === "complete" ? "Completion recorded" : "Needs verification"}</p><button type="button" className={styles.secondarySmall} disabled={disabled || !canEditMoney} onClick={() => open(item, "install")} aria-label={`Record completed installation for ${item.customerName}`}>Record installed</button>{item.row && item.row.installationInvoiceAmount > 0 && <p>Installer invoice: {money(item.row.installationInvoiceAmount)}</p>}<SafeLink url={item.row?.installationInvoiceUrl}>Install invoice</SafeLink><button type="button" disabled={!item.progress.identity.quoteId||!item.progress.identity.jobId} onClick={()=>setFulfillmentItem(item)}>Orders, receipts & visits</button><SafeLink url={item.row?.manufacturerOrderUrl || item.quote?.manufacturer_order_url}>Vendor order</SafeLink></section>
            <section><h4>Payment history</h4>{item.row?.payments.length ? <ul>{item.row.payments.map((payment) => <li key={payment.id}><strong>{money(payment.amount)}</strong> · {payment.payment_label}<small>{date(payment.paid_at)} · {payment.payment_type.replace("_", " ")}{payment.notes ? ` · ${payment.notes}` : ""}</small></li>)}</ul> : <p>No payment entries available.</p>}{item.row && <p>Credits in: {money(item.row.creditIn)}<br />Credits out: {money(item.row.creditOut)}<br />Job expenses: {money(item.row.expensesTotal)}</p>}</section>
            <section><h4>Documents & matched evidence</h4>{item.contracts.map((contract) => <SafeLink key={contract.id} url={contract.contract_url || (contract.share_token ? `/quote/${encodeURIComponent(contract.share_token)}` : null)}>{contract.title}</SafeLink>)}<SafeLink url={item.row?.manufacturerDocumentUrl || item.quote?.manufacturer_document_url}>Vendor document</SafeLink>{item.orderEmails.map((mail) => <SafeLink key={mail.id} url={mail.email_url}>{mail.subject || "Matched order email"}</SafeLink>)}{item.installEmails.map((mail) => <SafeLink key={mail.id} url={mail.email_url}>{mail.subject || "Matched installation email"}</SafeLink>)}{!item.contracts.length && !item.orderEmails.length && !item.installEmails.length && <p>No exact-linked documents or inbox evidence.</p>}</section>
            <section><h4>Customer & source records</h4><p>{item.address || "Address not recorded"}</p><small>Job: {item.job?.id || item.row?.jobId || "—"}<br />Quote: {item.quote?.id || item.row?.quoteId || "—"}<br />Ledger: {item.row?.id || "—"}</small>{item.pendingQuotes.length > 0 && <><h4>Pending quote alternatives</h4>{item.pendingQuotes.map((quote) => <p key={quote.id}>{quote.quote_number || quote.quote_label || quote.id.slice(0, 8)} · {money(quote.quote_total)} · Pending Quote</p>)}</>}<h4>Notes</h4><p className={styles.fullNotes}>{item.notes || "No notes recorded."}</p></section>
          </div>}
        </article>;
      })}
      {!visible.length && <p className={styles.cardEmpty}>{props.busy ? "Loading job records…" : items.length ? "No jobs match this status and search." : "No job records are available in the loaded CRM data."}</p>}
    </div>
    {props.integrationHealth && <details><summary>Integration freshness</summary>{props.integrationHealth.map((source) => <p key={source.processor}>{source.processor.replaceAll("-", " ")}: {source.state} · Last attempt {date(source.lastAttemptAt)} · Last success {date(source.lastSuccessAt)}</p>)}</details>}
    <p className={styles.footer}>Missing sold dates are listed last. Open job details for the full record. Stage changes do not record a signature or payment.</p>
    <Dialog.Root open={Boolean(editor)} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <Dialog.Portal><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={styles.modal} onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus({ preventScroll: true }); }} onEscapeKeyDown={(event) => { if (running) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()}>
        {editor && <><Dialog.Title className={styles.modalTitle}>{labels[editor.kind]}</Dialog.Title><Dialog.Description className={styles.modalDescription}>{editor.item.customerName} · {editor.item.project}</Dialog.Description><button type="button" className={styles.close} disabled={running} aria-label="Close editor" onClick={close}><X size={20} /></button>
          <form key={`${editor.item.id}:${editor.kind}`} onSubmit={submit} className={styles.form}>
            {editor.kind === "stage" ? <><p>Record a staff stage label. Evidence determines the operational queue; conflicting labels remain visible for review.</p><div className={styles.stageChoices}>{JOB_TRACKING_STAGES.filter((stage) => stage.id !== "attention").map((stage) => <label key={stage.id}><input type="radio" name="stage" value={stage.id} defaultChecked={stage.id === editor.item.stageId} required /><span>{stage.label}</span></label>)}</div><label>Manager exception, if needed<textarea name="manager_exception" placeholder="Mike only: document remaining obligations and the closeout reason"/></label></>
              : editor.kind === "square" ? <><div className={styles.confirmBox}><span>Square {editor.paymentType} request</span><strong>{money(editor.paymentType === "deposit" ? editor.item.depositOutstanding : editor.item.squareBalanceOutstanding)}</strong><p>To: {editor.item.customerName}<br /><b>{editor.item.email}</b></p></div><p>Send a Square payment link from 805@805shutters.com. The customer chooses whether to pay; sending a link does not mark this job paid.</p><label className={styles.confirmCheck}><input type="checkbox" required />I checked the customer, email, and amount.</label></>
                : editor.kind === "contract" ? <><p>Record a contract the customer has already signed. This does not sign on the customer’s behalf or send a message.</p><label>Actual date signed<input name="signed_date" type="date" required max={localDate()} defaultValue={dateInput(editor.item.signedAt)} /></label><label>Signed document URL (optional)<input name="contract_url" type="url" placeholder="https://…" defaultValue={editor.item.contractUrl?.startsWith("http") ? editor.item.contractUrl : ""} /></label><label className={styles.confirmCheck}><input name="confirm_contract" type="checkbox" required />I reviewed the existing signed contract and verified the signing date.</label></>
                  : editor.kind === "install" ? <><p>Record an installation that has actually been completed, not a scheduled visit. This does not record a customer payment.</p><label>Actual installation date<input name="installed_date" type="date" required max={localDate()} defaultValue={dateInput(editor.item.installedAt)} /></label></>
                    : editor.kind === "sold_date" ? <><label>Actual date sold<input name="sold_date" type="date" required defaultValue={dateInput(editor.item.soldDate)} /></label><p>Use the actual sale date, not the order, installation, or last-updated date.</p></>
                  : editor.kind === "order" ? <><label>Manufacturer / vendor<input name="vendor" defaultValue={editor.item.vendor || ""} /></label><label>Order reference<input name="reference" defaultValue={editor.item.orderReference || ""} /></label><label>Order date<input name="ordered_at" type="date" max={localDate()} defaultValue={dateInput(editor.item.orderedAt)} /></label><label>Order URL<input name="url" type="url" defaultValue={editor.item.row?.manufacturerOrderUrl || editor.item.quote?.manufacturer_order_url || ""} placeholder="https://…" /></label><p>This records an existing order. It does not submit an order to a vendor.</p></>
                    : editor.kind === "email" ? <><label>Verified customer email<input name="email" type="email" required defaultValue={editor.item.email || ""} autoComplete="off" /></label><p>This updates only this {editor.item.row && editor.item.row.source !== "crm_quote" ? "sale" : editor.item.quote ? "quote" : "job"}'s customer contact. No message is sent.</p></>
                      : editor.kind === "notes" ? <><label>Job notes<textarea name="notes" rows={6} defaultValue={editor.item.row?.notes ?? editor.item.quote?.notes ?? editor.item.job?.notes ?? ""} /></label>{editor.item.job && <><label>Staff next-action note<input name="next_action" defaultValue={editor.item.job?.next_action || ""} /></label><label>Next action due<input name="next_action_due" type="date" defaultValue={dateInput(editor.item.job.next_action_due)} /></label></>}</>
                      : <>{editor.kind === "payment" && <><p>Record money already received. No customer charge or message will be sent.</p><label>Apply payment to<select name="payment_label" defaultValue={editor.paymentType || "deposit"}><option value="deposit">Deposit</option><option value="balance">Balance</option></select></label></>}<label>{editor.kind === "payment" ? "Amount received" : labels[editor.kind]}<input name="amount" type="number" inputMode="decimal" min={editor.kind === "payment" ? "0.01" : "0"} step="0.01" required defaultValue={amountValue ?? ""} placeholder="0.00" /></label>{editor.kind === "payment" ? <><div className={styles.formColumns}><label>Payment method<select name="payment_type" defaultValue="zelle"><option value="zelle">Zelle</option><option value="cash">Cash</option><option value="check">Check</option><option value="credit_card">Card (already received)</option><option value="other">Other</option></select></label><label>Date received<input name="paid_at" type="date" required defaultValue={localDate()} /></label></div><label>Reference / notes<textarea name="note" rows={3} placeholder="Check number, transfer reference, or receipt details" /></label></> : ["balance_due_target", "deposit_paid_target", "balance_paid_target"].includes(editor.kind) ? <><p>This is a ledger correction, not a new payment. Enter the corrected total and document why.</p><label>Reason for correction<textarea name="note" rows={3} required /></label></> : <p>Enter the actual recorded amount. Zero is saved as $0.00; blank fields cannot be saved.</p>}</>}
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <div className={styles.modalActions}><button type="button" className={styles.secondary} onClick={close} disabled={running}>Cancel</button><button type="submit" className={styles.primary} disabled={disabled}>{running ? "Saving…" : editor.kind === "square" ? "Confirm & send Square link" : editor.kind === "payment" ? "Record received payment" : "Save changes"}</button></div>
          </form>
        </>}
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </section>;
}

export default JobTrackingWorkspace;
