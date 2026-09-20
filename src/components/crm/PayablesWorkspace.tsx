"use client";

import { installationCost } from "@/lib/crm/installation-estimate";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Circle, Minus, X } from "lucide-react";
import { isPayablesLedgerJob, ownerPayableFinancials, ownerPayableReadiness, OWNER_PAYABLES_MODEL } from "@/lib/crm/owner-payables";
import { kenPayableReadiness } from "@/lib/crm/ken-monthly-ledger";
import { partnerPaymentItemKeyForRow } from "@/lib/crm/partner-payments";
import type { CrmBookkeepingRow, CrmPartnerPaymentLedger, CrmPaymentPerson } from "@/lib/crm/types";
import styles from "./PayablesWorkspace.module.css";

export type OwnerPaymentRequest = {
  person: CrmPaymentPerson; amount: number; paid_on: string; note: string;
  payment_request_id?: string; payment_method?: string; payment_reference?: string;
  item_ids?: string[]; advance?: boolean; payment_model: typeof OWNER_PAYABLES_MODEL;
};
export type PayableReadinessRequest = {
  source: CrmBookkeepingRow["source"]; id: string; ready: boolean | null;
  person?: "ken"; reason: string; expected_revision: string | null;
};
type Props = {
  rows: CrmBookkeepingRow[]; ledger?: CrmPartnerPaymentLedger; busy: boolean; canEdit: boolean;
  activePerson: CrmPaymentPerson; onPersonChange: (person: CrmPaymentPerson) => void;
  onPay: (request: OwnerPaymentRequest) => Promise<void>;
  onReadiness: (request: PayableReadinessRequest) => Promise<void>;
};
const people = ["ken", "mike", "jessica"] as const;
const names = { ken: "10% buyout", mike: "Mike", jessica: "Jessica" };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
type Editor = { kind: "payment"; person: CrmPaymentPerson; row?: CrmBookkeepingRow; requestId?: string } | { kind: "readiness"; row: CrmBookkeepingRow; person?: "ken" };

