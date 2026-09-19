/** Shared read model. Exact provider IDs deduplicate payments; names/amounts never do. */
export type HubLedger = {
  id: string; quote_id: string | null; bookkeeping_entry_id: string | null; amount: number;
  paid_at: string | null; payment_label: string; payment_type?: string; external_source?: string;
  external_id?: string; created_at?: string; updated_at?: string; notes?: string | null;
  meta: Record<string, unknown>;
};
export type HubSquare = { id: string; kind: string; occurred_at: string; amount_cents: number; fee_cents: number | null; status: string; currency?: string; details: Record<string, unknown> };
export const paymentMethods = {
  credit_card: 'Square / Card', apple_pay: 'Apple Pay', check: 'Checks', cash: 'Cash', zelle: 'Zelle', venmo: 'Venmo', other: 'Other',
} as const;
export type HubMethod = keyof typeof paymentMethods;
export const paymentPurposes = { deposit: 'Deposit', balance: 'Balance', progress: 'Progress payment', full: 'Full payment', unspecified: 'Unspecified' } as const;
export type HubPurpose = keyof typeof paymentPurposes;
export const hubRecord = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === 'string' ? v : '';
export function ledgerPurpose(p: HubLedger): HubPurpose {
  const explicit = str(hubRecord(p.meta?.payment_hub).purpose || p.meta?.square_payment_type).toLowerCase();
  if (Object.hasOwn(paymentPurposes, explicit)) return explicit as HubPurpose;
  const label = p.payment_label?.trim().toLowerCase() || '';
  if (/^(?:square\s+)?deposit(?:\s+payment)?$/.test(label)) return 'deposit';
  if (/^(?:square\s+)?(?:balance|final)(?:\s+payment)?$/.test(label)) return 'balance';
  if (/^(?:progress|partial|custom)(?:\s+payment)?$/.test(label)) return 'progress';
  if (/^(?:full payment|paid in full)$/.test(label)) return 'full';
  return 'unspecified';
}
function ledgerMethod(p: HubLedger): HubMethod {
  const method = str(hubRecord(p.meta?.payment_hub).method || p.payment_type);
  return Object.hasOwn(paymentMethods, method) ? method as HubMethod : 'other';
}
export type HubTransaction = {
  id: string; squareId?: string; ledger?: HubLedger; customer: string; method: HubMethod;
  purposes: HubPurpose[]; occurredAt: string; dateIsRecorded: boolean; recordedAt?: string; amountCents: number;
  creditCents: number; feeCents: number | null; currency: string; status: string; detail: string; reference: string;
};
export function buildPaymentHub(input: {
  objects: HubSquare[]; payments: HubLedger[];
  allocations: {square_payment_id: string; ledger_payment_id: string}[];
  quotes: {id: string; customer_name: string}[]; entries: {id: string; customer_name: string}[];
  requests: {order_id: string | null; payment_type: string}[];
  classifications: {square_payment_id: string}[];
}): HubTransaction[] {
  const used = new Set<string>();
  const name = (p: HubLedger) => (p.quote_id ? input.quotes.find(q=>q.id===p.quote_id) : input.entries.find(e=>e.id===p.bookkeeping_entry_id))?.customer_name || 'Customer unavailable';
  const rows: HubTransaction[] = input.objects.filter(p=>p.kind==='payment').map(p=>{
    const linked = input.payments.filter(l=>input.allocations.some(a=>a.square_payment_id===p.id && a.ledger_payment_id===l.id) || (l.external_source==='square' && l.external_id===p.id) || l.meta?.square_payment_id===p.id);
    linked.forEach(l=>used.add(l.id));
    const note = str(p.details.note);
    // These exact formats are emitted by our payment-link / wallet checkout.
    const walletNote = note.match(/^(deposit|balance):[\da-f-]{36}:(apple_pay|google_pay)$/i);
    const linkNote = note.match(/^(?:quote|entry):[\da-f-]{36} type:(deposit|balance)$/i);
    const request = input.requests.find(r=>r.order_id && r.order_id===p.details.order_id);
    const rawPurpose = request?.payment_type || walletNote?.[1] || linkNote?.[1];
    const purposes = [...new Set(linked.map(ledgerPurpose))];
    if (!purposes.length || purposes.every(v=>v==='unspecified')) {
      purposes.splice(0,purposes.length,rawPurpose && Object.hasOwn(paymentPurposes, rawPurpose) ? rawPurpose as HubPurpose : 'unspecified');
    }
    const wallet = str(p.details.wallet_type).toUpperCase();
    const source = str(p.details.source_type).toUpperCase();
    const method: HubMethod = wallet==='APPLE_PAY' || walletNote?.[2]==='apple_pay' ? 'apple_pay' : source==='CASH' ? 'cash' : source && source!=='CARD' ? 'other' : 'credit_card';
    const outside = input.classifications.some(c=>c.square_payment_id===p.id);
    return {id:`square:${p.id}`,squareId:p.id,customer:[...new Set(linked.map(name))].join(', ') || (outside?'Outside 805 — reviewed':'Unmatched customer'),method,purposes,occurredAt:p.occurred_at,dateIsRecorded:false,amountCents:Number(p.amount_cents),creditCents:linked.reduce((s,l)=>s+Math.round(Number(l.amount)*100),0),feeCents:p.fee_cents,currency:p.currency||'USD',status:p.status,detail:Number(p.details.refunded_cents)>0?'Refund recorded — review job balance':str(p.details.review_error)||(!linked.length ? outside?'Not assigned to 805':'Customer match needs review':'Linked to CRM ledger'),reference:note};
  });
  for (const p of input.payments) {
    if (used.has(p.id)) continue;
    const hub = hubRecord(p.meta?.payment_hub), check = hubRecord(hub.check);
    const method=ledgerMethod(p), original=Number(check.original_amount_cents);
    rows.push({id:`ledger:${p.id}`,ledger:p,customer:name(p),method,purposes:[ledgerPurpose(p)],occurredAt:p.paid_at || p.created_at || '',dateIsRecorded:!p.paid_at,recordedAt:p.created_at,amountCents:Number.isSafeInteger(original)&&original>0?original:Math.round(Number(p.amount)*100),creditCents:Math.round(Number(p.amount)*100),feeCents:null,currency:'USD',status:method==='check'?str(check.status)||'UNVERIFIED':'RECORDED',detail:method==='check'?str(check.number)?`Check #${str(check.number)}`:'Check clearance not verified':p.external_source==='square_email'?'Email record — provider match unverified':'CRM receipt',reference:str(hub.reference)||p.notes||p.payment_label});
  }
  // Date-only receipts stay on their actual business date; do not invent a time.
  const localTimestamp = (v: string) => new Date(v).toLocaleString('sv-SE',{timeZone:'America/Los_Angeles'}).replace(' ','T');
  const sortKey = (r: HubTransaction) => {
    if(r.occurredAt.length!==10) return r.occurredAt ? localTimestamp(r.occurredAt) : '';
    const recorded=r.recordedAt ? localTimestamp(r.recordedAt) : '';
    return recorded.startsWith(r.occurredAt) ? recorded : `${r.occurredAt}T00:00:00`;
  };
  return rows.sort((a,b)=>sortKey(b).localeCompare(sortKey(a)) || a.id.localeCompare(b.id));
}
