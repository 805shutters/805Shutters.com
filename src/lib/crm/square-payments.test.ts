import { describe, expect, it, vi } from "vitest";
import {
  reconcileVerifiedSquareOrderPayment,
  resolveSquarePaymentLabel,
  squarePaymentWillCloseQuote,
  summarizeExistingSquareLedger,
  validateVerifiedSquarePayment,
} from "@/lib/crm/square-payments";
import { SquareOrderFacts, SquarePaymentFacts } from "@/lib/finance/square";

const payment: SquarePaymentFacts = {
  squarePaymentId: "payment-1",
  amountCents: 50000,
  currency: "USD",
  quoteId: null,
  jobId: null,
  paymentType: null,
  orderId: "order-1",
  paidAt: "2026-07-30T18:00:00.000Z",
  eventId: "event-1",
  receiptUrl: "https://squareup.com/receipt/payment-1",
  refundedAmountCents: 0,
};

const order: SquareOrderFacts = {
  quoteId: "11111111-1111-4111-8111-111111111111",
  jobId: "22222222-2222-4222-8222-222222222222",
  paymentType: "deposit",
  expectedAmountCents: 50000,
  currency: "USD",
};

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

  it("honors an explicit balance link even when it is the first Square payment", () => {
    expect(resolveSquarePaymentLabel([], "balance")).toBe("Balance payment");
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

describe("verified Square order reconciliation", () => {
  it("requires exact durable order identity and exact amount", () => {
    expect(validateVerifiedSquarePayment({ payment, order })).toMatchObject({
      quoteId: order.quoteId,
      jobId: order.jobId,
      paymentType: "deposit",
      amount: 500,
    });
    expect(() => validateVerifiedSquarePayment({
      payment: { ...payment, amountCents: 49999 },
      order,
    })).toThrow(/exactly match/i);
    expect(() => validateVerifiedSquarePayment({
      payment: { ...payment, refundedAmountCents: 100 },
      order,
    })).toThrow(/refund/i);
    expect(() => validateVerifiedSquarePayment({
      payment,
      order: { ...order, quoteId: null },
    })).toThrow(/exact crm quote/i);
  });

  it("uses the atomic database function and returns recorded state", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { status: "recorded", markedPaid: false },
      error: null,
    });
    const result = await reconcileVerifiedSquareOrderPayment({ rpc } as never, { payment, order });
    expect(rpc).toHaveBeenCalledWith("reconcile_square_quote_payment", expect.objectContaining({
      p_quote_id: order.quoteId,
      p_job_id: order.jobId,
      p_square_payment_id: payment.squarePaymentId,
      p_square_order_id: payment.orderId,
      p_payment_intent: "deposit",
      p_amount: 500,
      p_expected_amount: 500,
      p_square_event_id: "event-1",
    }));
    expect(result).toMatchObject({ status: "recorded", paymentLabel: "Deposit", amount: 500 });
  });

  it("reports duplicate webhook replay without creating a second payment", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { status: "duplicate", markedPaid: false },
      error: null,
    });
    await expect(reconcileVerifiedSquareOrderPayment({ rpc } as never, { payment, order }))
      .resolves.toMatchObject({ status: "duplicate", squarePaymentId: "payment-1" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
