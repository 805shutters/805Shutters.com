import { describe, expect, it } from "vitest";
import { paymentControlAmounts } from "./payment-control-amounts";

describe("paymentControlAmounts", () => {
  it("caps the balance payment at the actual amount still owed", () => {
    expect(
      paymentControlAmounts({
        total: 4_771.87,
        depositDue: 2_385.94,
        depositPaid: 2_386,
        balancePaid: 0,
        openBalance: 2_385.87
      })
    ).toMatchObject({
      depositShortfall: 0,
      configuredBalanceDue: 2_385.93,
      balanceShortfall: 2_385.87,
      balancePaidTarget: 2_385.87,
      openBalance: 2_385.87
    });
  });

  it("keeps deposit and balance targets separate when both are unpaid", () => {
    expect(
      paymentControlAmounts({
        total: 100,
        depositDue: 50,
        depositPaid: 0,
        balancePaid: 0,
        openBalance: 100
      })
    ).toMatchObject({
      depositShortfall: 50,
      balanceShortfall: 50,
      balancePaidTarget: 50
    });
  });

  it("does not let a payment button consume an existing credit", () => {
    expect(
      paymentControlAmounts({
        total: 100,
        depositDue: 50,
        depositPaid: 0,
        balancePaid: 0,
        openBalance: 80
      })
    ).toMatchObject({
      depositShortfall: 50,
      balanceShortfall: 30,
      balancePaidTarget: 30
    });
  });
});
