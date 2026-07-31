import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms, toE164, type SmsResult } from "@/lib/notify/twilio";
import { sendEmail, type EmailResult } from "@/lib/notify/email";

export const SQUARE_DEPOSIT_CONTRACT_REMINDER =
  "Thank you so much for your payment for the deposit for your window coverings. Would you please sign the contract that’s in your email as well?";

const EVENT_KEY = "square_payment_unsigned_contract";
const STATUS_CALLBACK_PATH = "/api/webhooks/twilio/square-contract-reminder-status";
const STATUS_CALLBACK_RETRY_FRAGMENT = "#rc=2&rp=ct,rt,5xx";
export const SQUARE_CONTRACT_REMINDER_DELAY_MS = 15 * 60 * 1000;

type ReminderStatus =
  | "sending"
  | "accepted"
  | "delivered"
  | "undelivered"
  | "failed"
  | "unknown"
  | "skipped"
  | "review_needed"
  | "scheduled";

type QuoteRow = {
  id: string;
  job_id: string | null;
  sent_at: string | null;
  signed_at: string | null;
  customer_signature: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  sent_via: string | null;
  external_id: string | null;
  meta: Record<string, unknown> | null;
};

type JobRow = {
  id: string;
  phone: string | null;
  email: string | null;
  meta: Record<string, unknown> | null;
};

type ContractRow = {
  id: string;
  job_id: string | null;
  signed_at: string | null;
  status: string | null;
};

type PreferenceRow = {
  do_not_contact: boolean | null;
  opted_out_at: string | null;
};

type EmailPreferenceRow = {
  do_not_contact: boolean | null;
  opted_out_at: string | null;
};

type SalesQuoteRow = {
  id: string;
  sent_via: string | null;
};

type DeliveryRow = {
  id: string;
  status: ReminderStatus;
  attempt_count: number;
  provider_message_sid: string | null;
};

export type SquareContractReminderResult = {
  status: ReminderStatus;
  sent: boolean;
  reason?: string;
  deliveryId?: string;
  providerMessageSid?: string | null;
  channel?: "sms" | "email";
};

type ScheduledReminderRow = {
  id: string;
  quote_id: string;
  square_payment_id: string;
  scheduled_for: string;
};

export async function scheduleSquareContractReminder(
  supabase: SupabaseClient,
  input: {
    quoteId: string;
    jobId?: string | null;
    squarePaymentId: string;
    paidAt?: string | null;
  },
): Promise<SquareContractReminderResult> {
  const parsed = input.paidAt ? new Date(input.paidAt) : new Date();
  const receivedAt = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const scheduledFor = new Date(receivedAt.getTime() + SQUARE_CONTRACT_REMINDER_DELAY_MS).toISOString();
  const { data, error } = await supabase.rpc("schedule_crm_square_contract_reminder", {
    p_quote_id: input.quoteId,
    p_job_id: input.jobId || null,
    p_square_payment_id: input.squarePaymentId,
    p_event_key: EVENT_KEY,
    p_scheduled_for: scheduledFor,
  });
  if (error) throw new Error(`Contract reminder could not be scheduled: ${error.message}`);
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const row = rows[0] as ScheduledReminderRow | undefined;
  return {
    status: "scheduled",
    sent: false,
    reason: row ? `Scheduled for ${row.scheduled_for || scheduledFor}.` : "Reminder was already scheduled.",
    deliveryId: row?.id,
  };
}

function booleanFlag(meta: Record<string, unknown> | null, ...keys: string[]) {
  return keys.some((key) => meta?.[key] === true);
}

export function isCustomerSmsOptOut(body: string | null | undefined) {
  return /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*[.!]?\s*$/i.test(String(body || ""));
}

