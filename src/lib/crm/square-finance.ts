import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { squareEnvironment, squareLocationId, fetchSquareOrderFacts } from '@/lib/finance/square';
import { normalizeSquareObject, record, text, squareListPath, squareRead, type SquareObject, type SquareObjectKind } from '@/lib/finance/square-reporting';
import { deliverSquarePaymentAlerts } from './square-payment-alerts';
import { collectCrmPages } from './pagination';

type SyncState = { from?: string; cursor?: string; until?: string; completedThrough?: string; error?: string | null };
type SyncRow = { merchant_id: string | null; location_id: string | null; history_from: string; auto_post_after: string; state: Record<string, SyncState> };
function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function squareFinanceRows<T>(db: SupabaseClient, table: string, environment = squareEnvironment(), orderColumn = 'id'): Promise<T[]> {
  return checked(await collectCrmPages<T>(async (from, to) => {
    const result = await db.from(table).select('*').eq('environment', environment).order(orderColumn).range(from, to);
    return { data: result.data as T[] | null, error: result.error };
  })) || [];
}

async function storeObject(db: SupabaseClient, obj: SquareObject) {
  const existing = checked(await db.from('crm_square_objects').select('provider_updated_at').eq('environment', obj.environment).eq('kind', obj.kind).eq('id', obj.id).maybeSingle());
  if (existing && Date.parse(existing.provider_updated_at) > Date.parse(obj.provider_updated_at)) return false;
  checked(await db.from('crm_square_objects').upsert(obj, { onConflict: 'environment,kind,id' }));
  return true;
}

async function linkOrPost(db: SupabaseClient, payment: SquareObject, sync: SyncRow) {
  if (payment.status !== 'COMPLETED' || payment.currency !== 'USD') return;
  const allocations = checked(await db.from('crm_square_allocations').select('amount_cents,ledger_payment_id').eq('environment', payment.environment).eq('square_payment_id', payment.id));
  if ((allocations || []).reduce((sum, a) => sum + Number(a.amount_cents), 0) >= payment.amount_cents) return;
  const legacy = checked(await db.from('crm_quote_bookkeeping_payments').select('id,quote_id,bookkeeping_entry_id,amount,external_source,external_id,meta')
    .or(`and(external_source.eq.square,external_id.eq.${payment.id}),meta->>square_payment_id.eq.${payment.id}`));
  for (const row of legacy || []) {
    if (allocations?.some(a => a.ledger_payment_id === row.id)) continue;
    checked(await db.rpc('allocate_square_payment', {
      p_environment: payment.environment, p_payment_id: payment.id, p_decision_id: row.id,
      p_amount_cents: Math.round(Number(row.amount) * 100), p_quote_id: row.quote_id,
      p_entry_id: row.quote_id ? null : row.bookkeeping_entry_id, p_existing_payment_id: row.id,
      p_actor: 'square-finance', p_evidence: 'Exact Square payment ID already attached to this CRM credit; no new money added.',
    }));
  }
  if (legacy?.length || Date.parse(payment.occurred_at) < Date.parse(sync.auto_post_after) || Number(payment.details.refunded_cents) > 0) return;
  const orderId = text(payment.details.order_id);
  if (!orderId) return;
  const order = await fetchSquareOrderFacts(orderId);
  if (!order.paymentType || order.currency !== 'USD' || order.expectedAmountCents !== payment.amount_cents) return;
  if (Boolean(order.quoteId) === Boolean(order.bookkeepingEntryId)) return;
  if (order.quoteId) {
    const quote = checked(await db.from('crm_quotes').select('job_id').eq('id', order.quoteId).maybeSingle());
    if (!quote || !order.jobId || quote.job_id !== order.jobId) return;
  }
  // Only fresh payments carrying an exact server-created CRM order target post
  // automatically. Historical/name/amount matches require an owner decision.
  checked(await db.rpc('allocate_square_payment', {
    p_environment: payment.environment, p_payment_id: payment.id, p_decision_id: randomUUID(),
    p_amount_cents: payment.amount_cents, p_quote_id: order.quoteId,
    p_entry_id: order.bookkeepingEntryId || null, p_existing_payment_id: null,
    p_actor: 'square-finance', p_evidence: `Verified Square order ${orderId}; exact CRM target, currency and requested amount.`,
  }));
}

