import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPaymentRequestPreview } from "./payment-request-preview";
import { collectiblePaymentAmount, paymentRecipientAddress, squareOrderPaymentAmounts, squarePaymentRecipient } from "./square-payment-links";

const quoteId = "11111111-1111-4111-8111-111111111111";
const ledger = {
  total: 4000,
  depositDue: 2000,
  payments: [{ amount: 500, payment_label: "Deposit" }],
  creditsIn: [{ amount: 250 }],
  creditsOut: [],
};

describe("payment request preview", () => {
  it("uses the send path amount and recipient for the requested payment type", () => {
    const amounts = squareOrderPaymentAmounts({
      total: ledger.total,
      depositRequired: ledger.depositDue,
      payments: ledger.payments,
      creditsIn: ledger.creditsIn,
      creditsOut: ledger.creditsOut,
    });
    const preview = buildPaymentRequestPreview({
      quoteId,
      paymentType: "deposit",
      customerName: "Ada Customer",
      customerEmail: "  ada@example.test ",
      signed: true,
      superseded: false,
      squareRequests: [],
      clearance: null,
      stripeRequests: [],
      stripeAccount: null,
      ...ledger,
    });
    expect(preview.amount).toBe(collectiblePaymentAmount(amounts, "deposit"));
    expect(preview.amount).toBe(1500);
    expect(preview.outstanding).toBe(amounts.outstanding);
    expect(preview.outstanding).toBe(3250);
    expect(preview.recipient).toEqual({ name: "Ada Customer", email: squarePaymentRecipient("ada@example.test") });
    expect(preview.recipient.email).toBe(paymentRecipientAddress("  ada@example.test ").email);
  });

  it("reports a missing recipient without throwing", () => {
    const preview = buildPaymentRequestPreview({
      quoteId,
      paymentType: "balance",
      total: 1000,
      depositDue: 0,
      customerName: "Ada Customer",
      customerEmail: null,
      signed: false,
      superseded: true,
      payments: [],
      creditsIn: [],
      creditsOut: [],
      squareRequests: [],
      clearance: null,
      stripeRequests: [],
      stripeAccount: null,
    });
    expect(preview.recipient).toEqual({ name: "Ada Customer", email: null });
    expect(preview.signed).toBe(false);
    expect(preview.superseded).toBe(true);
    expect(preview.amount).toBe(collectiblePaymentAmount(squareOrderPaymentAmounts({ total: 1000, depositRequired: 0 }), "balance"));
  });

  it("does not write or call a card provider from the preview route", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sources = [
      readFileSync(join(here, "payment-request-preview.ts"), "utf8"),
      readFileSync(join(here, "../../app/api/crm/quotes/[id]/payment-request-preview/route.ts"), "utf8"),
    ].join("\n");
    expect(sources).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(|\b(stripeRequest|verifyStripeAccount|createCardPaymentLink|createSquarePaymentLink|createStripePaymentLink|ensureShareToken)\b|\bfetch\(/);
  });
});