export function resolveSquareContractReminderChannel(input: {
  crmSentVia?: string | null;
  linkedSalesSentVia?: string | null;
  successfulSendChannels?: Array<"sms" | "email">;
}): { channel: "sms" | "email" } | { reason: string } {
  const crm = String(input.crmSentVia || "").toLowerCase();
  const linked = String(input.linkedSalesSentVia || "").toLowerCase();
  const successful = [...new Set(input.successfulSendChannels || [])];
  if ([crm, linked].filter(Boolean).some((value) => !["sms", "email", "both"].includes(value))) {
    return { reason: "The original customer contact channel is invalid." };
  }
  if (successful.length > 1 || crm === "both") {
    return { reason: "The original customer contact used both email and SMS and is ambiguous." };
  }
  const actual = successful[0] || (crm === "sms" || crm === "email" ? crm : null);
  if (!actual) {
    return { reason: "The original successful customer contact channel was not recorded." };
  }
  if (
    (crm === "sms" || crm === "email") && crm !== actual ||
    (linked === "sms" || linked === "email") && linked !== actual
  ) {
    return { reason: "Recorded original customer contact channels conflict." };
  }
  return { channel: actual };
}

export function squareContractReminderEligibility(input: {
  quote: QuoteRow | null;
  job: JobRow | null;
  contracts: ContractRow[];
  preference: PreferenceRow | null;
  emailPreference?: EmailPreferenceRow | null;
  channel: "sms" | "email";
}):
  | { eligible: true; channel: "sms"; recipient: string }
  | { eligible: true; channel: "email"; recipient: string }
  | { eligible: false; reason: string } {
  const { quote, job, contracts, preference, emailPreference, channel } = input;
  if (!quote || !job || !quote.job_id || quote.job_id !== job.id) {
    return { eligible: false, reason: "Exact quote and job identity did not match." };
  }
  if (!quote.sent_at) {
    return { eligible: false, reason: "No contract has been sent for this quote." };
  }
  if (
    quote.signed_at ||
    quote.customer_signature ||
    contracts.some((contract) =>
      Boolean(contract.signed_at) ||
      ["signed", "approved", "sold"].includes(String(contract.status || "").toLowerCase())
    )
  ) {
    return { eligible: false, reason: "The contract is already signed." };
  }
  if (contracts.some((contract) => contract.job_id && contract.job_id !== job.id)) {
    return { eligible: false, reason: "Contract identity is ambiguous for this quote and job." };
  }
  if (channel === "sms" && (
    preference?.do_not_contact ||
    preference?.opted_out_at ||
    booleanFlag(job.meta, "do_not_contact", "do_not_sms", "sms_opt_out", "sms_opted_out")
  )) {
    return { eligible: false, reason: "The customer is opted out or marked do not contact." };
  }
  if (channel === "email" && (
    emailPreference?.do_not_contact ||
    emailPreference?.opted_out_at ||
    booleanFlag(job.meta, "do_not_contact", "do_not_email", "email_opt_out", "email_opted_out")
  )) {
    return { eligible: false, reason: "The customer email is opted out or marked do not contact." };
  }

  if (channel === "sms") {
    const quotePhone = toE164(quote.customer_phone);
    const jobPhone = toE164(job.phone);
    if (quote.customer_phone && !quotePhone) {
      return { eligible: false, reason: "The quote phone is unreachable or invalid." };
    }
    if (job.phone && !jobPhone) {
      return { eligible: false, reason: "The job phone is unreachable or invalid." };
    }
    if (quotePhone && jobPhone && quotePhone !== jobPhone) {
      return { eligible: false, reason: "Quote and job phones do not exactly match." };
    }
    const recipient = quotePhone || jobPhone;
    if (!recipient) return { eligible: false, reason: "No reachable customer phone is available." };
    return { eligible: true, channel, recipient };
  }

  const quoteEmail = String(quote.customer_email || "").trim().toLowerCase();
  const jobEmail = String(job.email || "").trim().toLowerCase();
  const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (quoteEmail && !validEmail(quoteEmail)) return { eligible: false, reason: "The quote email is unreachable or invalid." };
  if (jobEmail && !validEmail(jobEmail)) return { eligible: false, reason: "The job email is unreachable or invalid." };
  if (quoteEmail && jobEmail && quoteEmail !== jobEmail) {
    return { eligible: false, reason: "Quote and job emails do not exactly match." };
  }
  const recipient = quoteEmail || jobEmail;
  if (!recipient) return { eligible: false, reason: "No reachable customer email is available." };
  return { eligible: true, channel, recipient };
}

