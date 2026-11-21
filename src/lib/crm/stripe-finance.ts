import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  objectId,
  stripeRecord,
  stripeRequest,
  verifyStripeAccount,
  type StripeObject,
} from "@/lib/finance/stripe";
import { synchronizeStripeRequest } from "./stripe-collection";

export const stripeEventKinds = [
  "checkout.session.",
  "payment_intent.",
  "charge.refunded",
  "charge.dispute.",
  "refund.",
  "payout.",
];
export function supportedStripeEvent(type: string) {
  return stripeEventKinds.some((prefix) => type.startsWith(prefix));
}

/** Only authoritative API objects reach the evidence store; never webhook amounts. */
export async function storeStripeObject(
  db: SupabaseClient,
  config: { account: string; livemode: boolean },
  kind: string,
  o: StripeObject,
  payoutId?: string,
) {
  if (
    typeof o.id !== "string" ||
    ("livemode" in o && o.livemode !== config.livemode)
  )
    throw new Error("Provider identity or mode mismatch.");
  const charge = stripeRecord(o.latest_charge),
    balance = stripeRecord(charge.balance_transaction);
  const value = {
    account_id: config.account,
    livemode: config.livemode,
    kind,
    id: o.id,
    status: o.status || o.type || "recorded",
    currency: o.currency,
    amount_cents: kind === "payment" ? o.amount_received : o.amount,
    fee_cents: kind === "payment" ? (balance.fee ?? null) : (o.fee ?? null),
    payment_id: kind === "payment" ? o.id : objectId(o.payment_intent),
    ...(payoutId
      ? { payout_id: payoutId }
      : kind === "payout"
        ? { payout_id: o.id }
        : {}),
    occurred_at: new Date(Number(o.created) * 1000).toISOString(),
    imported_at: new Date().toISOString(),
    details:
      kind === "payment"
        ? {
            request_id: stripeRecord(o.metadata).crm_request_id ?? null,
            charge_id: objectId(o.latest_charge),
            refunded_cents: charge.amount_refunded ?? 0,
            disputed: charge.disputed === true,
            receipt_url: charge.receipt_url ?? null,
          }
        : {
            charge_id: objectId(o.charge),
            balance_transaction_id: objectId(o.balance_transaction),
            net_cents: o.net ?? null,
            arrival_date: o.arrival_date ?? null,
            destination_id: objectId(o.destination),
            source_id: objectId(o.source),
            reason: o.reason ?? null,
            type: o.type ?? null,
            automatic: o.automatic ?? null,
          },
  };
  // Keep payout membership and composition evidence when a global refresh revisits an object.
  const prior = await db
    .from("crm_stripe_objects")
    .select("payout_id,details")
    .eq("account_id", config.account)
    .eq("livemode", config.livemode)
    .eq("kind", kind)
    .eq("id", o.id)
    .maybeSingle();
  if (prior.error) throw new Error("Prior provider evidence unavailable.");
  const result = await db.from("crm_stripe_objects").upsert(
    {
      ...value,
      payout_id: payoutId || value.payout_id || prior.data?.payout_id || null,
      details: { ...stripeRecord(prior.data?.details), ...value.details },
    },
    { onConflict: "account_id,livemode,kind,id" },
  );
  if (result.error) throw new Error("Provider evidence could not be saved.");
}
const stages = [
  "requests",
  "payment",
  "refund",
  "dispute",
  "payout",
  "balance_transaction",
  "composition",
  "events",
] as const;
const endpoints: Record<string, string> = {
  payment: "payment_intents",
  refund: "refunds",
  dispute: "disputes",
  payout: "payouts",
  balance_transaction: "balance_transactions",
};

