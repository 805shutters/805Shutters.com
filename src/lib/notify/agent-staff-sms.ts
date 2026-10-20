import { OWNER_ALERT_FROM_PHONE } from "./owner-alert-routing";
import { toE164 } from "./phone";
import type { SmsResult } from "./twilio";

/** Messaging service prepared for the approved 805 Low Volume Standard brand. The campaign is not approved. */
export const DEDICATED_805_STAFF_SMS_SERVICE_SID = "MG60d4038bf54bffa0690cce85a6e49147";
/** Sole sender on that service. */
export const DEDICATED_805_STAFF_SMS_FROM = "+18055908050";

const ACCOUNT_SID = /^AC[0-9a-f]{32}$/i;

export function readAgentStaffSmsConfig(env: Record<string, string | undefined> = process.env) {
  const accountSid = env.VOICE_805_STAFF_SMS_ACCOUNT_SID?.trim() || "";
  const authToken = env.VOICE_805_STAFF_SMS_AUTH_TOKEN?.trim() || "";
  const messagingServiceSid = env.VOICE_805_STAFF_SMS_MESSAGING_SERVICE_SID?.trim() || "";
  const fromPhone = toE164(env.VOICE_805_STAFF_SMS_FROM);
  if (!accountSid || !authToken || !messagingServiceSid || !fromPhone || !ACCOUNT_SID.test(accountSid)) {
    return { ok: false as const, reason: "dedicated 805 staff SMS is not configured" };
  }
  if (messagingServiceSid.toUpperCase() !== DEDICATED_805_STAFF_SMS_SERVICE_SID.toUpperCase()) {
    return { ok: false as const, reason: "dedicated 805 staff SMS service is not the 805 staff booking service" };
  }
  if (fromPhone === OWNER_ALERT_FROM_PHONE) {
    return { ok: false as const, reason: "dedicated 805 staff SMS sender is not allowed" };
  }
  if (fromPhone !== DEDICATED_805_STAFF_SMS_FROM) {
    return { ok: false as const, reason: "dedicated 805 staff SMS sender is not the 805 number" };
  }
  const sharedAccount = env.TWILIO_ACCOUNT_SID?.trim() || "";
  if (sharedAccount && accountSid.toUpperCase() === sharedAccount.toUpperCase()) {
    return { ok: false as const, reason: "dedicated 805 staff SMS account matches the shared Twilio account" };
  }
  return {
    ok: true as const,
    accountSid,
    authToken,
    messagingServiceSid: DEDICATED_805_STAFF_SMS_SERVICE_SID,
    fromPhone,
  };
}

/** Agent booking alerts only. Never falls back to the shared Twilio account or the owner-alert sender. */
export async function sendAgentStaffBookingSms(input: { to: string | null | undefined; body: string }): Promise<SmsResult> {
  const to = toE164(input.to);
  if (!to) return { sent: false, skipped: "invalid or missing destination phone" };
  const config = readAgentStaffSmsConfig();
  if (!config.ok) return { sent: false, skipped: config.reason };

  const params = new URLSearchParams({
    To: to,
    Body: input.body,
    MessagingServiceSid: config.messagingServiceSid,
    From: config.fromPhone,
  });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string };
    if (!res.ok) {
      console.warn("805 staff SMS was not accepted", res.status);
      return { sent: false, error: `Twilio error ${res.status}`, uncertain: res.status >= 500 };
    }
    if (!data.sid) {
      console.warn("805 staff SMS response omitted a Message SID");
      return { sent: false, uncertain: true, error: "Twilio accepted the request without a Message SID", providerStatus: data.status };
    }
    return { sent: true, sid: data.sid, providerStatus: data.status };
  } catch (error) {
    console.warn("805 staff SMS request did not finish", error instanceof Error ? error.name : "Error");
    return { sent: false, error: error instanceof Error ? error.message : "send failed", uncertain: true };
  }
}
