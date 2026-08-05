import { describe, expect, it } from "vitest";
import { buildRecentFinancialActivity } from "./recent-financial-activity";

describe("recent financial activity", () => {
  it("sorts newest payments first and preserves payer and source references", () => {
    const activity = buildRecentFinancialActivity([
      {
        customerName: "Jane Customer",
        payments: [
          {
            id: "older",
            paid_at: "2026-08-01",
            created_at: "2026-08-01T12:00:00.000Z",
            payment_type: "zelle",
            amount: 500,
            external_source: "zelle_email",
            external_id: "gmail-1",
            meta: { payer_name: "Jane Payer" },
          },
          {
            id: "newer",
            paid_at: "2026-08-03",
            created_at: "2026-08-03T12:00:00.000Z",
            payment_type: "credit_card",
            amount: 1250,
            external_source: "square",
            external_id: "square-1",
            meta: { square_customer_name: "Jane Square" },
          },
        ],
      },
    ] as never);

    expect(activity.map((entry) => entry.id)).toEqual(["newer", "older"]);
    expect(activity[0]).toMatchObject({
      paymentType: "Square",
      payerCustomer: "Jane Square",
      amount: 1250,
      sourceReference: "square · square-1",
    });
    expect(activity[1]).toMatchObject({ paymentType: "Zelle", payerCustomer: "Jane Payer" });
  });
});
