import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import { createSquarePaymentLink } from "@/lib/finance/square";
import { createStripePaymentLink } from "@/lib/crm/stripe-collection";
import { POST } from "./route";

vi.mock("@/lib/finance/square", () => ({
  createSquarePaymentLink: vi.fn(),
  isSquareConfigured: vi.fn(() => true),
  dollarsToCents: (amount: number) => Math.round(amount * 100),
  retireSquarePaymentLink: vi.fn(),
}));
vi.mock("@/lib/finance/stripe", () => ({ isStripeConfigured: vi.fn(() => true) }));
vi.mock("@/lib/crm/stripe-collection", () => ({
  createStripePaymentLink: vi.fn(),
  retireStripePaymentLink: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: () => ({ from: vi.fn() }) }));
vi.mock("@/lib/crm/public-quote", () => ({
  loadPublicQuoteByToken: vi.fn(),
  computeSelectionTotal: vi.fn(),
}));
vi.mock("@/lib/crm/square-payment-requests", () => ({ trackSquarePaymentRequest: vi.fn() }));

const post = () => POST(
  new NextRequest("https://www.805shutters.com/api/quote/token/square-checkout", {
    method: "POST",
    body: JSON.stringify({ paymentType: "deposit" }),
  }),
  { params: Promise.resolve({ token: "token" }) },
);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CARD_PAYMENT_PROVIDER;
});

describe("public card checkout provider gate", () => {
  it("refuses an unset or invalid provider before Square or Stripe", async () => {
    const unset = await post();
    expect(unset.status).toBe(503);
    expect(await unset.json()).toMatchObject({ message: "Card payment provider is not configured." });

    process.env.CARD_PAYMENT_PROVIDER = "paypal";
    const invalid = await post();
    expect(invalid.status).toBe(503);
    expect(await invalid.json()).toMatchObject({ message: "Card collection requires Stripe. Square collection is retired." });

    expect(createSquarePaymentLink).not.toHaveBeenCalled();
    expect(createStripePaymentLink).not.toHaveBeenCalled();
    expect(loadPublicQuoteByToken).not.toHaveBeenCalled();
  });
});
