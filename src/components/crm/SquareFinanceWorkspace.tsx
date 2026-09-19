'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { SquareObject } from '@/lib/finance/square-reporting';
import './square-finance.css';

type ObjectRow = Omit<SquareObject, 'details'> & { details: Record<string, unknown> };
type Allocation = { id: string; square_payment_id: string; amount_cents: number; ledger_payment_id: string; actor_email: string; evidence: string };
type Ledger = { id: string; quote_id: string | null; bookkeeping_entry_id: string | null; amount: number; paid_at: string; payment_label: string; external_source: string; meta: Record<string, unknown> };
type Target = { id: string; customer_name: string; status?: string; source?: string; quote_total?: number; total_amount?: number; meta: Record<string, unknown> };
type State = { cursor?: string; until?: string; completedThrough?: string; error?: string };
type Data = {
  smsConfigured: boolean; alerts: {id: string; square_payment_id: string; status: string; body: string | null; provider_sid: string | null; error: string | null; created_at: string}[];
  environment: string; canReview: boolean; objects: ObjectRow[]; allocations: Allocation[];
  bankMatches: { id: string; payout_id: string; amount_cents: number; bank_date: string; statement_reference: string; actor_email: string }[];
  classifications: { square_payment_id: string; evidence: string }[];
  events: { id: string; event_type: string; received_at: string; processed_at: string | null; attempts: number; error: string | null }[];
  sync: { history_from: string; last_started_at: string | null; last_finished_at: string | null; error: string | null; merchant_id: string | null; location_id: string | null; state: Record<string, State> };
  totals: { completedGrossCents: number; assignedGrossCents: number; knownFeeCents: number; feesPending: number; completedRefundCents: number; pendingCount: number };
  requests: {id: string; order_id: string | null; quote_id: string | null; bookkeeping_entry_id: string | null; amount_cents: number; payment_type: string; url: string; created_at: string}[];
  credits: {id: string; amount: number; from_quote_id: string | null; to_quote_id: string | null; from_bookkeeping_entry_id: string | null; to_bookkeeping_entry_id: string | null}[];
  quotes: Target[]; entries: Target[]; payments: Ledger[]; webhook: { configured: boolean; url: string | null };
};
const dollars = (cents: number | null) => cents === null ? 'Awaiting Square' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents) / 100);
const date = (value: string | null) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', ...(value.length === 10 ? {} : { timeStyle: 'short' }) }) : 'Not yet';
const tabs = ['Transactions', 'Overview', 'Job finances', 'Payment requests', 'Needs review', 'Payouts', 'Refunds & disputes', 'Connection health'] as const;
type Tab = typeof tabs[number];
function csvCell(value: unknown) { const s = String(value ?? ''); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" : '') + s.replaceAll('"', '""')}"`; }
function receiptUrl(value: unknown) { try { const u = new URL(String(value)); return u.protocol === 'https:' && (u.hostname === 'squareup.com' || u.hostname.endsWith('.squareup.com')) ? u.href : null; } catch { return null; } }

export function SquareFinanceWorkspace({ session }: { session: Session }) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [tab, setTab] = useState<Tab>('Transactions'), [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ObjectRow | null>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const operationRef = useRef(false), lastAutoRefresh = useRef(0);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  useEffect(() => { if (selected) reviewRef.current?.focus(); }, [selected]);
  const [target, setTarget] = useState(''), [existing, setExisting] = useState(''), [amount, setAmount] = useState(''), [evidence, setEvidence] = useState(''), [bankDate, setBankDate] = useState('');
  const [decisionId, setDecisionId] = useState('');
  const api = useCallback(async (body?: Record<string, unknown>) => {
    const response = await fetch('/api/crm/square/', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Square finance request failed.');
    return result;
  }, [session.access_token]);
  const load = useCallback(async () => { try { setData(await api()); setCheckedAt(new Date().toISOString()); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load Square finances.'); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  // Refresh the visible activity feed without interrupting a review form. The
  // existing server lease prevents simultaneous browser/cron imports.
  useEffect(() => {
    if (!data || tab !== 'Transactions' || selected) return;
    let disposed = false;
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || operationRef.current || Date.now() - lastAutoRefresh.current < 60_000) return;
      lastAutoRefresh.current = Date.now();
      operationRef.current = true;
      setAutoRefreshing(true);
      try {
        const result = data.canReview ? await api({ action: 'sync' }) : null;
        if (!disposed) {
          await load();
          if (result?.status === 'needs_attention') setError('Some Square records could not refresh. Your previous transactions remain visible. See Connection health.');
        }
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : 'Automatic refresh failed. Your previous transactions remain visible.');
      } finally {
        operationRef.current = false;
        if (!disposed) setAutoRefreshing(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const onVisible = () => { void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { disposed = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); setAutoRefreshing(false); };
  }, [Boolean(data), data?.canReview, tab, selected, api, load]);
  async function act(body: Record<string, unknown>) {
    if (operationRef.current) return;
    operationRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try { const result = await api(body); await load(); setNotice(result.status === 'already_running' ? 'Square refresh is already running. Refresh this view shortly.' : result.status === 'needs_attention' ? 'Refresh saved available records. Check Connection health for remaining errors.' : body.action === 'sync' ? 'Refresh completed. History coverage is shown under Connection health.' : 'Decision saved and verified.'); if (body.action !== 'sync') setSelected(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action could not be completed.'); }
    finally { operationRef.current = false; setBusy(false); }
  }
  const targets = useMemo(() => data ? [
    ...data.quotes.filter(t => !['archived', 'lost'].includes(t.status || '') && !t.meta?.deleted_at && !t.meta?.bookkeeping_deleted_at).map(t => ({ ...t, key: `quote:${t.id}`, total: t.quote_total })),
    ...data.entries.filter(t => ['manual', 'legacy_sheet'].includes(t.source || '') && !t.meta?.deleted_at && !t.meta?.bookkeeping_deleted_at).map(t => ({ ...t, key: `entry:${t.id}`, total: t.total_amount })),
  ].sort((a, b) => a.customer_name.localeCompare(b.customer_name)) : [], [data]);
  if (!data) return <section className="square-finance"><h1>Square Payments</h1><p role={error ? 'alert' : 'status'}>{error || 'Loading Square records…'}</p><button onClick={() => void load()}>Try again</button></section>;
  const allocated = (id: string) => data.allocations.filter(a => a.square_payment_id === id).reduce((sum, a) => sum + Number(a.amount_cents), 0);
  const excluded = (id: string) => data.classifications.some(c => c.square_payment_id === id);
  const payments = data.objects.filter(o => o.kind === 'payment').sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const review = payments.filter(p => p.status === 'COMPLETED' && !excluded(p.id) && (allocated(p.id) !== Number(p.amount_cents) || p.details.review_error));
  const targetName = (p: Ledger) => p.quote_id ? data.quotes.find(q => q.id === p.quote_id)?.customer_name : data.entries.find(e => e.id === p.bookkeeping_entry_id)?.customer_name;
  const customer = (id: string) => data.allocations.filter(a => a.square_payment_id === id).map(a => { const p = data.payments.find(p => p.id === a.ledger_payment_id); return p ? targetName(p) || 'Linked customer' : 'Ledger record unavailable'; }).join(', ');
  const filtered = (rows: ObjectRow[]) => rows.filter(o => `${o.id} ${customer(o.id)} ${o.details.note || ''} ${o.status}`.toLowerCase().includes(query.toLowerCase()));
  const ledgerTotals = (key: string, total: number) => {
    const [kind, id] = key.split(':');
    const credits = data.credits.reduce((sum, c) => sum + Number(c.amount) * ((kind === 'quote' ? c.to_quote_id === id : c.to_bookkeeping_entry_id === id) ? 1 : 0) - Number(c.amount) * ((kind === 'quote' ? c.from_quote_id === id : c.from_bookkeeping_entry_id === id) ? 1 : 0), 0);
    const rows = data.payments.filter(p => kind === 'quote' ? p.quote_id === id : p.bookkeeping_entry_id === id && !p.quote_id);
    const collected = rows.reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0);
    const square = data.allocations.filter(a => rows.some(p => p.id === a.ledger_payment_id)).reduce((sum, a) => sum + Number(a.amount_cents), 0);
    return { collected, square, credit: Math.round(credits * 100), balance: Math.round(total * 100) - collected - Math.round(credits * 100) };
  };
  function choose(row: ObjectRow) { setSelected(row); setTarget(''); setExisting(''); setEvidence(''); setBankDate(''); setAmount(((Number(row.amount_cents) - (row.kind === 'payment' ? allocated(row.id) : data!.bankMatches.filter(b => b.payout_id === row.id).reduce((s, b) => s + Number(b.amount_cents), 0))) / 100).toFixed(2)); setDecisionId(crypto.randomUUID()); }
  function download() {
    const rows = data!.objects.map(o => [o.kind, o.id, o.status, o.currency, o.amount_cents, o.fee_cents, o.occurred_at, o.payment_id, o.payout_id, o.kind === 'payment' ? customer(o.id) : '', o.kind === 'payment' ? allocated(o.id) : '', o.imported_at]);
    const csv = [['Record type', 'Square ID', 'Status', 'Currency', 'Gross or payout net (cents)', 'Processing fee (cents; blank = unknown)', 'Occurred at', 'Payment ID', 'Payout ID', 'CRM customer', 'Assigned (cents)', 'Last imported'], ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `805-square-finances-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function paymentTable(rows: ObjectRow[]) { return <div className="square-table-scroll"><table className="square-transactions"><thead><tr><th>Customer</th><th>Date & time</th><th>Payment</th><th>Fee</th><th>Status</th><th><span className="square-sr-only">Details</span></th></tr></thead><tbody>{filtered(rows).map(p => <tr key={p.id}><td data-label="Customer"><strong>{customer(p.id) || (excluded(p.id) ? 'Outside 805 — reviewed' : 'Unmatched customer')}</strong><small>{customer(p.id) ? `${dollars(allocated(p.id))} linked to job` : excluded(p.id) ? 'Reviewed · not assigned to 805' : 'Customer match needs review'}</small></td><td data-label="Date">{date(p.occurred_at)}</td><td data-label="Payment" className="square-money">{dollars(p.amount_cents)}</td><td data-label="Fee">{dollars(p.fee_cents)}</td><td data-label="Status"><span className="square-status" data-status={p.status}>{p.status === 'COMPLETED' ? 'Completed' : p.status === 'APPROVED' ? 'Approved' : p.status === 'PENDING' ? 'Pending' : p.status === 'FAILED' ? 'Failed' : p.status === 'CANCELED' ? 'Canceled' : p.status}</span>{Number(p.details.refunded_cents) > 0 && <small>{dollars(Number(p.details.refunded_cents))} refunded — review job balance</small>}{p.details.review_error ? <small role="status">{String(p.details.review_error)}</small> : null}</td><td><button aria-label={`View payment ${p.id}`} onClick={() => choose(p)}>View details <span aria-hidden="true">↗</span></button></td></tr>)}</tbody></table>{!filtered(rows).length && <p>No payments in this view.</p>}</div>; }
  const payoutRows = data.objects.filter(o => o.kind === 'payout').sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const resources = ['recent_payments', 'payment', 'refund', 'dispute', 'payout'];
  const incomplete = resources.some(k => !data.sync.state[k]?.completedThrough || data.sync.state[k]?.error);
  return <section className="square-finance">
    <header><div><p className="square-eyebrow">805 SHUTTERS <span> / {data.environment === 'production' ? 'PAYMENTS' : 'SANDBOX'}</span></p><h1>Square Payments</h1><p>Customer payments, all in one place.</p></div><div className="square-actions"><button disabled={busy || autoRefreshing} onClick={() => void load()}>Refresh list</button>{data.canReview && <button className="square-primary" disabled={busy || autoRefreshing} onClick={() => void act({ action: 'sync' })}>{busy || autoRefreshing ? 'Checking Square…' : 'Refresh from Square'}</button>}<button onClick={download}>Export CSV</button></div></header>
    {error && <p role="alert" className="square-alert">{error}</p>}{notice && <p role="status" className="square-notice">{notice}</p>}
    {tab === 'Connection health' && <p className="square-coverage">Last refresh attempt: {date(data.sync.last_finished_at)}. {incomplete ? 'History is incomplete or needs attention; totals cover imported records only.' : `Records checked from ${date(data.sync.history_from)}. See coverage by category below.`}</p>}
    <nav aria-label="Square finance views">{tabs.map(t => <button key={t} aria-pressed={tab === t} onClick={() => { setTab(t); setQuery(''); setSelected(null); }}>{t}{t === 'Needs review' ? ` (${review.length})` : ''}</button>)}</nav>
    {tab === 'Overview' && <>{incomplete && <p className="square-coverage">History is still loading or needs attention. Totals cover imported records only; check Connection health for coverage.</p>}<div className="square-metrics">{[
      ['Square gross collected', dollars(data.totals.completedGrossCents), 'All completed USD payments at this Square location', 'Transactions'],
      ['Assigned to 805 jobs', dollars(data.totals.assignedGrossCents), 'Gross credits linked to the CRM ledger', 'Transactions'],
      ['Known processing fees', dollars(data.totals.knownFeeCents), `${data.totals.feesPending} payments still awaiting fees`, 'Transactions'],
      ['Completed refunds', dollars(data.totals.completedRefundCents), 'Check affected job balances before collecting again', 'Refunds & disputes'],
      ['Needs assignment / review', String(review.length), 'Includes historical payments awaiting exact evidence', 'Needs review'],
      ['Pending customer payments', String(data.totals.pendingCount), 'No customer credit until completed', 'Transactions'],
    ].map(([label, value, note, view]) => <button className="square-metric" key={label} onClick={() => setTab(view as Tab)}><span>{label}</span><strong>{value}</strong><small>{note}</small></button>)}</div><p>Payouts move money already collected. They are not added to sales. Bank matches require your statement reference; Square payout status alone does not confirm receipt.</p><h2>Recent payments</h2>{paymentTable(payments.slice(0, 10))}</>}
    {tab === 'Job finances' && <><label>Find customer / job<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Customer name" /></label><p>Job balances use the existing CRM ledger, including other payment methods and transferred credits. Square fees are tracked separately and never reduce the customer's payment credit.</p><div className="square-table-scroll"><table><thead><tr><th>Customer / ledger</th><th>Job total</th><th>All payments</th><th>Square linked</th><th>Net credits transferred</th><th>Balance</th><th>Square activity</th></tr></thead><tbody>{targets.filter(t => t.customer_name.toLowerCase().includes(query.toLowerCase())).map(t => { const totals = ledgerTotals(t.key, Number(t.total)); return <tr key={t.key}><td>{t.customer_name}<small>{t.key.startsWith('quote:') ? 'Quote' : 'Standalone ledger'} · {t.id.slice(0, 8)}</small></td><td>{dollars(Number(t.total) * 100)}</td><td>{dollars(totals.collected)}</td><td>{dollars(totals.square)}</td><td>{dollars(totals.credit)}</td><td>{dollars(totals.balance)}</td><td><button onClick={() => { setQuery(t.customer_name); setTab('Transactions'); }}>View payments</button></td></tr>; })}</tbody></table></div></>}
    {tab === 'Payment requests' && <><p>New requests keep their exact job, amount, and Square order. Create deposit, custom progress, and balance requests from the job's existing payment panel. Historical requests created before this release are not included.</p><div className="square-table-scroll"><table><thead><tr><th>Created / job</th><th>Requested</th><th>Square collected</th><th>Request status</th><th>Reference</th></tr></thead><tbody>{data.requests.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map(r => {
      const target = targets.find(t => t.key === (r.quote_id ? `quote:${r.quote_id}` : `entry:${r.bookkeeping_entry_id}`));
      const related = payments.filter(p => r.order_id && p.details.order_id === r.order_id && p.status === 'COMPLETED');
      const collected = related.reduce((sum, p) => sum + Number(p.amount_cents), 0);
      const balance = target ? ledgerTotals(target.key, Number(target.total)).balance : null;
      return <tr key={r.id}><td>{date(r.created_at)}<small>{target?.customer_name || 'Ledger needs review'}</small></td><td>{dollars(r.amount_cents)}<small>{r.payment_type}</small></td><td>{dollars(collected)}</td><td>{collected >= Number(r.amount_cents) ? related.some(p => Number(p.details.refunded_cents)>0) ? 'Paid — refund review' : 'Paid' : collected > 0 ? 'Partially paid' : balance !== null && balance < Number(r.amount_cents) ? 'Balance changed — replace this link in Square' : r.order_id ? 'Awaiting completed payment' : 'Order link needs review'}</td><td>{r.id}<small>{r.order_id}</small></td></tr>;
    })}</tbody></table>{!data.requests.length && <p>No new payment requests have been created yet.</p>}</div></>}
    {(tab === 'Transactions' || tab === 'Needs review') && <>{tab === 'Transactions' && <div className="square-feed-heading"><div><p className="square-eyebrow">PAYMENT ACTIVITY</p><h2>Latest transactions <span>{payments.length}</span></h2><p>Newest first · All transactions at your Square location</p></div><div className="square-live-status" aria-live="polite"><span className="square-live-dot" aria-hidden="true" />{autoRefreshing ? 'Checking for payments…' : error ? 'Refresh needs attention' : 'Auto-refresh on'}<small>{data.canReview ? 'Checks Square every minute while open' : 'Updates this list every minute'}{checkedAt ? ` · List updated ${new Date(checkedAt).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit', timeZone:'America/Los_Angeles'})}` : ''}</small></div></div>}<label className="square-search"><span>Find a payment or customer</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Customer, payment ID, or note" /></label>{tab === 'Needs review' && <p>Link an existing CRM credit when it was already recorded manually or from email. Only add a new credit when your evidence confirms it is missing. Split a payment by assigning part of its gross amount to each job.</p>}{paymentTable(tab === 'Transactions' ? payments : review)}</>}
    {tab === 'Payouts' && <div className="square-table-scroll"><table><thead><tr><th>Payout / expected arrival</th><th>Square status</th><th>Net transfer</th><th>Breakdown check</th><th>Bank evidence</th></tr></thead><tbody>{payoutRows.map(p => {
      const entries = data.objects.filter(e => e.payout_id === p.id), state = data.sync.state[`entries:${p.id}`];
      const complete = Boolean(state?.completedThrough && !state.cursor && !state.error && Date.parse(state.completedThrough) >= Date.parse(p.provider_updated_at));
      const sum = entries.reduce((s, e) => s + Number(e.amount_cents), 0), matched = data.bankMatches.filter(b => b.payout_id === p.id).reduce((s, b) => s + Number(b.amount_cents), 0);
      return <tr key={p.id}><td>{p.id}<small>{String(p.details.arrival_date || 'Arrival pending')}</small></td><td>{p.status}</td><td>{dollars(p.amount_cents)}</td><td>{!complete ? 'Breakdown incomplete' : sum === Number(p.amount_cents) ? `${entries.length} entries balance` : `Difference ${dollars(Number(p.amount_cents) - sum)}`}</td><td>{matched === Number(p.amount_cents) && p.status === 'PAID' ? 'Matched to statement' : `${dollars(matched)} matched`}<button onClick={() => choose(p)}>View / match</button></td></tr>;
    })}</tbody></table>{!payoutRows.length && <p>No payouts imported yet.</p>}</div>}
    {tab === 'Refunds & disputes' && <><p>Refunds and disputes are tracked here. Review the original job credit and any customer balance correction separately. Resolve disputes or issue refunds in Square.</p><div className="square-table-scroll"><table><thead><tr><th>Type / date</th><th>Square record</th><th>Amount</th><th>Status</th><th>Payment / deadline</th></tr></thead><tbody>{data.objects.filter(o => ['refund', 'dispute'].includes(o.kind)).map(o => <tr key={`${o.kind}:${o.id}`}><td>{o.kind}<small>{date(o.occurred_at)}</small></td><td>{o.id}</td><td>{dollars(o.amount_cents)}</td><td>{o.status}</td><td>{customer(o.payment_id || '') || o.payment_id || 'Needs review'}<small>{o.details.due_at ? `Evidence due ${date(String(o.details.due_at))}` : String(o.details.reason || '')}</small></td></tr>)}</tbody></table></div><a href="https://app.squareup.com/" target="_blank" rel="noreferrer">Open Square Dashboard</a></>}
    {tab === 'Connection health' && <><h2>Connection and coverage</h2><dl><dt>Square merchant</dt><dd>{data.sync.merchant_id || 'Not verified yet'}</dd><dt>Location</dt><dd>{data.sync.location_id || 'Not verified yet'}</dd><dt>Webhook configuration</dt><dd>{data.webhook.configured ? 'Signing configuration present; delivery evidence below' : 'Webhook configuration missing'}</dd><dt>Callback</dt><dd>{data.webhook.url || 'Not configured'}</dd><dt>Latest refresh error</dt><dd>{data.sync.error || 'None reported'}</dd></dl><table><thead><tr><th>Category</th><th>Fully checked through</th><th>Remaining work</th></tr></thead><tbody>{resources.map(k => <tr key={k}><td>{k}</td><td>{date(data.sync.state[k]?.completedThrough || null)}</td><td>{data.sync.state[k]?.error || (data.sync.state[k]?.cursor ? (data.sync.state[k]?.completedThrough ? 'Rechecking history for changes' : 'More history pages to import') : data.sync.state[k]?.completedThrough ? 'Current pass complete' : 'Awaiting first pass')}</td></tr>)}</tbody></table><h2>Payment texts to 805-298-5555</h2><p>{data.smsConfigured ? "Text service configured. New completed payments are queued once; old imports are excluded." : "Text service is not configured. Payment alerts will remain queued."}</p><div className="square-table-scroll"><table><thead><tr><th>Created</th><th>Message</th><th>Delivery status</th></tr></thead><tbody>{data.alerts.map(a => <tr key={a.id}><td>{date(a.created_at)}</td><td>{a.body || a.square_payment_id}</td><td>{a.status}<small>{a.error || a.provider_sid}</small></td></tr>)}</tbody></table></div><h2>Latest webhook deliveries</h2><p>Showing the latest 100 deliveries. Every accepted event is stored before acknowledgment.</p><div className="square-table-scroll"><table><thead><tr><th>Received</th><th>Event</th><th>Processing</th></tr></thead><tbody>{data.events.map(e => <tr key={e.id}><td>{date(e.received_at)}</td><td>{e.event_type}<small>{e.id}</small></td><td>{e.error || (e.processed_at ? 'Processed' : 'Waiting for worker')}<small>{e.attempts} attempts</small></td></tr>)}</tbody></table></div>{!data.events.length && <p>No live webhook delivery has been recorded yet.</p>}</>}
    {selected && <section ref={reviewRef} tabIndex={-1} className="square-review" aria-label="Square record details"><div className="square-actions"><h2>{selected.kind === 'payment' ? 'Review customer payment' : 'Review payout'}</h2><button onClick={() => setSelected(null)}>Close</button></div><p><strong>{dollars(selected.amount_cents)}</strong> · {selected.status} · {selected.id}</p>
      {selected.kind === 'payment' ? <>{selected.details.note && <p className="square-payment-note">{String(selected.details.note)}</p>}<p>{dollars(allocated(selected.id))} assigned to {customer(selected.id) || 'no job yet'}.</p>{receiptUrl(selected.details.receipt_url) && <a href={receiptUrl(selected.details.receipt_url)!} target="_blank" rel="noreferrer">View Square receipt</a>}{data.allocations.filter(a => a.square_payment_id === selected.id).map(a => <p key={a.id}>{dollars(a.amount_cents)} — {a.evidence} · {a.actor_email}</p>)}
      {data.canReview && selected.status === 'COMPLETED' && !excluded(selected.id) && allocated(selected.id) < Number(selected.amount_cents) && <form onSubmit={e => { e.preventDefault(); const [kind, id] = target.split(':'); void act({ action: 'allocate', paymentId: selected.id, decisionId, amountCents: Math.round(Number(amount) * 100), quoteId: kind === 'quote' ? id : null, entryId: kind === 'entry' ? id : null, existingPaymentId: existing || null, evidence }); }}>
        <label>Customer / job ledger<select required value={target} onChange={e => { setTarget(e.target.value); setExisting(''); }}>{<option value="">Choose the exact job</option>}{targets.map(t => <option key={t.key} value={t.key}>{t.customer_name} — {dollars(Number(t.total) * 100)} — {t.key.startsWith('quote') ? 'Quote' : 'Ledger'} {t.id.slice(0, 8)}</option>)}</select></label>
        <label>How was this payment recorded?<select value={existing} onChange={e => { setExisting(e.target.value); const p = data.payments.find(p => p.id === e.target.value); if (p) setAmount(Number(p.amount).toFixed(2)); }}><option value="">Add missing customer credit</option>{data.payments.filter(p => target.startsWith('quote:') ? p.quote_id === target.slice(6) : p.bookkeeping_entry_id === target.slice(6) && !p.quote_id).map(p => <option key={p.id} value={p.id}>Link existing {dollars(Number(p.amount) * 100)} · {p.paid_at} · {p.payment_label} ({p.external_source || 'manual'})</option>)}</select></label>
        <label>Amount to assign ($)<input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label><label>Evidence confirming the match<textarea required minLength={8} maxLength={2000} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Receipt reference, exact job, and why this is an existing or missing credit" /></label><button disabled={busy || !target} type="submit">{existing ? 'Confirm link — no new customer credit' : `Confirm new customer credit ${dollars(Math.round(Number(amount) * 100))}`}</button>
        {allocated(selected.id) === 0 && <button type="button" disabled={busy || evidence.trim().length < 8} onClick={() => void act({ action: 'exclude', paymentId: selected.id, evidence })}>Confirm this payment is outside 805</button>}
      </form>}</> : <><h3>Payout breakdown</h3><div className="square-table-scroll"><table><thead><tr><th>Entry</th><th>Gross</th><th>Fee</th><th>Net</th><th>Payment</th></tr></thead><tbody>{data.objects.filter(o => o.payout_id === selected.id).map(o => <tr key={o.id}><td>{o.status}</td><td>{dollars(o.details.gross_cents === null ? null : Number(o.details.gross_cents))}</td><td>{dollars(o.details.payout_fee_cents === null ? null : Number(o.details.payout_fee_cents))}</td><td>{dollars(o.amount_cents)}</td><td>{customer(o.payment_id || '') || o.payment_id || 'Payout adjustment'}</td></tr>)}</tbody></table></div>{data.bankMatches.filter(b => b.payout_id === selected.id).map(b => <p key={b.id}>{date(b.bank_date)} · {dollars(b.amount_cents)} · {b.statement_reference} · {b.actor_email}</p>)}
      {data.canReview && selected.status === 'PAID' && <form onSubmit={e => { e.preventDefault(); void act({ action: 'bank', payoutId: selected.id, bankDate, amountCents: Math.round(Number(amount) * 100), evidence }); }}><label>Bank statement date<input required type="date" value={bankDate} onChange={e => setBankDate(e.target.value)} /></label><label>Amount matched to this payout ($)<input required type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label><label>Statement / bank transaction reference<textarea required minLength={8} maxLength={2000} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Bank account nickname, statement date/page, transaction reference" /></label><button disabled={busy}>Confirm bank evidence</button></form>}</>}
    </section>}
  </section>;
}
