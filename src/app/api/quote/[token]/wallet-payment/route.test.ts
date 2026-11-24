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

describe("retired Square endpoint", () => {
  it.each(["", "stripe", "square"])("rejects old tokens with provider %s", async (provider) => {
    process.env.CARD_PAYMENT_PROVIDER = provider;
    const response = await post();
    expect(response.status).toBe(410);
    expect(JSON.stringify(await response.json())).toContain("retired");
    expect(createSquareWalletPayment).not.toHaveBeenCalled();
    expect(loadPublicQuoteByToken).not.toHaveBeenCalled();
  });
});
