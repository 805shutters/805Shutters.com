import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SOLD_QUOTE_NOTIFICATION_RECIPIENTS,
} from "@mts/lib/quoteSoldNotification";
import { sendSms, toE164, type SmsResult } from "@/lib/notify/twilio";

const EVENT_KEY = "contract_signed";
const STATUS_CALLBACK_PATH = "/api/webhooks/twilio/sold-quote-status";
const STATUS_CALLBACK_RETRY_FRAGMENT = "#rc=2&rp=ct,rt,5xx";

type NotificationSource =
  | "public_contract_accept"
  | "public_contract_retry"
  | "in_home_sold";

export type SoldQuoteSmsRecipient = {
  input: string;
  e164: string | null;
  role: "primary" | "staff";
};

export type SoldQuoteSmsDelivery = {
  id?: string;
  recipient: string;
  recipientE164: string | null;
  status:
    | "accepted"
    | "delivered"
    | "undelivered"
    | "failed"
    | "invalid"
    | "unknown"
    | "sending";
  attemptCount?: number;
  providerMessageSid?: string | null;
  persisted: boolean;
};

export type SoldQuoteSmsNotification = {
  recipient: string;
  result: SmsResult;
  delivery: SoldQuoteSmsDelivery;
};

type DeliveryRow = {
  id: string;
  recipient: string;
  recipient_e164: string | null;
  status: SoldQuoteSmsDelivery["status"];
  attempt_count: number;
  provider_message_sid: string | null;
};

type SoldQuoteRecipientEnv = {
  MIKE_805_SALES_SMS_NUMBER?: string;
  JESSICA_805_SALES_SMS_NUMBER?: string;
  CRM_SOLD_QUOTE_SMS_NUMBERS?: string;
};

function recipientKey(recipient: SoldQuoteSmsRecipient): string {
  return recipient.e164 || recipient.input.trim().toLowerCase();
}

/**
 * Michael and Jessica's documented settings replace their established fallback
 * numbers. Ken's established shop number remains required, and the
 * comma-separated shop setting can add recipients. Entries are normalized and
 * deduplicated so a configured fallback is never texted twice.
 */
