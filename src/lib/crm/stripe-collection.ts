import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retireLegacySquareRequests } from "./square-collection-retirement";
import { CrmAuthError } from "@/lib/crm/auth";
import type {
  SquarePaymentLinkInput,
  SquarePaymentLink,
} from "@/lib/finance/square";
import {
  objectId,
  stripeRecord,
  stripeRequest,
  verifyStripeAccount,
} from "@/lib/finance/stripe";

export type RequestRow = {
  id: string;
  account_id: string;
  livemode: boolean;
  quote_id: string | null;
  bookkeeping_entry_id: string | null;
  job_id: string;
  amount_cents: number;
  purpose: string;
  status: string;
  fingerprint: string;
  session_id: string | null;
  payment_intent_id: string | null;
  url: string | null;
  created_at: string;
};

/** Reservation happens before checkout creation or delivery. Expose only known business errors. */
export function stripeReservationError(error: { code?: string; message?: string }) {
  const reasons: Record<string, string> = {
    "Existing Square requests require verified retirement or resolution before Stripe collection.":
      "This order has a historical Square payment request. Review it in Stripe payments / Square clearance review before requesting a Stripe payment.",
    "Amount exceeds current balance.":
      "The requested amount exceeds the current balance. Close this request, refresh, and review the amount.",
    "Existing card request must be reconciled and expired before replacement.":
      "An existing Stripe payment request must be reconciled and expired before it can be replaced. Review it in Stripe payments.",
    "Exact active job ledger is required.":
      "The active customer order could not be verified. Close this request, refresh, and review the order.",
  };
  const reason = error.code === "P0001" ? reasons[error.message || ""] : undefined;
  return new CrmAuthError(
    reason ? 409 : 502,
    `Payment link was not sent. ${reason || "The payment request could not be reserved. Review the current balance and existing card requests before trying again."}`,
  );
}
async function save(
  db: SupabaseClient,
  table: string,
  value: Record<string, unknown>,
  conflict: string,
) {
  const { error } = await db
    .from(table)
    .upsert(value, { onConflict: conflict });
  if (error)
    throw new Error(
      "Stripe evidence could not be saved; collection remains on hold.",
    );
}
async function update(
  db: SupabaseClient,
  id: string,
  value: Record<string, unknown>,
) {
  const { error } = await db
    .from("crm_stripe_requests")
    .update({ ...value, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("Stripe request status could not be saved.");
}
export async function synchronizeStripeRequest(
  db: SupabaseClient,
  r: RequestRow,
) {
  const config = await verifyStripeAccount();
  if (r.account_id !== config.account || r.livemode !== config.livemode)
    throw new Error("Stripe request belongs to a different account or mode.");
  if (!r.session_id) return r;
  const session = await stripeRequest(
    `/v1/checkout/sessions/${encodeURIComponent(r.session_id)}`,
  );
  if (
    session.id !== r.session_id ||
    session.livemode !== r.livemode ||
    stripeRecord(session.metadata).crm_request_id !== r.id ||
    session.amount_total !== Number(r.amount_cents) ||
    session.currency !== "usd"
  )
    throw new Error("Checkout evidence does not match the exact CRM request.");
  const intentId = objectId(session.payment_intent);
  if (intentId) {
    const payment = await stripeRequest(
      `/v1/payment_intents/${encodeURIComponent(intentId)}?expand[]=latest_charge.balance_transaction`,
    );
    const charge = stripeRecord(payment.latest_charge),
      balance = stripeRecord(charge.balance_transaction);
    if (
      payment.id !== intentId ||
      payment.livemode !== r.livemode ||
      stripeRecord(payment.metadata).crm_request_id !== r.id ||
      payment.amount !== Number(r.amount_cents) ||
      payment.currency !== "usd"
    )
      throw new Error("Payment evidence does not match the exact CRM request.");
    await save(
      db,
      "crm_stripe_objects",
      {
        account_id: r.account_id,
        livemode: r.livemode,
        kind: "payment",
        id: intentId,
        status: payment.status,
        currency: payment.currency,
        amount_cents: payment.amount_received,
        fee_cents: balance.fee ?? null,
        occurred_at: new Date(Number(payment.created) * 1000).toISOString(),
        details: {
          request_id: r.id,
          charge_id: objectId(payment.latest_charge),
          refunded_cents: charge.amount_refunded ?? 0,
          disputed: charge.disputed === true,
          receipt_url: charge.receipt_url ?? null,
        },
      },
      "account_id,livemode,kind,id",
    );
    const status =
      payment.status === "succeeded"
        ? r.livemode
          ? "review"
          : "paid"
        : session.status === "expired"
          ? "expired"
          : payment.status === "processing"
            ? "processing"
            : session.status === "open"
              ? "open"
              : "review";
    await update(db, r.id, { payment_intent_id: intentId, status });
    r = { ...r, payment_intent_id: intentId, status };
    if (payment.status === "succeeded" && r.livemode) {
      const result = await db.rpc("allocate_stripe_payment", {
        p_request: r.id,
        p_intent: intentId,
      });
      if (result.error)
        throw new Error("Payment verified; CRM allocation needs review.");
      r.status = result.data?.status === "review" ? "review" : "paid";
      await update(db, r.id, {
        status: r.status,
        ...(r.status === "paid" ? { error: null } : {}),
      });
      const plans = await import("./in-house-plan-processor");
      if (Number(charge.amount_refunded) > 0 || charge.disputed === true)
        await plans.flagPlanRefund(
          db,
          `${r.account_id}:${intentId}`,
          undefined,
          "stripe",
        );
      else
        await plans.refreshPlansAfterLedgerWrite(db, {
          quoteId: r.quote_id || undefined,
          bookkeepingEntryId: r.bookkeeping_entry_id || undefined,
          jobId: r.job_id,
        });
    }
  } else {
    const status =
      session.status === "expired"
        ? "expired"
        : session.status === "open"
          ? "open"
          : "review";
    await update(db, r.id, { status });
    r = { ...r, status };
  }
  if (r.status === "open") {
    const due = await db.rpc("stripe_target_balance", {
      p_quote: r.quote_id,
      p_entry: r.bookkeeping_entry_id,
      p_job: r.job_id,
    });
    if (due.error)
      throw new Error(
        "Current ledger balance unavailable; checkout requires review.",
      );
    if (Number(due.data) < Number(r.amount_cents)) {
      const expired = await stripeRequest(
        `/v1/checkout/sessions/${encodeURIComponent(r.session_id!)}/expire`,
        { method: "POST", idempotencyKey: `805-expire-${r.session_id}` },
      );
      if (expired.status !== "expired")
        throw new Error("Stale checkout expiration requires review.");
      await update(db, r.id, { status: "expired", url: null });
      r = { ...r, status: "expired", url: null };
    }
  }
  return r;
}
export async function createStripePaymentLink(
  db: SupabaseClient,
  input: SquarePaymentLinkInput,
): Promise<SquarePaymentLink> {
  const config = await verifyStripeAccount(true);
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    !input.jobId ||
    !input.quoteId === !input.bookkeepingEntryId
  )
    throw new Error("Exact job, ledger and positive integer amount required.");
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        amount: input.amountCents,
        purpose: input.paymentType,
        quote: input.quoteId || null,
        entry: input.bookkeepingEntryId || null,
        installment: input.inHouseInstallmentId || null,
        selection: [...(input.selectedLineIds || [])].sort(),
      }),
    )
    .digest("hex");
  const reservation = {
    p_account: config.account,
    p_live: config.livemode,
    p_quote: input.quoteId || null,
    p_entry: input.bookkeepingEntryId || null,
    p_job: input.jobId,
    p_installment: input.inHouseInstallmentId || null,
    p_purpose: input.paymentType,
    p_amount: input.amountCents,
    p_fingerprint: fingerprint,
  };
  let reserved = await db.rpc("reserve_stripe_request", reservation);
  if (config.livemode && reserved.error?.code === "P0001" && reserved.error.message === "Existing Square requests require verified retirement or resolution before Stripe collection.") {
    await retireLegacySquareRequests(db, { quoteId: input.quoteId, bookkeepingEntryId: input.bookkeepingEntryId, jobId: input.jobId });
    // Re-read the live ledger and acquire the normal reservation after retirement.
    reserved = await db.rpc("reserve_stripe_request", reservation);
  }

  if (reserved.error)
    throw stripeReservationError(reserved.error);
  let row = reserved.data as RequestRow;
  if (row.session_id) {
    row = await synchronizeStripeRequest(db, row);
    if (row.status === "open" && row.url)
      return {
        id: row.session_id!,
        url: row.url,
        orderId: row.session_id!,
        provider: "stripe",
        requestId: row.id,
      };
    throw new Error(
      "This request has closed or needs reconciliation. Refresh the balance before creating another.",
    );
  }
  // Stripe retains idempotency keys at least 24 hours; never recreate an uncertain old request.
  if (Date.now() - Date.parse(row.created_at) > 23 * 3600000)
    throw new Error(
      "Uncertain older checkout requires provider review before replacement.",
    );
  const form = new URLSearchParams({
    mode: "payment",
    "allowed_payment_method_types[0]": "card",
    // Keep the integration label stable so retries retain an identical body.
    integration_identifier: "805-crm-hosted-cards-qmznvtrk",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(input.amountCents),
    "line_items[0][price_data][product_data][name]": `805 Shutters ${row.purpose}`,
    "line_items[0][quantity]": "1",
    success_url: "https://www.805shutters.com/payment/return/?result=submitted",
    cancel_url: "https://www.805shutters.com/payment/return/?result=cancelled",
    client_reference_id: row.id,
    "metadata[crm_request_id]": row.id,
    "payment_intent_data[metadata][crm_request_id]": row.id,
  });
  // Stable body across retries: buyer email is intentionally not part of the hosted session.
  const session = await stripeRequest("/v1/checkout/sessions", {
    method: "POST",
    form,
    idempotencyKey: `805-checkout-${row.id}`,
  });
  if (
    typeof session.url !== "string" ||
    !session.url.startsWith("https://checkout.stripe.com/") ||
    session.livemode !== config.livemode
  )
    throw new Error("Unexpected Stripe checkout response.");
  await update(db, row.id, {
    session_id: session.id,
    url: session.url,
    status: "open",
    expires_at: new Date(Number(session.expires_at) * 1000).toISOString(),
  });
  return {
    id: session.id,
    url: session.url,
    orderId: session.id,
    provider: "stripe",
    requestId: row.id,
  };
}
export async function retireStripePaymentLink(db: SupabaseClient, id: string) {
  const config = await verifyStripeAccount();
  const { data, error } = await db
    .from("crm_stripe_requests")
    .select("*")
    .eq("account_id", config.account)
    .eq("livemode", config.livemode)
    .eq("session_id", id)
    .single();
  if (error || !data) throw new Error("Exact Stripe request was not found.");
  const row = await synchronizeStripeRequest(db, data);
  if (row.status === "expired") return;
  if (row.status !== "open")
    throw new Error(
      "A paid or processing checkout cannot be retired as unpaid.",
    );
  const session = await stripeRequest(
    `/v1/checkout/sessions/${encodeURIComponent(id)}/expire`,
    { method: "POST", idempotencyKey: `805-expire-${id}` },
  );
  if (session.status !== "expired")
    throw new Error("Stripe did not confirm checkout expiration.");
  await update(db, row.id, { status: "expired", url: null });
}
