import { objectMeta } from "./measure-needed-state";
import { IN_HOUSE_SCHEDULE, scheduleAmounts } from "./payment-schedule";
import { unpaidCents, type PaymentPlan } from "./in-house-plan-model";
import type { JobTrackingViewItem } from "./job-tracking-view";

export type JobPaymentColumn = {
  number: number;
  label: "Deposit" | "Second payment" | "Balance";
  amount: number | null;
  received: number | null;
  remaining: number | null;
  paid: boolean;
  dueDate: string | null;
  paidAt: string | null;
};
export type JobPaymentColumns = {
  plan: PaymentPlan | null;
  payments: JobPaymentColumn[];
  verified: boolean;
  paidCount: number;
  outstanding: number | null;
  notice: string | null;
};

/** Match the actual financial record, never another agreement for the same job/customer. */
export function jobPaymentColumns(
  source: JobTrackingViewItem,
  plans: PaymentPlan[] = [],
  available = true,
): JobPaymentColumns | null {
  const standalone = source.row && source.row.source !== "crm_quote";
  const quoteId = source.quote?.id || source.row?.quoteId || (source.row?.source === "crm_quote" ? source.row.id : null);
  const matches = plans.filter(plan => plan.status !== "cancelled" && (standalone
    ? plan.bookkeeping_entry_id === source.row!.id
    : Boolean(quoteId && plan.quote_id === quoteId && !plan.bookkeeping_entry_id)));
  const plan = matches.length === 1 ? matches[0] : null;
  const meta = objectMeta(standalone ? source.row!.meta : source.quote?.meta || source.row?.meta);
  const agreed = objectMeta(meta.adjustments).paymentSchedule === IN_HOUSE_SCHEDULE;
  if (!plan && !agreed && !matches.length) return null;
  const completeSchedule = Boolean(plan && [1, 2, 3].every(number =>
    plan.installments.filter(i => i.number === number).length === 1));
  const verified = available && completeSchedule && plan?.status !== "review";
  const fallback = !plan && source.total !== null && source.total >= 0.03 ? scheduleAmounts(source.total) : null;
  const payments = (["Deposit", "Second payment", "Balance"] as const).map((label, index): JobPaymentColumn => {
    const installment = plan?.installments.find(i => i.number === index + 1);
    return {
      number: index + 1, label,
      amount: installment ? installment.amount_cents / 100 : fallback ? fallback[index] / 100 : null,
      received: verified && installment ? installment.paid_cents / 100 : null,
      remaining: verified && installment ? unpaidCents(installment) / 100 : null,
      paid: Boolean(verified && installment && unpaidCents(installment) === 0),
      dueDate: installment?.due_date || null,
      paidAt: verified ? installment?.paid_at || null : null,
    };
  });
  return {
    plan, payments, verified, paidCount: payments.filter(p => p.paid).length,
    outstanding: verified && plan ? plan.current.outstandingCents / 100 : source.balanceOutstanding,
    notice: !available ? "Payment tracking unavailable. Refresh to verify receipts."
      : matches.length > 1 ? "Multiple payment plans need review."
      : !plan ? "Accepted payment tracking not available."
      : !completeSchedule ? "Payment schedule needs review."
      : plan.status === "review" ? plan.review_reason || "Payment evidence needs review."
      : plan.status === "paused" ? "Payment plan paused." : null,
  };
}