export function squareContractReminderStatusCallbackUrl(
  env: { NEXT_PUBLIC_SITE_URL?: string } = process.env as {
    NEXT_PUBLIC_SITE_URL?: string;
  },
) {
  const origin = env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com";
  try {
    const url = new URL(STATUS_CALLBACK_PATH, `${origin.replace(/\/+$/, "")}/`);
    return url.protocol === "https:" ? `${url.toString()}${STATUS_CALLBACK_RETRY_FRAGMENT}` : null;
  } catch {
    return null;
  }
}

async function recordSkip(
  supabase: SupabaseClient,
  input: {
    quoteId: string;
    jobId: string | null;
    squarePaymentId: string;
    reason: string;
    status?: "skipped" | "review_needed";
  },
) {
  const { error } = await supabase.rpc("record_crm_square_contract_reminder_skip", {
    p_quote_id: input.quoteId,
    p_job_id: input.jobId,
    p_square_payment_id: input.squarePaymentId,
    p_event_key: EVENT_KEY,
    p_reason: input.reason,
    p_status: input.status || "skipped",
  });
  if (error) {
    console.error("[square-contract-reminder] skip persistence failed", {
      squarePaymentId: input.squarePaymentId,
      quoteId: input.quoteId,
      error: error.message,
    });
  }
}

function resultStatus(result: SmsResult): ReminderStatus {
  if (result.sent) return "accepted";
  if (result.uncertain) return "unknown";
  return "failed";
}

