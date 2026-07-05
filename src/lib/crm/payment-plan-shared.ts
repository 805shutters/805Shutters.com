// Client-safe payment-plan types + meta readers (no server imports), shared by
// the CRM UI and the server-side module in payment-plans.ts.

import { objectMeta } from "@/lib/crm/measure-needed-state";

export const PAYMENT_PLAN_META_KEY = "payment_plan";

export type CrmPaymentPlanMethod = "square_autopay" | "zelle" | "other";

export type CrmPaymentPlanInstallment = {
  seq: number;
  amount: number;
  /** Card processing fee the customer pays on top of the installment (0/null for Zelle etc.). */
  card_fee?: number | null;
  due_date: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  payment_type: string | null;
  reminder_sent_at: string | null;
  overdue_notice_sent_at: string | null;
};

export type CrmPaymentPlanMeta = {
  status: "pending_install" | "active" | "completed" | "canceled";
  financed_total: number;
  installment_count: number;
  /** Percent card fee passed through to the customer on card-collected plans (0 = none). */
  card_fee_percent?: number;
  method: CrmPaymentPlanMethod;
  installments: CrmPaymentPlanInstallment[];
  created_at: string;
  created_by: string;
  activated_at: string | null;
  canceled_at?: string | null;
  canceled_by?: string | null;
  completed_at?: string | null;
  notes?: string | null;
};

export function getPaymentPlanMeta(meta: unknown): CrmPaymentPlanMeta | null {
  const plan = objectMeta(meta)[PAYMENT_PLAN_META_KEY];
  return plan && typeof plan === "object" && !Array.isArray(plan) ? (plan as CrmPaymentPlanMeta) : null;
}

export function hasOpenPaymentPlan(meta: unknown) {
  const plan = getPaymentPlanMeta(meta);
  return Boolean(plan && (plan.status === "pending_install" || plan.status === "active"));
}

export function formatMoney(amount: number) {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What the customer actually pays for an installment: base amount plus any card fee. */
export function installmentChargeAmount(installment: Pick<CrmPaymentPlanInstallment, "amount" | "card_fee">) {
  return Math.round((installment.amount + (installment.card_fee || 0)) * 100) / 100;
}

export const PAYMENT_PLAN_METHOD_LABELS: Record<CrmPaymentPlanMethod, string> = {
  square_autopay: "Square autopay (card on file)",
  zelle: "Zelle",
  other: "Other"
};
