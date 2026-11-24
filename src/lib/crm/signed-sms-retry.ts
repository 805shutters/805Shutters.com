import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSignedShopSmsForRecipient } from "./public-quote";
import { sendSoldQuoteSmsNotifications, type SoldQuoteSmsNotification } from "./sold-quote-notifications";

export type RetryClaim = { quote_id: string; lease_token: string; attempts: number };
type Outcome = { status: "complete" | "retry" | "blocked" | "suppressed"; error: string | null };

export function signedSmsRetryOutcome(notifications: SoldQuoteSmsNotification[], attempts: number): Outcome {
  if (!notifications.length) return { status: "blocked", error: "No staff recipients configured" };
  if (notifications.every(n => n.delivery.persisted && ["accepted", "delivered"].includes(n.delivery.status))) {
    return { status: "complete", error: null };
  }
  // No blind replay after an ambiguous provider call, stale send, invalid
  // destination, or carrier rejection. Retain the record for reconciliation.
  const ambiguous = notifications.some(n => n.delivery.persisted &&
    ["unknown", "sending", "invalid", "undelivered"].includes(n.delivery.status));
  return {
    status: ambiguous || attempts >= 6 ? "blocked" : "retry",
    error: ambiguous ? "Provider outcome or destination requires review; automatic resend held"
      : attempts >= 6 ? "Staff SMS retry limit reached" : "Staff SMS was not accepted; retry scheduled",
  };
}

export type RetryDependencies = {
  claim: () => Promise<RetryClaim | null>;
  deliver: (claim: RetryClaim) => Promise<SoldQuoteSmsNotification[] | null>;
  finish: (claim: RetryClaim, outcome: Outcome, availableAt: string) => Promise<void>;
  now: () => number;
};

export async function processSignedSmsRetries(db: SupabaseClient, options: { limit?: number; deadlineMs?: number } = {},
  overrides: Partial<RetryDependencies> = {}) {
  const deps: RetryDependencies = {
    claim: async () => {
      const { data, error } = await db.rpc("claim_signed_sms_retry");
      if (error) throw new Error(`Staff SMS retry claim failed: ${error.message}`);
      return data as RetryClaim | null;
    },
    deliver: async claim => {
      // No quote rebuilding, technical measure generation, or customer messages.
      const { data: q, error } = await db.from("crm_quotes")
        .select("id,job_id,status,archived_at,signed_at,customer_signature,customer_printed_name,customer_name,customer_phone,customer_address,quote_total,deposit_required,meta")
        .eq("id", claim.quote_id).single();
      if (error) throw new Error(`Signed quote could not be read: ${error.message}`);
      if (!q.signed_at || !q.customer_signature?.trim() || q.archived_at || ["archived", "lost"].includes(q.status)
        || q.meta?.no_external_notification === true || q.meta?.historical_recordkeeping_only === true
        || q.meta?.sold_sms_suppressed === true) return null;
      const { data: job, error: jobError } = q.job_id
        ? await db.from("crm_jobs").select("customer_name,phone,address,source,meta").eq("id", q.job_id).maybeSingle()
        : { data: null, error: null };
      if (jobError) throw new Error(`Signed customer contact could not be read: ${jobError.message}`);
      if (!job || job.source === "mts_bookkeeping_import" || job.meta?.no_external_notification === true
        || job.meta?.historical_recordkeeping_only === true) return null;
      return sendSoldQuoteSmsNotifications(db, {
        quoteId: q.id, source: "signed_sms_retry",
        buildMessage: (recipient, primary) => buildSignedShopSmsForRecipient(recipient,
          q.customer_printed_name || q.customer_name || job?.customer_name || "Customer",
          Number(q.quote_total), Number(q.deposit_required) || 0,
          { customerPhone: q.customer_phone || job?.phone, customerAddress: q.customer_address || job?.address }, primary),
      });
    },
    finish: async (claim, outcome, availableAt) => {
      const { data, error } = await db.from("crm_signed_sms_retry").update({
        status: outcome.status, last_error: outcome.error, available_at: availableAt,
        lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString(),
      }).eq("quote_id", claim.quote_id).eq("lease_token", claim.lease_token).eq("status", "processing")
        .select("quote_id").maybeSingle();
      if (error || !data) throw new Error("Staff SMS retry result could not be saved under its lease");
    },
    now: Date.now,
    ...overrides,
  };
  const deadline = deps.now() + (options.deadlineMs ?? 200_000);
  const result = { processed: 0, complete: 0, retry: 0, blocked: 0, suppressed: 0, errors: [] as string[] };
  for (let i = 0; i < (options.limit ?? 10) && deps.now() < deadline - 40_000; i++) {
    const claim = await deps.claim();
    if (!claim) break;
    let outcome: Outcome;
    try {
      const deliveries = await deps.deliver(claim);
      outcome = deliveries === null ? { status: "suppressed", error: "Quote no longer eligible for staff alerts" }
        : signedSmsRetryOutcome(deliveries, claim.attempts);
    } catch (error) {
      // Any provider attempt is guarded by the existing per-recipient claim.
      // On the next run a persisted 'sending' record blocks a blind resend.
      outcome = { status: claim.attempts >= 6 ? "blocked" : "retry",
        error: error instanceof Error ? error.message : "Staff SMS retry failed" };
    }
    const delay = Math.min(60, 5 * 2 ** Math.min(claim.attempts - 1, 4));
    await deps.finish(claim, outcome, new Date(deps.now() + delay * 60_000).toISOString());
    result.processed++;
    result[outcome.status]++;
    if (outcome.error) result.errors.push(outcome.error);
  }
  return result;
}

export async function signedSmsRetryHealth(db: SupabaseClient) {
  const statuses = ["pending", "processing", "retry", "blocked", "complete", "suppressed"] as const;
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    const { count, error } = await db.from("crm_signed_sms_retry").select("quote_id", { count: "exact", head: true }).eq("status", status);
    if (error) throw new Error("Staff SMS retry health unavailable");
    counts[status] = count || 0;
  }
  return { ok: counts.blocked === 0, counts };
}
