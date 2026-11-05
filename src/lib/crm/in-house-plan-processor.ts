import { trackSquarePaymentRequest } from "./square-payment-requests";
import { toE164 } from "@/lib/notify/twilio";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSquarePaymentLink,
  retireSquarePaymentLink,
} from "@/lib/finance/square";
import { CrmAuthError } from "./auth";
import { brandIdentity } from "@/lib/brand-identity";
import {
  deliverPlanMessage,
  emailDeliveryStatus,
  type DeliveryMessage,
  type DeliveryResult,
} from "./in-house-plan-delivery";
import {
  check,
  I_TABLE,
  L_TABLE,
  N_TABLE,
  PLAN_TABLE,
  findOpenPlan,
  loadPaymentPlan,
  loadPlanSnapshot,
  planRows,
  requirePlanManager,
  snapshotFingerprint,
  synchronizePlan,
  withPlanLease,
} from "./in-house-plans";
import {
  overdueWeek,
  planDate,
  planHour,
  targetForPlan,
  unpaidCents,
  type PaymentPlan,
  type PlanInstallment,
  type PlanNotification,
} from "./in-house-plan-model";

type Link = {
  id: string;
  plan_id: string;
  installment_id: string;
  amount_cents: number;
  square_link_id: string | null;
  square_order_id: string | null;
  url: string | null;
  status: string;
};
export type PlanProviders = {
  createLink: typeof createSquarePaymentLink;
  retireLink: typeof retireSquarePaymentLink;
  deliver: (m: DeliveryMessage) => Promise<DeliveryResult>;
};
export const providers: PlanProviders = {
  createLink: createSquarePaymentLink,
  retireLink: retireSquarePaymentLink,
  deliver: deliverPlanMessage,
};
const money = (c: number) =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
async function retirePriorBalanceLinks(
  db: SupabaseClient,
  plan: PaymentPlan,
  io: PlanProviders,
) {
  const events = await planRows<{
    id: string;
    action: string;
    metadata: Record<string, unknown>;
  }>(
    db,
    "crm_activity_events",
    "entity_id",
    plan.quote_id || plan.bookkeeping_entry_id!,
  );
  for (const event of events) {
    const linkId = event.metadata?.squarePaymentLinkId;
    if (
      event.action !== "square_balance_link.send" ||
      typeof linkId !== "string" ||
      event.metadata.paymentPlanRetiredAt
    )
      continue;
    await io.retireLink(linkId);
    check(
      await db
        .from("crm_activity_events")
        .update({
          metadata: {
            ...event.metadata,
            paymentPlanRetiredAt: new Date().toISOString(),
            paymentPlanId: plan.id,
          },
        })
        .eq("id", event.id),
    );
    check(
      await db.from("crm_in_house_plan_events").insert({
        plan_id: plan.id,
        action: "prior_balance_link_retired",
        actor: "in-house-plan-processor",
        detail: linkId,
      }),
    );
  }
}
export async function retireObsoletePlanLinks(
  db: SupabaseClient,
  plan: PaymentPlan,
  io = providers,
) {
  const links = await planRows<Link>(db, L_TABLE, "plan_id", plan.id);
  for (const link of links.filter((l) =>
    ["creating", "active", "retiring"].includes(l.status),
  )) {
    const installment = plan.installments.find(
      (i) => i.id === link.installment_id,
    );
    if (
      ["active", "waiting_deposit"].includes(plan.status) &&
      installment &&
      unpaidCents(installment) === link.amount_cents &&
      link.status !== "retiring"
    )
      continue;
    // Recover a link whose provider response was lost using the original immutable idempotency key.
    if (!link.square_link_id) {
      const made = await io.createLink({
        quoteId: plan.quote_id!,
        jobId: plan.current.jobId!,
        amountCents: link.amount_cents,
        paymentType: installment?.number === 1 ? "deposit" : "balance",
        inHousePlanId: plan.id,
        inHouseInstallmentId: link.installment_id,
        idempotencyKey: link.id,
        title: `805 Shutters installment ${installment?.number || ""}`,
        buyerEmail: plan.baseline.email,
      });
      if (!made.orderId)
        throw new Error(
          "Square did not return an order ID; link recovery is required.",
        );
      link.square_link_id = made.id;
      check(
        await db
          .from(L_TABLE)
          .update({
            square_link_id: made.id,
            square_order_id: made.orderId || null,
            url: made.url,
          })
          .eq("id", link.id),
      );
    }
    check(
      await db.from(L_TABLE).update({ status: "retiring" }).eq("id", link.id),
    );
    await io.retireLink(link.square_link_id);
    check(
      await db.from(L_TABLE).update({ status: "retired" }).eq("id", link.id),
    );
  }
}
export async function installmentLink(
  db: SupabaseClient,
  plan: PaymentPlan,
  i: PlanInstallment,
  io: PlanProviders,
): Promise<string> {
  const result = await db
    .from(L_TABLE)
    .select("*")
    .eq("installment_id", i.id)
    .in("status", ["creating", "active", "retiring"])
    .maybeSingle();
  check(result);
  let link = result.data as Link | null;
  if (
    link?.status === "retiring" ||
    (link && link.amount_cents !== unpaidCents(i))
  )
    throw new Error(
      "Previous payment link must be retired before replacing it.",
    );
  if (!link) {
    const r = await db
      .from(L_TABLE)
      .insert({
        id: randomUUID(),
        plan_id: plan.id,
        installment_id: i.id,
        amount_cents: unpaidCents(i),
        status: "creating",
      })
      .select("*")
      .single();
    check(r);
    link = r.data as Link;
  }
  if (!link.square_link_id) {
    const made = await io.createLink({
      quoteId: plan.quote_id!,
      jobId: plan.current.jobId!,
      amountCents: link.amount_cents,
      paymentType: i.number === 1 ? "deposit" : "balance",
      inHousePlanId: plan.id,
      inHouseInstallmentId: i.id,
      idempotencyKey: link.id,
      title: `805 Shutters installment ${i.number}`,
      buyerEmail: plan.baseline.email,
    });
    if (!made.orderId)
      throw new Error(
        "Square did not return an order ID; link recovery is required.",
      );
    await trackSquarePaymentRequest(db, made, {
      quoteId: plan.quote_id!,
      jobId: plan.current.jobId!,
      amountCents: link.amount_cents,
      paymentType: i.number === 1 ? "deposit" : "balance",
      title: `805 Shutters payment ${i.number} of 3`,
    });
    check(
      await db
        .from(L_TABLE)
        .update({
          square_link_id: made.id,
          square_order_id: made.orderId || null,
          url: made.url,
          status: "active",
        })
        .eq("id", link.id),
    );
    return made.url;
  }
  if (!link.url) throw new Error("Square payment link is incomplete.");
  return link.url;
}
async function notify(
  db: SupabaseClient,
  plan: PaymentPlan,
  eventKey: string,
  channel: PlanNotification["channel"],
  to: string | null,
  subject: string,
  text: string,
  now: Date,
  io: PlanProviders,
) {
  const newId = randomUUID();
  const r = await db.from(N_TABLE).upsert(
    {
      id: newId,
      plan_id: plan.id,
      event_key: eventKey,
      channel,
      recipient: to,
    },
    { onConflict: "plan_id,event_key,channel", ignoreDuplicates: true },
  );
  check(r);
  const result = await db
    .from(N_TABLE)
    .select("*")
    .eq("plan_id", plan.id)
    .eq("event_key", eventKey)
    .eq("channel", channel)
    .single();
  check(result);
  const n = result.data as PlanNotification & { retry_at: string | null };
  if (n.status === "sending") {
    // The previous worker lost its acknowledgement. Preserve this as uncertain rather than sending twice.
    check(
      await db
        .from(N_TABLE)
        .update({
          status: "unknown",
          error:
            "Previous delivery did not finish recording. Check provider history.",
        })
        .eq("id", n.id),
    );
    return;
  }
  if (
    n.status !== "pending" &&
    !(
      n.status === "failed" &&
      n.retry_at &&
      n.retry_at <= now.toISOString() &&
      n.attempts < 3
    )
  )
    return;
  {
    const live = await loadPlanSnapshot(db, targetForPlan(plan));
    if (snapshotFingerprint(live) !== snapshotFingerprint(plan.current))
      throw new Error(
        "Ledger or recipient changed before delivery; retry after reconciliation.",
      );
  }
  if (channel !== "owner" && to) {
    const phone = toE164(to);
    const preferences = await db
      .from(
        channel === "sms"
          ? "crm_customer_sms_preferences"
          : "crm_customer_email_preferences",
      )
      .select("do_not_contact,opted_out_at")
      .eq(
        channel === "sms" ? "phone_e164" : "email_normalized",
        channel === "sms" ? phone || to : to.trim().toLowerCase(),
      )
      .maybeSingle();
    check(preferences);
    const job = await db
      .from("crm_jobs")
      .select("meta")
      .eq("id", plan.current.jobId)
      .maybeSingle();
    check(job);
    const m = job.data?.meta || {};
    const blocked =
      preferences.data?.do_not_contact ||
      preferences.data?.opted_out_at ||
      m.do_not_contact ||
      (channel === "sms"
        ? m.do_not_sms || m.sms_opt_out || m.sms_opted_out
        : m.do_not_email || m.email_opt_out || m.email_opted_out);
    if (blocked) {
      check(
        await db
          .from(N_TABLE)
          .update({
            status: "skipped",
            error: `Recipient opted out of ${channel} messages`,
          })
          .eq("id", n.id),
      );
      return;
    }
  }
  check(
    await db
      .from(N_TABLE)
      .update({
        status: "sending",
        recipient: to,
        attempts: n.attempts + 1,
        updated_at: now.toISOString(),
      })
      .eq("id", n.id),
  );
  const outcome = await io.deliver({ id: n.id, channel, to, subject, text });
  check(
    await db
      .from(N_TABLE)
      .update({
        status: outcome.status,
        provider_id: outcome.providerId || null,
        error: outcome.error || null,
        retry_at: outcome.retry
          ? new Date(now.getTime() + 3600000).toISOString()
          : null,
        updated_at: now.toISOString(),
      })
      .eq("id", n.id)
      .eq("status", "sending"),
  );
}
export function installmentMessage(
  plan: PaymentPlan,
  i: PlanInstallment,
  url: string,
  today: string,
) {
  const when =
    i.due_date === today
      ? "due today"
      : i.due_date! < today
        ? `overdue since ${i.due_date}`
        : `due on ${i.due_date}`;
  return `Hi ${plan.current.customerName}, your 805 Shutters payment ${i.number} of 3 for ${plan.current.quoteNumber || "your project"} is ${when}. Amount remaining: ${money(unpaidCents(i))}. Pay securely: ${url}. Questions? Call or text 805-806-9344.`;
}
async function sendDue(
  db: SupabaseClient,
  plan: PaymentPlan,
  now: Date,
  io: PlanProviders,
  resendId?: string,
) {
  if (plan.status !== "active") return;
  const today = planDate(now);
  const notifications = await planRows<PlanNotification>(
    db,
    N_TABLE,
    "plan_id",
    plan.id,
  );
  for (const i of plan.installments.filter(
    (i) => i.number > 1 && i.due_date && unpaidCents(i),
  )) {
    const until = Math.round(
      (Date.parse(i.due_date!) - Date.parse(today)) / 86400000,
    );
    const stage = resendId
      ? `manual:${resendId}`
      : until === 3
        ? "before"
        : until === 0
          ? "due"
          : null;
    if (stage) {
      // Lease + fresh ledger before each recipient, independent stage/channel IDs.
      for (const channel of ["email", "sms"] as const) {
        const latest = {
          ...plan,
          ...(await import("./in-house-plan-model")).reconcilePlan(
            plan,
            await loadPlanSnapshot(db, targetForPlan(plan)),
          ),
        };
        const fresh = latest.installments.find((x) => x.id === i.id)!;
        if (latest.status !== "active" || !unpaidCents(fresh)) continue;
        const key = `${stage}:${i.id}`;
        if (
          notifications.some(
            (n) =>
              n.event_key === key &&
              n.channel === channel &&
              [
                "accepted",
                "delivered",
                "unknown",
                "sending",
                "skipped",
              ].includes(n.status),
          )
        )
          continue;
        const url = await installmentLink(db, latest, fresh, io);
        const text = installmentMessage(latest, fresh, url, today);
        const optedOut = notifications.some(
          (n) => n.channel === "sms" && n.error?.includes("opted out"),
        );
        await notify(
          db,
          latest,
          key,
          channel,
          channel === "email"
            ? latest.current.email
            : optedOut
              ? null
              : latest.current.phone,
          "Your 805 Shutters installment payment",
          text +
            (channel === "sms" ? " Reply STOP to stop text messages." : ""),
          now,
          io,
        );
      }
    }
    const week = overdueWeek(i.due_date!, today);
    if (week !== null)
      await notify(
        db,
        plan,
        `overdue:${i.id}:${week}`,
        "owner",
        process.env.MIKE_805_SALES_SMS_NUMBER || null,
        "",
        `805 Shutters: ${plan.current.customerName} (${plan.current.quoteNumber || "project"}), payment ${i.number}/3: ${money(unpaidCents(i))} overdue since ${i.due_date}. ${brandIdentity.website}/crm`,
        now,
        io,
      );
  }
}
export async function processPaymentPlan(
  db: SupabaseClient,
  id: string,
  now = new Date(),
  io = providers,
  options: { send?: boolean; resendId?: string } = {},
) {
  return withPlanLease(db, id, async (plan, token) => {
    try {
      plan = await synchronizePlan(db, plan, token);
      const notices = await planRows<PlanNotification>(
        db,
        N_TABLE,
        "plan_id",
        plan.id,
      );
      for (const n of notices) {
        if (
          n.status === "sending" &&
          Date.parse(n.created_at) < now.getTime() - 300000
        )
          check(
            await db
              .from(N_TABLE)
              .update({
                status: "unknown",
                error:
                  "Provider response was not recorded. Review before resending.",
              })
              .eq("id", n.id)
              .eq("status", "sending"),
          );
        if (n.channel === "email" && n.status === "accepted" && n.provider_id) {
          const outcome = await emailDeliveryStatus(n.provider_id);
          check(
            await db
              .from(N_TABLE)
              .update({
                status: outcome.status,
                error: outcome.error || null,
                updated_at: now.toISOString(),
              })
              .eq("id", n.id)
              .eq("status", "accepted"),
          );
        }
      }
      await retireObsoletePlanLinks(db, plan, io);
      await retirePriorBalanceLinks(db, plan, io);
      if (options.send && planHour(now) >= 9 && planHour(now) < 18)
        await sendDue(db, plan, now, io, options.resendId);
      check(
        await db
          .from(PLAN_TABLE)
          .update({ processing_error: null })
          .eq("id", id)
          .eq("lease_token", token),
      );
      return plan;
    } catch (error) {
      await db
        .from(PLAN_TABLE)
        .update({
          processing_error:
            error instanceof Error
              ? error.message
              : "Payment processing failed",
        })
        .eq("id", id)
        .eq("lease_token", token);
      throw error;
    }
  });
}
export async function runPaymentPlans(
  db: SupabaseClient,
  now = new Date(),
  io = providers,
) {
  // Rotate unfinished work first, but drain multiple batches so all normal monthly
  // requests are handled in the 9 a.m. run instead of limiting collection to 25 jobs.
  const started = Date.now();
  const errors: { id: string; message: string }[] = [];
  let processed = 0;
  const seen = new Set<string>();
  while (Date.now() - started < 210000) {
    const batch = await db
      .from(PLAN_TABLE)
      .select("id")
      .order("updated_at", { ascending: true })
      .order("id")
      .limit(100);
    check(batch);
    const pending = (batch.data || []).filter((p) => !seen.has(p.id));
    if (!pending.length) break;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, async () => {
        while (cursor < pending.length && Date.now() - started < 210000) {
          const p = pending[cursor++];
          seen.add(p.id);
          try {
            await processPaymentPlan(db, p.id, now, io, { send: true });
            processed++;
          } catch (e) {
            errors.push({
              id: p.id,
              message: e instanceof Error ? e.message : "Payment plan failed",
            });
          }
        }
      }),
    );
  }
  return { processed, errors };
}
export async function managePaymentPlan(
  db: SupabaseClient,
  id: string,
  action: string,
  actor: string,
  requestId?: string,
  io = providers,
  now = new Date(),
) {
  requirePlanManager(actor);
  if (!["pause", "resume", "cancel", "resend"].includes(action))
    throw new CrmAuthError(400, "Choose pause, resume, cancel or resend.");
  if (action === "resend") {
    if (planHour(now) < 9 || planHour(now) >= 18)
      throw new CrmAuthError(
        409,
        "Manual resends are available from 9 a.m. to 6 p.m. Los Angeles time.",
      );
    if (!/^[\da-f-]{36}$/i.test(requestId || ""))
      throw new CrmAuthError(400, "A unique resend request is required.");
    const p = await processPaymentPlan(db, id, now, io, {
      send: true,
      resendId: requestId,
    });
    check(
      await db
        .from("crm_in_house_plan_events")
        .insert({ plan_id: id, action: "resend", actor }),
    );
    return p;
  }
  return withPlanLease(db, id, async (plan, token) => {
    if (action === "resume" && plan.status === "review")
      plan = { ...plan, status: "paused", review_reason: null };
    plan = await synchronizePlan(db, plan, token);
    if (["cancelled", "completed"].includes(plan.status))
      throw new CrmAuthError(409, "This plan has ended.");
    if (action !== "cancel" && plan.status === "review")
      throw new CrmAuthError(
        409,
        "Restore the original agreed ledger evidence before resuming this schedule. Changed terms require a new customer-reviewed agreement.",
      );
    const allocations = await planRows(
      db,
      "crm_in_house_plan_allocations",
      "plan_id",
      id,
    );
    const next = {
      ...plan,
      status:
        action === "cancel"
          ? "cancelled"
          : action === "pause"
            ? "paused"
            : plan.anchor_date && !plan.current.depositOutstandingCents
              ? "active"
              : "waiting_deposit",
      allocations,
    };
    check(
      await db.rpc("crm_save_in_house_plan", {
        p_id: id,
        p_token: token,
        p_state: next,
        p_action: action,
        p_actor: actor,
      }),
    );
    const updated = await loadPaymentPlan(db, id);
    try {
      await retireObsoletePlanLinks(db, updated, io);
      check(
        await db
          .from(PLAN_TABLE)
          .update({ processing_error: null })
          .eq("id", id)
          .eq("lease_token", token),
      );
    } catch (error) {
      await db
        .from(PLAN_TABLE)
        .update({
          processing_error:
            error instanceof Error ? error.message : "Link retirement failed",
        })
        .eq("id", id)
        .eq("lease_token", token);
      throw error;
    }
    return updated;
  });
}
export async function flagPlanRefund(
  db: SupabaseClient,
  paymentId: string,
  io = providers,
) {
  const r = await db
    .from("crm_quote_bookkeeping_payments")
    .select("meta,quote_id,bookkeeping_entry_id")
    .eq("external_source", "square")
    .eq("external_id", paymentId)
    .maybeSingle();
  check(r);
  if (!r.data) return;
  const target = r.data.bookkeeping_entry_id
    ? { bookkeepingEntryId: r.data.bookkeeping_entry_id }
    : r.data.quote_id
      ? { quoteId: r.data.quote_id }
      : null;
  const active = target ? await findOpenPlan(db, target) : null;
  const ids = new Set<string>(
    [r.data.meta?.in_house_plan_id, active?.id].filter(Boolean),
  );
  for (const id of ids)
    await withPlanLease(db, id, async (plan, token) => {
      const allocations = await planRows(
        db,
        "crm_in_house_plan_allocations",
        "plan_id",
        id,
      );
      check(
        await db.rpc("crm_save_in_house_plan", {
          p_id: id,
          p_token: token,
          p_state: {
            ...plan,
            status: plan.status === "cancelled" ? "cancelled" : "review",
            review_reason:
              "Square reported a refund. Reconcile the refund in the ledger before approving a new schedule.",
            allocations,
          },
          p_action: "refund_review",
        }),
      );
      await retireObsoletePlanLinks(db, await loadPaymentPlan(db, id), io);
    });
}

/** Follow ledger writes without making a successfully recorded receipt look like a failed save. */
export async function refreshPlansAfterLedgerWrite(
  db: SupabaseClient,
  target: { quoteId?: string; bookkeepingEntryId?: string; jobId?: string },
) {
  try {
    const result = await db
      .from(PLAN_TABLE)
      .select("id,current")
      .neq("status", "cancelled");
    if (result.error && ["42P01", "PGRST205"].includes(result.error.code))
      return null;
    check(result);
    for (const p of result.data || []) {
      if (
        (target.jobId && p.current.jobId === target.jobId) ||
        (target.quoteId && p.current.target.quoteId === target.quoteId) ||
        (target.bookkeepingEntryId &&
          p.current.target.bookkeepingEntryId === target.bookkeepingEntryId)
      ) {
        await processPaymentPlan(db, p.id, new Date(), providers, {
          send: false,
        });
      }
    }
    return null;
  } catch (error) {
    return `Ledger saved. Payment-plan processing needs attention: ${error instanceof Error ? error.message : "unavailable"}`;
  }
}
