import { describe, expect, it } from "vitest";
import { amountDueForPaymentType, quotePaymentState } from "./quote-payment-state";

describe("quotePaymentState", () => {
  it("uses the configured deposit when the ledger has no deposit payment", () => {
    expect(quotePaymentState({ total: 4_000, depositRequired: 2_000 })).toEqual({
      available: true,
      dueType: "deposit",
      amountDue: 2_000,
      outstanding: 4_000,
      depositPaid: 0,
      paidTotal: 0,
    });
  });

  it("uses the remaining balance after the ledger shows the deposit paid", () => {
    expect(quotePaymentState({
      total: 4_000,
      depositRequired: 2_000,
      payments: [{ payment_label: "Deposit", amount: 2_000 }],
    })).toEqual({
      available: true,
      dueType: "balance",
      amountDue: 2_000,
      outstanding: 2_000,
      depositPaid: 2_000,
      paidTotal: 2_000,
    });
  });

  it("keeps a partial deposit shortfall due and applies ledger credits once", () => {
    expect(quotePaymentState({
      total: 4_000,
      depositRequired: 2_000,
      payments: [{ payment_label: "Deposit", amount: 500 }],
      creditsIn: [{ amount: 250 }],
    })).toMatchObject({
      dueType: "deposit",
      amountDue: 1_500,
      outstanding: 3_250,
      depositPaid: 500,
      paidTotal: 500,
    });
  });

  it("revalidates the requested card-payment type against the ledger state", () => {
    const state = quotePaymentState({
      total: 4_000,
      depositRequired: 2_000,
      payments: [{ payment_label: "Deposit", amount: 2_000 }],
    });

    expect(amountDueForPaymentType(state, "balance")).toBe(2_000);
    expect(() => amountDueForPaymentType(state, "deposit")).toThrow("payment amount changed");
  });
});
