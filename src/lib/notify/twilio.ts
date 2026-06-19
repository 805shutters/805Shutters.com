// Twilio SMS helper. Env-gated and NEVER throws: a failed or unconfigured send
// returns a result object so it can't break a customer's sign/checkout flow.
//
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID
// or TWILIO_FROM_PHONE. When unset, sends are skipped (testable without going live).

export type SmsResult = { sent: boolean; skipped?: string; error?: string; sid?: string };

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_PHONE),
  );
}

/** Normalize a US phone to E.164 (+1XXXXXXXXXX). Returns null if not 10/11 digits. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(phone).trim().startsWith("+")) return String(phone).trim();
  return null;
}

export async function sendSms(input: { to: string | null | undefined; body: string }): Promise<SmsResult> {
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

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) {
      console.warn("Twilio send failed:", data.message || res.status);
      return { sent: false, error: data.message || `Twilio error ${res.status}` };
    }
    return { sent: true, sid: data.sid };
  } catch (e) {
    console.warn("Twilio send threw:", e);
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
