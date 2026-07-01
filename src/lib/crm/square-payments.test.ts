import { describe, expect, it } from "vitest";
import {
  resolveSquarePaymentLabel,
  squarePaymentWillCloseQuote,
  summarizeExistingSquareLedger,
} from "@/lib/crm/square-payments";

describe("Square CRM payment classification", () => {
  it("records the first Square payment for a quote as the deposit", () => {
    expect(resolveSquarePaymentLabel([])).toBe("Deposit");
  });

  it("records later Square payments as balance payments once any deposit exists", () => {
    expect(resolveSquarePaymentLabel([{ payment_label: "Deposit", amount: 500 }])).toBe("Balance payment");
  });

  it("records later Square payments as balance payments once any payment exists", () => {
    expect(resolveSquarePaymentLabel([{ payment_label: "Balance payment", amount: 500 }])).toBe("Balance payment");
  });

  it("summarizes deposit and balance rows using the same label rule as bookkeeping", () => {
    expect(
      summarizeExistingSquareLedger([
        { payment_label: "Deposit", amount: 500 },
        { payment_label: "Balance payment", amount: 250 },
      ])
    ).toEqual({ depositPaid: 500, balancePaid: 250, paidTotal: 750 });
  });

  it("detects when the incoming Square payment pays the quote in full", () => {
    expect(
      squarePaymentWillCloseQuote({
        quoteTotal: 1000,
        existingPayments: [{ payment_label: "Deposit", amount: 500 }],
        incomingAmount: 500,
      })
    ).toBe(true);
  });

  it("keeps the quote open when the Square payment leaves a balance", () => {
    expect(
      squarePaymentWillCloseQuote({
        quoteTotal: 1000,
        existingPayments: [],
        incomingAmount: 500,
      })
    ).toBe(false);
  });
});
