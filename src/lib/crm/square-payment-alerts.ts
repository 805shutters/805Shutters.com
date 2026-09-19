import type { SupabaseClient } from '@supabase/supabase-js';
import { isTwilioConfigured, sendSms } from '@/lib/notify/twilio';
export const SQUARE_OWNER_ALERT_TO = '+18052985555';
export const SQUARE_OWNER_ALERT_CALLBACK = 'https://www.805shutters.com/api/webhooks/twilio/square-payment-alert/';
export function squarePaymentAlertBody(amountCents: number, customerNames: string[]) {
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountCents / 100);
  const names = [...new Set(customerNames.map(n => n.replace(/[\r\n]+/g, ' ').trim()).filter(Boolean))].join(', ').slice(0, 100);
  return names ? `805 Shutters: Square received ${amount} from ${names}.` : `805 Shutters: Square received ${amount}. Customer/job needs review.`;
}
/** At-most-once provider submission. Ambiguous sends are held for review;
 * callbacks can recover their delivery status without sending another text. */
export async function deliverSquarePaymentAlerts(db: SupabaseClient, sender: typeof sendSms = sendSms) {
  if (!isTwilioConfigured()) return { configured: false, attempted: 0 };
  const pending = await db.from('crm_square_alerts').select('id,square_payment_id').eq('environment', 'production').eq('status', 'queued').order('created_at').limit(3);
  if (pending.error) throw new Error(pending.error.message);
  let attempted = 0;
  for (const alert of pending.data || []) {
    const payment = await db.from('crm_square_objects').select('amount_cents,status').eq('environment', 'production').eq('kind', 'payment').eq('id', alert.square_payment_id).single();
    if (payment.error || payment.data.status !== 'COMPLETED') continue;
    const links = await db.from('crm_square_allocations').select('ledger_payment_id').eq('environment', 'production').eq('square_payment_id', alert.square_payment_id);
    if (links.error) throw new Error(links.error.message);
    const names: string[] = [];
    for (const link of links.data || []) {
      const ledger = await db.from('crm_quote_bookkeeping_payments').select('quote_id,bookkeeping_entry_id').eq('id', link.ledger_payment_id).single();
      if (ledger.error) throw new Error(ledger.error.message);
      const target = ledger.data.quote_id ? ['crm_quotes', ledger.data.quote_id] : ['crm_quote_bookkeeping_entries', ledger.data.bookkeeping_entry_id];
      if (target[0] === 'crm_quotes') {
        const quote = await db.from('crm_quotes').select('job_id').eq('id', target[1]).single();
        if (quote.data?.job_id) {
          const job = await db.from('crm_jobs').select('customer_name').eq('id', quote.data.job_id).single();
          if (job.data?.customer_name) names.push(job.data.customer_name);
        }
      } else {
        const customer = await db.from(target[0]).select('customer_name').eq('id', target[1]).single();
        if (customer.data?.customer_name) names.push(customer.data.customer_name);
      }
    }
    const body = squarePaymentAlertBody(Number(payment.data.amount_cents), names);
    const claim = await db.from('crm_square_alerts').update({ status: 'sending', body, attempted_at: new Date().toISOString() }).eq('id', alert.id).eq('status', 'queued').select('id');
    if (claim.error) throw new Error(claim.error.message);
    if (!claim.data?.length) continue;
    attempted++;
    const result = await sender({ to: SQUARE_OWNER_ALERT_TO, body, statusCallback: `${SQUARE_OWNER_ALERT_CALLBACK}?alert=${encodeURIComponent(alert.id)}`, timeoutMs: 10000 });
    const saved = await db.from('crm_square_alerts').update({ status: result.sent ? 'accepted' : result.uncertain ? 'unknown' : 'failed', provider_sid: result.sid || null, provider_status: result.providerStatus || null, error: result.error || result.skipped || null }).eq('id', alert.id).eq('status', 'sending');
    if (saved.error) throw new Error('Payment text was attempted but the result could not be saved; do not resend without checking Twilio.');
  }
  return { configured: true, attempted };
}
