import { describe, expect, it } from "vitest";
import {
  buildKenPaymentReview,
  isLastDayOfPacificMonth,
  kenPaymentDisabledReason,
  reconcileKenBuyoutApplication
} from "@/lib/crm/ken-payment-workflow";
import type { CrmPartnerPaymentLedgerItem } from "@/lib/crm/types";

function item(overrides: Partial<CrmPartnerPaymentLedgerItem> = {}): CrmPartnerPaymentLedgerItem {
  return {
    id: "ken:manual:1",
    itemKey: "ken:manual:1",
    person: "ken",
    source: "manual",
    quoteId: null,
    quoteIdAliases: [],
    bookkeepingEntryId: "1",
    jobId: "job-1",
    customerName: "Customer One",
    quoteNumber: "805-0001",
    closedAt: "2026-07-20",
    periodMonth: "2026-07-01",
    sourceStatus: "paid",
    salesOwner: "mike",
    total: 1000,
    advertisingReserve: 0,
    owedAmount: 100,
    paidAmount: 25,
    remainingAmount: 75,
    paymentState: "partial",
    explicitAllocationIds: [],
    legacyPaidAmount: 0,
    ...overrides
  };
}

describe("Ken payment review", () => {
  it("separates eligible and held jobs and reconciles gross, offsets, and net", () => {
    const review = buildKenPaymentReview([
      item(),
      item({ id: "paid", itemKey: "paid", paidAmount: 50, remainingAmount: 0, paymentState: "paid" })
    ]);
    expect(review.included.map((entry) => entry.itemKey)).toEqual(["ken:manual:1"]);
    expect(review.held).toEqual([expect.objectContaining({ reason: "Already paid" })]);
    expect(review).toMatchObject({ grossTotal: 100, offsets: 25, netAmount: 75 });
  });

  it("gates review on recipient, positive net, eligible rows, and request state", () => {
    const review = buildKenPaymentReview([item()]);
    expect(kenPaymentDisabledReason({ recipientConfigured: true, review, busy: false })).toBeNull();
    expect(kenPaymentDisabledReason({ recipientConfigured: false, review, busy: false })).toContain("not configured");
    expect(kenPaymentDisabledReason({ recipientConfigured: true, review: buildKenPaymentReview([]), busy: false })).toContain(
      "no eligible payable entries"
    );
    expect(kenPaymentDisabledReason({
      recipientConfigured: true,
      review: { ...review, netAmount: 0 },
      busy: false
    })).toContain("greater than $0");
    expect(kenPaymentDisabledReason({ recipientConfigured: true, review, busy: true })).toContain("in progress");
  });

  it("recognizes only the last Pacific calendar day for the month-end review queue", () => {
    expect(isLastDayOfPacificMonth(new Date("2026-08-01T06:30:00Z"))).toBe(true);
    expect(isLastDayOfPacificMonth(new Date("2026-07-31T06:30:00Z"))).toBe(false);
  });

  it("reconciles one payment against the buyout balance to the cent", () => {
    expect(reconcileKenBuyoutApplication({
      remainingBefore: 420000.12,
      paymentAmount: 234.57,
      remainingAfter: 419765.55
    })).toMatchObject({ ok: true, expectedRemainingAfter: 419765.55 });
    expect(reconcileKenBuyoutApplication({
      remainingBefore: 420000.12,
      paymentAmount: 234.57,
      remainingAfter: 419765.54
    }).ok).toBe(false);
  });
});
