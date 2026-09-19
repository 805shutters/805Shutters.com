import { isTwilioConfigured } from '@/lib/notify/twilio';
import { NextRequest, NextResponse } from 'next/server';
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from '@/lib/crm/auth';
import { isMikePaymentAdminEmail } from '@/lib/crm/allowed-users';
import { squareFinanceRows, syncSquareFinance } from '@/lib/crm/square-finance';
import { squareEnvironment, getSquareWebhookConfig } from '@/lib/finance/square';
import { record, text, squareFinanceTotals, type SquareObject } from '@/lib/finance/square-reporting';
import { loadCompleteCrmTable } from '@/lib/crm/pagination';

export const runtime = 'nodejs';
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const environment = squareEnvironment();
    const [objects, allocations, bankMatches, classifications, events, sync, quotes, entries, payments, alerts, jobs, requests, credits] = await Promise.all([
      squareFinanceRows<SquareObject>(supabase, 'crm_square_objects'),
      squareFinanceRows<{ square_payment_id: string; amount_cents: number }>(supabase, 'crm_square_allocations'),
      squareFinanceRows(supabase, 'crm_square_bank_matches'),
      // Classifications use the provider payment ID as their key.
      squareFinanceRows(supabase, 'crm_square_classifications', environment, 'square_payment_id'),
      supabase.from('crm_square_events').select('*').eq('environment', environment).order('received_at', { ascending: false }).limit(100),
      supabase.from('crm_square_sync').select('environment,merchant_id,location_id,history_from,auto_post_after,state,last_started_at,last_finished_at,error').eq('environment', environment).single(),
      loadCompleteCrmTable(supabase, 'crm_quotes', 'created_at', 'id,job_id,quote_total,status,meta'),
      loadCompleteCrmTable(supabase, 'crm_quote_bookkeeping_entries', 'created_at', 'id,job_id,customer_name,total_amount,source,meta'),
      loadCompleteCrmTable(supabase, 'crm_quote_bookkeeping_payments', 'created_at', 'id,quote_id,bookkeeping_entry_id,amount,paid_at,payment_label,external_source,external_id,meta'),
      supabase.from('crm_square_alerts').select('*').eq('environment', environment).order('created_at', { ascending: false }).limit(100),
      loadCompleteCrmTable(supabase, 'crm_jobs', 'created_at', 'id,customer_name'),
      squareFinanceRows(supabase, 'crm_square_requests'),
      loadCompleteCrmTable(supabase, 'crm_quote_bookkeeping_credits', 'created_at', 'id,amount,from_quote_id,to_quote_id,from_bookkeeping_entry_id,to_bookkeeping_entry_id'),
    ]);
    for (const result of [events, sync, quotes, entries, payments, alerts, jobs, credits]) if (result.error) throw new Error(result.error.message);
    const config = getSquareWebhookConfig();
    return NextResponse.json({ environment, canReview: isMikePaymentAdminEmail(email), objects, allocations, bankMatches,
      requests, credits: credits.data, classifications, events: events.data, sync: sync.data, totals: squareFinanceTotals(objects, allocations),
      quotes: (quotes.data || []).map(q => ({...q, customer_name: (jobs.data || []).find(j => j.id === q.job_id)?.customer_name || 'Customer unavailable'})), entries: entries.data, payments: payments.data,
      alerts: alerts.data, smsConfigured: isTwilioConfigured(),
      webhook: { configured: Boolean(config.signingKey && config.webhookUrl), url: config.webhookUrl || null },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return crmAuthErrorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    if (!isMikePaymentAdminEmail(email)) throw new CrmAuthError(403, 'Only Mike can review Square allocations and bank matches.');
    const body = record(await request.json()), environment = squareEnvironment();
    if (body.action === 'sync') return NextResponse.json(await syncSquareFinance(supabase));
    const evidence = text(body.evidence).trim();
    if (evidence.length < 8 || evidence.length > 2000) throw new CrmAuthError(400, 'Enter the receipt or statement evidence supporting this decision.');
    let result;
    if (body.action === 'allocate') {
      if (!Number.isSafeInteger(body.amountCents) || Number(body.amountCents) <= 0) throw new CrmAuthError(400, 'Enter a positive amount in whole cents.');
      result = await supabase.rpc('allocate_square_payment', {
        p_environment: environment, p_payment_id: text(body.paymentId), p_decision_id: text(body.decisionId),
        p_amount_cents: body.amountCents, p_quote_id: text(body.quoteId) || null, p_entry_id: text(body.entryId) || null,
        p_existing_payment_id: text(body.existingPaymentId) || null, p_actor: email, p_evidence: evidence,
      });
    } else if (body.action === 'exclude') {
      result = await supabase.rpc('classify_square_payment', { p_environment: environment, p_payment_id: text(body.paymentId), p_actor: email, p_evidence: evidence });
    } else if (body.action === 'bank') {
      if (!Number.isSafeInteger(body.amountCents) || !body.amountCents) throw new CrmAuthError(400, 'Enter the bank statement amount in whole cents.');
      result = await supabase.rpc('match_square_bank', { p_environment: environment, p_payout_id: text(body.payoutId), p_reference: evidence, p_date: text(body.bankDate), p_amount_cents: body.amountCents, p_actor: email });
    } else throw new CrmAuthError(400, 'Choose a supported finance action.');
    if (result.error) throw new CrmAuthError(409, result.error.message);
    return NextResponse.json({ saved: true, result: result.data });
  } catch (error) { return crmAuthErrorResponse(error); }
}