/** Bounded, resumable read-only provider sync. Customer credits use the guarded RPC.
 * Failed pages retain their cursor; a successful resource never hides another's error. */
export async function syncSquareFinance(db: SupabaseClient, budgetMs = 45000, priorityPaymentId?: string) {
  const environment = squareEnvironment(), locationId = squareLocationId(), lease = randomUUID();
  if (!checked(await db.rpc('claim_square_sync', { p_environment: environment, p_lease: lease }))) return { status: 'already_running' };
  const started = Date.now(), deadline = started + budgetMs;
  let failure: string | null = null;
  const errors: string[] = [];
  const withinBudget = () => Date.now() < deadline;
  try {
    const sync = checked(await db.from('crm_square_sync').select('*').eq('environment', environment).single()) as SyncRow;
    const location = record((await squareRead(`/v2/locations/${encodeURIComponent(locationId)}`)).location);
    const merchantId = text(location.merchant_id);
    if (!merchantId || text(location.id) !== locationId || text(location.currency) !== 'USD') throw new Error('Square location identity and USD currency must be verified.');
    if ((sync.merchant_id && sync.merchant_id !== merchantId) || (sync.location_id && sync.location_id !== locationId)) throw new Error('Configured Square account changed. Owner review is required before importing another account.');
    checked(await db.from('crm_square_sync').update({ merchant_id: merchantId, location_id: locationId }).eq('environment', environment).eq('lease_id', lease));
    const context = { environment, merchantId, locationId };
    const importRecord = async (kind: SquareObjectKind, input: Record<string, unknown>, payoutId?: string) => {
      const obj = normalizeSquareObject(kind, input, { ...context, payoutId });
      if (!await storeObject(db, obj)) return;
      if (kind === 'payment') {
        try { await linkOrPost(db, obj, sync); }
        catch (error) {
          // Provider evidence is preserved even if a ledger match needs review.
          const detail = error instanceof Error ? error.message : 'Payment needs review.';
          checked(await db.from('crm_square_objects').update({ details: { ...obj.details, review_error: detail } }).eq('environment', environment).eq('kind', kind).eq('id', obj.id));
        }
      }
    };
    if (priorityPaymentId) {
      await importRecord('payment', record((await squareRead(`/v2/payments/${encodeURIComponent(priorityPaymentId)}`)).payment));
      return { status: 'synced' };
    }
    const events = checked(await db.from('crm_square_events').select('*').eq('environment', environment).is('processed_at', null).order('attempts').order('received_at').limit(5));
    for (const event of events || []) {
      if (!withinBudget()) break;
      try {
        if (event.merchant_id !== merchantId) throw new Error('Webhook merchant differs from verified Square account.');
        const kind = String(event.event_type).split('.')[0] as SquareObjectKind;
        if (!['payment', 'refund', 'dispute', 'payout'].includes(kind)) throw new Error('Unsupported Square event.');
        const collection = kind === 'payment' ? 'payments' : kind === 'refund' ? 'refunds' : kind === 'dispute' ? 'disputes' : 'payouts';
        const response = await squareRead(`/v2/${collection}/${encodeURIComponent(event.object_id)}`);
        await importRecord(kind, record(response[kind]));
        checked(await db.from('crm_square_events').update({ processed_at: new Date().toISOString(), error: null, attempts: event.attempts + 1 }).eq('environment', environment).eq('id', event.id));
      } catch (error) {
        checked(await db.from('crm_square_events').update({ error: error instanceof Error ? error.message : 'Event import failed.', attempts: event.attempts + 1 }).eq('environment', environment).eq('id', event.id));
      }
    }
    if (withinBudget()) {
      const state = sync.state.recent_payments || {};
      const until = state.until || new Date().toISOString();
      const from = state.from || new Date((state.completedThrough ? Date.parse(state.completedThrough) : Date.now()) - 2 * 86400000).toISOString();
      try {
        const path = squareListPath('payment', locationId, sync.history_from, until, state.cursor);
        const query = new URLSearchParams(path.split('?')[1]);
        query.set('updated_at_begin_time', from); query.set('updated_at_end_time', until); query.set('sort_field', 'UPDATED_AT');
        const response = await squareRead(`/v2/payments?${query}`);
        for (const value of Array.isArray(response.payments) ? response.payments : []) await importRecord('payment', record(value));
        const cursor = text(response.cursor);
        sync.state.recent_payments = cursor ? { ...state, cursor, until, from, error: null } : { completedThrough: until, error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recent payment recovery failed.';
        sync.state.recent_payments = { ...state, until, from, error: message }; errors.push(message);
      }
      checked(await db.from('crm_square_sync').update({ state: sync.state }).eq('environment', environment).eq('lease_id', lease));
    }
    // Full history is revisited in resumable pages, recovering changed fees,
    // refunds and payouts even if all webhooks for an old payment were missed.
    const resources = (['payment', 'refund', 'dispute', 'payout'] as const).slice().sort((a, b) => Date.parse(sync.state[a]?.completedThrough || '1970-01-01') - Date.parse(sync.state[b]?.completedThrough || '1970-01-01'));
    for (const kind of resources) {
      if (!withinBudget()) break;
      const state = sync.state[kind] || {};
      const until = state.until || new Date().toISOString();
      let cursor = state.cursor || '';
      try {
        do {
          const response = await squareRead(squareListPath(kind, locationId, sync.history_from, until, cursor));
          const key = kind === 'payment' ? 'payments' : kind === 'refund' ? 'refunds' : kind === 'dispute' ? 'disputes' : 'payouts';
          for (const value of Array.isArray(response[key]) ? response[key] : []) {
            if (!withinBudget()) throw new Error('Refresh time limit reached; this page will resume safely.');
            await importRecord(kind, record(value));
          }
          cursor = text(response.cursor);
          sync.state[kind] = cursor ? { ...state, cursor, until, error: null } : { completedThrough: until, error: null };
          checked(await db.from('crm_square_sync').update({ state: sync.state }).eq('environment', environment).eq('lease_id', lease));
        } while (false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Square import failed.';
        sync.state[kind] = { ...state, cursor, until, error: message };
        errors.push(`${kind}: ${message}`);
        checked(await db.from('crm_square_sync').update({ state: sync.state }).eq('environment', environment).eq('lease_id', lease));
      }
    }
    // Entries have independent persistent cursors. A partially loaded payout
    // never claims a balanced breakdown.
    const payouts = await squareFinanceRows<SquareObject>(db, 'crm_square_objects');
    for (const payout of payouts.filter(p => p.kind === 'payout').sort((a, b) => Date.parse(a.imported_at) - Date.parse(b.imported_at))) {
      if (!withinBudget()) break;
      const key = `entries:${payout.id}`, state = sync.state[key] || {};
      if (state.completedThrough && Date.parse(state.completedThrough) >= Date.parse(payout.provider_updated_at)) continue;
      let cursor = state.cursor || '';
      try {
        do {
          const query = new URLSearchParams({ limit: '20', ...(cursor ? { cursor } : {}) });
          const response = await squareRead(`/v2/payouts/${encodeURIComponent(payout.id)}/payout-entries?${query}`);
          for (const value of Array.isArray(response.payout_entries) ? response.payout_entries : []) {
            if (!withinBudget()) throw new Error('Payout breakdown paused; page will resume safely.');
            const entry = record(value);
            // Entry timestamps are optional; the containing payout supplies them.
            await importRecord('payout_entry', { ...entry, created_at: entry.effective_at || payout.occurred_at, updated_at: payout.provider_updated_at }, payout.id);
          }
          cursor = text(response.cursor);
          sync.state[key] = cursor ? { cursor } : { completedThrough: payout.provider_updated_at };
          checked(await db.from('crm_square_sync').update({ state: sync.state }).eq('environment', environment).eq('lease_id', lease));
        } while (cursor && withinBudget());
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Payout entries import failed.';
        sync.state[key] = { ...state, cursor, error: message }; errors.push(message);
        checked(await db.from('crm_square_sync').update({ state: sync.state }).eq('environment', environment).eq('lease_id', lease));
      }
    }
    failure = errors.length ? errors.join('; ') : null;
    return { status: failure ? 'needs_attention' : 'synced', errors, state: sync.state };
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Square sync failed.';
    throw error;
  } finally {
    try { if (environment === 'production') await deliverSquarePaymentAlerts(db); } catch (error) { failure = [failure, error instanceof Error ? error.message : 'Owner payment text needs review.'].filter(Boolean).join('; '); }
    checked(await db.from('crm_square_sync').update({ lease_id: null, lease_until: null, last_finished_at: new Date().toISOString(), error: failure }).eq('environment', environment).eq('lease_id', lease));
  }
}
