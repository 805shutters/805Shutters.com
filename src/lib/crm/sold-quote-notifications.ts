import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SOLD_QUOTE_NOTIFICATION_RECIPIENTS,
} from "@mts/lib/quoteSoldNotification";
import { sendSms, toE164, type SmsResult } from "@/lib/notify/twilio";

const EVENT_KEY = "contract_signed";

type NotificationSource =
  | "public_contract_accept"
  | "public_contract_retry"
  | "in_home_sold";

export type SoldQuoteSmsRecipient = {
  input: string;
  e164: string | null;
};

export type SoldQuoteSmsDelivery = {
  id?: string;
  recipient: string;
  recipientE164: string | null;
  status: "sent" | "failed" | "invalid" | "unknown" | "sending";
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

function recipientKey(recipient: SoldQuoteSmsRecipient): string {
  return recipient.e164 || recipient.input.trim().toLowerCase();
}

/**
 * The three established business recipients are mandatory. The documented
 * CRM_SOLD_QUOTE_SMS_NUMBERS setting can add recipients without accidentally
 * removing a required shop number. All entries are normalized and deduplicated.
 */
export function soldQuoteSmsRecipients(
  configured = process.env.CRM_SOLD_QUOTE_SMS_NUMBERS,
): SoldQuoteSmsRecipient[] {
  const raw = [
    ...SOLD_QUOTE_NOTIFICATION_RECIPIENTS,
    ...(configured || "").split(","),
  ];
  const seen = new Set<string>();
  const recipients: SoldQuoteSmsRecipient[] = [];

  for (const value of raw) {
    const input = String(value || "").trim();
    if (!input) continue;
    const e164 = toE164(input);
    const key = e164 || `invalid:${input.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ input, e164 });
  }

  return recipients;
}

function deliveryStatus(result: SmsResult): SoldQuoteSmsDelivery["status"] {
  if (result.sent) return "sent";
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
    buildMessage: (recipient: string) => string;
    configuredRecipients?: string;
  },
  smsSender: typeof sendSms = sendSms,
): Promise<SoldQuoteSmsNotification[]> {
  const recipients = soldQuoteSmsRecipients(input.configuredRecipients);
  const notifications: SoldQuoteSmsNotification[] = [];

  for (const recipient of recipients) {
    const body = input.buildMessage(recipient.input);
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
      const result: SmsResult = status === "sent"
        ? {
            sent: true,
            sid: existing?.provider_message_sid || undefined,
            skipped: "sold quote notification already delivered",
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

    const result = await smsSender({ to: recipient.e164 || recipient.input, body });
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
