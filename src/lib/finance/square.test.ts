import { afterEach, describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  createSquarePaymentLink,
  fetchSquareOrderFacts,
  verifySquareWebhookSignature,
  squarePaymentLinksUrl,
  squarePaymentLinkRequestBody,
  squareOrdersUrl,
  squareEnvironment,
  dollarsToCents,
  extractSquarePaymentFacts,
  getSquareWebhookConfig,
  isSquareConfigured,
  isSquarePaidPaymentEvent,
  isSquareWebhookTestPayment,
} from "./square";

const URL = "https://www.805shutters.com/api/webhooks/square/";
const KEY = "whsig_TEST_SIGNING_KEY";
const BODY = JSON.stringify({
  type: "payment.updated",
  data: { object: { payment: { id: "abc", status: "COMPLETED", total_money: { amount: 50000 } } } },
});
function sign(webhookUrl: string, body: string): string {
  return createHmac("sha256", KEY).update(`${webhookUrl}${body}`).digest("base64");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

describe("Square endpoint configuration", () => {
  it("uses Square's production Connect API host", () => {
    expect(squarePaymentLinksUrl("production")).toBe("https://connect.squareup.com/v2/online-checkout/payment-links");
    expect(squareOrdersUrl("production")).toBe("https://connect.squareup.com/v2/orders");
  });
  it("uses Square's sandbox Connect API host", () => {
    expect(squarePaymentLinksUrl("sandbox")).toBe("https://connect.squareupsandbox.com/v2/online-checkout/payment-links");
    expect(squareOrdersUrl("sandbox")).toBe("https://connect.squareupsandbox.com/v2/orders");
  });
  it("reads webhook config at runtime", () => {
    vi.stubEnv("SQUARE_WEBHOOK_URL", URL);
    vi.stubEnv("SQUARE_WEBHOOK_SIGNING_KEY", KEY);

    expect(getSquareWebhookConfig()).toEqual({ webhookUrl: URL, signingKey: KEY });
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
        jobId: "job-1",
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

describe("createSquarePaymentLink", () => {
  it("sends Square REST snake_case fields and CRM metadata", async () => {
    vi.stubEnv("SQUARE_ACCESS_TOKEN", "token");
    vi.stubEnv("SQUARE_LOCATION_ID", "loc");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ payment_link: { id: "plink", url: "https://square.link/u/test" } }),
    } as Response);

    const link = await createSquarePaymentLink({
      amountCents: 52547,
      title: "Deposit - 805 Shutters",
      quoteId: "quote-1",
      jobId: "job-1",
      paymentType: "deposit",
      buyerEmail: "customer@example.com",
    });

    expect(link).toEqual({ id: "plink", url: "https://square.link/u/test" });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      checkout_options: { allow_tipping: false, ask_for_shipping_address: false },
      pre_populated_data: { buyer_email: "customer@example.com" },
      order: {
        location_id: "loc",
        reference_id: "quote-1",
        metadata: {
          quote_id: "quote-1",
          job_id: "job-1",
          payment_type: "deposit",
          expected_amount_cents: "52547",
        },
      },
    });
    expect(body.order.line_items[0]).toMatchObject({
      quantity: "1",
      base_price_money: { amount: 52547, currency: "USD" },
    });
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
      created_at: "2026-07-01T17:38:00Z",
      data: {
        object: {
          payment: {
            id: "pay1",
            amount_money: { amount: 50000, currency: "USD" },
            order_id: "order1",
            receipt_url: "https://squareup.com/receipt/pay1",
            metadata: { quote_id: "Q123", payment_type: "deposit" }
          }
        }
      },
    });
    expect(facts).toEqual({
      squarePaymentId: "pay1",
      amountCents: 50000,
      currency: "USD",
      quoteId: "Q123",
      jobId: null,
      paymentType: "deposit",
      orderId: "order1",
      paidAt: "2026-07-01T17:38:00Z",
      eventId: null,
      receiptUrl: "https://squareup.com/receipt/pay1",
      refundedAmountCents: 0,
    });
  });
  it("pulls quote metadata from an embedded order object", () => {
    const facts = extractSquarePaymentFacts({
      type: "payment.updated",
      data: {
        object: {
          order: { id: "order1", reference_id: "Q123", metadata: { payment_type: "balance" } }
        }
      },
    });
    expect(facts).toMatchObject({ quoteId: "Q123", paymentType: "balance", orderId: "order1" });
  });
  it("returns null when there is no payment object", () => {
    expect(extractSquarePaymentFacts({ type: "ping" })).toBeNull();
  });
});

describe("isSquareWebhookTestPayment", () => {
  const fixture = {
    squarePaymentId: "hYy9pRFVxpDsO1FB05SunFWUe9JZY",
    amountCents: 100,
    currency: "USD",
    quoteId: null,
    jobId: null,
    paymentType: null,
    orderId: "03O3USaPaAaFnI6kkwB1JxGgBsUZY",
    paidAt: "2020-11-22T21:16:51.198Z",
    eventId: "test-event",
    receiptUrl: null,
    refundedAmountCents: 0,
  };

  it("recognizes Square's exact synthetic provider-test fixture", () => {
    expect(isSquareWebhookTestPayment(fixture)).toBe(true);
  });

  it("does not skip a real payment that differs in any financial identity field", () => {
    expect(isSquareWebhookTestPayment({ ...fixture, squarePaymentId: "real-payment" })).toBe(false);
    expect(isSquareWebhookTestPayment({ ...fixture, orderId: "real-order" })).toBe(false);
    expect(isSquareWebhookTestPayment({ ...fixture, amountCents: 61107 })).toBe(false);
    expect(isSquareWebhookTestPayment({ ...fixture, paidAt: "2026-07-30T21:16:51.198Z" })).toBe(false);
  });
});

describe("fetchSquareOrderFacts", () => {
  it("looks up quote metadata from the Square order", async () => {
    vi.stubEnv("SQUARE_ACCESS_TOKEN", "token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        order: {
          reference_id: "quote-1",
          metadata: {
            job_id: "job-1",
            payment_type: "deposit",
            expected_amount_cents: "50000",
          },
          total_money: { amount: 50000, currency: "USD" },
        },
      }),
    } as Response);

    await expect(fetchSquareOrderFacts("order-1")).resolves.toEqual({
      quoteId: "quote-1",
      jobId: "job-1",
      paymentType: "deposit",
      expectedAmountCents: 50000,
      currency: "USD",
    });
  });
});

describe("isSquarePaidPaymentEvent", () => {
  it("accepts a completed payment", () => {
    expect(isSquarePaidPaymentEvent({ type: "payment.updated", data: { object: { payment: { status: "COMPLETED" } } } })).toBe(true);
  });
  it("ignores an approved authorization until it completes", () => {
    expect(isSquarePaidPaymentEvent({ type: "payment.updated", data: { object: { payment: { status: "APPROVED" } } } })).toBe(false);
  });
  it("ignores non-payment events", () => {
    expect(isSquarePaidPaymentEvent({ type: "refund.created", data: {} })).toBe(false);
  });
  it("ignores created, failed, and refunded payments", () => {
    expect(isSquarePaidPaymentEvent({ type: "payment.created", data: { object: { payment: { status: "COMPLETED" } } } })).toBe(false);
    expect(isSquarePaidPaymentEvent({ type: "payment.updated", data: { object: { payment: { status: "FAILED" } } } })).toBe(false);
    expect(isSquarePaidPaymentEvent({
      type: "payment.updated",
      data: { object: { payment: { status: "COMPLETED", refunded_money: { amount: 100 } } } },
    })).toBe(false);
  });
});
