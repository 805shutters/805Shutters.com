import { beforeEach, expect, it, vi } from "vitest";
import {
  createStripePaymentLink,
  retireStripePaymentLink,
  synchronizeStripeRequest,
  stripeReservationError,
  type RequestRow,
} from "./stripe-collection";
import { stripeRequest, verifyStripeAccount } from "@/lib/finance/stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("@/lib/finance/stripe", async () => ({
  ...(await vi.importActual("@/lib/finance/stripe")),
  stripeRequest: vi.fn(),
  verifyStripeAccount: vi.fn(),
}));
vi.mock("./square-collection-retirement", () => ({ retireLegacySquareRequests: vi.fn() }));
import { retireLegacySquareRequests } from "./square-collection-retirement";
const input = {
  amountCents: 50000,
  title: "Deposit",
  quoteId: "quote",
  jobId: "job",
  paymentType: "deposit" as const,
};
const row = {
  id: "request",
  account_id: "acct_fixture",
  livemode: false,
  quote_id: "quote",
  bookkeeping_entry_id: null,
  job_id: "job",
  amount_cents: 50000,
  purpose: "deposit",
  status: "creating",
  session_id: null as string | null,
  payment_intent_id: null as string | null,
  url: null as string | null,
  created_at: new Date().toISOString(),
};
function database(request = { ...row }) {
  const chain: any = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: request, error: null }),
    then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
  };
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return {
    rpc: vi.fn().mockResolvedValue({ data: request, error: null }),
    from: vi.fn().mockReturnValue(chain),
  } as unknown as SupabaseClient;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyStripeAccount).mockResolvedValue({
    account: "acct_fixture",
    livemode: false,
    key: "fixture",
    environment: "test",
  });
  vi.mocked(stripeRequest).mockResolvedValue({
    id: "cs_test_1",
    url: "https://checkout.stripe.com/c/pay/fixture",
    livemode: false,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
});
it("uses durable request identity as idempotency and never creates an invoice or sends a message", async () => {
  const db = database();
  const a = await createStripePaymentLink(db, input),
    b = await createStripePaymentLink(db, {
      ...input,
      title: "Changed customer label",
    });
  expect(a).toEqual(b);
  const calls = vi.mocked(stripeRequest).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][0]).toBe("/v1/checkout/sessions");
  expect(calls[0][1]?.idempotencyKey).toBe(calls[1][1]?.idempotencyKey);
  expect(calls[0][1]?.form?.toString()).toBe(calls[1][1]?.form?.toString());
  expect(calls[0][1]?.form?.get("allowed_payment_method_types[0]")).toBe("card");
  expect(calls[0][1]?.form?.has("payment_method_types[0]")).toBe(false);
  expect(calls[0][1]?.form?.get("integration_identifier")).toMatch(
    /^805-crm-hosted-cards-[a-z]{8}$/,
  );
});
it("refuses uncertain old creates and invalid amount before provider side effects", async () => {
  await expect(
    createStripePaymentLink(
      database({ ...row, created_at: "2020-01-01" }),
      input,
    ),
  ).rejects.toThrow("older checkout");
  await expect(
    createStripePaymentLink(database(), { ...input, amountCents: 1.2 }),
  ).rejects.toThrow("integer amount");
  expect(stripeRequest).not.toHaveBeenCalled();
});
it("fails closed if reservation cannot be saved", async () => {
  const db = database();
  vi.mocked(db.rpc).mockResolvedValue({
    data: null,
    error: { message: "blocked" },
  } as never);
  await expect(createStripePaymentLink(db, input)).rejects.toThrow("reserved");
  expect(stripeRequest).not.toHaveBeenCalled();
});
it.each([
  ["Existing Square requests require verified retirement or resolution before Stripe collection.", "Square clearance review"],
  ["Amount exceeds current balance.", "exceeds the current balance"],
  ["Existing card request must be reconciled and expired before replacement.", "reconciled and expired"],
  ["Exact active job ledger is required.", "active customer order"],
])("reports reservation rejection before any checkout is created: %s", async (message, expected) => {
  const db = database();
  vi.mocked(db.rpc).mockResolvedValue({ data: null, error: { code: "P0001", message } } as never);
  await expect(createStripePaymentLink(db, input)).rejects.toMatchObject({
    status: 409, message: expect.stringContaining(expected),
  });
  expect(stripeRequest).not.toHaveBeenCalled();
});
it("does not expose unexpected database messages or classify infrastructure errors as business conflicts", () => {
  for (const error of [
    { code: "XX000", message: "private database details" },
    { code: "P0001", message: "unrecognized internal error" },
    { code: "08006", message: "Amount exceeds current balance." },
  ]) {
    const result = stripeReservationError(error);
    expect(result.status).toBe(502);
    expect(result.message).toContain("Payment link was not sent.");
    expect(result.message).not.toContain(error.message);
  }
});
it("does not expire a paid or mismatched checkout", async () => {
  const existing = { ...row, session_id: "cs_test_1" };
  vi.mocked(stripeRequest).mockResolvedValue({
    id: "cs_test_1",
    livemode: false,
    metadata: { crm_request_id: "wrong" },
    amount_total: 50000,
    currency: "usd",
    status: "open",
  });
  await expect(
    retireStripePaymentLink(database(existing), "cs_test_1"),
  ).rejects.toThrow("does not match");
  expect(
    vi
      .mocked(stripeRequest)
      .mock.calls.some(([url]) => url.endsWith("/expire")),
  ).toBe(false);
});

