import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { isValidTwilioWebhookSignature, toE164 } from "@/lib/notify/twilio";
import { META_BOOKING_SMS_ACTION } from "@/lib/notify/meta-booking-sms";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const form = new URLSearchParams(await request.text());
  if (!isValidTwilioWebhookSignature({ authToken: process.env.TWILIO_AUTH_TOKEN,
    webhookUrl: `https://www.805shutters.com/api/webhooks/meta-booking-sms/?id=${id}`, form,
    providedSignature: request.headers.get("x-twilio-signature"),
  }) || form.get("AccountSid") !== process.env.TWILIO_ACCOUNT_SID ||
    form.get("To") !== toE164(process.env.MIKE_805_SALES_SMS_NUMBER)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = getSupabaseServiceClient();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await db.from("crm_activity_events").select("metadata,after_data")
    .eq("id", id).eq("action", META_BOOKING_SMS_ACTION).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "event_unavailable" }, { status: 503 });
  const sid = form.get("MessageSid");
  if (!sid || (data.after_data?.sid && data.after_data.sid !== sid)) return NextResponse.json({ error: "sid_mismatch" }, { status: 403 });
  const status = form.get("MessageStatus") || "unknown";
  // Store callbacks apart from initial acceptance; callbacks may arrive before sendSms returns.
  // Terminal updates use separate JSON keys, so late sent/queued callbacks cannot erase delivery proof.
  const terminal = ["delivered", "undelivered", "failed"].includes(status);
  const field = terminal ? "before_data" : "metadata";
  const { error: updateError } = await db.from("crm_activity_events").update({
    [field]: { ...(terminal ? {} : data.metadata), sid, delivery_status: status,
      error_code: form.get("ErrorCode"), updated_at: new Date().toISOString() },
  }).eq("id", id).eq("action", META_BOOKING_SMS_ACTION);
  return NextResponse.json({ recorded: !updateError }, { status: updateError ? 503 : 200 });
}
