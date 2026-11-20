import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import { createSquareWalletPayment, isSquareConfigured } from "@/lib/finance/square";
import { POST } from "./route";

vi.mock("@/lib/finance/square", () => ({
  createSquareWalletPayment: vi.fn(),
  isSquareConfigured: vi.fn(() => true),
  dollarsToCents: (amount: number) => Math.round(amount * 100),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: () => ({ from: vi.fn() }) }));
vi.mock("@/lib/crm/public-quote", () => ({ loadPublicQuoteByToken: vi.fn(), computeSelectionTotal: vi.fn() }));
vi.mock("@/lib/crm/square-finance", () => ({ syncSquareFinance: vi.fn() }));

const post = () => POST(
  new NextRequest("https://www.805shutters.com/api/quote/token/wallet-payment", {
    method: "POST",
    body: JSON.stringify({
      paymentType: "deposit",
      walletType: "apple_pay",
      sourceId: "cnon:test",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    }),
  }),
  { params: Promise.resolve({ token: "token" }) },
);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CARD_PAYMENT_PROVIDER;
  vi.mocked(isSquareConfigured).mockReturnValue(true);
});

describe("wallet payment provider gate", () => {
  it("refuses an unset provider before any Square call", async () => {
    const response = await post();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ message: "Card payment provider is not configured." });
    expect(createSquareWalletPayment).not.toHaveBeenCalled();
    expect(loadPublicQuoteByToken).not.toHaveBeenCalled();
  });

  it("keeps Stripe on card checkout and still recognizes explicit Square", async () => {
    process.env.CARD_PAYMENT_PROVIDER = "stripe";
    expect((await post()).status).toBe(409);
    expect(createSquareWalletPayment).not.toHaveBeenCalled();

    process.env.CARD_PAYMENT_PROVIDER = "square";
    vi.mocked(isSquareConfigured).mockReturnValue(false);
    const response = await post();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ message: "Wallet payments are not enabled yet." });
    expect(createSquareWalletPayment).not.toHaveBeenCalled();
  });
});
