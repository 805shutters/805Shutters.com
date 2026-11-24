import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardProviderConfigError } from "@/lib/finance/card-provider";
import { createSquarePaymentLink } from "@/lib/finance/square";
import { createStripePaymentLink } from "./stripe-collection";
import { createCardPaymentLink, isCardConfigured } from "./card-payment-links";

vi.mock("@/lib/finance/square", () => ({
  isSquareConfigured: vi.fn(() => true),
  createSquarePaymentLink: vi.fn(),
}));
vi.mock("@/lib/finance/stripe", () => ({ isStripeConfigured: vi.fn(() => true) }));
vi.mock("./stripe-collection", () => ({ createStripePaymentLink: vi.fn() }));

const db = { from: vi.fn() } as unknown as SupabaseClient;
const input = {
  amountCents: 10000,
  title: "Deposit",
  quoteId: "22222222-2222-4222-8222-222222222222",
  jobId: "job-1",
  paymentType: "deposit" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CARD_PAYMENT_PROVIDER;
  vi.mocked(createSquarePaymentLink).mockResolvedValue({ id: "sq", url: "https://square.example.test/pay" });
  vi.mocked(createStripePaymentLink).mockResolvedValue({
    id: "cs_test_1",
    orderId: "cs_test_1",
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
    provider: "stripe",
    requestId: "req-1",
  });
});

function noProviderCalls() {
  expect(createSquarePaymentLink).not.toHaveBeenCalled();
  expect(createStripePaymentLink).not.toHaveBeenCalled();
}

describe("createCardPaymentLink provider gate", () => {
  it("refuses an unset provider before Square or Stripe", async () => {
    await expect(createCardPaymentLink(db, input)).rejects.toMatchObject({
      name: "CardProviderConfigError",
      status: 503,
    });
    expect(() => isCardConfigured()).toThrow(CardProviderConfigError);
    noProviderCalls();
  });

  it("refuses an invalid provider before Square or Stripe", async () => {
    process.env.CARD_PAYMENT_PROVIDER = "paypal";
    await expect(createCardPaymentLink(db, input)).rejects.toMatchObject({ status: 503 });
    noProviderCalls();
  });

  it("refuses Square even with the old switch or an explicit historical provider", async () => {
    process.env.CARD_PAYMENT_PROVIDER = "square";
    await expect(createCardPaymentLink(db, input)).rejects.toMatchObject({ status: 503 });
    process.env.CARD_PAYMENT_PROVIDER = "stripe";
    await expect(createCardPaymentLink(db, input, "square")).rejects.toMatchObject({ status: 409 });
    noProviderCalls();
  });

  it("sends an explicit stripe request only to Stripe", async () => {
    process.env.CARD_PAYMENT_PROVIDER = "stripe";
    expect(isCardConfigured()).toBe(true);
    await createCardPaymentLink(db, input);
    expect(createStripePaymentLink).toHaveBeenCalledOnce();
    expect(createSquarePaymentLink).not.toHaveBeenCalled();
  });
});
