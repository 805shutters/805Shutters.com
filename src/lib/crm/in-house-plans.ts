import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { buildBookkeepingRows } from "./bookkeeping";
import { collectCrmPages } from "./pagination";
import type {
  CrmBookkeepingEntry,
  CrmBookkeepingPayment,
  CrmBookkeepingCredit,
  CrmQuote,
} from "./types";
import {
  dateOnly,
  monthlyDate,
  planManager,
  planTargetKey,
  reconcilePlan,
  splitThirds,
  targetForPlan,
  type PaymentPlan,
  type PlanSnapshot,
  type PlanTarget,
  type PlanView,
} from "./in-house-plan-model";

export const PLAN_TABLE = "crm_in_house_plans";
export const I_TABLE = "crm_in_house_plan_installments";
export const N_TABLE = "crm_in_house_plan_notifications";
export const L_TABLE = "crm_in_house_plan_links";
export function check(result: { error: { message: string } | null }) {
  if (result.error)
    throw new CrmAuthError(
      502,
      `Payment plan could not be verified: ${result.error.message}`,
    );
}
export function requirePlanManager(email: string) {
  if (!planManager(email))
    throw new CrmAuthError(
      403,
      "Only Michael or Jessica can manage payment plans.",
    );
}
export function validatePlanTarget(target: PlanTarget) {
  try {
    planTargetKey(target);
  } catch {
    throw new CrmAuthError(
      400,
      "Choose exactly one quote or bookkeeping record.",
    );
  }
  if (
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      target.quoteId || target.bookkeepingEntryId || "",
    )
  )
    throw new CrmAuthError(400, "A valid ledger record is required.");
}
export async function planRows<T>(
  db: SupabaseClient,
  table: string,
  key: string,
  id: string,
): Promise<T[]> {
  const result = await collectCrmPages<T>(async (from, to) => {
    let query = db
      .from(table)
      .select("*")
      .eq(key, id)
      .order(table === "crm_in_house_plan_allocations" ? "payment_id" : "id");
    if (table === "crm_in_house_plan_allocations")
      query = query.order("installment_id");
    const r = await query.range(from, to);
    return { data: r.data as T[] | null, error: r.error };
  });
  check(result);
  return result.data || [];
}
const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
const str = (x: unknown) =>
  typeof x === "string" && x.trim() ? x.trim() : null;
