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

describe("retired Square endpoint", () => {
  it.each(["", "stripe", "square"])("rejects old tokens with provider %s", async (provider) => {
    process.env.CARD_PAYMENT_PROVIDER = provider;
    const response = await post();
    expect(response.status).toBe(410);
    expect(JSON.stringify(await response.json())).toContain("retired");
    expect(createSquareCustomer).not.toHaveBeenCalled();
    expect(createSquareCardOnFile).not.toHaveBeenCalled();
  });
});
