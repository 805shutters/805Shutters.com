export type CrmSmsResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export function normalizeSmsPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.startsWith("+") ? phone : "";
}

export async function sendCrmSms(to: string, message: string): Promise<CrmSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_FROM_PHONE;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const normalizedTo = normalizeSmsPhone(to);

  if (!accountSid || !authToken || (!fromPhone && !messagingServiceSid) || !normalizedTo) {
    return {
      ok: false,
      skipped: true,
      error: "Twilio SMS settings are not configured."
    };
  }

  const form = new URLSearchParams({
    To: normalizedTo,
    Body: message
  });

  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid);
  } else if (fromPhone) {
    form.set("From", fromPhone);
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  if (!response.ok) {
    return {
      ok: false,
      error: await response.text()
    };
  }

  return { ok: true };
}
