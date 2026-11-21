import type { SupabaseClient } from '@supabase/supabase-js';
import { squareEnvironment, type SquarePaymentLink, type SquarePaymentLinkInput } from '@/lib/finance/square';
/** Save the exact requested amount and ledger before presenting or sending the link. */
export async function trackSquarePaymentRequest(db: SupabaseClient, link: SquarePaymentLink, input: SquarePaymentLinkInput) {
 if(link.provider === 'stripe') {
  if(!link.requestId)throw new Error('Stripe request evidence is missing.');
  const {data,error}=await db.from('crm_stripe_requests').select('id,session_id,amount_cents,quote_id,bookkeeping_entry_id').eq('id',link.requestId).single();
  if(error||!data||data.session_id!==link.id||Number(data.amount_cents)!==input.amountCents||data.quote_id!==(input.quoteId||null)||data.bookkeeping_entry_id!==(input.bookkeepingEntryId||null))throw new Error('Stripe request evidence does not match.');
  return;
 }
 const result = await db.from('crm_square_requests').upsert({ environment: squareEnvironment(), id: link.id, order_id: link.orderId || null, quote_id: input.quoteId || null, bookkeeping_entry_id: input.bookkeepingEntryId || null, amount_cents: input.amountCents, payment_type: input.paymentType, url: link.url }, { onConflict: 'environment,id', ignoreDuplicates: true });
 if (result.error) throw new Error('The Square link was created but its exact CRM request could not be saved. No payment request was sent.');
}
