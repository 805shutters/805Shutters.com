import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { requireCrmUser } from "@/lib/crm/auth";
import { stripeConfig } from "@/lib/finance/stripe";
vi.mock("@/lib/crm/auth", async () => ({
  ...(await vi.importActual("@/lib/crm/auth")),
  requireCrmUser: vi.fn(),
}));
vi.mock("@/lib/crm/allowed-users", () => ({
  isMikePaymentAdminEmail: (email: string) => email === "owner@example.test",
}));
vi.mock("@/lib/finance/stripe", async () => ({
  ...(await vi.importActual("@/lib/finance/stripe")),
  stripeConfig: vi.fn(),
}));
const rpc = vi.fn(),
  writes = vi.fn(),
  from = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: writes,
  };
  from.mockReturnValue(chain);
  rpc.mockResolvedValue({ data: { status: "matched" }, error: null });
  vi.mocked(requireCrmUser).mockResolvedValue({
    supabase: { from, rpc },
    email: "owner@example.test",
  } as never);
  vi.mocked(stripeConfig).mockReturnValue({
    account: "acct_fixture",
    livemode: true,
    environment: "live",
    key: "fixture",
  });
});
const request = (body: unknown) =>
  new NextRequest("https://fixture.invalid/api/crm/stripe/", {
    method: "POST",
    body: JSON.stringify(body),
  });
it("shows an actionable setup hold without exposing configuration or querying evidence", async () => {
  vi.mocked(stripeConfig).mockImplementationOnce(() => {
    throw new Error("private configuration detail");
  });
  const r = await GET(new NextRequest("https://fixture.invalid/api/crm/stripe/"));
  expect(r.status).toBe(503);
  const body = await r.text();
  expect(body).toContain("Stripe setup is not complete.");
  expect(body).not.toContain("private configuration detail");
  expect(from).not.toHaveBeenCalled();
});
it("does not mutate during an authenticated evidence read", async () => {
  const r = await GET(
    new NextRequest("https://fixture.invalid/api/crm/stripe/"),
  );
  expect(r.status).toBe(200);
  expect(rpc).not.toHaveBeenCalled();
  expect(writes).not.toHaveBeenCalled();
  expect((await r.json()).canReview).toBe(true);
});
it.each(["bank", "clearance", "expire", "sync"])(
  "rejects staff action %s before any financial side effect",
  async (action) => {
    vi.mocked(requireCrmUser).mockResolvedValue({
      supabase: { from, rpc },
      email: "staff@example.test",
    } as never);
    expect((await POST(request({ action }))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  },
);
it("blocks test mode bank matching and unconfirmed historical clearance", async () => {
  vi.mocked(stripeConfig).mockReturnValue({
    account: "acct_fixture",
    livemode: false,
    environment: "test",
    key: "fixture",
  });
  expect(
    (
      await POST(
        request({ action: "bank", amountCents: 100, evidence: "bank receipt" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          action: "clearance",
          targetId: "q",
          evidence: "An alleged resolved provider obligation.",
        }),
      )
    ).status,
  ).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("refuses a blanket or multi-quote clearance before any clearance is recorded", async () => {
  expect(
    (
      await POST(
        request({
          action: "clear-all",
          confirmObligationsResolved: true,
          evidence: "Provider links retired and invoices resolved with evidence.",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          action: "clearance",
          targetIds: [
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222",
          ],
          confirmObligationsResolved: true,
          evidence: "Provider links retired and invoices resolved with evidence.",
        }),
      )
    ).status,
  ).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("derives bank account and actor on the server instead of trusting supplied identities", async () => {
  expect(
    (
      await POST(
        request({
          action: "bank",
          account: "acct_wrong",
          actor: "wrong",
          payoutId: "po_one",
          bankTransactionId: "bank-one",
          bankDate: "2026-11-20",
          amountCents: 9700,
          evidence: "Exact posted bank receipt",
        }),
      )
    ).status,
  ).toBe(200);
  expect(rpc).toHaveBeenCalledWith(
    "match_stripe_bank",
    expect.objectContaining({
      p_account: "acct_fixture",
      p_actor: "owner@example.test",
      p_amount: 9700,
    }),
  );
});
