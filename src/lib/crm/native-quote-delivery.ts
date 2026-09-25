import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { prepareV2CustomerSendPayloadFromDatabase, V2SendPreparationError } from "./sales-quote-v2-send";
import { assertV2CustomerPayloadHasNoProtectedFields } from "./sales-quote-v2-send-persist";
import { sendEmail, buildQuoteEmail } from "@/lib/notify/email";
import { sendSms, toE164 } from "@/lib/notify/twilio";
import type { SendSalesQuoteOptions } from "./sales-quote-send";

type Row = Record<string, unknown>;
export const nativeDeliveryRuntimeEnabled = () => process.env.QUOTE_V2_NATIVE_CUSTOMER_DELIVERY === "enabled-after-native-delivery-migration";
export type NativeDeliveryRequest = { email: string[]; sms: string[]; note: string | null; measureDecision: string | null; purpose?: "in_person" };
type Delivery = { id: string; quote_id: string | null; crm_quote_id: string; share_token: string; request_key: string; request: NativeDeliveryRequest; customer_payload: { total: number }; quote_revision: number; send_key?: string };
type Attempt = { id: string; channel: "email" | "sms"; recipient: string; state: "pending" | "sending" | "sent" | "failed" | "uncertain"; claim_token: string; result?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function runtimeGuard() {
  if (!nativeDeliveryRuntimeEnabled()) throw new CrmAuthError(409, "Native customer delivery is awaiting its verified database migration and runtime activation.");
}
function rpcError(error: { code?: string; message?: string } | null, fallback: string): void {
  if (error) throw new CrmAuthError(error.code === "42501" ? 403 : ["PT409", "40001", "55000", "23505", "22023"].includes(error.code || "") ? 409 : 502, error.message || fallback);
}
export function nativeDeliveryRequest(quote: Row, options: SendSalesQuoteOptions): NativeDeliveryRequest {
  if (options.emails != null && (!Array.isArray(options.emails) || options.emails.some(email => typeof email !== "string")) || options.phone != null && typeof options.phone !== "string") throw new CrmAuthError(400, "Invalid delivery recipients.");
  const emails = options.channels?.email === false ? [] : [...new Set((options.emails?.length ? options.emails : [quote.customer_email])
    .filter((email): email is string => typeof email === "string" && Boolean(email.trim())).map(email => email.trim().toLowerCase()))].sort();
  const phone = options.channels?.sms === false ? null : toE164(options.phone || String(quote.customer_phone || ""));
  if (emails.length > 10 || emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    (options.channels?.email !== false && !emails.length) || (options.channels?.sms !== false && !phone)) {
    throw new CrmAuthError(400, "Review the email and phone for every selected delivery channel.");
  }
  if (!emails.length && !phone) throw new CrmAuthError(400, "Select email or text delivery.");
  if (options.measureDecision != null && !["needed", "not_needed"].includes(options.measureDecision)) throw new CrmAuthError(400, "Invalid technical measure decision.");
  if (options.note && (typeof options.note !== "string" || options.note.length > 4000)) throw new CrmAuthError(400, "The customer note is too long.");
  return { email: emails, sms: phone ? [phone] : [], note: options.note?.trim() || null, measureDecision: options.measureDecision || null };
}

export async function nativeQuoteDeliveryCapability(db: SupabaseClient, quoteId: string, actorId: string) {
  if (!nativeDeliveryRuntimeEnabled()) return { enabled: false, native: false, canSend: false, reserved: false, schemaVersion: 1 };
  const { data, error } = await db.rpc("native_quote_delivery_capability", { p_quote_id: quoteId, p_actor_id: actorId });
  // Missing migration is deliberately a disabled capability, never an opt-in.
  if (error || data?.schemaVersion !== 1) return { enabled: false, native: false, canSend: false, reserved: false, schemaVersion: 1 };
  return { ...data, enabled: true };
}

export async function sendNativeSalesQuote(db: SupabaseClient, quote: Row, actor: { userId?: string }, options: SendSalesQuoteOptions) {
  const delivery = await reserveNativeSalesQuote(db, quote, actor, options);
  return deliverFrozenNativeQuote(db, delivery, actor.userId!);
}

/** Freeze the reviewed contract without creating or dispatching any messages. */
export async function prepareNativeInPersonQuote(db: SupabaseClient, quote: Row, actor: { userId?: string }, options: SendSalesQuoteOptions) {
  const delivery = await reserveNativeSalesQuote(db, quote, actor, options, true);
  const { loadPublicQuoteByToken } = await import("./public-quote");
  const pub = await loadPublicQuoteByToken(db, delivery.share_token);
  if (!pub || !pub.allPriced || pub.total <= 0 || (!pub.signed && Math.round(pub.total * 100) !== Math.round(Number(delivery.customer_payload.total) * 100))) {
    throw new CrmAuthError(409, "The customer contract could not be verified for signing.");
  }
  return { path: `/quote/${encodeURIComponent(delivery.share_token)}`, signed: pub.signed };
}

export async function markNativeSalesQuoteSold(db: SupabaseClient, quote: Row, actor: { userId?: string }, options: SendSalesQuoteOptions & { acknowledgedTotal?: number }) {
  const delivery = await reserveNativeSalesQuote(db, quote, actor, options, true);
  if (quote.signed_at) {
    if (Math.round(Number(options.acknowledgedTotal) * 100) !== Math.round(Number(quote.total_amount) * 100)) throw new CrmAuthError(409, "Reload the accepted contract total.");
    return delivery.crm_quote_id;
  }
  const { data, error } = await db.rpc("record_native_quote_staff_sale", {
    p_quote_id: quote.id, p_actor_id: actor.userId, p_expected_revision: options.expectedRevision,
    p_acknowledged_total: options.acknowledgedTotal,
  });
  rpcError(error, "The quote could not be marked sold.");
  if (data !== delivery.crm_quote_id) throw new CrmAuthError(502, "The sold contract could not be confirmed.");
  return delivery.crm_quote_id;
}

async function reserveNativeSalesQuote(db: SupabaseClient, quote: Row, actor: { userId?: string }, options: SendSalesQuoteOptions, inPerson = false): Promise<Delivery> {
  runtimeGuard();
  if (quote.status === "archived" || quote.archived_at) {
    throw new CrmAuthError(409, "This quote is archived. Restore the intended revision before sending it.");
  }
  if (!actor.userId || !UUID.test(actor.userId) || !Number.isSafeInteger(options.expectedRevision) || Number(options.expectedRevision) < 1 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(options.idempotencyKey || "")) {
    throw new CrmAuthError(400, "Reload this quote to obtain its current revision and delivery request key.");
  }
  const capability = await nativeQuoteDeliveryCapability(db, String(quote.id), actor.userId);
  if (!capability.enabled) throw new CrmAuthError(409, "The complete native delivery migration is not active.");
  if (options.deliveryMode != null && options.deliveryMode !== "resend") throw new CrmAuthError(400, "Invalid delivery action.");
  if (inPerson && !capability.supportsInPerson) throw new CrmAuthError(409, "In-person signing is awaiting its database migration.");
  const request: NativeDeliveryRequest = inPerson
    ? { email: [], sms: [], note: null, measureDecision: options.measureDecision || null, purpose: "in_person" }
    : nativeDeliveryRequest(quote, options);
  if (options.deliveryMode === "resend") {
    if (!capability.supportsResend) throw new CrmAuthError(409, "Send again is awaiting its database migration.");
    const { data: saved, error } = await db.rpc("reserve_native_quote_resend", {
      p_quote_id: quote.id, p_actor_id: actor.userId, p_expected_revision: options.expectedRevision,
      p_request_key: options.idempotencyKey, p_previous_request_key: options.previousDeliveryKey || null, p_request: request,
    });
    rpcError(error, "The resend could not be reserved. No new email was confirmed; reload delivery status before retrying.");
    if (!saved?.id || !saved.share_token || !saved.send_key) throw new CrmAuthError(502, "Resend returned an inconsistent identity.");
    return saved as Delivery;
  }
  const { data: existing, error: readError } = await db.from("sales_quote_v2_deliveries").select("*").eq("quote_id", quote.id).maybeSingle();
  rpcError(readError, "Native quote delivery could not be loaded.");
  if (inPerson && existing) {
    if (Number(existing.quote_revision) !== Number(options.expectedRevision)) throw new CrmAuthError(409, "This contract changed. Reload it before signing.");
    return existing as Delivery;
  }
  let group: Row[] = [quote];
  if (!existing && quote.quote_group_id) {
    const { data, error } = await db.from("sales_quotes").select("*").eq("quote_group_id", quote.quote_group_id).order("id");
    rpcError(error, "Quote alternatives could not be loaded.");
    group = (data || []).filter(member => !member.deleted_at && member.status !== "archived");
  }
  const payloads: Row[] = [];
  if (!existing) {
    for (const member of group) {
      let payload;
      try {
        payload = await prepareV2CustomerSendPayloadFromDatabase(db, member, { sendAsIs: options.sendAsIs === true });
      } catch (error) {
        if (error instanceof V2SendPreparationError) {
          throw new CrmAuthError(409, `Quote ${member.quote_number || member.id} cannot be sent: ${error.message}`);
        }
        throw error;
      }
      assertV2CustomerPayloadHasNoProtectedFields(payload);
      payloads.push({ quoteId: member.id, revision: member.quote_v2_revision, payload });
    }
  }
  const { data: saved, error } = await db.rpc("reserve_native_quote_group_delivery", {
    p_quote_id: quote.id, p_actor_id: actor.userId, p_expected_revision: options.expectedRevision,
    p_request_key: options.idempotencyKey, p_request: request, p_payloads: payloads,
  });
  rpcError(error, "Native quote delivery could not be reserved.");
  const delivery = saved as Delivery;
  if (!delivery?.id || !delivery.share_token) throw new CrmAuthError(502, "Native delivery returned an inconsistent identity.");
  return delivery;
}

/** Claims each recipient independently before the provider call. No automatic
 * retry follows an uncertain result or a process crash after claiming. */
export async function deliverFrozenNativeQuote(db: SupabaseClient, delivery: Delivery, actorId: string) {
  runtimeGuard();
  const { loadPublicQuoteByToken, publicQuoteUrl, buildQuoteShareSms } = await import("./public-quote");
  const pub = await loadPublicQuoteByToken(db, delivery.share_token);
  if (pub?.signed) throw new CrmAuthError(409, "This contract is already signed. Use its signed contract or payment link.");
  if (!pub || !pub.allPriced || Math.round(pub.total * 100) !== Math.round(Number(delivery.customer_payload.total) * 100)) {
    throw new CrmAuthError(409, "The frozen customer contract could not be verified before delivery.");
  }
  const url = publicQuoteUrl(delivery.share_token);
  const mail = buildQuoteEmail(pub.customerName, url, pub.total, {
    quoteNumber: pub.quoteNumber, lines: pub.lines, subtotal: pub.subtotal, depositDue: pub.depositDue,
    balanceDue: pub.balanceDue, versions: pub.versions, personalNote: delivery.request.note || undefined,
  });
  const { data: rows, error: readError } = await db.from("sales_quote_v2_delivery_attempts").select("*").eq("delivery_id", delivery.id).eq("send_key", delivery.send_key || "initial").order("id");
  rpcError(readError, "Delivery recipients could not be loaded.");
  const outcomes: Attempt[] = [];
  const newlyAccepted = new Set<string>();
  for (const original of (rows || []) as Attempt[]) {
    const { data: claim, error: claimError } = await db.rpc("claim_native_quote_delivery_attempt", { p_attempt_id: original.id, p_actor_id: actorId });
    rpcError(claimError, "Delivery could not be claimed.");
    if (!claim?.claimed) { outcomes.push(claim?.attempt || original); continue; }
    const attempt = claim.attempt as Attempt;
    let result: { sent: boolean; skipped?: string; error?: string; uncertain?: boolean; providerId?: string };
    try {
      if (attempt.channel === "email") {
        const sent = await sendEmail({ to: attempt.recipient, ...mail, from: "805 Shutters <805@805shutters.com>", idempotencyKey: `native-quote:${attempt.id}` });
        result = { sent: sent.sent, skipped: sent.skipped, error: sent.error, uncertain: sent.uncertain, providerId: sent.id };
      } else {
        const sent = await sendSms({ to: attempt.recipient, body: buildQuoteShareSms(url) });
        result = { sent: sent.sent, skipped: sent.skipped, error: sent.error, uncertain: sent.uncertain, providerId: sent.sid };
      }
    } catch (error) {
      result = { sent: false, uncertain: true, error: error instanceof Error ? error.message : "Provider outcome is unknown." };
    }
    // Never treat a success without provider identity as proof of delivery.
    if (result.sent && !result.providerId) result = { ...result, sent: false, uncertain: true, error: "Provider acceptance has no receipt identifier." };
    const { data: finished, error: finishError } = await db.rpc("finish_native_quote_delivery_attempt", {
      p_attempt_id: attempt.id, p_actor_id: actorId, p_claim_token: attempt.claim_token, p_result: result,
    });
    rpcError(finishError, "Provider outcome could not be recorded. Do not resend until the attempt is reconciled.");
    outcomes.push(finished as Attempt);
    if (finished?.state === "sent") newlyAccepted.add(attempt.id);
  }
  const summarize = (channel: "email" | "sms") => {
    const selected = outcomes.filter(row => row.channel === channel);
    if (!selected.length) return { sent: false, skipped: `${channel} not selected` };
    const acceptedCount = selected.filter(row => newlyAccepted.has(row.id)).length;
    if (selected.every(row => row.state === "sent")) return { sent: acceptedCount > 0, alreadySent: acceptedCount === 0, acceptedCount };
    if (selected.some(row => row.state === "sending" || row.state === "uncertain")) return { sent: false, error: "Provider outcome is pending reconciliation; it was not sent again." };
    return { sent: false, error: selected.filter(row => row.state !== "sent").map(row => String(row.result?.error || row.result?.skipped || "not sent")).join("; ") };
  };
  return { url, sms: summarize("sms"), email: summarize("email"), status: outcomes.some(row => row.state === "sent") ? "sent" : "draft", deliveryId: delivery.id };
}
