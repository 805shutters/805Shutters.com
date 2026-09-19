import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { isValidTwilioWebhookSignature } from '@/lib/notify/twilio';
import { SQUARE_OWNER_ALERT_CALLBACK } from '@/lib/crm/square-payment-alerts';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text()), alert = request.nextUrl.searchParams.get('alert');
  if (!alert || !/^[a-f0-9-]{36}$/i.test(alert)) return new NextResponse('Invalid alert', { status: 400 });
  if (!isValidTwilioWebhookSignature({ authToken: process.env.TWILIO_AUTH_TOKEN, webhookUrl: `${SQUARE_OWNER_ALERT_CALLBACK}?alert=${encodeURIComponent(alert)}`, form, providedSignature: request.headers.get('x-twilio-signature') })) return new NextResponse('Invalid signature', { status: 401 });
  const db = getSupabaseServiceClient(); if (!db) return new NextResponse('Unavailable', { status: 503 });
  const status = form.get('MessageStatus') || form.get('SmsStatus') || '';
  if (!['accepted','queued','sending','sent','delivered','failed','undelivered'].includes(status)) return new NextResponse(null, { status: 204 });
  const result = await db.rpc('record_square_alert_status', { p_id: alert, p_sid: form.get('MessageSid') || form.get('SmsSid') || '', p_status: status, p_error: form.get('ErrorCode') || null });
  return new NextResponse(null, { status: result.error ? 503 : 204 });
}