it("holds a successful live payment when ledger allocation fails instead of opening another obligation", async () => {
  const live = {
    ...row,
    livemode: true,
    session_id: "cs_live",
    fingerprint: "f",
  };
  vi.mocked(verifyStripeAccount).mockResolvedValue({
    account: "acct_fixture",
    livemode: true,
    key: "fixture",
    environment: "live",
  });
  vi.mocked(stripeRequest)
    .mockResolvedValueOnce({
      id: "cs_live",
      livemode: true,
      metadata: { crm_request_id: row.id },
      amount_total: 50000,
      currency: "usd",
      payment_intent: "pi_live",
      status: "complete",
    })
    .mockResolvedValueOnce({
      id: "pi_live",
      livemode: true,
      metadata: { crm_request_id: row.id },
      amount: 50000,
      amount_received: 50000,
      currency: "usd",
      status: "succeeded",
      created: 1700000000,
      latest_charge: { amount_refunded: 0, disputed: false },
    });
  const db = database(live);
  vi.mocked(db.rpc).mockResolvedValue({
    error: { message: "db unavailable" },
    data: null,
  } as never);
  await expect(
    synchronizeStripeRequest(db, live as RequestRow),
  ).rejects.toThrow("allocation needs review");
  const updates = (
    db.from("crm_stripe_requests").update as ReturnType<typeof vi.fn>
  ).mock.calls;
  expect(updates.some(([value]) => value.status === "review")).toBe(true);
  expect(updates.some(([value]) => value.status === "paid")).toBe(false);
});
it("expires an open checkout when another receipt reduced the shared balance", async () => {
  const open = { ...row, session_id: "cs_test", fingerprint: "f" };
  const db = database(open);
  vi.mocked(db.rpc).mockResolvedValue({ data: 10000, error: null } as never);
  vi.mocked(stripeRequest)
    .mockResolvedValueOnce({
      id: "cs_test",
      livemode: false,
      metadata: { crm_request_id: row.id },
      amount_total: 50000,
      currency: "usd",
      status: "open",
    })
    .mockResolvedValueOnce({ id: "cs_test", status: "expired" });
  expect((await synchronizeStripeRequest(db, open as RequestRow)).status).toBe(
    "expired",
  );
  expect(stripeRequest).toHaveBeenLastCalledWith(
    "/v1/checkout/sessions/cs_test/expire",
    expect.anything(),
  );
});

it("verifies legacy retirement and reserves the current balance again before live Stripe checkout", async () => {
  vi.mocked(verifyStripeAccount).mockResolvedValue({ account: "acct_fixture", livemode: true, key: "fixture", environment: "live" });
  vi.mocked(stripeRequest).mockResolvedValue({ id: "cs_live_fixture", url: "https://checkout.stripe.com/c/pay/fixture", livemode: true, expires_at: Math.floor(Date.now()/1000)+3600 });
  vi.mocked(retireLegacySquareRequests).mockResolvedValue({ retired: 1 });
  const db = database({ ...row, livemode: true });
  vi.mocked(db.rpc).mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Existing Square requests require verified retirement or resolution before Stripe collection." } } as never);
  await expect(createStripePaymentLink(db, input)).resolves.toMatchObject({ provider: "stripe" });
  expect(retireLegacySquareRequests).toHaveBeenCalledWith(db, { quoteId: "quote", bookkeepingEntryId: undefined, jobId: "job" });
  expect(db.rpc).toHaveBeenCalledTimes(2);
  expect(vi.mocked(retireLegacySquareRequests).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(stripeRequest).mock.invocationCallOrder[0]);
});
it("never creates Stripe checkout when historical retirement is unresolved", async () => {
  vi.mocked(verifyStripeAccount).mockResolvedValue({ account: "acct_fixture", livemode: true, key: "fixture", environment: "live" });
  vi.mocked(retireLegacySquareRequests).mockRejectedValueOnce(new Error("retirement unresolved"));
  const db = database();
  vi.mocked(db.rpc).mockResolvedValue({ data: null, error: { code: "P0001", message: "Existing Square requests require verified retirement or resolution before Stripe collection." } } as never);
  await expect(createStripePaymentLink(db, input)).rejects.toThrow("retirement unresolved");
  expect(stripeRequest).not.toHaveBeenCalled(); expect(db.rpc).toHaveBeenCalledTimes(1);
});
