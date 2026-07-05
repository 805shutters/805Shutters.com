// In-house payment plan ("805 House Plan"): 0% interest, 50% deposit up front,
// balance split into equal monthly installments. The first installment is due
// the DAY OF INSTALLATION, then monthly. The plan lives on
// crm_jobs.meta.payment_plan; a plan created before install sits in
// "pending_install" with no due dates and is activated (schedule anchored to
// the install date) by the same job-status transition that fires the
// review-request automation. Recorded installment payments also insert a row
// into the bookkeeping payments ledger when the job has a ledger entry, so
// Customer Files balances stay true.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/notify/twilio";
import { objectMeta } from "@/lib/crm/measure-needed-state";
import type { CrmJob } from "@/lib/crm/types";
import {
  PAYMENT_PLAN_META_KEY,
  getPaymentPlanMeta,
  hasOpenPaymentPlan,
  formatMoney,
  installmentChargeAmount,
  type CrmPaymentPlanMeta,
  type CrmPaymentPlanMethod
} from "@/lib/crm/payment-plan-shared";

export {
  PAYMENT_PLAN_META_KEY,
  getPaymentPlanMeta,
  hasOpenPaymentPlan,
  formatMoney
} from "@/lib/crm/payment-plan-shared";
export type {
  CrmPaymentPlanMeta,
  CrmPaymentPlanMethod,
  CrmPaymentPlanInstallment
} from "@/lib/crm/payment-plan-shared";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };

/** Days before a due date that the customer reminder text goes out. */
const REMINDER_LEAD_DAYS = 3;
/** Days past due before the overdue notice (customer + shop alert) goes out. */
const OVERDUE_GRACE_DAYS = 3;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Split a total into `count` equal cent-safe amounts; the last one absorbs the remainder. */
export function buildInstallmentAmounts(total: number, count: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const amounts: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    amounts.push((isLast ? cents - base * (count - 1) : base) / 100);
  }
  return amounts;
}