/** Each page checkpoints before the next phase. Short runs rotate fairly across every evidence source. */
export async function syncStripeFinance(db: SupabaseClient, budgetMs = 45000) {
  const config = await verifyStripeAccount(),
    lease = randomUUID(),
    start = Date.now();
  const claimed = await db.rpc("claim_stripe_sync", {
    p_account: config.account,
    p_live: config.livemode,
    p_lease: lease,
  });
  if (claimed.error) throw new Error("Stripe recovery lease unavailable.");
  if (!claimed.data) return { status: "busy" };
  let processed = 0,
    passComplete = false;
  const failures: string[] = [];
  try {
    const sync = await db
      .from("crm_stripe_sync")
      .select("state")
      .eq("account_id", config.account)
      .eq("livemode", config.livemode)
      .single();
    if (sync.error) throw new Error("Recovery cursor unavailable.");
    const state = stripeRecord(sync.data.state);
    const checkpoint = async () => {
      const saved = await db
        .from("crm_stripe_sync")
        .update({
          state,
          last_finished_at: new Date().toISOString(),
          error: failures.length ? "Some evidence requires review." : null,
        })
        .eq("account_id", config.account)
        .eq("livemode", config.livemode)
        .eq("lease_id", lease);
      if (saved.error) throw new Error("Recovery checkpoint failed.");
    };
    for (
      let count = 0;
      count < stages.length && Date.now() - start < budgetMs;
      count++
    ) {
      const stage = stages.includes(state.phase as (typeof stages)[number])
        ? (state.phase as (typeof stages)[number])
        : "requests";
      try {
        if (stage === "requests") {
          let q = db
            .from("crm_stripe_requests")
            .select("*")
            .eq("account_id", config.account)
            .eq("livemode", config.livemode)
            .not("session_id", "is", null)
            .order("id")
            .limit(10);
          if (typeof state.requestAfter === "string")
            q = q.gt("id", state.requestAfter);
          const rows = await q;
          if (rows.error) throw new Error("Stripe requests unavailable.");
          let visited = 0;
          for (const row of rows.data || []) {
            if (Date.now() - start >= budgetMs) break;
            try {
              await synchronizeStripeRequest(db, row);
            } catch {
              failures.push(row.id);
              const held = await db
                .from("crm_stripe_requests")
                .update({ error: "Reconciliation needs provider review." })
                .eq("id", row.id);
              if (held.error)
                throw new Error("Review status could not be saved.");
            }
            state.requestAfter = row.id;
            processed++;
            visited++;
          }
          if (visited === (rows.data || []).length && visited < 10)
            state.requestAfter = null;
        } else if (stage === "composition") {
          let q = db
            .from("crm_stripe_objects")
            .select("*")
            .eq("account_id", config.account)
            .eq("livemode", config.livemode)
            .eq("kind", "payout")
            .eq("status", "paid")
            .order("id")
            .limit(1);
          if (typeof state.payoutAfter === "string")
            q = q.gt("id", state.payoutAfter);
          const result = await q;
          if (result.error) throw new Error("Payout evidence unavailable.");
          const payout = result.data?.[0];
          if (!payout) {
            state.payoutAfter = null;
            state.compositionAfter = null;
            state.compositionNet = 0;
          } else if (payout.details?.automatic !== true) {
            // Stripe cannot enumerate the composition of manual payouts using this filter.
            state.payoutAfter = payout.id;
            state.compositionAfter = null;
            state.compositionNet = 0;
          } else {
            const cursor =
              typeof state.compositionAfter === "string"
                ? `&starting_after=${encodeURIComponent(state.compositionAfter)}`
                : "";
            const page = await stripeRequest<{
              data: StripeObject[];
              has_more: boolean;
            }>(
              `/v1/balance_transactions?payout=${encodeURIComponent(payout.id)}&limit=25${cursor}`,
            );
            for (const o of page.data) {
              await storeStripeObject(
                db,
                config,
                "balance_transaction",
                o,
                payout.id,
              );
              state.compositionNet =
                Number(state.compositionNet || 0) + Number(o.net);
            }
            if (page.has_more) state.compositionAfter = page.data.at(-1)?.id;
            else {
              const net = Number(state.compositionNet || 0),
                exact = net === Number(payout.amount_cents);
              const saved = await db
                .from("crm_stripe_objects")
                .update({
                  details: {
                    ...payout.details,
                    composition_complete: exact,
                    composition_net_cents: net,
                    composition_checked_at: new Date().toISOString(),
                  },
                })
                .eq("account_id", config.account)
                .eq("livemode", config.livemode)
                .eq("kind", "payout")
                .eq("id", payout.id);
              if (saved.error)
                throw new Error("Payout composition could not be saved.");
              if (!exact) failures.push(payout.id);
              state.payoutAfter = payout.id;
              state.compositionAfter = null;
              state.compositionNet = 0;
            }
          }
        } else if (stage === "events") {
          const events = await db
            .from("crm_stripe_events")
            .select("*")
            .eq("account_id", config.account)
            .eq("livemode", config.livemode)
            .is("processed_at", null)
            .order("received_at")
            .limit(10);
          if (events.error) throw new Error("Event queue unavailable.");
          state.eventsPending = (events.data || []).length === 10;
          for (const e of events.data || []) {
            if (Date.now() - start >= budgetMs) {
              state.eventsPending = true;
              break;
            }
            try {
              const event = await stripeRequest(
                `/v1/events/${encodeURIComponent(e.id)}`,
              );
              const obj = stripeRecord(stripeRecord(event.data).object),
                meta = stripeRecord(obj.metadata);
              if (
                event.id !== e.id ||
                event.livemode !== config.livemode ||
                event.type !== e.event_type ||
                obj.id !== e.object_id
              )
                throw new Error("Event identity mismatch.");
              const kind = e.event_type.startsWith("payout.")
                ? "payout"
                : e.event_type.startsWith("refund.")
                  ? "refund"
                  : e.event_type.startsWith("charge.dispute.")
                    ? "dispute"
                    : e.event_type.startsWith("payment_intent.")
                      ? "payment"
                      : null;
              if (kind) {
                const latest = await stripeRequest(
                  `/v1/${endpoints[kind]}/${encodeURIComponent(e.object_id)}${kind === "payment" ? "?expand[]=latest_charge.balance_transaction" : ""}`,
                );
                if (latest.id !== e.object_id)
                  throw new Error("Object identity mismatch.");
                await storeStripeObject(db, config, kind, latest);
              }
              let target = db
                .from("crm_stripe_requests")
                .select("*")
                .eq("account_id", config.account)
                .eq("livemode", config.livemode);
              const requestId = meta.crm_request_id,
                paymentId =
                  objectId(obj.payment_intent) ||
                  (kind === "payment" ? e.object_id : null);
              if (typeof requestId === "string")
                target = target.eq("id", requestId);
              else if (paymentId)
                target = target.eq("payment_intent_id", paymentId);
              else if (!kind)
                throw new Error(
                  "Payment notification needs an exact CRM match.",
                );
              if (typeof requestId === "string" || paymentId) {
                const r = await target.maybeSingle();
                if (r.error) throw new Error("Event target lookup failed.");
                if (r.data) await synchronizeStripeRequest(db, r.data);
                else if (!kind)
                  throw new Error(
                    "Unmatched payment notification requires review.",
                  );
              }
              const saved = await db
                .from("crm_stripe_events")
                .update({ processed_at: new Date().toISOString(), error: null })
                .eq("account_id", config.account)
                .eq("livemode", config.livemode)
                .eq("id", e.id);
              if (saved.error)
                throw new Error("Event completion could not be saved.");
            } catch {
              failures.push(e.id);
              state.eventsPending = true;
              // Move reviewed failures behind new notifications so one bad event cannot starve recovery.
              const saved = await db
                .from("crm_stripe_events")
                .update({
                  error: "Authoritative reconciliation requires review.",
                  received_at: new Date().toISOString(),
                })
                .eq("account_id", config.account)
                .eq("livemode", config.livemode)
                .eq("id", e.id);
              if (saved.error)
                throw new Error("Event review could not be saved.");
            }
          }
        } else {
          const cursor =
            typeof state[stage] === "string"
              ? `&starting_after=${encodeURIComponent(String(state[stage]))}`
              : "";
          const expand =
            stage === "payment"
              ? "&expand[]=data.latest_charge.balance_transaction"
              : "";
          const page = await stripeRequest<{
            data: StripeObject[];
            has_more: boolean;
          }>(`/v1/${endpoints[stage]}?limit=25${cursor}${expand}`);
          for (const o of page.data)
            await storeStripeObject(db, config, stage, o);
          state[stage] = page.has_more ? page.data.at(-1)?.id : null;
        }
      } catch {
        // Preserve this phase's cursor, but let independent evidence recover next.
        failures.push(stage);
      }
      state.phase = stages[(stages.indexOf(stage) + 1) % stages.length];
      passComplete = state.phase === "requests";
      await checkpoint();
    }
    const cursorPending = Object.entries(state).some(
      ([key, value]) => key !== "phase" && Boolean(value),
    );
    return {
      status: failures.length
        ? "needs_review"
        : passComplete && !cursorPending
          ? "pass_complete"
          : "partial",
      processed,
      account: config.account,
      livemode: config.livemode,
    };
  } catch (error) {
    await db
      .from("crm_stripe_sync")
      .update({ error: "Recovery incomplete; inspect provider and retry." })
      .eq("account_id", config.account)
      .eq("livemode", config.livemode)
      .eq("lease_id", lease);
    throw error;
  } finally {
    await db
      .from("crm_stripe_sync")
      .update({ lease_id: null, lease_until: null })
      .eq("account_id", config.account)
      .eq("livemode", config.livemode)
      .eq("lease_id", lease);
  }
}
