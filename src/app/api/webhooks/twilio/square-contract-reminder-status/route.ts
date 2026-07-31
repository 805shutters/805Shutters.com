import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { isValidTwilioWebhookSignature } from "@/lib/notify/twilio";
import { recordSquareContractReminderProviderStatus } from "@/lib/crm/square-contract-reminders";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const webhookUrl =
    process.env.TWILIO_SQUARE_CONTRACT_REMINDER_STATUS_URL ||
    request.url.replace(/#.*$/, "");
  if (!isValidTwilioWebhookSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN,
    webhookUrl,
    form,
    providedSignature: request.headers.get("x-twilio-signature"),
  })) {
    return new NextResponse("Invalid Twilio signature.", { status: 401 });
  }
  const supabase = getSupabaseServiceClient();
  if (!supabase) return new NextResponse("Database is not configured.", { status: 503 });

  const result = await recordSquareContractReminderProviderStatus(supabase, {
    messageSid: form.get("MessageSid") || form.get("SmsSid") || "",
    providerStatus: form.get("MessageStatus") || form.get("SmsStatus") || "",
    errorCode: form.get("ErrorCode"),
  });
  if (result.error) return new NextResponse("Status could not be recorded.", { status: 500 });
  return new NextResponse(null, { status: 204 });
}
