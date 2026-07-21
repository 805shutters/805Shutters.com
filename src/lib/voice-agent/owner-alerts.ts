import { sendSms, SmsResult } from "@/lib/notify/twilio";

type EnvMap = Record<string, string | undefined>;

export type VoiceAgentAlertType = "missed_call" | "voicemail" | "call_summary";

export type VoiceAgentOwnerAlertInput = {
  type?: string | null;
  callerName?: string | null;
  callerPhone?: string | null;
  summary?: string | null;
  message?: string | null;
  callbackWindow?: string | null;
  callId?: string | null;
};

export type VoiceAgentOwnerAlertResult = {
  sent: boolean;
  result?: SmsResult;
  skipped?: string;
  body?: string;
};

function cleanText(value: string | null | undefined, maxLength = 240): string | null {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

export function normalizeVoiceAgentAlertType(type: string | null | undefined): VoiceAgentAlertType {
  const normalized = String(type || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (normalized === "voicemail") return "voicemail";
  if (normalized === "call_summary" || normalized === "summary") return "call_summary";
  return "missed_call";
}

export function voiceAgentAlertRecipient(env: EnvMap = process.env): string | null {
  return env["805_VOICE_ALERT_SMS_NUMBER"] || env.MIKE_805_SALES_SMS_NUMBER || null;
}

export function buildVoiceAgentOwnerSms(input: VoiceAgentOwnerAlertInput): string {
  const type = normalizeVoiceAgentAlertType(input.type);
  const callerName = cleanText(input.callerName, 80) || "Unknown caller";
  const callerPhone = cleanText(input.callerPhone, 40);
  const summary = cleanText(input.summary || input.message, 260);
  const callbackWindow = cleanText(input.callbackWindow, 80);
  const callId = cleanText(input.callId, 80);

  const label =
    type === "voicemail"
      ? "805 Shutters voicemail"
      : type === "call_summary"
        ? "805 Shutters call"
        : "805 Shutters missed call";

  return [
    `${label}: ${callerName}${callerPhone ? `, ${callerPhone}` : ""}.`,
    summary ? `Message: ${summary}` : "No message captured.",
    callbackWindow ? `Callback: ${callbackWindow}.` : null,
    callId ? `Call ID: ${callId}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function sendVoiceAgentOwnerAlert(input: VoiceAgentOwnerAlertInput): Promise<VoiceAgentOwnerAlertResult> {
  const to = voiceAgentAlertRecipient();
  if (!to) return { sent: false, skipped: "no voice alert sms recipient configured" };

  const body = buildVoiceAgentOwnerSms(input);
  const result = await sendSms({ to, body });
  return { sent: result.sent, result, body };
}
