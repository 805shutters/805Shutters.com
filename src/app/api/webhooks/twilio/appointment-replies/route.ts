import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { forwardCustomerAppointmentReply } from "@/lib/crm/calendar-notifications";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { isCustomerSmsOptOut } from "@/lib/crm/square-contract-reminders";
import { toE164 } from "@/lib/notify/twilio";

export const runtime = "nodejs";

function validTwilioSignature(request: NextRequest, form: URLSearchParams): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;
  const webhookUrl = process.env.TWILIO_APPOINTMENT_REPLY_WEBHOOK_URL || request.url;
  const payload = [...form.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce((value, [key, field]) => `${value}${key}${field}`, webhookUrl);
  const expected = createHmac("sha1", authToken).update(payload).digest("base64");
  const provided = request.headers.get("x-twilio-signature") || "";
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  if (!validTwilioSignature(request, form)) {
    return new NextResponse("Invalid Twilio signature.", { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) return new NextResponse("Database is not configured.", { status: 503 });

  try {
    const from = form.get("From") || "";
    const body = form.get("Body") || "";
    const phoneE164 = toE164(from);
    if (phoneE164 && isCustomerSmsOptOut(body)) {
      const { error } = await supabase.from("crm_customer_sms_preferences").upsert({
        phone_e164: phoneE164,
        do_not_contact: true,
        opted_out_at: new Date().toISOString(),
        opt_out_source: "twilio_inbound",
        updated_at: new Date().toISOString(),
      }, { onConflict: "phone_e164" });
      if (error) throw new Error(`SMS opt-out could not be persisted: ${error.message}`);
    }
    await forwardCustomerAppointmentReply(supabase, from, body);
    return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
      headers: { "content-type": "text/xml; charset=utf-8" }
    });
  } catch (error) {
    console.error("[appointment-replies] inbound SMS forwarding failed", error);
    return new NextResponse("Appointment reply could not be forwarded.", { status: 500 });
  }
}