/** Add months to a YYYY-MM-DD date, clamping to the last day of shorter months. */
export function addMonthsClamped(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const mm = String(targetMonth + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}`;
}

/** First payment is due on the anchor date (install day), then monthly. */
export function scheduleDueDates(anchorDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonthsClamped(anchorDate, i));
}

function todayIso(now: Date = new Date()) {
  return now.toISOString().slice(0, 10);
}

function shopSmsNumbers(): string[] {
  const list = [
    process.env.JESSICA_805_SALES_SMS_NUMBER,
    process.env.MIKE_805_SALES_SMS_NUMBER,
    ...(process.env.CRM_SOLD_QUOTE_SMS_NUMBERS || "").split(",")
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of list) {
    const v = (n || "").trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

async function fetchJob(supabase: CrmSupabaseClient, jobId: string): Promise<CrmJob> {
  const { data, error } = await supabase.from("crm_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error || !data) throw new Error("CRM job was not found.");
  return data as CrmJob;
}

async function savePlan(supabase: CrmSupabaseClient, job: CrmJob, plan: CrmPaymentPlanMeta): Promise<CrmJob> {
  const meta = { ...objectMeta(job.meta), [PAYMENT_PLAN_META_KEY]: plan };
  const { data, error } = await supabase.from("crm_jobs").update({ meta }).eq("id", job.id).select("*").single();
  if (error || !data) throw new Error("Payment plan could not be saved.");
  return data as CrmJob;
}

async function recordActivity(
  supabase: CrmSupabaseClient,
  actor: CrmActor,
  jobId: string,
  action: string,
  metadata: Record<string, unknown>
) {
  try {
    const { recordCrmActivity } = await import("@/lib/crm/backend");
    await recordCrmActivity(supabase, actor, { entityType: "job", entityId: jobId, action, metadata });
  } catch (error) {
    console.error("payment-plan activity log failed", error);
  }
}

export async function createPaymentPlanForJob(
  supabase: CrmSupabaseClient,
  jobId: string,
  input: {
    financed_total: number;
    installment_count: number;
    method?: CrmPaymentPlanMethod;
    card_fee_percent?: number;
    notes?: string | null;
  },
  actor: CrmActor
): Promise<{ job: CrmJob; plan: CrmPaymentPlanMeta }> {
  const financedTotal = round2(Number(input.financed_total));
  const count = Math.trunc(Number(input.installment_count));
  if (!Number.isFinite(financedTotal) || financedTotal <= 0) {
    throw new Error("Financed amount must be greater than zero.");
  }
  if (!Number.isFinite(count) || count < 1 || count > 12) {
    throw new Error("Installment count must be between 1 and 12.");
  }

  const method = input.method || "square_autopay";
  // Card-network rules cap credit-card surcharges at 3%; only card plans carry a fee.
  const rawFeePercent = input.card_fee_percent ?? (method === "square_autopay" ? 3 : 0);
  const cardFeePercent = method === "square_autopay" ? Math.min(3, Math.max(0, Number(rawFeePercent) || 0)) : 0;

  const job = await fetchJob(supabase, jobId);
  if (hasOpenPaymentPlan(job.meta)) {
    throw new Error("This job already has an open payment plan.");
  }

  const now = new Date().toISOString();
  const amounts = buildInstallmentAmounts(financedTotal, count);
  const jobInstalled = job.status === "installed" || job.status === "invoiced" || job.status === "closed";
  const anchor = jobInstalled ? todayIso() : null;
  const dueDates = anchor ? scheduleDueDates(anchor, count) : null;

  const plan: CrmPaymentPlanMeta = {
    status: jobInstalled ? "active" : "pending_install",
    financed_total: financedTotal,
    installment_count: count,
    card_fee_percent: cardFeePercent,
    method,
    installments: amounts.map((amount, i) => ({
      seq: i + 1,
      amount,
      card_fee: cardFeePercent > 0 ? round2((amount * cardFeePercent) / 100) : null,
      due_date: dueDates ? dueDates[i] : null,
      paid_at: null,
      paid_amount: null,
      payment_type: null,
      reminder_sent_at: null,
      overdue_notice_sent_at: null
    })),
    created_at: now,
    created_by: actor.email,
    activated_at: jobInstalled ? now : null,
    notes: input.notes || null
  };

  const updated = await savePlan(supabase, job, plan);
  await recordActivity(supabase, actor, jobId, "payment_plan.create", {
    financed_total: financedTotal,
    installment_count: count,
    method: plan.method,
    card_fee_percent: cardFeePercent,
    status: plan.status
  });

  return { job: updated, plan };
}

/**
 * Anchor the schedule to the install date: first installment due that day,
 * the rest monthly after. Fired by the job-status transition into
 * installed/invoiced. Never throws.
 */
export async function activatePaymentPlanForJob(
  supabase: CrmSupabaseClient,
  jobId: string,
  actor: CrmActor,
  anchorDate?: string
): Promise<{ activated: boolean }> {
  try {
    const job = await fetchJob(supabase, jobId);
    const plan = getPaymentPlanMeta(job.meta);
    if (!plan || plan.status !== "pending_install") return { activated: false };

    const anchor = anchorDate || todayIso();
    const dueDates = scheduleDueDates(anchor, plan.installments.length);
    const activated: CrmPaymentPlanMeta = {
      ...plan,
      status: "active",
      activated_at: new Date().toISOString(),
      installments: plan.installments.map((inst, i) => ({ ...inst, due_date: dueDates[i] }))
    };

    await savePlan(supabase, job, activated);
    await recordActivity(supabase, actor, jobId, "payment_plan.activate", { anchor, due_dates: dueDates });

    if (job.phone) {
      const first = activated.installments[0];
      const feeNote = first.card_fee ? ` (includes ${plan.card_fee_percent || 3}% card processing fee)` : "";
      await sendSms({
        to: job.phone,
        body:
          `Hi ${String(job.customer_name || "").trim().split(/\s+/)[0] || "there"}, your 805 Shutters installation is complete - thank you! ` +
          `Your payment plan starts today: ${activated.installments.length} monthly payments of ${formatMoney(installmentChargeAmount(first))}${feeNote}, first one due today (${first.due_date}). ` +
          `Questions? Call or text 805-806-9344.`
      });
    }

    return { activated: true };
  } catch (error) {
    console.error("payment-plan activation failed", error);
    return { activated: false };
  }
}

export async function markInstallmentPaid(
  supabase: CrmSupabaseClient,
  jobId: string,
  seq: number,
  input: { amount?: number; payment_type?: string; paid_at?: string },
  actor: CrmActor
): Promise<{ job: CrmJob; plan: CrmPaymentPlanMeta }> {
  const job = await fetchJob(supabase, jobId);
  const plan = getPaymentPlanMeta(job.meta);
  if (!plan || (plan.status !== "active" && plan.status !== "pending_install")) {
    throw new Error("This job has no open payment plan.");
  }
  const installment = plan.installments.find((inst) => inst.seq === seq);
  if (!installment) throw new Error("Unknown installment.");
  if (installment.paid_at) throw new Error("This installment is already marked paid.");

  const paidAt = input.paid_at || todayIso();
  // Customer pays base + card fee; the ledger below books only the base so
  // the sale balance stays correct.
  const paidAmount = round2(Number(input.amount ?? installmentChargeAmount(installment)));
  const paymentType = input.payment_type || (plan.method === "zelle" ? "zelle" : "credit_card");

  const installments = plan.installments.map((inst) =>
    inst.seq === seq ? { ...inst, paid_at: paidAt, paid_amount: paidAmount, payment_type: paymentType } : inst
  );
  const allPaid = installments.every((inst) => inst.paid_at);
  const updatedPlan: CrmPaymentPlanMeta = {
    ...plan,
    installments,
    status: allPaid ? "completed" : plan.status,
    completed_at: allPaid ? new Date().toISOString() : plan.completed_at || null
  };

  const updatedJob = await savePlan(supabase, job, updatedPlan);

  // Mirror the payment into the bookkeeping ledger so balances recompute.
  try {
    const { data: entry } = await supabase
      .from("crm_quote_bookkeeping_entries")
      .select("id")
      .eq("job_id", jobId)
      .limit(1)
      .maybeSingle();
    if (entry?.id) {
      const { error: paymentError } = await supabase.from("crm_quote_bookkeeping_payments").insert({
        bookkeeping_entry_id: entry.id,
        payment_label: `Payment plan ${seq}/${plan.installment_count}`,
        payment_type: ["zelle", "cash", "check", "credit_card", "venmo"].includes(paymentType) ? paymentType : "other",
        amount: installment.amount,
        paid_at: paidAt,
        source: "manual",
        notes: installment.card_fee
          ? `In-house payment plan installment (customer paid ${formatMoney(paidAmount)} including ${formatMoney(installment.card_fee)} card processing fee)`
          : "In-house payment plan installment",
        meta: { createdBy: actor.email, paymentPlanSeq: seq, cardFee: installment.card_fee || 0 }
      });
      if (paymentError) console.error("payment-plan ledger mirror failed", paymentError.message);
    }
  } catch (error) {
    console.error("payment-plan ledger mirror failed", error);
  }

  await recordActivity(supabase, actor, jobId, "payment_plan.payment", {
    seq,
    amount: paidAmount,
    payment_type: paymentType,
    paid_at: paidAt,
    completed: allPaid
  });

  return { job: updatedJob, plan: updatedPlan };
}

export async function cancelPaymentPlan(
  supabase: CrmSupabaseClient,
  jobId: string,
  actor: CrmActor,
  reason?: string
): Promise<{ job: CrmJob; plan: CrmPaymentPlanMeta }> {
  const job = await fetchJob(supabase, jobId);
  const plan = getPaymentPlanMeta(job.meta);
  if (!plan || (plan.status !== "active" && plan.status !== "pending_install")) {
    throw new Error("This job has no open payment plan.");
  }

  const canceled: CrmPaymentPlanMeta = {
    ...plan,
    status: "canceled",
    canceled_at: new Date().toISOString(),
    canceled_by: actor.email,
    notes: reason ? `${plan.notes ? `${plan.notes}\n` : ""}Canceled: ${reason}` : plan.notes
  };
  const updatedJob = await savePlan(supabase, job, canceled);
  await recordActivity(supabase, actor, jobId, "payment_plan.cancel", { reason: reason || null });
  return { job: updatedJob, plan: canceled };
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

/**
 * Daily cron sweep: texts the customer a reminder a few days before each due
 * date, and an overdue notice (plus a shop alert to Mike/Jessica) once a
 * payment is past the grace window. Stamps each send so nothing repeats.
 */
export async function runPaymentPlanReminders(supabase: CrmSupabaseClient, now: Date = new Date()) {
  const today = todayIso(now);
  const { data: jobs, error } = await supabase
    .from("crm_jobs")
    .select("*")
    .not("meta->payment_plan", "is", null)
    .limit(2000);
  if (error) throw new Error(`Payment-plan sweep failed: ${error.message}`);

  const summary = { plansChecked: 0, remindersSent: 0, overdueNoticesSent: 0 };
  const shopNumbers = shopSmsNumbers();

  for (const jobRow of (jobs as CrmJob[]) || []) {
    const plan = getPaymentPlanMeta(jobRow.meta);
    if (!plan || plan.status !== "active") continue;
    summary.plansChecked += 1;

    let changed = false;
    const firstName = String(jobRow.customer_name || "").trim().split(/\s+/)[0] || "there";
    const installments = [...plan.installments];

    for (let i = 0; i < installments.length; i += 1) {
      const inst = installments[i];
      if (inst.paid_at || !inst.due_date) continue;
      const untilDue = daysBetween(today, inst.due_date);

      if (untilDue >= 0 && untilDue <= REMINDER_LEAD_DAYS && !inst.reminder_sent_at && jobRow.phone) {
        const when = untilDue === 0 ? "today" : `on ${inst.due_date}`;
        const sms = await sendSms({
          to: jobRow.phone,
          body:
            `Hi ${firstName}, a friendly reminder from 805 Shutters: payment ${inst.seq} of ${plan.installment_count} ` +
            `(${formatMoney(installmentChargeAmount(inst))}) is due ${when}. Questions? Call or text 805-806-9344. Thank you!`
        });
        if (sms.sent) {
          installments[i] = { ...inst, reminder_sent_at: new Date().toISOString() };
          summary.remindersSent += 1;
          changed = true;
        }
      } else if (untilDue < -OVERDUE_GRACE_DAYS && !inst.overdue_notice_sent_at) {
        if (jobRow.phone) {
          await sendSms({
            to: jobRow.phone,
            body:
              `Hi ${firstName}, this is 805 Shutters - payment ${inst.seq} of ${plan.installment_count} ` +
              `(${formatMoney(installmentChargeAmount(inst))}, due ${inst.due_date}) hasn't come through yet. ` +
              `Please call or text 805-806-9344 so we can get it sorted. Thank you!`
          });
        }
        const alertBody = `805 Shutters: payment plan OVERDUE — ${jobRow.customer_name || "customer"}, payment ${inst.seq}/${plan.installment_count} (${formatMoney(installmentChargeAmount(inst))}) was due ${inst.due_date}.`;
        for (const num of shopNumbers) {
          await sendSms({ to: num, body: alertBody });
        }
        installments[i] = { ...inst, overdue_notice_sent_at: new Date().toISOString() };
        summary.overdueNoticesSent += 1;
        changed = true;
      }
    }

    if (changed) {
      await savePlan(supabase, jobRow, { ...plan, installments });
    }
  }

  return summary;
}
