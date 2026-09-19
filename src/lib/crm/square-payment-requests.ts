import type { SupabaseClient } from '@supabase/supabase-js';
import { squareEnvironment, type SquarePaymentLink, type SquarePaymentLinkInput } from '@/lib/finance/square';
/** Save the exact requested amount and ledger before presenting or sending the link. */
export async function trackSquarePaymentRequest(db: SupabaseClient, link: SquarePaymentLink, input: SquarePaymentLinkInput) {
 const result = await db.from('crm_square_requests').upsert({ environment: squareEnvironment(), id: link.id, order_id: link.orderId || null, quote_id: input.quoteId || null, bookkeeping_entry_id: input.bookkeepingEntryId || null, amount_cents: input.amountCents, payment_type: input.paymentType, url: link.url }, { onConflict: 'environment,id', ignoreDuplicates: true });
 if (result.error) throw new Error('The Square link was created but its exact CRM request could not be saved. No payment request was sent.');
}