export async function maybeSendSquareContractReminder(
  supabase: SupabaseClient,
  input: { quoteId: string; squarePaymentId: string; claimedDeliveryId: string },
  smsSender: typeof sendSms = sendSms,
  emailSender: typeof sendEmail = sendEmail,
): Promise<SquareContractReminderResult> {
  const finishWithoutSend = async (
    status: "skipped" | "review_needed",
    reason: string,
  ): Promise<SquareContractReminderResult> => {
    const { error } = await supabase
      .from("crm_square_contract_reminders")
      .update({ status, reason, updated_at: new Date().toISOString() })
      .eq("id", input.claimedDeliveryId)
      .eq("status", "sending");
    if (error) throw new Error(`Contract reminder suppression could not be persisted: ${error.message}`);
    return { status, sent: false, reason, deliveryId: input.claimedDeliveryId };
  };
  const quoteResult = await supabase
    .from("crm_quotes")
    .select("id,job_id,sent_at,signed_at,customer_signature,customer_phone,customer_email,sent_via,external_id,meta")
    .eq("id", input.quoteId)
    .maybeSingle();
  if (quoteResult.error) throw new Error(`Contract reminder quote lookup failed: ${quoteResult.error.message}`);
  const quote = quoteResult.data as QuoteRow | null;

  const [jobResult, contractsResult, activityResult] = await Promise.all([
    quote?.job_id
      ? supabase.from("crm_jobs").select("id,phone,email,meta").eq("id", quote.job_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("crm_customer_contracts")
      .select("id,job_id,signed_at,status")
      .eq("quote_id", input.quoteId),
    supabase
      .from("crm_activity_events")
      .select("metadata")
      .eq("entity_type", "quote")
      .eq("entity_id", input.quoteId)
      .eq("action", "send_to_customer"),
  ]);
  const loadError = jobResult.error || contractsResult.error || activityResult.error;
  if (loadError) throw new Error(`Contract reminder identity lookup failed: ${loadError.message}`);
  const job = jobResult.data as JobRow | null;

  const linkedIdCandidates = [
    String(quote?.external_id || "").match(/^quote:([0-9a-f-]{36})$/i)?.[1],
    typeof quote?.meta?.source_sales_quote_id === "string" ? quote.meta.source_sales_quote_id : null,
    typeof quote?.meta?.mts_quote_id === "string" ? quote.meta.mts_quote_id : null,
  ].filter((value): value is string => Boolean(value));
  const linkedIds = [...new Set(linkedIdCandidates)];
  let linkedSalesQuote: SalesQuoteRow | null = null;
  if (linkedIds.length > 1) {
    const reason = "The CRM quote has conflicting exact source quote identities.";
    await recordSkip(supabase, {
      quoteId: input.quoteId,
      jobId: quote?.job_id || null,
      squarePaymentId: input.squarePaymentId,
      reason,
      status: "review_needed",
    });
    return finishWithoutSend("review_needed", reason);
  }
  if (linkedIds[0]) {
    const linkedResult = await supabase
      .from("sales_quotes")
      .select("id,sent_via")
      .eq("id", linkedIds[0])
      .maybeSingle();
    if (linkedResult.error) throw new Error(`Contract reminder source-channel lookup failed: ${linkedResult.error.message}`);
    linkedSalesQuote = linkedResult.data as SalesQuoteRow | null;
  }
  const channelResult = resolveSquareContractReminderChannel({
    crmSentVia: quote?.sent_via,
    linkedSalesSentVia: linkedSalesQuote?.sent_via,
    successfulSendChannels: [...new Set(
      ((activityResult.data || []) as Array<{ metadata?: Record<string, unknown> | null }>)
        .flatMap((activity) => [
          activity.metadata?.sms === true ? "sms" as const : null,
          activity.metadata?.email === true ? "email" as const : null,
        ])
        .filter((value): value is "sms" | "email" => Boolean(value)),
    )],
  });
  if (!("channel" in channelResult)) {
    await recordSkip(supabase, {
      quoteId: input.quoteId,
      jobId: quote?.job_id || null,
      squarePaymentId: input.squarePaymentId,
      reason: channelResult.reason,
      status: "review_needed",
    });
    return finishWithoutSend("review_needed", channelResult.reason);
  }

  const preliminary = squareContractReminderEligibility({
    quote,
    job,
    contracts: (contractsResult.data || []) as ContractRow[],
    preference: null,
    emailPreference: null,
    channel: channelResult.channel,
  });

  let preference: PreferenceRow | null = null;
  let emailPreference: EmailPreferenceRow | null = null;
  const candidateRecipient = preliminary.eligible ? preliminary.recipient : null;
  if (channelResult.channel === "sms" && candidateRecipient) {
    const preferenceResult = await supabase
      .from("crm_customer_sms_preferences")
      .select("do_not_contact,opted_out_at")
      .eq("phone_e164", candidateRecipient)
      .maybeSingle();
    if (preferenceResult.error) {
      throw new Error(`Contract reminder contact preference lookup failed: ${preferenceResult.error.message}`);
    }
    preference = preferenceResult.data as PreferenceRow | null;
  }
  if (channelResult.channel === "email" && candidateRecipient) {
    const preferenceResult = await supabase
      .from("crm_customer_email_preferences")
      .select("do_not_contact,opted_out_at")
      .eq("email_normalized", candidateRecipient)
      .maybeSingle();
    if (preferenceResult.error) {
      throw new Error(`Contract reminder email preference lookup failed: ${preferenceResult.error.message}`);
    }
    emailPreference = preferenceResult.data as EmailPreferenceRow | null;
  }

  const eligibility = squareContractReminderEligibility({
    quote,
    job,
    contracts: (contractsResult.data || []) as ContractRow[],
    preference,
    emailPreference,
    channel: channelResult.channel,
  });
  if (!eligibility.eligible) {
    const reviewNeeded =
      /(opted out|do not contact|unreachable|invalid|do not exactly match|ambiguous|identity did not match|no reachable)/i
        .test(eligibility.reason);
    await recordSkip(supabase, {
      quoteId: input.quoteId,
      jobId: quote?.job_id || null,
      squarePaymentId: input.squarePaymentId,
      reason: eligibility.reason,
      status: reviewNeeded ? "review_needed" : "skipped",
    });
    return finishWithoutSend(
      reviewNeeded ? "review_needed" : "skipped",
      eligibility.reason,
    );
  }

  const delivery: DeliveryRow = {
    id: input.claimedDeliveryId,
    status: "sending",
    attempt_count: 1,
    provider_message_sid: null,
  };

  let sendResult: SmsResult | EmailResult;
  if (eligibility.channel === "sms") {
    sendResult = await smsSender({
      to: eligibility.recipient,
      body: SQUARE_DEPOSIT_CONTRACT_REMINDER,
      statusCallback: squareContractReminderStatusCallbackUrl(),
    });
  } else {
    sendResult = await emailSender({
      to: eligibility.recipient,
      subject: "Thank you for your deposit — please sign your contract",
      text: `${SQUARE_DEPOSIT_CONTRACT_REMINDER}\n\nThank you,\n805 Shutters`,
      html: `<p>${SQUARE_DEPOSIT_CONTRACT_REMINDER}</p><p>Thank you,<br>805 Shutters</p>`,
      idempotencyKey: `square-contract-reminder-${input.squarePaymentId}`.slice(0, 255),
    });
  }
  const sms = sendResult as SmsResult;
  const status = eligibility.channel === "sms"
    ? resultStatus(sms)
    : sendResult.sent ? "accepted" : "failed";
  const finish = await supabase
    .from("crm_square_contract_reminders")
    .update({
      status,
      channel: eligibility.channel,
      recipient: eligibility.recipient,
      message_body: SQUARE_DEPOSIT_CONTRACT_REMINDER,
      provider_message_sid: eligibility.channel === "sms" ? sms.sid || null : null,
      provider_message_id: eligibility.channel === "email" ? (sendResult as EmailResult).id || null : null,
      provider_status: sms.providerStatus || (sendResult.sent ? "accepted" : null),
      last_error: sendResult.error || sendResult.skipped || null,
      sent_at: sendResult.sent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", delivery.id)
    .eq("status", "sending");
  if (finish.error) {
    throw new Error(`Contract reminder delivery result could not be persisted: ${finish.error.message}`);
  }
  return {
    status,
    sent: sendResult.sent,
    reason: sendResult.error || sendResult.skipped,
    deliveryId: delivery.id,
    providerMessageSid: sms.sid || null,
    channel: eligibility.channel,
  };
}

export async function dispatchDueSquareContractReminders(
  supabase: SupabaseClient,
  limit = 50,
  smsSender: typeof sendSms = sendSms,
  emailSender: typeof sendEmail = sendEmail,
) {
  const { data, error } = await supabase.rpc("claim_due_crm_square_contract_reminders", {
    p_limit: limit,
  });
  if (error) throw new Error(`Due contract reminders could not be claimed: ${error.message}`);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as ScheduledReminderRow[];
  const results: SquareContractReminderResult[] = [];
  for (const row of rows) {
    try {
      results.push(await maybeSendSquareContractReminder(supabase, {
        quoteId: row.quote_id,
        squarePaymentId: row.square_payment_id,
        claimedDeliveryId: row.id,
      }, smsSender, emailSender));
    } catch (dispatchError) {
      const reason = dispatchError instanceof Error ? dispatchError.message : "Reminder dispatch failed.";
      const { error: updateError } = await supabase
        .from("crm_square_contract_reminders")
        .update({ status: "unknown", last_error: reason, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "sending");
      if (updateError) console.error("[square-contract-reminder] dispatch failure persistence failed", updateError);
      results.push({ status: "unknown", sent: false, reason, deliveryId: row.id });
    }
  }
  return {
    claimed: rows.length,
    sent: results.filter((result) => result.sent).length,
    suppressed: results.filter((result) => result.status === "skipped").length,
    reviewNeeded: results.filter((result) => result.status === "review_needed").length,
    unknown: results.filter((result) => result.status === "unknown").length,
    results,
  };
}

export async function recordSquareContractReminderProviderStatus(
  supabase: SupabaseClient,
  input: { messageSid: string; providerStatus: string; errorCode?: string | null },
) {
  const { data, error } = await supabase.rpc("record_crm_square_contract_reminder_provider_status", {
    p_message_sid: input.messageSid,
    p_provider_status: input.providerStatus,
    p_error_code: input.errorCode || null,
  });
  if (error) return { updated: false, error: error.message };
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return { updated: rows.length > 0 };
}
