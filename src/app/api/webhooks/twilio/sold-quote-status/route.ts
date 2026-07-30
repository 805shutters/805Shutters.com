import { NextRequest, NextResponse } from "next/server";
import {
  recordSoldQuoteSmsProviderStatus,
  soldQuoteSmsStatusCallbackUrl,
} from "@/lib/crm/sold-quote-notifications";
import {
  isValidTwilioWebhookSignature,
} from "@/lib/notify/twilio";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const TWILIO_MESSAGE_SID = /^SM[0-9a-f]{32}$/i;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const signatureUrl = soldQuoteSmsStatusCallbackUrl() || request.url;
  const signatureValid = isValidTwilioWebhookSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN,
    webhookUrl: signatureUrl,
    form,
    providedSignature: request.headers.get("x-twilio-signature"),
  });
  if (!signatureValid) {
    return new NextResponse("Invalid Twilio signature.", { status: 401 });
  }

  const accountSid = form.get("AccountSid");
  if (
    accountSid &&
    process.env.TWILIO_ACCOUNT_SID &&
    accountSid !== process.env.TWILIO_ACCOUNT_SID
  ) {
    return new NextResponse("Unexpected Twilio account.", { status: 403 });
  }

  const messageSid = form.get("MessageSid") || form.get("SmsSid") || "";
  const providerStatus = form.get("MessageStatus") || form.get("SmsStatus") || "";
  if (!TWILIO_MESSAGE_SID.test(messageSid) || !providerStatus.trim()) {
    return new NextResponse("Invalid status callback payload.", { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return new NextResponse("Database is not configured.", { status: 503 });
  }

  const result = await recordSoldQuoteSmsProviderStatus(supabase, {
    messageSid,
    providerStatus,
    errorCode: form.get("ErrorCode"),
  });
  if (!result.updated) {
    // A callback can race the Messages API response that persists its SID.
    // A non-2xx asks Twilio to retry instead of losing the final outcome.
    return new NextResponse(
      result.error
        ? "Delivery status could not be recorded."
        : "Message delivery record is not ready.",
      { status: 503 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
