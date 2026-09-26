'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Mail, MessageSquare, RefreshCw, Search, Send, Smartphone } from 'lucide-react';
import type { MobilePaymentCustomer } from '@/lib/crm/mobile-payment-queue';
import { mobilePhoneTarget } from '@/lib/crm/mobile-customers';
import { paymentMoney as money, squarePaymentMessage, validPaymentAmount, type CustomerPaymentChoice } from '@/lib/crm/customer-payment-request';
import styles from './CustomerPaymentsWorkspace.module.css';

type Channel = 'text' | 'email';
type Filter = 'owing' | 'deposit' | 'balance' | 'all';
type SendRequest = {
  quoteId: string; jobId: string; paymentType: 'deposit' | 'balance'; requestKind: CustomerPaymentChoice;
  expectedAmount: number; expectedRecipient: string; channel: Channel; idempotencyKey: string; customAmount?: number;
};
const eligible = (row: MobilePaymentCustomer) => Boolean(row.sold && row.quoteId && row.jobId && !row.archived && row.outstanding !== null && row.outstanding > 0);

export function CustomerPaymentsWorkspace({ session }: { session: Session }) {
  const [rows, setRows] = useState<MobilePaymentCustomer[]>([]);
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<Filter>('owing');
  const [selected, setSelected] = useState<string | null>(null);
  const [kind, setKind] = useState<CustomerPaymentChoice>('deposit'), [custom, setCustom] = useState('');
  const [channel, setChannel] = useState<Channel>('text');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [asOf, setAsOf] = useState('');
  const [sending, setSending] = useState(false), [sendError, setSendError] = useState(''), [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState<SendRequest | null>(null);
  const [accepted, setAccepted] = useState(false);
  const sendingRef = useRef(false), controller = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement>(null);
  const api = useCallback(async (init?: RequestInit) => {
    const response = await fetch('/api/crm/mobile/customers?scope=all', {
      ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'The payment request could not be completed.');
    return data;
  }, [session.access_token]);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const pending = new AbortController(); controller.current = pending;
    setLoading(true); setError('');
    try {
      const data = await api({ signal: pending.signal });
      if (!Array.isArray(data.results)) throw new Error('Customer payment data could not be verified. Refresh and try again.');
      if (!pending.signal.aborted) { setRows(data.results); setAsOf(data.asOf); }
    } catch (e) { if (!pending.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load customer payments.'); }
    finally { if (!pending.signal.aborted) setLoading(false); }
  }, [api]);
  useEffect(() => { void refresh(); return () => controller.current?.abort(); }, [refresh]);
  // A review stays stable while being composed. The server rechecks the ledger at send time.
  const term = query.trim().toLowerCase();
  const filtered = rows.filter(row => (filter === 'all' || (row.sold && !row.archived && row.outstanding !== null && row.outstanding > 0
    && (filter === 'owing' || filter === 'deposit' && row.deposit > 0 || filter === 'balance' && row.balance > 0)))
    && (!term || [row.name, row.project, row.phone, row.email, row.address].some(value => value?.toLowerCase().includes(term))));
  const current = rows.find(row => row.id === selected);
  const amount = current ? kind === 'custom' ? Number(custom) : kind === 'full' ? current.outstanding : current[kind] : null;
  const amountValid = validPaymentAmount(amount) && current?.outstanding !== null && amount <= (current?.outstanding ?? 0);
  const recipient = current ? channel === 'text' ? current.phone : current.email : null;
  const contactValid = channel === 'text' ? Boolean(mobilePhoneTarget(recipient)) : Boolean(recipient && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient));
  const locked = sending || attempt !== null;
  const ready = Boolean(current && eligible(current) && amountValid && contactValid && !loading && !error);
  const message = current && amountValid ? squarePaymentMessage(current.name, '[Secure payment link]', {
    amount: amount!, paymentType: kind === 'deposit' ? 'deposit' : 'balance', customAmount: kind === 'custom', fullAmount: kind === 'full',
  }) : null;

  function choose(row: MobilePaymentCustomer) {
    if (locked) return;
    setSelected(row.id); setKind(row.deposit > 0 ? 'deposit' : 'balance'); setCustom('');
    setChannel(mobilePhoneTarget(row.phone) ? 'text' : 'email'); setSendError(''); setNotice('');
    requestAnimationFrame(() => { panel.current?.focus({ preventScroll: true }); if (window.innerWidth < 1000) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  async function send() {
    if (sendingRef.current || accepted || (!attempt && !ready) || !current) return;
    const request: SendRequest = attempt || {
      quoteId: current.quoteId!, jobId: current.jobId, paymentType: kind === 'deposit' ? 'deposit' : 'balance', requestKind: kind,
      expectedAmount: amount!, expectedRecipient: recipient!, channel, idempotencyKey: crypto.randomUUID(),
      ...(kind === 'custom' ? { customAmount: amount! } : {}),
    };
    sendingRef.current = true; setSending(true); setAttempt(request); setSendError(''); setNotice('');
    try {
      const result = await api({ method: 'POST', body: JSON.stringify(request) });
      if (result.deliveryState !== 'accepted') throw new Error('Provider acceptance is unconfirmed. Check the same request before starting another.');
      setAccepted(true);
      setNotice(`${request.channel === 'text' ? 'Text' : 'Email'} provider accepted the ${money(result.amount)} payment link${result.replayed ? ' (same request; not sent again)' : ''}. Delivery is not yet confirmed.`);
    } catch (e) { setSendError(e instanceof Error ? e.message : 'Could not confirm the send. Check the same request before starting another.'); }
    finally { sendingRef.current = false; setSending(false); }
  }
  function closeRequest() { setAttempt(null); setAccepted(false); setSelected(null); setNotice(''); setSendError(''); void refresh(); }

  return <section className={styles.workspace} aria-label="Customer payments">
    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={18} aria-hidden="true" /><input aria-label="Search customer payments" placeholder="Search customer or job number" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <select aria-label="Payment status" value={filter} onChange={e => setFilter(e.target.value as Filter)}><option value="owing">Payments outstanding</option><option value="deposit">Deposit outstanding</option><option value="balance">Balance outstanding</option><option value="all">All customers</option></select>
      <button className={styles.button} disabled={loading || locked} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden="true" />Refresh</button>
    </div>
    {loading && <p className={styles.muted} role="status">{rows.length ? 'Refreshing balances…' : 'Loading customers and balances…'}</p>}
    {error && <p className={styles.error} role="alert">{error} <button className={styles.button} disabled={locked} onClick={() => void refresh()}>Try again</button></p>}
    <div className={styles.layout} data-selected={Boolean(current)}>
      <div className={styles.list}><header className={styles.listHeader}><h2>Customers</h2><span>{filtered.length} customers</span></header>
        {filtered.map(row => <article key={row.id} className={`${styles.row} ${current?.id === row.id ? styles.selected : ''}`}>
          <div className={styles.person}><div><strong>{row.name}</strong><p className={styles.muted}>{row.project}</p></div><span className={styles.badge}>{row.archived ? 'Archived' : !row.sold ? 'Sale not recorded' : row.outstanding === null ? 'Needs review' : row.outstanding <= 0 ? row.paidInFull ? 'Paid in full' : 'No balance' : row.deposit > 0 ? 'Deposit outstanding' : 'Balance outstanding'}</span></div>
          <div className={styles.numbers}><div><span>Deposit outstanding</span><strong>{!row.sold ? '—' : row.outstanding === null ? 'Unverified' : money(row.deposit)}</strong></div><div><span>Balance outstanding</span><strong>{!row.sold ? '—' : row.outstanding === null ? 'Unverified' : money(row.balance)}</strong></div><button className={`${styles.button} ${current?.id === row.id ? styles.primary : ''}`} disabled={locked || loading || Boolean(error) || !eligible(row)} onClick={() => choose(row)} aria-label={`Send payment link to ${row.name}, ${row.project}`}>{row.paidInFull ? 'Fully paid' : 'Send link'}</button></div>
          <p className={styles.rowNote}>{row.closed ? 'Closed job' : row.shipped ? 'Shipped' : row.paid && row.deposit > 0 ? 'Partial deposit received' : row.products.join(' · ')}</p>
          {!eligible(row) && row.outstanding !== null && row.outstanding > 0 && <p className={styles.rowNote}>{row.archived ? 'Restore this job before requesting payment.' : !row.sold ? 'Record the sale before requesting payment here.' : 'A linked customer contract is needed to send a payment link.'}</p>}
        </article>)}
        {!loading && !error && !filtered.length && <p className={styles.empty}>No customers match this search or payment status.</p>}
      </div>
      <aside className={styles.panel} ref={panel} tabIndex={-1} aria-label="Send payment link">
        <header className={styles.panelHeading}><h2>Send payment link</h2><Send size={18} aria-hidden="true" /></header>
        {current ? <>
          <strong>{current.name}</strong><p className={styles.muted}>{current.project}</p>
          <dl className={styles.summary}><div><dt>Contract total</dt><dd>{money(current.contractTotal)}</dd></div><div><dt>Payments received</dt><dd>{current.paid === null ? 'Not verified' : money(current.paid)}</dd></div><div><dt>Total outstanding</dt><dd>{current.outstanding === null ? 'Not verified' : money(current.outstanding)}</dd></div></dl>
          <label className={styles.field}><span>Payment requested</span><select aria-label="Payment requested" value={kind} disabled={locked} onChange={e => setKind(e.target.value as CustomerPaymentChoice)}>{current.deposit > 0 && <option value="deposit">Remaining deposit · {money(current.deposit)}</option>}{current.balance > 0 && <option value="balance">Remaining balance · {money(current.balance)}</option>}<option value="full">Entire amount owed · {money(current.outstanding ?? 0)}</option><option value="custom">Specific amount</option></select></label>
          {kind === 'custom' && <label className={styles.field}><span>Specific amount ($)</span><input aria-label="Specific amount ($)" type="number" inputMode="decimal" min="0.01" max={current.outstanding ?? 0} step="0.01" value={custom} disabled={locked} onChange={e => setCustom(e.target.value)} aria-describedby="payment-amount-help" /><small id="payment-amount-help">Up to {money(current.outstanding ?? 0)} currently owed.</small></label>}
          {!amountValid && <p className={styles.error} role="alert">Enter a positive amount up to the total owed, with no more than two decimal places.</p>}
          <div className={styles.requestAmount}><span>Amount on payment link</span><strong>{amountValid ? money(amount!) : '—'}</strong></div>
          <fieldset className={styles.channels} disabled={locked}><legend>Send via</legend><div><button type="button" className={styles.button} aria-pressed={channel === 'text'} disabled={!mobilePhoneTarget(current.phone)} onClick={() => setChannel('text')}><MessageSquare size={16} aria-hidden="true" />Text message</button><button type="button" className={styles.button} aria-pressed={channel === 'email'} disabled={!current.email} onClick={() => setChannel('email')}><Mail size={16} aria-hidden="true" />Email</button></div></fieldset>
          <p className={styles.recipient}>To: {recipient || 'No contact available'}{channel === 'email' && <><br />From: 805@805shutters.com</>}</p>
          {!contactValid && <p className={styles.error}>A valid customer {channel === 'text' ? 'phone number' : 'email address'} is required.</p>}
          <span className={styles.previewLabel}>MESSAGE PREVIEW</span><div className={styles.message}>{message ? channel === 'text' ? message.sms : `Subject: ${message.subject}\n\n${message.text}` : 'Enter a valid amount to preview the message.'}</div>
          <button type="button" className={`${styles.button} ${styles.primary} ${styles.send}`} disabled={sending || accepted || (!attempt && !ready)} onClick={() => void send()}><Send size={16} aria-hidden="true" />{sending ? 'Sending once…' : accepted ? 'Provider accepted' : attempt ? 'Check same request' : `Send ${channel === 'text' ? 'text' : 'email'} link`}</button>
          {sendError && <p className={styles.error} role="alert">{sendError}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
          {attempt && <><p className={styles.rowNote}>{accepted ? 'Sending a link does not record a payment or change the amount owed.' : 'If acceptance is unknown, review this request before starting another send.'}</p><button type="button" className={styles.button} disabled={sending} onClick={closeRequest}>Close request & refresh</button></>}
        </> : <p className={styles.empty}>Select a customer’s Send link button to review their amount and choose text or email.</p>}
      </aside>
    </div>
    <p className={styles.footer}><Smartphone size={14} aria-hidden="true" />Same balances as Customer Info / Payments{asOf ? ` · Updated ${new Date(asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
  </section>;
}
