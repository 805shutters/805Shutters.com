import { createHmac } from "node:crypto";
import { after, NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { POST } from "./route";
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: vi.fn() }));
const writes = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_ENV", "test");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_fixture");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "fixture");
  writes.mockResolvedValue({ error: null });
  vi.mocked(getSupabaseServiceClient).mockReturnValue({
    from: () => ({ upsert: writes }),
  } as never);
});
afterEach(() => vi.unstubAllEnvs());
function request(
  type = "payment_intent.succeeded",
  patch: Record<string, unknown> = {},
  valid = true,
) {
  const raw = JSON.stringify({
      id: "evt_fixture",
      type,
      livemode: false,
      data: {
        object: {
          id: "pi_fixture",
          amount: 999999,
          metadata: { crm_request_id: "forged" },
        },
      },
      ...patch,
    }),
    t = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", "fixture")
    .update(`${t}.${raw}`)
    .digest("hex");
  return new NextRequest("https://test.invalid/api/webhooks/stripe/", {
    method: "POST",
    body: raw,
    headers: {
      "stripe-signature": valid ? `t=${t},v1=${signature}` : "invalid",
    },
  });
}
it.each([
  "checkout.session.completed",
  "payment_intent.succeeded",
  "charge.refunded",
  "charge.dispute.created",
  "refund.updated",
  "payout.paid",
])(
  "durably queues %s without trusting webhook amounts or customer mappings",
  async (type) => {
    expect((await POST(request(type))).status).toBe(200);
    expect(writes).toHaveBeenCalledWith(
      {
        account_id: "acct_fixture",
        livemode: false,
        id: "evt_fixture",
        event_type: type,
        object_id: "pi_fixture",
      },
      { onConflict: "account_id,livemode,id", ignoreDuplicates: true },
    );
    expect(after).toHaveBeenCalledOnce();
  },
);
it("does not acknowledge lost events or process invalid signatures and wrong account/mode", async () => {
  writes.mockResolvedValue({ error: { message: "offline" } });
  expect((await POST(request())).status).toBe(503);
  expect(after).not.toHaveBeenCalled();
  writes.mockClear();
  expect(
    (await POST(request("payment_intent.succeeded", {}, false))).status,
  ).toBe(401);
  expect(
    (await POST(request("payment_intent.succeeded", { livemode: true })))
      .status,
  ).toBe(400);
  expect(
    (await POST(request("payment_intent.succeeded", { account: "acct_wrong" })))
      .status,
  ).toBe(400);
  expect(writes).not.toHaveBeenCalled();
});
it("acknowledges unrelated signed events without creating an unprocessable queue", async () => {
  expect((await POST(request("customer.updated"))).status).toBe(200);
  expect(writes).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});
