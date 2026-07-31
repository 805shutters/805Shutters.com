import type { CrmPartnerPaymentLedgerItem } from "@/lib/crm/types";

export type KenPaymentReview = {
  included: CrmPartnerPaymentLedgerItem[];
  held: Array<{ item: CrmPartnerPaymentLedgerItem; reason: string }>;
  grossTotal: number;
  offsets: number;
  netAmount: number;
};

function cents(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function buildKenPaymentReview(items: CrmPartnerPaymentLedgerItem[]): KenPaymentReview {
  const included = items.filter((item) => item.paymentState !== "paid" && item.remainingAmount > 0);
  const held = items
    .filter((item) => !included.includes(item))
    .map((item) => ({
      item,
      reason: item.paymentState === "paid" || item.remainingAmount <= 0 ? "Already paid" : "Not currently eligible"
    }));
  const grossTotal = cents(included.reduce((sum, item) => sum + item.owedAmount, 0));
  const offsets = cents(included.reduce((sum, item) => sum + item.paidAmount, 0));

  return {
    included,
    held,
    grossTotal,
    offsets,
    netAmount: cents(grossTotal - offsets)
  };
}

export function kenPaymentDisabledReason(input: {
  recipientConfigured: boolean;
  review: KenPaymentReview;
  busy: boolean;
}): string | null {
  if (input.busy) return "Payment request in progress.";
  if (!input.recipientConfigured) return "Ken's Zelle recipient is not configured.";
  if (!input.review.included.length) return "Ken has no eligible payable entries.";
  if (input.review.netAmount <= 0) return "Ken's net payable must be greater than $0.";
  return null;
}

export function isLastDayOfPacificMonth(now: Date): boolean {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(tomorrow);
  return today.slice(0, 7) !== tomorrowDate.slice(0, 7);
}

export function reconcileKenBuyoutApplication(input: {
  remainingBefore: number;
  paymentAmount: number;
  remainingAfter: number;
}) {
  const expectedRemainingAfter = cents(Math.max(input.remainingBefore - input.paymentAmount, 0));
  const actualRemainingAfter = cents(input.remainingAfter);
  return {
    ok: actualRemainingAfter === expectedRemainingAfter,
    remainingBefore: cents(input.remainingBefore),
    paymentAmount: cents(input.paymentAmount),
    expectedRemainingAfter,
    actualRemainingAfter
  };
}
