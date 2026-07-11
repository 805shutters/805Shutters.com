import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { forwardCustomerAppointmentReply } from "@/lib/crm/calendar-notifications";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

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
    await forwardCustomerAppointmentReply(supabase, form.get("From") || "", form.get("Body") || "");
    return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
      headers: { "content-type": "text/xml; charset=utf-8" }
    });
  } catch (error) {
    console.error("[appointment-replies] inbound SMS forwarding failed", error);
    return new NextResponse("Appointment reply could not be forwarded.", { status: 500 });
  }
}
