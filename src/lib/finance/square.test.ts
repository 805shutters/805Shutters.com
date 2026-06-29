import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifySquareWebhookSignature,
  SQUARE_PAYMENT_LINKS_URL,
  dollarsToCents,
  extractSquarePaymentFacts,
  isSquarePaidPaymentEvent,
} from "./square";

const URL = "https://www.805shutters.com/api/webhooks/square";
const KEY = "whsig_TEST_SIGNING_KEY";
const BODY = JSON.stringify({
  type: "payment.updated",
  data: { object: { payment: { id: "abc", status: "COMPLETED", total_money: { amount: 50000 } } } },
});
function sign(webhookUrl: string, body: string): string {
  return createHmac("sha256", KEY).update(`${webhookUrl}${body}`).digest("base64");
}

describe("verifySquareWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    expect(verifySquareWebhookSignature(URL, KEY, BODY, sign(URL, BODY))).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifySquareWebhookSignature(URL, KEY, BODY + "x", sign(URL, BODY))).toBe(false);
  });
  it("rejects a wrong signature", () => {
    expect(verifySquareWebhookSignature(URL, KEY, BODY, "badsig")).toBe(false);
  });
  it("rejects when url / key / signature are missing", () => {
    expect(verifySquareWebhookSignature("", KEY, BODY, sign(URL, BODY))).toBe(false);
    expect(verifySquareWebhookSignature(URL, "", BODY, sign(URL, BODY))).toBe(false);
    expect(verifySquareWebhookSignature(URL, KEY, BODY, null)).toBe(false);
  });
});

describe("Square endpoint configuration", () => {
  it("uses Square's current Connect API host", () => {
    expect(SQUARE_PAYMENT_LINKS_URL).toBe("https://connect.squareup.com/v2/online-checkout/payment-links");
  });
});

describe("dollarsToCents", () => {
  it("rounds to whole cents", () => {
    expect(dollarsToCents(541.25)).toBe(54125);
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(19.99)).toBe(1999);
  });
});

describe("extractSquarePaymentFacts", () => {
  it("pulls id, amount, quote id + type from a payment event", () => {
    const facts = extractSquarePaymentFacts({
      type: "payment.updated",
      data: { object: { payment: { id: "pay1", total_money: { amount: 50000 }, metadata: { quote_id: "Q123", payment_type: "deposit" } } } },
    });
    expect(facts).toEqual({ squarePaymentId: "pay1", amountCents: 50000, quoteId: "Q123", paymentType: "deposit" });
  });
  it("returns null when there is no payment object", () => {
    expect(extractSquarePaymentFacts({ type: "ping" })).toBeNull();
  });
});

describe("isSquarePaidPaymentEvent", () => {
  it("accepts a completed payment", () => {
    expect(isSquarePaidPaymentEvent({ type: "payment.updated", data: { object: { payment: { status: "COMPLETED" } } } })).toBe(true);
  });
  it("ignores non-payment events", () => {
    expect(isSquarePaidPaymentEvent({ type: "refund.created", data: {} })).toBe(false);
  });
});