export function PayablesWorkspace({ rows, ledger, busy, canEdit, activePerson, onPersonChange, onPay, onReadiness }: Props) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const disabled = busy || saving || !canEdit;
  const allJobs = rows.filter(isPayablesLedgerJob);
  const filtered = allJobs.filter(row => `${row.customerName} ${row.quoteNumber || ""}`.toLowerCase().includes(search.toLowerCase()));
  const itemFor = (row: CrmBookkeepingRow, person: CrmPaymentPerson) => ledger?.people[person].items.find(item => item.itemKey === partnerPaymentItemKeyForRow(person, row));
  const history = ledger?.history.filter(batch => batch.person === activePerson) || [];
  useEffect(() => { if (editor) { editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); editorRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")?.focus(); } }, [editor]);
  function open(next: Editor) { setError(""); setNotice(""); setEditor(next.kind === "payment" ? { ...next, requestId: crypto.randomUUID() } : next); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || savingRef.current || disabled) return;
    const values = new FormData(event.currentTarget);
    savingRef.current = true; setSaving(true); setError("");
    try {
      if (editor.kind === "readiness") {
        const value = String(values.get("ready"));
        await onReadiness({ person: editor.person, source: editor.row.source, id: editor.row.id, ready: value === "auto" ? null : value === "ready", reason: String(values.get("note") || ""), expected_revision: (editor.person === "ken" ? kenPayableReadiness(editor.row) : ownerPayableReadiness(editor.row)).revision });
        setNotice("Readiness correction saved. Payment records are unchanged.");
      } else {
        const method = String(values.get("method"));
        await onPay({ person: editor.person, amount: Number(values.get("amount")), paid_on: String(values.get("date")), note: `${method} · ${String(values.get("note"))}`, payment_model: OWNER_PAYABLES_MODEL, payment_request_id: editor.requestId, payment_method: method,
          ...(editor.row ? { item_ids: [partnerPaymentItemKeyForRow(editor.person, editor.row)] } : { advance: true }) });
        setNotice(`${names[editor.person]} payment recorded.`);
      }
      setEditor(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The record could not be saved. Reload before retrying."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  function renderEditor(row?: CrmBookkeepingRow) {
    if (!editor || (editor.row?.id !== row?.id || editor.row?.source !== row?.source)) return null;
    const item = editor.kind === "payment" && row ? itemFor(row, editor.person) : undefined;
    const maximum = editor.kind === "payment" && row ? Math.max(0, Math.min(item?.remainingAmount || 0, ledger?.people[editor.person].owed || 0)) : undefined;
    const settled = editor.kind === "payment" && row && !maximum;
    return <div ref={editorRef} className={styles.editor}>
      <div className={styles.editorHead}><h3>{editor.kind === "readiness" ? editor.person === "ken" ? "10% buyout readiness" : "Job readiness" : `${names[editor.person]} · ${row ? "record payment" : "record advance"}`}</h3><button type="button" aria-label="Close payment details" disabled={saving} onClick={() => setEditor(null)}><X size={18} /></button></div>
      {settled ? <p>{item?.paymentState === "paid" ? `${money(item.paidAmount)} recorded for this job.` : "No payment is currently due. Review job readiness and existing account credits."}</p> : <form onSubmit={save}>
        <div className={styles.fields}>
          {editor.kind === "readiness" ? <label>Status<select name="ready" defaultValue="auto"><option value="auto">Automatic · paid, complete and closed</option><option value="ready">Manually mark ready</option><option value="pending">Manually mark pending</option></select></label> : <>
            <label>Amount<input name="amount" type="number" step="0.01" min="0.01" max={maximum} defaultValue={maximum?.toFixed(2)} required /></label>
            <label>Payment date<input name="date" type="date" defaultValue={today()} required /></label>
            <label>Method<select name="method"><option value="ach">Bank transfer / ACH</option><option value="check">Check</option><option value="card">Card</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
          </>}
          <label className={styles.note}>Reference / reason<input name="note" required maxLength={1000} placeholder={editor.kind === "readiness" ? "Reason for the correction" : "Payment reference or note"} /></label>
        </div>
        <div className={styles.editorActions}><small>{editor.kind === "readiness" ? "Changes payout readiness only." : "Record a payment already made."}</small><button type="submit" disabled={disabled}>{saving ? "Saving…" : editor.kind === "readiness" ? "Save readiness" : "Record payment"}</button></div>
      </form>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>;
  }
  return <section className={styles.workspace} aria-label="Payables">
    <header className={styles.header}><div><p className={styles.eyebrow}>805 / OPERATIONS</p><h1>Payables</h1><p>Job profit, shared equally.</p></div><div className={styles.advanceButtons}>{(["mike", "jessica"] as const).map(person => <button type="button" key={person} disabled={disabled || !ledger} onClick={() => open({ kind: "payment", person })}>Record {names[person]} advance</button>)}</div></header>
    {!canEdit && <p className={styles.muted}>Payment records and manual corrections are available to Mike.</p>}
    <div className={styles.summary}>{people.map(person => {
      const account = ledger?.people[person];
      const paid = ledger?.history.filter(batch => batch.person === person).reduce((sum, batch) => sum + (batch.recordedAmount ?? batch.amount), 0) || 0;
      return <article key={person}><span>{names[person]} {(account?.owed || 0) < 0 ? "credit" : "remaining"}</span><strong>{ledger ? money(Math.abs(account?.owed || 0)) : "—"}</strong><small>{money(account?.earned || 0)} earned · {money(paid)} recorded</small></article>;
    })}</div>
    {ledger?.kenMonthly && <section className={styles.buyout} aria-label="Monthly buyout ledger">
      <h2>Next payment: {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${ledger.kenMonthly.dueDate}T12:00:00Z`))}</h2>
      <p><strong>{money(ledger.kenMonthly.total)}</strong> · {ledger.kenMonthly.items.length} qualifying jobs · unpaid amounts carried forward</p>
      <p>{money(ledger.kenMonthly.recordedTotal)} in recorded payments · {money(ledger.kenMonthly.excludedDuplicates)} duplicate checkbox entries excluded</p>
      <details><summary>Qualifying jobs</summary><div className={styles.tableWrap}><table><thead><tr><th>Customer</th><th>Eligible</th><th>Original due date</th><th>Unpaid</th></tr></thead><tbody>{ledger.kenMonthly.items.map(item => <tr key={item.itemKey}><td>{item.customerName}</td><td>{item.eligibleAt?.slice(0, 10)}</td><td>{item.dueDate}</td><td>{money(item.remainingAmount)}</td></tr>)}</tbody></table></div></details>
      {ledger.kenMonthly.review.length > 0 && <details><summary>{ledger.kenMonthly.review.length} records need date or allocation review</summary>{ledger.kenMonthly.review.map((issue, index) => <p key={`${issue.id}:${index}`}>{issue.label} · {issue.reason}</p>)}</details>}
    </section>}
    {renderEditor()}
    {ledger?.kenBuyout && <details className={styles.buyout}><summary>10% buyout · {money(ledger.kenBuyout.remainingBalance)} remaining overall</summary><div><p>{money(ledger.kenBuyout.totalPaid)} applied toward {money(ledger.kenBuyout.target)}</p><progress value={ledger.kenBuyout.totalPaid} max={ledger.kenBuyout.target} aria-label="Buyout paid" /><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Payment</th><th>Note</th><th>Remaining</th></tr></thead><tbody>{ledger.kenBuyout.payments.map(payment => <tr key={payment.id}><td>{payment.paidOn || "—"}</td><td>{money(payment.amount)}</td><td>{payment.note || "—"}</td><td>{money(payment.remainingBalance)}</td></tr>)}</tbody></table></div></div></details>}
    <div className={styles.toolbar}><h2>Paid &amp; closed jobs <small>{filtered.length}</small></h2><label><span className={styles.srOnly}>Search customer or quote</span><input type="search" placeholder="Search customer or quote" value={search} onChange={event => { setSearch(event.target.value); setLimit(20); }} /></label></div>
    <p className={styles.formula}>Contract − COGS − installation − 10% buyout = profit. Mike 50% · Jessica 50%.</p>
    <div role="status" className={styles.notice}>{notice}</div>
    {!ledger && <p>Loading payables…</p>}
    {filtered.slice(0, limit).map(row => {
      const amounts = ownerPayableFinancials(row);
      const readiness = ownerPayableReadiness(row);
      return <article className={styles.job} key={`${row.source}:${row.id}`}>
        <header className={styles.jobHeader}><div><h2>{row.customerName}</h2><small>{row.quoteNumber || "Job record"}{row.soldDate ? ` · Sold ${row.soldDate.slice(0, 10)}` : ""}</small></div><span className={readiness.ready ? styles.badgeReady : styles.badge}>{readiness.ready ? readiness.automatic ? "Paid & closed" : "Ready · manual" : "Pending"}</span></header>
        <div className={styles.financials}>{[["Contract", row.total], ["COGS", row.cogs], [installationCost(row).source === "estimate" && row.installationEstimate?.amount != null ? "Installation · Estimate" : "Installation", amounts.installation], ["10% buyout", amounts.buyout], ["Profit to split", amounts.profit]].map(([name, value]) => <div key={name}><span>{name}</span><strong>{money(Number(value))}</strong></div>)}</div>
        <div className={styles.milestones}>
          <div><span>Ready</span><button type="button" className={`${styles.circle} ${readiness.ready ? styles.checked : ""}`} disabled={disabled || !ledger} aria-label={`Review readiness for ${row.customerName}`} aria-pressed={readiness.ready} onClick={() => open({ kind: "readiness", row })}>{readiness.ready ? <Check /> : <Circle />}</button><strong>{readiness.ready ? "Ready" : "Pending"}</strong><small>{readiness.automatic ? readiness.ready ? "Paid & closed · automatic" : "Awaiting paid & closed" : "Manual correction"}</small>{readiness.reason && <small>{readiness.reason}</small>}</div>
          {people.map(person => { const item = itemFor(row, person); const expected = person === "ken" ? amounts.buyout : amounts[person]; const paid = item?.paidAmount || 0; const complete = Boolean(item && item.remainingAmount === 0); return <div key={person}><span>{names[person]}{person !== "ken" ? " · 50%" : ""}</span><button type="button" className={`${styles.circle} ${complete ? styles.checked : ""}`} disabled={disabled || !ledger} aria-label={`Record or review ${names[person]} payment for ${row.customerName}`} aria-pressed={complete} onClick={() => open({ kind: "payment", person, row })}>{complete ? <Check /> : paid > 0 ? <Minus /> : <Circle />}</button><strong>{money(item?.remainingAmount ?? expected)}</strong><small>{complete ? "Paid" : paid > 0 ? `${money(paid)} recorded` : "Remaining"}</small>{Boolean(item?.accountCreditApplied) && <small>{money(item!.accountCreditApplied!)} credit applied</small>}{person === "ken" && <><small>{item?.dueDate ? `Due ${item.dueDate}` : kenPayableReadiness(row).reviewReason || "Awaiting paid, complete and closed"}</small><button type="button" disabled={disabled} onClick={() => open({ kind: "readiness", person: "ken", row })}>Review buyout readiness</button></>}{person !== "ken" && <small>{money(expected)} share</small>}</div>; })}
        </div>
        {(row.advertisingReserve > 0 || row.expensesTotal > 0 || row.remakeTotal > 0) && <details className={styles.existingCosts}><summary>Other existing accounting amounts</summary><p>Marketing {money(row.advertisingReserve)} · Expenses {money(row.expensesTotal)} · Remakes {money(row.remakeTotal)}. Retained in bookkeeping; excluded from this split formula.</p></details>}
        {renderEditor(row)}
      </article>;
    })}
    {ledger && !filtered.length && <p>No qualifying paid-and-closed jobs match this search.</p>}
    {filtered.length > limit && <button type="button" onClick={() => setLimit(limit + 20)}>Show more jobs</button>}
    <section className={styles.history}><div className={styles.toolbar}><h2>Payment history</h2><label>Recipient<select value={activePerson} onChange={event => onPersonChange(event.target.value as CrmPaymentPerson)}>{people.map(person => <option key={person} value={person}>{names[person]}</option>)}</select></label></div><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Amount</th><th>Type</th><th>Note / reference</th><th>Jobs</th></tr></thead><tbody>{history.map(batch => <tr key={batch.id}><td>{batch.paidOn || "—"}</td><td>{money(batch.amount)}</td><td>{batch.reconciliation?.status === "confirmed_duplicate" ? "Duplicate · excluded" : batch.reconciliation?.status === "review" ? "Needs review" : batch.isAdvance ? "Advance" : "Payment"}</td><td>{batch.note || "—"}{batch.reconciliation?.status === "confirmed_duplicate" && <small>Included in batch: {batch.reconciliation.matchedBatchIds.join(", ")}</small>}{batch.dateReviewRequired && <small>Historical dates need review</small>}{batch.dueDate && <small>Due {batch.dueDate} · cutoff {batch.paymentCutoffAt}</small>}<small>{batch.createdByEmail}</small></td><td><details><summary>{batch.allocations.length} allocations</summary>{batch.allocations.map(allocation => <p key={allocation.id}>{allocation.customerName} · {money(allocation.amount)}{allocation.virtual ? " · legacy allocation" : ""}</p>)}</details></td></tr>)}</tbody></table></div>{!history.length && <p>No recorded payments.</p>}</section>
  </section>;
}
