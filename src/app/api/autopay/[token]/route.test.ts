import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSquareCardOnFile, createSquareCustomer } from "@/lib/finance/square";
import { POST } from "./route";

vi.mock("@/lib/finance/square", () => ({
  createSquareCustomer: vi.fn(),
  createSquareCardOnFile: vi.fn(),
  chargeSquareCardOnFile: vi.fn(),
  isSquareConfigured: vi.fn(() => true),
  dollarsToCents: (amount: number) => Math.round(amount * 100),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: () => ({ from: vi.fn() }) }));
vi.mock("@/lib/notify/twilio", () => ({ sendSms: vi.fn() }));

const token = "11111111-1111-4111-8111-111111111111";
const post = () => POST(
  new NextRequest(`https://www.805shutters.com/api/autopay/${token}`, {
    method: "POST",
    body: JSON.stringify({ sourceId: "cnon:test" }),
  }),
  { params: Promise.resolve({ token }) },
);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CARD_PAYMENT_PROVIDER;
});

describe("saved-card setup provider gate", () => {
  it("refuses an unset provider before saving a Square card", async () => {
    const response = await post();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "Card payment provider is not configured." });
    expect(createSquareCustomer).not.toHaveBeenCalled();
    expect(createSquareCardOnFile).not.toHaveBeenCalled();
  });

  it("keeps explicit Stripe from saving a Square card", async () => {
    process.env.CARD_PAYMENT_PROVIDER = "stripe";
    const response = await post();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining("cannot be moved to Stripe") });
    expect(createSquareCustomer).not.toHaveBeenCalled();
    expect(createSquareCardOnFile).not.toHaveBeenCalled();
  });
});
