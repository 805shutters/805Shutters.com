import { describe, expect, it } from "vitest";
import { squareOrderPaymentAmounts } from "@/lib/crm/square-payment-links";

describe("squareOrderPaymentAmounts", () => {
  it("separates an unpaid deposit from the remaining order balance", () => {
    expect(squareOrderPaymentAmounts({ total: 4_000, depositRequired: 2_000 })).toEqual({
      deposit: 2_000,
      balance: 2_000,
      outstanding: 4_000,
    });
  });

  it("moves the full outstanding amount to balance after the deposit is paid", () => {
    expect(squareOrderPaymentAmounts({
      total: 4_000,
      depositRequired: 2_000,
      payments: [{ payment_label: "Deposit", amount: 2_000 }],
    })).toEqual({ deposit: 0, balance: 2_000, outstanding: 2_000 });
  });

  it("accounts for partial deposits and ledger credits without double charging", () => {
    expect(squareOrderPaymentAmounts({
      total: 4_000,
      depositRequired: 2_000,
      payments: [{ payment_label: "Deposit", amount: 500 }],
      creditsIn: [{ amount: 250 }],
    })).toEqual({ deposit: 1_500, balance: 1_750, outstanding: 3_250 });
  });
});
