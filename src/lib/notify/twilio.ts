// Twilio SMS helper. Env-gated and NEVER throws: a failed or unconfigured send
// returns a result object so it can't break a customer's sign/checkout flow.
//
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID
// or TWILIO_FROM_PHONE. When unset, sends are skipped (testable without going live).

import { createHmac, timingSafeEqual } from "node:crypto";
import { toE164 } from "./phone";
export { toE164 } from "./phone";

export type SmsResult = {
  sent: boolean;
  skipped?: string;
  error?: string;
  sid?: string;
  /** Twilio's initial Message resource status, such as queued or accepted. */
  providerStatus?: string;
  /**
   * The request failed without a provider response. Delivery may have been
   * accepted, so callers must not automatically retry it.
   */
  uncertain?: boolean;
};

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_PHONE),
  );
}

export function twilioWebhookSignature(
  authToken: string,
  webhookUrl: string,
  form: URLSearchParams,
): string {
  const payload = [...form.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce((value, [key, field]) => `${value}${key}${field}`, webhookUrl);
  return createHmac("sha1", authToken).update(payload).digest("base64");
}

export function isValidTwilioWebhookSignature(input: {
  authToken: string | null | undefined;
  webhookUrl: string;
  form: URLSearchParams;
  providedSignature: string | null | undefined;
}): boolean {
  if (!input.authToken || !input.providedSignature) return false;
  const expected = Buffer.from(
    twilioWebhookSignature(input.authToken, input.webhookUrl, input.form),
  );
  const provided = Buffer.from(input.providedSignature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function sendSms(input: {
  to: string | null | undefined;
  body: string;
  statusCallback?: string | null;
  timeoutMs?: number;
}): Promise<SmsResult> {
  const to = toE164(input.to);
  if (!to) return { sent: false, skipped: "invalid or missing destination phone" };
  if (!isTwilioConfigured()) return { sent: false, skipped: "twilio not configured" };

  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const params = new URLSearchParams({ To: to, Body: input.body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    params.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    params.set("From", process.env.TWILIO_FROM_PHONE as string);
  }
  if (input.statusCallback) params.set("StatusCallback", input.statusCallback);

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      ...(input.timeoutMs ? { signal: AbortSignal.timeout(input.timeoutMs) } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      message?: string;
    };
    if (!res.ok) {
      console.warn("Twilio send failed:", data.message || res.status);
      return { sent: false, error: data.message || `Twilio error ${res.status}`, uncertain: res.status >= 500 };
    }
    if (!data.sid) {
      console.warn("Twilio accepted SMS without returning a Message SID.");
      return {
        sent: false,
        uncertain: true,
        error: "Twilio accepted the request without a Message SID",
        providerStatus: data.status,
      };
    }
    return { sent: true, sid: data.sid, providerStatus: data.status };
  } catch (e) {
    console.warn("Twilio send threw:", e);
    return {
      sent: false,
      error: e instanceof Error ? e.message : "send failed",
      uncertain: true,
    };
  }
}
