import { NextRequest, NextResponse } from "next/server";
import { classifyLeadSource, isMissingLeadSourceColumnError } from "@/lib/lead-source";
import { isTwilioConfigured, sendSms, toE164 } from "@/lib/notify/twilio";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

// "Text us" requests from the Ask 805 widget. Works on desktop (where sms:
// deep links do nothing): stores a lead, texts the staff numbers via Twilio,
// and sends the visitor a confirmation text. Every delivery channel is
// best-effort; the request succeeds if at least one channel worked.

const defaultStaffSmsNumbers = ["805-806-9344"];

type TextRequestPayload = {
  name?: string;
  phone?: string;
  message?: string;
  pagePath?: string;
  company?: string; // honeypot
  utm_source?: string;
  utm_medium?: string;
  gclid?: string;
  referrer?: string;
  landingPath?: string;
};

const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string) {
  const now = Date.now();
  const current = requestBuckets.get(key);

  if (!current || current.resetAt < now) {
    requestBuckets.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }

  if (current.count >= 5) return false;
  current.count += 1;
  return true;
}

function clientKey(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function splitList(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function staffSmsRecipients() {
  const numbers = [...defaultStaffSmsNumbers, ...splitList(process.env.CRM_APPOINTMENT_ALERT_SMS_NUMBERS)]
    .map((item) => toE164(item))
    .filter((item): item is string => Boolean(item));
  return numbers.filter((item, index) => numbers.indexOf(item) === index);
}

export async function POST(request: NextRequest) {
  if (!checkRateLimit(clientKey(request))) {
    return NextResponse.json(
      { message: "Too many messages. Please wait a few minutes or text us directly at (805) 806-9344." },
      { status: 429 }
    );
  }

  let payload: TextRequestPayload;
  try {
    payload = (await request.json()) as TextRequestPayload;
  } catch {
    return NextResponse.json({ message: "Request must be valid JSON." }, { status: 400 });
  }

  if (payload.company?.trim()) {
    return NextResponse.json({ ok: true, message: "Message received." });
  }

  const name = (payload.name || "").trim().slice(0, 120);
  const message = (payload.message || "").trim().slice(0, 600);
  const pagePath = (payload.pagePath || "").trim().slice(0, 200);
  const phone = toE164(payload.phone);

  if (!phone) {
    return NextResponse.json({ message: "Enter a valid phone number so we can text you back." }, { status: 400 });
  }

  if (message.length < 5) {
    return NextResponse.json({ message: "Tell us a little about your question first." }, { status: 400 });
  }

  let leadStored = false;
  const supabase = getSupabaseServiceClient();
  if (supabase) {
    const leadRecord = {
      source: "ask-805-text",
      lead_source: classifyLeadSource({
        utmSource: payload.utm_source,
        utmMedium: payload.utm_medium,
        gclid: payload.gclid,
        referrer: payload.referrer
      }),
      name: name || "Ask 805 text request",
      phone,
      interest: "question",
      notes: message,
      page_path: pagePath || null,
      meta: {
        userAgent: request.headers.get("user-agent"),
        referrer: request.headers.get("referer"),
        landingReferrer: payload.referrer || null,
        landingPath: payload.landingPath || null,
        gclid: payload.gclid || null,
        source: "805shutters.com ask-805 widget",
        receivedAt: new Date().toISOString()
      }
    };
    let { error } = await supabase.from("leads").insert(leadRecord);
    if (error && isMissingLeadSourceColumnError(error)) {
      const { lead_source: _leadSource, ...withoutLeadSource } = leadRecord;
      ({ error } = await supabase.from("leads").insert(withoutLeadSource));
    }
    if (error) {
      console.error("Ask 805 text-request lead insert failed", error.message);
    } else {
      leadStored = true;
    }
  }

  const staffBody = [
    "New Ask 805 text question:",
    name ? `From: ${name}` : null,
    `Phone: ${phone}`,
    `Question: ${message}`,
    pagePath ? `Page: ${pagePath}` : null,
    "Reply directly to the customer's number above."
  ]
    .filter(Boolean)
    .join("\n");

  const staffResults = await Promise.all(
    staffSmsRecipients().map((to) => sendSms({ to, body: staffBody }))
  );
  const staffSmsSent = staffResults.some((result) => result.sent);

  if (staffSmsSent) {
    // Best-effort confirmation back to the visitor; ignore failures.
    void sendSms({
      to: phone,
      body: "Thanks for reaching out to 805 Shutters! We received your question and will text you back shortly. - 805 Shutters, (805) 806-9344"
    });
  }

  if (process.env.LEAD_WEBHOOK_URL) {
    try {
      await fetch(process.env.LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ask-805-text", name, phone, message, pagePath })
      });
    } catch (error) {
      console.error(error);
    }
  }

  if (!leadStored && !staffSmsSent) {
    console.error("Ask 805 text-request had no working delivery channel", {
      twilioConfigured: isTwilioConfigured(),
      supabaseConfigured: Boolean(supabase)
    });
    return NextResponse.json(
      { message: "We could not deliver your message right now. Please text us directly at (805) 806-9344." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, message: "Message received. We'll text you back shortly." });
}
