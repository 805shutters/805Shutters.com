import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifySquareWebhookSignature,
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete process.env.SQUARE_ENV;
  delete process.env.SQUARE_ACCESS_TOKEN;
  delete process.env.SQUARE_LOCATION_ID;
});

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
    expect(facts).toEqual({ squarePaymentId: "pay1", amountCents: 50000, quoteId: "Q123", paymentType: "deposit", orderId: null });
  });
  it("falls back to payment note + order id when Square omits payment metadata", () => {
    const facts = extractSquarePaymentFacts({
      type: "payment.updated",
      data: {
        object: {
          payment: {
            id: "pay1",
            status: "COMPLETED",
            amount_money: { amount: 50000 },
            order_id: "order1",
            note: "quote:Q123 type:deposit",
          },
        },
      },
    });
    expect(facts).toEqual({ squarePaymentId: "pay1", amountCents: 50000, quoteId: "Q123", paymentType: "deposit", orderId: "order1" });
  });
  it("returns null when there is no payment object", () => {
    expect(extractSquarePaymentFacts({ type: "ping" })).toBeNull();
  });
});

describe("createSquarePaymentLink", () => {
  it("uses Square REST snake_case payloads and parses payment_link responses", async () => {
    process.env.SQUARE_ENV = "sandbox";
    process.env.SQUARE_ACCESS_TOKEN = "test-token";
    process.env.SQUARE_LOCATION_ID = "LOC123";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ payment_link: { id: "plink1", url: "https://square.link/u/test" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createSquarePaymentLink } = await import("./square");
    await expect(
      createSquarePaymentLink({
        amountCents: 50000,
        title: "Deposit - 805 Shutters",
        quoteId: "Q123",
        paymentType: "deposit",
        buyerEmail: "customer@example.com",
      }),
    ).resolves.toEqual({ id: "plink1", url: "https://square.link/u/test" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://connect.squareupsandbox.com/v2/online-checkout/payment-links",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      idempotency_key: expect.stringContaining("805-quote-Q123-deposit-"),
      checkout_options: { allow_tipping: false, ask_for_shipping_address: false },
      pre_populated_data: { buyer_email: "customer@example.com" },
      payment_note: "quote:Q123 type:deposit",
      order: {
        location_id: "LOC123",
        reference_id: "Q123",
        metadata: { quote_id: "Q123", payment_type: "deposit" },
        line_items: [
          {
            name: "Deposit - 805 Shutters",
            quantity: "1",
            base_price_money: { amount: 50000, currency: "USD" },
          },
        ],
      },
    });
  });
});

describe("retrieveSquareOrderPaymentFacts", () => {
  it("loads quote metadata from a Square order", async () => {
    process.env.SQUARE_ENV = "sandbox";
    process.env.SQUARE_ACCESS_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        order: {
          id: "order1",
          reference_id: "Q123",
          metadata: { quote_id: "Q123", payment_type: "deposit" },
          total_money: { amount: 50000 },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { retrieveSquareOrderPaymentFacts } = await import("./square");
    await expect(retrieveSquareOrderPaymentFacts("order1")).resolves.toMatchObject({
      orderId: "order1",
      quoteId: "Q123",
      paymentType: "deposit",
      amountCents: 50000,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://connect.squareupsandbox.com/v2/orders/order1",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }),
    );
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
