import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifySquareWebhookSignature,
  squarePaymentLinksUrl,
  squarePaymentLinkRequestBody,
  squareEnvironment,
  dollarsToCents,
  extractSquarePaymentFacts,
  isSquareConfigured,
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
  it("uses Square's production Connect API host", () => {
    expect(squarePaymentLinksUrl("production")).toBe("https://connect.squareup.com/v2/online-checkout/payment-links");
  });
  it("uses Square's sandbox Connect API host", () => {
    expect(squarePaymentLinksUrl("sandbox")).toBe("https://connect.squareupsandbox.com/v2/online-checkout/payment-links");
  });
  it("reads Square configuration dynamically at request time", () => {
    const original = {
      SQUARE_ENV: process.env.SQUARE_ENV,
      SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
      SQUARE_LOCATION_ID: process.env.SQUARE_LOCATION_ID,
    };
    try {
      process.env.SQUARE_ENV = "production";
      process.env.SQUARE_ACCESS_TOKEN = "token";
      process.env.SQUARE_LOCATION_ID = "location";
      expect(squareEnvironment()).toBe("production");
      expect(squarePaymentLinksUrl()).toBe("https://connect.squareup.com/v2/online-checkout/payment-links");
      expect(isSquareConfigured()).toBe(true);

      delete process.env.SQUARE_ACCESS_TOKEN;
      expect(isSquareConfigured()).toBe(false);
    } finally {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("squarePaymentLinkRequestBody", () => {
  it("uses Square REST API snake_case fields", () => {
    const body = squarePaymentLinkRequestBody(
      {
        amountCents: 54125,
        title: "Deposit - 805 Shutters",
        quoteId: "quote-1",
        paymentType: "deposit",
        buyerEmail: "customer@example.com",
      },
      "LOCATION1",
    );
    expect(body.order.location_id).toBe("LOCATION1");
    expect(body.order.reference_id).toBe("quote-1");
    expect(body.order.line_items[0].quantity).toBe("1");
    expect(body.order.line_items[0].base_price_money).toEqual({ amount: 54125, currency: "USD" });
    expect(body.checkout_options).toEqual({ allow_tipping: false, ask_for_shipping_address: false });
    expect(body.pre_populated_data).toEqual({ buyer_email: "customer@example.com" });
    expect("locationId" in body.order).toBe(false);
    expect("lineItems" in body.order).toBe(false);
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
