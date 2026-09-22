"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, CreditCard, FileText, Mail, MapPin, MessageSquare, Phone, RefreshCw, Search, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { mobileMapTarget, mobilePhoneTarget, mobileSmsTarget } from "@/lib/crm/mobile-customers";
import type { MobilePaymentCustomer } from "@/lib/crm/mobile-payment-queue";
import styles from "./MobileCustomersApp.module.css";

async function api(path: string, init?: RequestInit) {
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("Sign in to the CRM to load customers.");
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error("Sign in to the CRM to load customers.");
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Request failed.");
  return body;
}
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
type PaymentAction = { row: MobilePaymentCustomer; type: "deposit" | "balance"; key: string };
type PaymentChannel = "text" | "email";

export function mobilePaymentSendRequest(action: PaymentAction, channel: PaymentChannel) {
  return { quoteId: action.row.quoteId, jobId: action.row.jobId, paymentType: action.type, channel, idempotencyKey: action.key,
    expectedAmount: action.type === "deposit" ? action.row.deposit : action.row.balance,
    expectedRecipient: channel === "text" ? action.row.phone : action.row.email };
}

export function MobileCustomersApp() {
  const [rows, setRows] = useState<MobilePaymentCustomer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"payments" | "info">("payments");
  const [action, setAction] = useState<PaymentAction | null>(null);
  const [channel, setChannel] = useState<PaymentChannel>("text");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [asOf, setAsOf] = useState("");
  const request = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    try {
      const result = await api("/api/crm/mobile/customers", { signal: controller.signal });
      if (!controller.signal.aborted) { setRows(result.results); setAsOf(result.asOf); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Customers could not be loaded.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const visible = () => { if (document.visibilityState === "visible" && !sendingRef.current) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    const interval = setInterval(visible, 120_000);
    return () => { request.current?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  useEffect(() => { if (action) dialog.current?.showModal(); else dialog.current?.close(); }, [action]);
  const term = query.trim().toLowerCase();
  const filtered = rows.filter(row => !term || [row.name, row.phone, row.email, row.address, row.project].some(value => value?.toLowerCase().includes(term)));
  const priority = filtered.filter(row => row.priority);
  const other = filtered.filter(row => !row.priority);
  const current = rows.find(row => row.id === selected);
  const ready = !loading && !error;

  function open(row: MobilePaymentCustomer) { setSelected(row.id); setDetailTab("payments"); }
  function beginSend(row: MobilePaymentCustomer, method: PaymentChannel) {
    if (!row.dueType || !ready) return;
    setNotice(""); setSendError(""); setAttempted(false); setChannel(method);
    setAction({ row, type: row.dueType, key: crypto.randomUUID() });
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!action || sendingRef.current) return;
    sendingRef.current = true; setSending(true); setAttempted(true); setSendError("");
    try {
      const result = await api("/api/crm/mobile/customers", { method: "POST", body: JSON.stringify(mobilePaymentSendRequest(action, channel)) });
      if (result.deliveryState !== "accepted") throw new Error("Provider acceptance was not confirmed. Review the audit before retrying.");
      setNotice(`${channel === "text" ? "Text" : "Email"} provider accepted the payment-link request${result.replayed ? " (same request, not sent again)" : ""}. Delivery is not yet confirmed. The balance changes when payment is recorded.`);
      setAction(null); void refresh();
    } catch (e) { setSendError(e instanceof Error ? e.message : "Could not confirm the send. Review its audit before starting another request."); }
    finally { sendingRef.current = false; setSending(false); }
  }
  function actions(row: MobilePaymentCustomer) {
    if (!(row.outstanding !== null && row.outstanding > 0)) return null;
    const eligible = Boolean(row.quoteId && row.jobId && row.dueType && row.amountDue > 0);
    return <div className={styles.paymentActions}>
      <small><CreditCard size={15} /> Credit card payment · Square</small>
      <div className={styles.twoColumns}>
        <button className={styles.primary} disabled={!ready || !eligible || !mobilePhoneTarget(row.phone)} onClick={() => beginSend(row, "text")}><MessageSquare size={18} /> Text payment link</button>
        <button className={styles.primary} disabled={!ready || !eligible || !row.email} onClick={() => beginSend(row, "email")}><Mail size={18} /> Email payment link</button>
      </div>
      {!eligible && <small>A linked quote with a verified amount due is needed to send a Square link.</small>}
    </div>;
  }
  function compact(row: MobilePaymentCustomer) {
    return <button key={row.id} className={styles.customerRow} onClick={() => open(row)}>
      <span className={styles.avatar}>{row.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("")}</span>
      <span className={styles.rowName}><strong>{row.name}</strong><small>{row.project}{row.archived ? " · Archived" : row.shipped ? " · Shipped" : ""}</small></span>
      <span className={styles.rowAmount}>{row.outstanding === null ? "Review" : row.outstanding > 0 ? money(row.outstanding) : row.paidInFull ? "Paid" : "No balance"}<ChevronRight size={16} /></span>
    </button>;
  }
  return <main className={styles.page}>
    <header className={styles.header}>
      <a href="/crm/mobile" aria-label="Back to mobile app"><ArrowLeft size={21} /></a>
      {/* Exact approved brand artwork, reversed for the dark surface. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" width={96} height={56} />
      <button aria-label="Refresh payment balances" disabled={loading || sending} onClick={() => void refresh()}><RefreshCw size={19} /></button>
    </header>
    <div className={styles.heading}><small>CUSTOMERS</small><h1>Info & payments</h1><p>Everything you need to collect and connect.</p></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <div className={styles.error} role="alert">{error}<button onClick={() => void refresh()}>Try again</button>{error.includes("Sign in") && <a href="/api/crm/oauth/google?redirectTo=%2Fcrm%2Fmobile%2Fsearch%2F">Sign in to 805 payments</a>}</div>}
    {loading && <p className={styles.muted} role="status">{rows.length ? "Refreshing balances…" : "Loading customers and payment balances…"}</p>}
    {selected && !current && !loading && !error && <p role="status" className={styles.notice}>This job is no longer on the active customer list.<button onClick={() => setSelected(null)}>Back to customers</button></p>}
    {current ? <>
      <button className={styles.back} onClick={() => setSelected(null)}><ArrowLeft size={17} /> All customers</button>
      <h2>{current.name}</h2><p className={styles.muted}>{current.project}</p>
      <div className={styles.tabs} role="group" aria-label="Customer view"><button aria-pressed={detailTab === "payments"} onClick={() => setDetailTab("payments")}>Payments</button><button aria-pressed={detailTab === "info"} onClick={() => setDetailTab("info")}>Customer info</button></div>
      {detailTab === "payments" ? <section className={styles.card}>
        {current.shipped && <span className={styles.badge}><Check size={14} /> Shipped</span>}
        <p className={styles.muted}>Remaining balance</p><div className={styles.amount}>{current.outstanding === null ? "Not verified" : money(current.outstanding)}</div>
        <dl className={styles.totals}><div><dt>Contract total</dt><dd>{money(current.contractTotal)}</dd></div>{current.paid !== null && <div><dt>Payments recorded</dt><dd>{money(current.paid)}</dd></div>}{current.dueType && <div><dt>{current.dueType === "deposit" ? "Deposit due now" : "Balance due now"}</dt><dd>{money(current.amountDue)}</dd></div>}</dl>
        {actions(current)}
        {current.contractUrl && <a className={styles.contract} href={current.contractUrl} target="_blank" rel="noreferrer"><FileText size={18} /> View contract <ChevronRight size={16}/></a>}
      </section> : <section className={`${styles.card} ${styles.info}`}>
        <h3>Contact details</h3>
        {mobilePhoneTarget(current.phone) ? <><a href={mobilePhoneTarget(current.phone)!}><Phone size={18} /> {current.phone}</a><a href={mobileSmsTarget(current.phone)!}><MessageSquare size={18} /> Text customer</a></> : <p>Phone unavailable</p>}
        {current.email ? <a href={`mailto:${current.email}`}><Mail size={18} /> {current.email}</a> : <p>Email unavailable</p>}
        {mobileMapTarget(current.address) ? <a href={mobileMapTarget(current.address)!} target="_blank" rel="noreferrer"><MapPin size={18} /> {current.address}</a> : <p>Address unavailable</p>}
        <h3>Products</h3><p>{current.products.join(" · ") || "Not recorded"}</p>
        {current.contractUrl && <a href={current.contractUrl} target="_blank" rel="noreferrer"><FileText size={18} /> View contract</a>}
      </section>}
    </> : <>
      <label className={styles.search}><Search size={19} /><input aria-label="Search customers" placeholder="Search name, phone or address" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={18} /></button>}</label>
      <div className={styles.sectionHeading}><h2>Next payment</h2><span>{priority.length} ready</span></div>
      <p className={styles.muted}>Shipped with a balance due · oldest sale first</p>
      {priority[0] ? <section className={`${styles.card} ${styles.featured}`}>
        <span className={styles.badge}><Check size={14} /> Shipped · payment due</span>
        <button className={styles.customerTitle} onClick={() => open(priority[0])}>{priority[0].name}<ChevronRight size={19}/></button>
        <p className={styles.muted}>{priority[0].project} {priority[0].products.length ? `· ${priority[0].products.join(" / ")}` : ""}</p>
        <div className={styles.amount}>{money(priority[0].outstanding!)}</div><small>Remaining balance</small>
        {priority[0].dueType === "deposit" && <p className={styles.muted}>Deposit due now: {money(priority[0].amountDue)}</p>}
        {actions(priority[0])}
        <button className={styles.details} onClick={() => open(priority[0])}>Customer info & payment details <ChevronRight size={16}/></button>
      </section> : !loading && !error && <div className={styles.card}><Check className={styles.green}/><h3>{query ? "No matching shipped jobs due" : "No shipped jobs awaiting payment"}</h3><p className={styles.muted}>Other customer records are below.</p></div>}
      {priority.length > 1 && <section><div className={styles.sectionHeading}><h2>Up next</h2><span>{priority.length - 1}</span></div><div className={styles.list}>{priority.slice(1).map(compact)}</div></section>}
      <section><div className={styles.sectionHeading}><h2>Other customers</h2><span>{other.length}</span></div><div className={styles.list}>{other.map(compact)}</div>{!loading && !error && !other.length && <p className={styles.muted}>No other customers{query ? " match this search" : " to show"}.</p>}</section>
    </>}
    {asOf && <p className={styles.updated}>Updated {new Date(asOf).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · Paid & closed jobs hidden</p>}
    <dialog ref={dialog} aria-labelledby="payment-review-title" className={styles.dialog} onCancel={event => { if (sending) event.preventDefault(); else setAction(null); }}>
      {action && <form onSubmit={send}>
        <div className={styles.sectionHeading}><h2 id="payment-review-title">Review payment link</h2><button type="button" aria-label="Close payment review" disabled={sending} onClick={() => setAction(null)}><X size={20}/></button></div>
        <p className={styles.muted}>SQUARE CREDIT CARD PAYMENT</p><h3>{action.row.name}</h3><p>{action.row.project}</p>
        <div className={styles.amount}>{money(action.type === "deposit" ? action.row.deposit : action.row.balance)}</div><p>{action.type === "deposit" ? "Deposit" : "Balance"} payment</p>
        <div className={styles.tabs} role="group" aria-label="Delivery method"><button type="button" aria-pressed={channel === "text"} disabled={attempted || !mobilePhoneTarget(action.row.phone)} onClick={() => setChannel("text")}><MessageSquare size={16}/> Text</button><button type="button" aria-pressed={channel === "email"} disabled={attempted || !action.row.email} onClick={() => setChannel("email")}><Mail size={16}/> Email</button></div>
        <div className={styles.review}><small>To {channel === "text" ? "mobile" : "email"}</small><strong>{channel === "text" ? action.row.phone : action.row.email}</strong>{channel === "email" && <small>From: 805@805shutters.com</small>}<p>The customer receives the secure Square checkout link for this amount.</p></div>
        <p className={styles.muted}>Sending a link does not record a payment. Provider acceptance does not mean delivery.</p>
        {sendError && <p role="alert" className={styles.error}>{sendError}</p>}
        <button className={styles.primary} disabled={sending || !ready} type="submit">{sending ? "Sending once…" : attempted ? "Check same request" : `Confirm & send ${channel === "text" ? "text" : "email"}`}</button>
        <button className={styles.cancel} type="button" disabled={sending} onClick={() => setAction(null)}>Cancel</button>
      </form>}
    </dialog>
  </main>;
}
