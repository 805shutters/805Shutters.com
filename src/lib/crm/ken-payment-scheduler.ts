import { buildKenPaymentReview, isLastDayOfPacificMonth } from "@/lib/crm/ken-payment-workflow";
import type { CrmPartnerPaymentLedgerItem } from "@/lib/crm/types";

type EnvMap = Record<string, string | undefined>;

export function planMonthEndKenPaymentReview(
  items: CrmPartnerPaymentLedgerItem[],
  now: Date,
  env: EnvMap = process.env
) {
  if (env.KEN_MONTH_END_REVIEW_ENABLED !== "true") {
    return { queued: false, reason: "Ken month-end review scheduling is disabled." };
  }
  if (!isLastDayOfPacificMonth(now)) {
    return { queued: false, reason: "Not the last day of the Pacific calendar month." };
  }
  const review = buildKenPaymentReview(items);
  if (!review.included.length || review.netAmount <= 0) {
    return { queued: false, reason: "No eligible positive Ken payable review exists.", review };
  }
  return {
    queued: true,
    reason: "Fixed month-end review queued: 10% of every closed job whose Ken allocation remains unpaid. No payment, transfer, or email was performed.",
    review
  };
}
