import { squareAccessToken, squareApiBase, squareLocationId } from './square';

export type SquareRecord = Record<string, unknown>;
export type SquareObjectKind = 'payment' | 'refund' | 'dispute' | 'payout' | 'payout_entry';
export function record(value: unknown): SquareRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as SquareRecord : {};
}
export function text(value: unknown) { return typeof value === 'string' ? value : ''; }
export function cents(value: unknown): number {
  if (!Number.isSafeInteger(value)) throw new Error('Square returned an invalid money amount.');
  return value as number;
}
export function money(value: unknown) {
  const item = record(value);
  return { amount: cents(item.amount), currency: text(item.currency || item.currency_code) };
}
/** Read-only reporting uses its own version pin; it does not change checkout APIs. */
export async function squareRead(path: string): Promise<SquareRecord> {
  const token = squareAccessToken();
  if (!token || !squareLocationId()) throw new Error('Square access token and location are required.');
  const response = await fetch(`${squareApiBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2026-09-16', Accept: 'application/json' },
    signal: AbortSignal.timeout(15000), cache: 'no-store',
  });
  if (!response.ok) {
    // Do not copy provider bodies containing account/customer information to logs.
    throw new Error(`Square reporting request failed (${response.status}). Check connection permissions and retry.`);
  }
  return record(await response.json());
}
export function normalizeSquareObject(kind: SquareObjectKind, input: SquareRecord, context: {
  environment: string; merchantId: string; locationId: string; payoutId?: string;
}) {
  if (!text(input.id)) throw new Error('Square record has no stable identity.');
  const locationId = text(input.location_id) || (kind === 'payout_entry' ? context.locationId : '');
  if (locationId !== context.locationId) throw new Error('Square location does not match the configured company location.');
  const amount = money(kind === 'payment' ? input.total_money || input.amount_money : kind === 'payout_entry' ? input.net_amount_money : input.amount_money);
  if (!amount.currency) throw new Error('Square money currency is missing.');
  const fees = Array.isArray(input.processing_fee) ? input.processing_fee : null;
  const feeCents = fees ? fees.reduce((sum: number, fee: unknown) => {
    const m = money(record(fee).amount_money);
    if (m.currency !== amount.currency) throw new Error('Square fee currency differs from payment.');
    return sum + m.amount;
  }, 0) : null;
  const occurredAt = text(input.created_at || input.effective_at);
  const updatedAt = text(input.updated_at) || occurredAt;
  if (!occurredAt || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Square record timestamp is missing.');
  const paymentId = text(input.payment_id) || text(record(input.disputed_payment).payment_id)
    || text(record(input.type_charge_details).payment_id) || text(record(input.type_refund_details).payment_id) || null;
  // Store only the business evidence needed for finance. No card data or full payloads.
  return {
    kind, id: text(input.id), environment: context.environment, merchant_id: context.merchantId,
    location_id: locationId, currency: amount.currency, amount_cents: amount.amount,
    fee_cents: feeCents, payment_id: kind === 'payment' ? text(input.id) : paymentId,
    payout_id: context.payoutId || null, occurred_at: occurredAt, provider_updated_at: updatedAt,
    status: text(input.status || input.state || input.type) || 'UNKNOWN',
    imported_at: new Date().toISOString(),
    details: {
      order_id: text(input.order_id) || null, customer_id: text(input.customer_id) || null,
      reference_id: text(input.reference_id) || null, note: text(input.note) || null,
      receipt_url: text(input.receipt_url) || null,
      source_type: text(input.source_type) || null,
      wallet_type: text(record(input.card_details).wallet_type) || text(record(input.wallet_details).brand) || null,
      refunded_cents: input.refunded_money ? money(input.refunded_money).amount : 0,
      due_at: text(input.due_at) || null, reason: text(input.reason) || null,
      arrival_date: text(input.arrival_date) || null,
      gross_cents: input.gross_amount_money ? money(input.gross_amount_money).amount : null,
      payout_fee_cents: input.fee_amount_money ? money(input.fee_amount_money).amount : null,
      type: text(input.type) || null,
    },
  };
}
export type SquareObject = ReturnType<typeof normalizeSquareObject>;

export function squareListPath(kind: 'payment' | 'refund' | 'dispute' | 'payout', location: string, from: string, until: string, cursor?: string) {
  const query = new URLSearchParams({ location_id: location, limit: '10' });
  if (kind !== 'dispute') {
    query.set('begin_time', from); query.set('end_time', until); query.set('sort_order', 'ASC');
  }
  if (cursor) query.set('cursor', cursor);
  return `/v2/${kind === 'payment' ? 'payments' : kind === 'refund' ? 'refunds' : kind === 'dispute' ? 'disputes' : 'payouts'}?${query}`;
}

export function squareFinanceTotals(objects: SquareObject[], allocations: { square_payment_id: string; amount_cents: number }[]) {
  const assigned = new Map<string, number>();
  for (const a of allocations) assigned.set(a.square_payment_id, (assigned.get(a.square_payment_id) || 0) + Number(a.amount_cents));
  const payments = objects.filter(o => o.kind === 'payment' && o.currency === 'USD' && o.status === 'COMPLETED');
  return {
    completedGrossCents: payments.reduce((s, p) => s + Number(p.amount_cents), 0),
    assignedGrossCents: payments.reduce((s, p) => s + (assigned.get(p.id) || 0), 0),
    knownFeeCents: payments.reduce((s, p) => s + Number(p.fee_cents || 0), 0),
    feesPending: payments.filter(p => p.fee_cents === null).length,
    completedRefundCents: objects.filter(o => o.kind === 'refund' && o.status === 'COMPLETED' && o.currency === 'USD').reduce((s, p) => s + Number(p.amount_cents), 0),
    pendingCount: objects.filter(o => o.kind === 'payment' && ['PENDING', 'APPROVED'].includes(o.status)).length,
  };
}