export function soldQuoteSmsRecipients(
  env: SoldQuoteRecipientEnv = process.env as SoldQuoteRecipientEnv,
): SoldQuoteSmsRecipient[] {
  const [defaultPrimary, requiredKen, defaultJessica, ...retainedRecipients] =
    SOLD_QUOTE_NOTIFICATION_RECIPIENTS;
  const raw = [
    {
      input: env.MIKE_805_SALES_SMS_NUMBER || defaultPrimary,
      role: "primary" as const,
    },
    {
      input: requiredKen,
      role: "staff" as const,
    },
    {
      input: env.JESSICA_805_SALES_SMS_NUMBER || defaultJessica,
      role: "staff" as const,
    },
    ...retainedRecipients.map((input) => ({
      input,
      role: "staff" as const,
    })),
    ...(env.CRM_SOLD_QUOTE_SMS_NUMBERS || "").split(",").map((input) => ({
      input,
      role: "staff" as const,
    })),
  ];
  const seen = new Set<string>();
  const recipients: SoldQuoteSmsRecipient[] = [];

  for (const value of raw) {
    const input = String(value.input || "").trim();
    if (!input) continue;
    const e164 = toE164(input);
    const key = e164 || `invalid:${input.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ input, e164, role: value.role });
  }

  return recipients;
}

export function soldQuoteSmsStatusCallbackUrl(
  env: { NEXT_PUBLIC_SITE_URL?: string } = process.env as {
    NEXT_PUBLIC_SITE_URL?: string;
  },
): string | null {
  const origin = env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com";
  try {
    const url = new URL(STATUS_CALLBACK_PATH, `${origin.replace(/\/+$/, "")}/`);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function soldQuoteSmsStatusCallbackRequestUrl(): string | null {
  const callbackUrl = soldQuoteSmsStatusCallbackUrl();
  return callbackUrl ? `${callbackUrl}${STATUS_CALLBACK_RETRY_FRAGMENT}` : null;
}

function deliveryStatus(result: SmsResult): SoldQuoteSmsDelivery["status"] {
  if (result.sent) return "accepted";
  if (result.uncertain) return "unknown";
  if (result.skipped === "invalid or missing destination phone") return "invalid";
  return "failed";
}

function structuredLog(
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = JSON.stringify({ event, ...fields });
  if (level === "error") console.error("[sold-quote-sms]", line);
  else console.info("[sold-quote-sms]", line);
}

async function recordActivity(
  supabase: SupabaseClient,
  quoteId: string,
  source: NotificationSource,
  delivery: SoldQuoteSmsDelivery,
  result: SmsResult,
) {
  const { error } = await supabase.from("crm_activity_events").insert({
    actor_email: "automation:sold_quote_sms",
    entity_type: "quote",
    entity_id: quoteId,
    action: `sold_quote.sms.${delivery.status}`,
    metadata: {
      source,
      delivery_id: delivery.id || null,
      recipient: delivery.recipient,
      recipient_e164: delivery.recipientE164,
      status: delivery.status,
      attempt_count: delivery.attemptCount || null,
      provider_message_sid: result.sid || delivery.providerMessageSid || null,
      error: result.error || result.skipped || null,
    },
  });
  if (error) {
    structuredLog("error", "activity_write_failed", {
      quoteId,
      deliveryId: delivery.id || null,
      error: error.message,
    });
  }
}

async function currentDelivery(
  supabase: SupabaseClient,
  quoteId: string,
  recipient: SoldQuoteSmsRecipient,
): Promise<DeliveryRow | null> {
  const { data, error } = await supabase
    .from("crm_sold_quote_sms_notifications")
    .select("id,recipient,recipient_e164,status,attempt_count,provider_message_sid")
    .eq("quote_id", quoteId)
    .eq("event_key", EVENT_KEY)
    .eq("recipient", recipientKey(recipient))
    .maybeSingle();
  if (error) {
    structuredLog("error", "delivery_read_failed", {
      quoteId,
      recipient: recipient.input,
      error: error.message,
    });
    return null;
  }
  return data as DeliveryRow | null;
}

async function claimDelivery(
  supabase: SupabaseClient,
  quoteId: string,
  source: NotificationSource,
  recipient: SoldQuoteSmsRecipient,
  messageBody: string,
): Promise<{ row: DeliveryRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc(
    "claim_crm_sold_quote_sms_notification",
    {
      p_quote_id: quoteId,
      p_event_key: EVENT_KEY,
      p_source: source,
      p_recipient: recipientKey(recipient),
      p_recipient_e164: recipient.e164,
      p_message_body: messageBody,
    },
  );
  if (error) return { row: null, error: error.message };
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return { row: (rows[0] as DeliveryRow | undefined) || null, error: null };
}

async function finishDelivery(
  supabase: SupabaseClient,
  row: DeliveryRow,
  result: SmsResult,
): Promise<boolean> {
  const status = deliveryStatus(result);
  const { error } = await supabase
    .from("crm_sold_quote_sms_notifications")
    .update({
      status,
      provider_message_sid: result.sid || null,
      provider_status: result.providerStatus || (result.sent ? "accepted" : null),
      last_error: result.error || result.skipped || null,
      sent_at: result.sent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "sending");
  if (!error) return true;
  structuredLog("error", "delivery_result_write_failed", {
    deliveryId: row.id,
    status,
    providerAccepted: result.sent,
    error: error.message,
  });
  return false;
}

export async function sendSoldQuoteSmsNotifications(
  supabase: SupabaseClient,
  input: {
    quoteId: string;
    source: NotificationSource;
    buildMessage: (recipient: string, isPrimary: boolean) => string;
    recipientEnv?: SoldQuoteRecipientEnv;
    statusCallbackUrl?: string | null;
  },
  smsSender: typeof sendSms = sendSms,
): Promise<SoldQuoteSmsNotification[]> {
  const recipients = soldQuoteSmsRecipients(input.recipientEnv);
  const statusCallback = input.statusCallbackUrl === undefined
    ? soldQuoteSmsStatusCallbackRequestUrl()
    : input.statusCallbackUrl;
  const notifications: SoldQuoteSmsNotification[] = [];

  for (const recipient of recipients) {
    const body = input.buildMessage(recipient.input, recipient.role === "primary");
    const claim = await claimDelivery(
      supabase,
      input.quoteId,
      input.source,
      recipient,
      body,
    );

    if (claim.error) {
      const result: SmsResult = {
        sent: false,
        error: `SMS delivery state could not be claimed: ${claim.error}`,
      };
      const delivery: SoldQuoteSmsDelivery = {
        recipient: recipient.input,
        recipientE164: recipient.e164,
        status: "failed",
        persisted: false,
      };
      structuredLog("error", "claim_failed", {
        quoteId: input.quoteId,
        source: input.source,
        recipient: recipient.input,
        error: claim.error,
      });
      notifications.push({ recipient: recipient.input, result, delivery });
      continue;
    }

    if (!claim.row) {
      const existing = await currentDelivery(supabase, input.quoteId, recipient);
      const status = existing?.status || "sending";
      const result: SmsResult = status === "accepted" || status === "delivered"
        ? {
            sent: true,
            sid: existing?.provider_message_sid || undefined,
            skipped: status === "delivered"
              ? "sold quote notification delivered"
              : "sold quote notification already accepted by provider",
          }
        : {
            sent: false,
            skipped: status === "unknown"
              ? "delivery outcome requires provider reconciliation"
              : "sold quote notification delivery already in progress",
          };
      const delivery: SoldQuoteSmsDelivery = {
        id: existing?.id,
        recipient: recipient.input,
        recipientE164: recipient.e164,
        status,
        attemptCount: existing?.attempt_count,
        providerMessageSid: existing?.provider_message_sid,
        persisted: Boolean(existing),
      };
      structuredLog("info", "duplicate_suppressed", {
        quoteId: input.quoteId,
        source: input.source,
        deliveryId: existing?.id || null,
        recipient: recipient.input,
        status,
      });
      notifications.push({ recipient: recipient.input, result, delivery });
      continue;
    }

    const result = await smsSender({
      to: recipient.e164 || recipient.input,
      body,
      statusCallback,
    });
    const persisted = await finishDelivery(supabase, claim.row, result);
    const delivery: SoldQuoteSmsDelivery = {
      id: claim.row.id,
      recipient: recipient.input,
      recipientE164: recipient.e164,
      status: persisted ? deliveryStatus(result) : "sending",
      attemptCount: claim.row.attempt_count,
      providerMessageSid: result.sid || null,
      persisted,
    };
    structuredLog(
      result.sent && persisted ? "info" : "error",
      "delivery_finished",
      {
        quoteId: input.quoteId,
        source: input.source,
        deliveryId: claim.row.id,
        recipient: recipient.input,
        status: delivery.status,
        providerMessageSid: result.sid || null,
        persisted,
        error: result.error || result.skipped || null,
      },
    );
    await recordActivity(supabase, input.quoteId, input.source, delivery, result);
    notifications.push({ recipient: recipient.input, result, delivery });
  }

  return notifications;
}

export async function recordSoldQuoteSmsProviderStatus(
  supabase: SupabaseClient,
  input: {
    messageSid: string;
    providerStatus: string;
    errorCode?: string | null;
  },
): Promise<{ updated: boolean; delivery?: DeliveryRow; error?: string }> {
  const { data, error } = await supabase.rpc(
    "record_crm_sold_quote_sms_provider_status",
    {
      p_message_sid: input.messageSid,
      p_provider_status: input.providerStatus,
      p_error_code: input.errorCode || null,
    },
  );
  if (error) {
    structuredLog("error", "provider_status_write_failed", {
      messageSid: input.messageSid,
      providerStatus: input.providerStatus,
      error: error.message,
    });
    return { updated: false, error: error.message };
  }
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const delivery = rows[0] as DeliveryRow | undefined;
  structuredLog("info", delivery ? "provider_status_recorded" : "provider_status_unmatched", {
    messageSid: input.messageSid,
    providerStatus: input.providerStatus,
    deliveryId: delivery?.id || null,
    errorCode: input.errorCode || null,
  });
  return { updated: Boolean(delivery), delivery };
}
