import { after, NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { verifySquareWebhookSignature, getSquareWebhookConfig, squareEnvironment, extractSquarePaymentFacts, isSquareWebhookTestPayment } from '@/lib/finance/square';
import { record, text } from '@/lib/finance/square-reporting';
import { syncSquareFinance } from '@/lib/crm/square-finance';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const db = getSupabaseServiceClient();
  if (!db) return new NextResponse('Service unavailable', { status: 503 });
  const raw = await request.text();
  const { webhookUrl, signingKey } = getSquareWebhookConfig();
  if (!verifySquareWebhookSignature(webhookUrl, signingKey, raw, request.headers.get('x-square-hmacsha256-signature') || request.headers.get('x-square-hmac-signature'))) return new NextResponse('Invalid signature', { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new NextResponse('Bad JSON', { status: 400 }); }
  const events = Array.isArray(record(payload).events) ? record(payload).events as unknown[] : Array.isArray(payload) ? payload : [payload];
  for (const value of events) {
    const event = record(value), eventType = text(event.type);
    if (!/^(payment\.(created|updated)|refund\.(created|updated)|dispute\.(created|state.updated)|payout\.(sent|paid|failed))$/.test(eventType)) continue;
    const facts = extractSquarePaymentFacts(event);
    if (facts && isSquareWebhookTestPayment(facts)) continue;
    const id = text(event.event_id), data = record(event.data), merchantId = text(event.merchant_id);
    const kind = eventType.split('.')[0];
    const objectId = text(data.id) || text(record(record(data.object)[kind]).id);
    if (!id || !objectId || !merchantId) return new NextResponse('Event identity is required', { status: 400 });
    const result = await db.from('crm_square_events').upsert({ environment: squareEnvironment(), id, event_type: eventType, merchant_id: merchantId, object_id: objectId }, { onConflict: 'environment,id', ignoreDuplicates: true });
    if (result.error) return new NextResponse('Event could not be stored. Retry required.', { status: 503 });
  }
  // Acknowledge only after durable storage. Scheduled recovery covers interrupted workers.
  after(async () => { try { await syncSquareFinance(db, 40000); } catch { console.error('Square event worker requires recovery; see connection health.'); } });
  return NextResponse.json({ received: true });
}
