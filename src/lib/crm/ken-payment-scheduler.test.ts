import { describe, expect, it } from "vitest";
import { planMonthEndKenPaymentReview } from "@/lib/crm/ken-payment-scheduler";
import type { CrmPartnerPaymentLedgerItem } from "@/lib/crm/types";

const eligible = [{
  id: "one", itemKey: "one", person: "ken", source: "manual", quoteId: null, bookkeepingEntryId: null,
  quoteIdAliases: [],
  jobId: "job-one", customerName: "One", quoteNumber: null, closedAt: "2026-07-31", periodMonth: "2026-07-01",
  sourceStatus: "paid", salesOwner: "mike", total: 1000, advertisingReserve: 0, owedAmount: 100, paidAmount: 0, remainingAmount: 100,
  paymentState: "unpaid", explicitAllocationIds: [], legacyPaidAmount: 0
}] satisfies CrmPartnerPaymentLedgerItem[];

describe("month-end Ken payment review scheduler", () => {
  it("is disabled by default", () => {
    expect(planMonthEndKenPaymentReview(eligible, new Date("2026-08-01T06:30:00Z"), {}).queued).toBe(false);
  });

  it("queues review only on the last Pacific day and never represents a transfer", () => {
    const plan = planMonthEndKenPaymentReview(
      eligible,
      new Date("2026-08-01T06:30:00Z"),
      { KEN_MONTH_END_REVIEW_ENABLED: "true" }
    );
    expect(plan.queued).toBe(true);
    expect(plan.reason).toContain("10% of every closed job whose Ken allocation remains unpaid");
    expect(plan.reason).toContain("No payment, transfer, or email");
  });
});
