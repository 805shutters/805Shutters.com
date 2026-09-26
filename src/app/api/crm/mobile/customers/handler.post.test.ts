import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./handler";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), send: vi.fn(), insert: vi.fn(), update: vi.fn(), prior: null as Record<string, unknown> | null }));
vi.mock("@/lib/crm/auth", async original => ({ ...await original<typeof import("@/lib/crm/auth")>(), requireCrmUser: mocks.auth }));
vi.mock("@/lib/crm/square-payment-links", async original => ({ ...await original<typeof import("@/lib/crm/square-payment-links")>(), sendSquareOrderPaymentLink: mocks.send }));
const body = { quoteId: "quote-1", jobId: "job-1", paymentType: "balance", channel: "email", idempotencyKey: "11111111-1111-4111-8111-111111111111", expectedRecipient: "customer@example.test", expectedAmount: 400, expectedOutstanding: 1001.2, collectionMode: "partial", customAmount: 400 };
const post = (patch: Record<string, unknown> = {}) => POST(new NextRequest("http://localhost/api/crm/mobile/customers", { method: "POST", body: JSON.stringify({ ...body, ...patch }) }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.prior = null;
  mocks.insert.mockResolvedValue({ error: null });
  mocks.update.mockImplementation(() => { const result = { eq: () => result, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }; return result; });
  const db = { from: (table: string) => ({
    insert: mocks.insert, update: mocks.update,
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: null, data: table === "crm_quotes" ? { id: "quote-1", job_id: "job-1", customer_email: "customer@example.test" } : table === "crm_jobs" ? { id: "job-1", email: "customer@example.test" } : table === "crm_payment_link_send_requests" ? mocks.prior : null }) }) }),
  }) };
  mocks.auth.mockResolvedValue({ supabase: db, email: "staff@example.test", user: { id: "staff" } });
  mocks.send.mockResolvedValue({ amount: 400, remainingAfterPayment: 601.2, paymentType: "balance", linkId: "fixture", url: "https://example.test/pay", providerStatus: "accepted" });
});
describe("mobile amount selection POST", () => {
  it("passes the reviewed split through to the Square service and reserves its exact amount", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ amount: 400, remainingAfterPayment: 601.2, deliveryState: "accepted" });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 400, payment_type: "balance" }));
    expect(mocks.send.mock.calls[0][6]).toEqual({ expectedAmount: 400, expectedRecipient: "customer@example.test", collectionMode: "partial", customAmount: 400, expectedOutstanding: 1001.2 });
  });
  it("supports the full balance without a custom amount", async () => {
    expect((await post({ collectionMode: "full", customAmount: undefined, expectedAmount: 1001.2 })).status).toBe(200);
    expect(mocks.send.mock.calls[0][6]).toMatchObject({ collectionMode: "full", expectedAmount: 1001.2, expectedOutstanding: 1001.2 });
  });
  it.each([{ collectionMode: "other" }, { paymentType: "deposit" }, { collectionMode: "full" }, { expectedAmount: 0 }])("rejects invalid requests before reserving or sending: %j", async patch => {
    expect((await post(patch)).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("replays an accepted request once and rejects a changed amount on the same key", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    mocks.prior = { quote_id: "quote-1", job_id: "job-1", payment_type: "balance", channel: "email", recipient: "customer@example.test", amount: 400, status: "accepted" };
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ replayed: true, amount: 400 });
    expect((await post({ expectedAmount: 401, customAmount: 401 })).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