const cents = (x: number) => Math.round(x * 100);
export async function loadPlanSnapshot(
  db: SupabaseClient,
  target: PlanTarget,
): Promise<PlanSnapshot> {
  validatePlanTarget(target);
  const key = target.quoteId ? "quote_id" : "bookkeeping_entry_id";
  const id = target.quoteId || target.bookkeepingEntryId!;
  const [entryResult, payments, creditsIn, creditsOut] = await Promise.all([
    db
      .from("crm_quote_bookkeeping_entries")
      .select("*")
      .eq(target.quoteId ? "quote_id" : "id", id),
    planRows<CrmBookkeepingPayment & { meta?: Record<string, unknown> }>(
      db,
      "crm_quote_bookkeeping_payments",
      key,
      id,
    ),
    planRows<CrmBookkeepingCredit>(
      db,
      "crm_quote_bookkeeping_credits",
      `to_${key}`,
      id,
    ),
    planRows<CrmBookkeepingCredit>(
      db,
      "crm_quote_bookkeeping_credits",
      `from_${key}`,
      id,
    ),
  ]);
  check(entryResult);
  const entries = (entryResult.data as CrmBookkeepingEntry[]) || [];
  const entry = entries[0];
  if (entries.length > 1)
    throw new CrmAuthError(
      409,
      "Multiple ledger entries reference this quote. Review the ledger first.",
    );
  if (
    !target.quoteId &&
    (!entry || !["manual", "legacy_sheet"].includes(entry.source))
  )
    throw new CrmAuthError(
      409,
      "Use the exact quote-owned ledger for this plan.",
    );
  if (target.quoteId && entry && entry.source !== "crm_quote")
    throw new CrmAuthError(
      409,
      "Use the standalone bookkeeping record for this plan.",
    );
  const quoteId = target.quoteId || entry?.quote_id;
  let quote: CrmQuote | null = null;
  if (quoteId) {
    const r = await db
      .from("crm_quotes")
      .select("*")
      .eq("id", quoteId)
      .maybeSingle();
    check(r);
    quote = r.data;
    if (!quote) throw new CrmAuthError(404, "Linked quote was not found.");
  }
  if (entry?.job_id && quote?.job_id && entry.job_id !== quote.job_id)
    throw new CrmAuthError(
      409,
      "Job and quote links disagree. Review the ledger first.",
    );
  const jobId = entry?.job_id || quote?.job_id || null;
  let job: Record<string, unknown> = {};
  if (jobId) {
    const r = await db
      .from("crm_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    check(r);
    if (!r.data) throw new CrmAuthError(404, "Linked job was not found.");
    job = r.data;
  }
  if (
    [entry?.meta, quote?.meta, job.meta].some(
      (meta) => obj(meta).deleted_at || obj(meta).bookkeeping_deleted_at,
    )
  )
    throw new CrmAuthError(
      409,
      "The linked ledger or job was deleted. Review this plan.",
    );
  if (
    [quote?.status, job.status, obj(entry?.meta).status].some((s) =>
      ["lost", "archived"].includes(String(s)),
    )
  )
    throw new CrmAuthError(
      409,
      "This job is no longer active. Review this plan.",
    );
  if (
    quote &&
    target.quoteId &&
    ["draft", "sent"].includes(quote.status) &&
    !quote.signed_at &&
    !quote.customer_signature
  )
    throw new CrmAuthError(
      409,
      "Approve a payment plan only on a sold contract.",
    );
  const rows = buildBookkeepingRows({
    quotes: quote ? [quote] : [],
    entries,
    payments,
    credits: [
      ...new Map([...creditsIn, ...creditsOut].map((c) => [c.id, c])).values(),
    ],
  });
  const row = rows.find((r) =>
    target.quoteId
      ? r.source === "crm_quote" && r.quoteId === target.quoteId
      : r.id === target.bookkeepingEntryId,
  );
  if (!row)
    throw new CrmAuthError(404, "The exact ledger could not be projected.");
  const totalCents = cents(row.total),
    depositCents = splitThirds(totalCents)[0],
    outstandingCents = cents(row.balance);
  if (![totalCents, depositCents, outstandingCents].every(Number.isSafeInteger))
    throw new CrmAuthError(409, "The ledger contains an invalid amount.");
  if (
    !quote?.signed_at ||
    obj(obj(quote.meta).adjustments).paymentSchedule !==
      "in_house_three_month_v1"
  )
    throw new CrmAuthError(
      409,
      "This accepted contract has no in-house three-month terms.",
    );
  const identity = await db
    .from(PLAN_TABLE)
    .select("id")
    .eq("quote_id", quote.id)
    .maybeSingle();
  check(identity);
  const links = identity.data
    ? await planRows<{ installment_id: string; square_order_id: string }>(
        db,
        L_TABLE,
        "plan_id",
        identity.data.id,
      )
    : [];
  const squareIds = payments
    .map(
      (p) =>
        str(p.meta?.square_payment_id) ||
        (p.external_source === "square" ? p.external_id : null),
    )
    .filter((v): v is string => Boolean(v));
  const objects = squareIds.length
    ? await db
        .from("crm_square_objects")
        .select("id,details")
        .eq("kind", "payment")
        .eq("environment", "production")
        .in("id", squareIds)
    : { data: [], error: null };
  check(objects);
  const refunds = squareIds.length
    ? await db
        .from("crm_square_objects")
        .select("id")
        .eq("kind", "refund")
        .eq("environment", "production")
        .in("payment_id", squareIds)
        .in("status", ["PENDING", "COMPLETED"])
    : { data: [], error: null };
  check(refunds);
  if (
    refunds.data?.length ||
    objects.data?.some((o) => Number(o.details?.refunded_cents) > 0)
  )
    throw new CrmAuthError(
      409,
      "Square refund evidence requires a reconciled ledger and a reviewed agreement before collection can resume.",
    );
  for (const p of payments) {
    const paymentId =
      str(p.meta?.square_payment_id) ||
      (p.external_source === "square" ? p.external_id : null);
    const order =
      str(p.meta?.square_order_id) ||
      str(objects.data?.find((o) => o.id === paymentId)?.details?.order_id);
    const link = links.find((l) => l.square_order_id === order);
    if (link)
      p.meta = { ...p.meta, in_house_installment_id: link.installment_id };
  }
  const savedInstallments = identity.data
    ? await planRows<{ id: string; number: number }>(
        db,
        I_TABLE,
        "plan_id",
        identity.data.id,
      )
    : [];
  const remaining = splitThirds(totalCents);
  for (const payment of [...payments].sort(
    (a, b) =>
      (dateOnly(a.paid_at) || "").localeCompare(dateOnly(b.paid_at) || "") ||
      a.id.localeCompare(b.id),
  )) {
    let available = Math.max(0, cents(Number(payment.amount)));
    const first = savedInstallments.find(
      (i) => i.id === payment.meta?.in_house_installment_id,
    )?.number;
    for (const n of [1, 2, 3].sort(
      (a, b) => Number(b === first) - Number(a === first) || a - b,
    )) {
      const allocated = Math.min(available, remaining[n - 1]);
      remaining[n - 1] -= allocated;
      available -= allocated;
    }
  }
  const meta = obj(entry?.meta);
  const acceptedDate = dateOnly(quote?.signed_at || quote?.sold_at);
  return {
    target,
    jobId,
    customerName: row.customerName,
    quoteNumber: row.quoteNumber,
    email: str(meta.customer_email) || quote?.customer_email || str(job.email),
    phone: str(meta.customer_phone) || quote?.customer_phone || str(job.phone),
    acceptedDate,
    totalCents,
    depositCents,
    outstandingCents,
    paidCents: cents(row.paidTotal),
    depositOutstandingCents: remaining[0],
    creditFingerprint: JSON.stringify(
      [
        ...creditsIn.map((c) => `in:${c.id}:${c.amount}`),
        ...creditsOut.map((c) => `out:${c.id}:${c.amount}`),
      ].sort(),
    ),
    payments: payments
      .sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      )
      .map((p) => ({
        id: p.id,
        cents: cents(Number(p.amount)),
        label: p.payment_label,
        installmentId: str(p.meta?.in_house_installment_id),
        paidAt: dateOnly(p.paid_at) || "",
        method: p.payment_type,
      })),
  };
}
export function snapshotFingerprint(snapshot: PlanSnapshot) {
  // jsonb reorders object keys. Hash canonical content, not insertion order.
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, stable(v)]),
          )
        : value;
  return createHash("sha256")
    .update(JSON.stringify(stable(snapshot)))
    .digest("hex");
}
export async function loadPaymentPlan(
  db: SupabaseClient,
  id: string,
): Promise<PaymentPlan> {
  const r = await db
    .from(PLAN_TABLE)
    .select(
      "*,installments:crm_in_house_plan_installments!crm_in_house_plan_installments_plan_id_fkey(*)",
    )
    .eq("id", id)
    .maybeSingle();
  check(r);
  if (!r.data) throw new CrmAuthError(404, "Payment plan was not found.");
  const plan = r.data as PaymentPlan;
  plan.installments.sort((a, b) => a.number - b.number);
  return plan;
}
export async function withPlanLease<T>(
  db: SupabaseClient,
  id: string,
  fn: (plan: PaymentPlan, token: string) => Promise<T>,
): Promise<T> {
  const token = randomUUID();
  const claim = await db.rpc("crm_claim_in_house_plan", {
    p_id: id,
    p_token: token,
  });
  check(claim);
  if (!claim.data)
    throw new CrmAuthError(
      409,
      "This plan is being updated. Refresh in a moment.",
    );
  try {
    return await fn(await loadPaymentPlan(db, id), token);
  } finally {
    check(
      await db
        .from(PLAN_TABLE)
        .update({ lease_token: null, lease_until: null })
        .eq("id", id)
        .eq("lease_token", token),
    );
  }
}
export async function synchronizePlan(
  db: SupabaseClient,
  plan: PaymentPlan,
  token: string,
  action?: string,
  actor?: string,
) {
  let state;
  try {
    state = reconcilePlan(
      plan,
      await loadPlanSnapshot(db, targetForPlan(plan)),
    );
  } catch (error) {
    // Never collect against unreadable or deleted ledger evidence.
    const allocations = await planRows(
      db,
      "crm_in_house_plan_allocations",
      "plan_id",
      plan.id,
    );
    state = {
      status: plan.status === "cancelled" ? "cancelled" : "review",
      review_reason:
        error instanceof Error ? error.message : "Ledger unavailable",
      anchor_date: plan.anchor_date,
      current: plan.current,
      installments: plan.installments,
      allocations,
    };
  }
  check(
    await db.rpc("crm_save_in_house_plan", {
      p_id: plan.id,
      p_token: token,
      p_state: state,
      p_action: action || (state.status !== plan.status ? state.status : null),
      p_actor: actor || "in-house-plan-processor",
    }),
  );
  return loadPaymentPlan(db, plan.id);
}
export async function listPaymentPlans(
  db: SupabaseClient,
): Promise<PlanView[]> {
  const r = await collectCrmPages<PaymentPlan>(async (from, to) => {
    const q = await db
      .from(PLAN_TABLE)
      .select(
        "*,installments:crm_in_house_plan_installments!crm_in_house_plan_installments_plan_id_fkey(*)",
      )
      .order("id")
      .range(from, to);
    return { data: q.data as PaymentPlan[] | null, error: q.error };
  });
  check(r);
  return Promise.all(
    (r.data || []).map(async (p) => {
      // Read-only projection keeps manual receipts visible immediately without a GET sending messages.
      let projected = p;
      if (p.status !== "cancelled") {
        try {
          projected = {
            ...p,
            ...reconcilePlan(p, await loadPlanSnapshot(db, targetForPlan(p))),
          };
        } catch {
          projected = {
            ...p,
            status: "review",
            review_reason: "The current ledger could not be verified.",
          };
        }
      }
      const [notifications, history] = await Promise.all([
        planRows<PlanView["notifications"][number]>(
          db,
          N_TABLE,
          "plan_id",
          p.id,
        ),
        planRows<PlanView["history"][number]>(
          db,
          "crm_in_house_plan_events",
          "plan_id",
          p.id,
        ),
      ]);
      // Explicitly strip leases and internal baseline snapshots from public-token responses elsewhere.
      return {
        ...projected,
        installments: projected.installments.sort(
          (a, b) => a.number - b.number,
        ),
        notifications,
        history: history.sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        ),
      };
    }),
  );
}
export async function findOpenPlan(
  db: SupabaseClient,
  target: PlanTarget,
): Promise<PaymentPlan | null> {
  const r = await db
    .from(PLAN_TABLE)
    .select(
      "*,installments:crm_in_house_plan_installments!crm_in_house_plan_installments_plan_id_fkey(*)",
    )
    .eq(
      target.quoteId ? "quote_id" : "bookkeeping_entry_id",
      target.quoteId || target.bookkeepingEntryId,
    )
    .neq("status", "cancelled")
    .maybeSingle();
  // Additive rollout: old flows may load before the new schema is applied.
  if (r.error && ["42P01", "PGRST205"].includes(r.error.code)) return null;
  check(r);
  return r.data;
}
export async function guardPlanBalanceRequest(
  db: SupabaseClient,
  target: PlanTarget,
) {
  const plan = await findOpenPlan(db, target);
  if (plan)
    throw new CrmAuthError(
      409,
      "This job has a 3-payment plan. Use its installment links in Bookkeeping.",
    );
}
