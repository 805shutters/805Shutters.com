"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Circle, X } from "lucide-react";
import { OWNER_PAYABLES_MODEL } from "@/lib/crm/owner-payables";
import { kenPayableReadiness } from "@/lib/crm/ken-monthly-ledger";
import { kenPayoffView, payoffSelection } from "@/lib/crm/ken-payoff-view";
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
  activePerson?: CrmPaymentPerson; onPersonChange?: (person: CrmPaymentPerson) => void;
  onPay: (request: OwnerPaymentRequest) => Promise<void>;
  onReadiness: (request: PayableReadinessRequest) => Promise<void>;
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : "Date needs review";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
type Editor = { kind: "payment"; keys: string[]; requestId: string; snapshot: string } | { kind: "readiness"; row: CrmBookkeepingRow };
export function PayablesWorkspace({ rows, ledger, busy, canEdit, onPay, onReadiness }: Props) {
  const [tab, setTab] = useState<"ready" | "paid">("ready");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const view = kenPayoffView(rows, ledger);
  const disabled = busy || saving || !canEdit;
  const filtered = view.ready.filter(({ item }) => `${item.customerName} ${item.quoteNumber || ""}`.toLowerCase().includes(search.toLowerCase()));
  const selected = editor?.kind === "payment" ? payoffSelection(view.ready, editor.keys) : null;
  const stale = editor?.kind === "payment" && (!selected || selected.snapshot !== editor.snapshot);
  useEffect(() => { if (editor) { editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); editorRef.current?.querySelector<HTMLInputElement>("input")?.focus(); } }, [editor]);
  function openPayment(keys: string[]) {
    const selection = payoffSelection(view.ready, keys);
    if (!selection) return;
    setError(""); setNotice(""); setEditor({ kind: "payment", keys, requestId: crypto.randomUUID(), snapshot: selection.snapshot });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || savingRef.current || disabled || stale) return;
    const values = new FormData(event.currentTarget);
    savingRef.current = true; setSaving(true); setError("");
    try {
      const note = String(values.get("note") || "").trim();
      if (!note) throw new Error("Enter a reference or reason.");
      if (editor.kind === "readiness") {
        const value = String(values.get("ready"));
        await onReadiness({ person: "ken", source: editor.row.source, id: editor.row.id, ready: value === "auto" ? null : value === "ready", reason: note, expected_revision: kenPayableReadiness(editor.row).revision });
        setNotice("Ken’s readiness correction saved.");
      } else {
        const amount = Number(values.get("amount"));
        if (!selected || !Number.isFinite(amount) || amount <= 0 || amount > selected.total) throw new Error("Enter an amount within the selected unpaid total.");
        await onPay({ person: "ken", amount, paid_on: String(values.get("date")), note, payment_reference: note, payment_method: String(values.get("method")), payment_model: OWNER_PAYABLES_MODEL, payment_request_id: editor.requestId, item_ids: editor.keys });
        setNotice("Ken’s payment recorded. The ledger has been updated.");
      }
      setEditor(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The record could not be saved."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <section className={styles.workspace} aria-label="Payoff">
    <header className={styles.header}><h1>Payoff</h1><p>Ken Hill · 10% contract buyout</p></header>
    <section className={styles.summary} aria-label="Ken payoff summary">
      <div className={styles.next}><span>Next payment · {view.dueDate ? date(view.dueDate) : "Loading"}</span><strong>{ledger ? money(view.total) : "—"}</strong><small>{view.ready.length} qualifying jobs · includes unpaid carryover</small></div>
      <div><span>Paid to Ken</span><strong>{ledger ? money(ledger.kenBuyout.totalPaid) : "—"}</strong><small>{view.history.length + view.review.length} payment records{view.review.length > 0 ? " · reconciliation pending" : ""}</small></div>
      <div><span>Buyout remaining</span><strong>{ledger ? money(ledger.kenBuyout.remainingBalance) : "—"}</strong><small>Of {ledger ? money(ledger.kenBuyout.target) : "—"} total buyout</small></div>
    </section>
    {view.review.length > 0 && <details className={styles.review}><summary>Payment history needs review · {view.review.length} records</summary><p>Recorded totals include entries awaiting reconciliation. These are not credit against new jobs.</p>{view.review.map(batch => <p key={batch.id}>{date(batch.paidOn)} · {money(batch.amount)} · {batch.reconciliation?.reason || "Payment allocation needs review"}</p>)}</details>}
    <div className={styles.toolbar}><div className={styles.tabs} role="group" aria-label="Payoff ledger view"><button type="button" aria-pressed={tab === "ready"} onClick={() => { setTab("ready"); setSearch(""); }}>Ready for {view.dueDate ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${view.dueDate}T12:00:00Z`)) : "payment"} <b>{view.ready.length}</b></button><button type="button" aria-pressed={tab === "paid"} onClick={() => { setTab("paid"); setSearch(""); }}>Paid to Ken <b>{view.history.length}</b></button></div>{tab === "ready" && <label><span className={styles.srOnly}>Search qualifying jobs</span><input type="search" placeholder="Search customer or contract" value={search} onChange={event => setSearch(event.target.value)} /></label>}</div>
    <div role="status">{notice}</div>
    {!ledger ? <p>Loading payoff…</p> : tab === "ready" ? <>
      <p className={styles.description}>Customer paid in full. Installation complete. Job closed.</p>
      <div className={styles.tableWrap}><table><thead><tr><th>Customer / contract</th><th>Closed</th><th>Contract total</th><th>Ready</th><th>10% buyout</th><th>Unpaid to Ken</th><th>Ken paid</th></tr></thead><tbody>{filtered.map(({ row, item }) => <tr key={item.itemKey}><td><strong>{item.customerName}</strong><small>{item.quoteNumber || "Job record"}</small></td><td>{date(row.jobClosedAt)}<small>{item.dueDate && item.dueDate < (view.dueDate || "") ? `Carried from ${date(item.dueDate)}` : `Eligible ${date(item.eligibleAt)}`}</small></td><td>{money(item.total)}</td><td><button type="button" className={`${styles.circle} ${styles.checked}`} disabled={disabled} aria-label={`Review readiness for ${item.customerName}`} onClick={() => { setError(""); setEditor({ kind: "readiness", row }); }}><Check size={19} /></button><small>{kenPayableReadiness(row).automatic ? "Automatic" : "Manual"}</small></td><td>{money(item.owedAmount)}</td><td className={styles.green}><strong>{money(item.remainingAmount)}</strong>{item.paidAmount > 0 && <small>{money(item.paidAmount)} already paid</small>}</td><td><button type="button" className={styles.circle} disabled={disabled} aria-label={`Record Ken payment for ${item.customerName}`} onClick={() => openPayment([item.itemKey])}><Circle size={19} /></button></td></tr>)}</tbody></table></div>
      {!filtered.length && <p className={styles.empty}>No qualifying jobs{search ? " match your search" : " are ready for this payment"}.</p>}
      <footer className={styles.footer}><div><small>{search ? "All ready jobs · search does not change payment selection" : "Monthly ledger total"}</small><strong>{money(view.total)}</strong></div><button className={styles.primary} type="button" disabled={disabled || !view.ready.length} onClick={() => openPayment(view.ready.map(({ item }) => item.itemKey))}>Review &amp; record payment</button></footer>
    </> : <section aria-label="Ken payment history" className={styles.history}>{view.history.map(batch => <details key={batch.id} className={styles.batch}><summary><span className={`${styles.circle} ${styles.checked}`}><Check size={19}/></span><span><strong>{date(batch.paidOn)}</strong><small>{batch.allocations.length} job allocations{batch.dateReviewRequired ? " · historical dates need review" : ""}</small></span><strong>{money(batch.recordedAmount ?? batch.amount)}</strong></summary><p>{batch.note || "Recorded payment"}</p>{batch.dueDate && <p>Payment due {date(batch.dueDate)} · cutoff {date(batch.paymentCutoffAt)}</p>}<div className={styles.tableWrap}><table><thead><tr><th>Covered job</th><th>Contract</th><th>Paid to Ken</th></tr></thead><tbody>{batch.allocations.map(allocation => <tr key={allocation.id}><td>{allocation.customerName}</td><td>{allocation.quoteNumber || "—"}</td><td>{money(allocation.amount)}</td></tr>)}</tbody></table></div></details>)}{!view.history.length && <p className={styles.empty}>No reconciled payments to display.</p>}{view.duplicates.length > 0 && <details className={styles.review}><summary>Preserved audit history · {view.duplicates.length} duplicate entries excluded</summary>{view.duplicates.map(batch => <p key={batch.id}>{date(batch.paidOn)} · {money(batch.amount)} · {batch.reconciliation?.reason}</p>)}</details>}</section>}
    {editor && <div ref={editorRef} className={styles.editor}><div className={styles.editorHead}><h2>{editor.kind === "payment" ? "Record Ken’s payment" : `Readiness · ${editor.row.customerName}`}</h2><button type="button" aria-label="Close payment details" disabled={saving} onClick={() => setEditor(null)}><X size={18}/></button></div>
      {editor.kind === "payment" && <><p>{editor.keys.length} selected jobs · {money(selected?.total || 0)} unpaid. Record a payment already made.</p><details><summary>Review covered jobs</summary>{selected?.items.map(({ item }) => <p key={item.itemKey}>{item.customerName} · {item.quoteNumber || "Job record"} · {money(item.remainingAmount)}</p>)}</details></>}
      {stale ? <p role="alert">This ledger changed. Close this form and review the updated jobs before recording payment.</p> : <form onSubmit={save}><div className={styles.fields}>{editor.kind === "payment" ? <><label>Amount<input name="amount" type="number" step="0.01" min="0.01" max={selected?.total} defaultValue={selected?.total.toFixed(2)} required/></label><label>Payment date<input name="date" type="date" defaultValue={today()} required/></label><label>Method<select name="method"><option value="ach">Bank transfer / ACH</option><option value="check">Check</option><option value="cash">Cash</option><option value="other">Other</option></select></label></> : <label>Readiness<select name="ready" defaultValue="auto"><option value="auto">Automatic · paid, complete and closed</option><option value="ready">Manually mark ready</option><option value="pending">Manually hold payment</option></select></label>}<label>Reference / reason<input name="note" required maxLength={1000} placeholder={editor.kind === "payment" ? "Payment reference" : "Reason for correction"}/></label></div><div className={styles.editorActions}><small>{editor.kind === "payment" ? "Partial payments leave the rest unpaid." : "Readiness corrections do not record a payment."}</small><button className={styles.primary} type="submit" disabled={disabled}>{saving ? "Saving…" : editor.kind === "payment" ? "Record payment" : "Save readiness"}</button></div></form>}{error && <p role="alert">{error}</p>}</div>}
  </section>;
}
