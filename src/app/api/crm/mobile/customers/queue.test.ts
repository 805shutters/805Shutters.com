import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { requireCrmUser } from "@/lib/crm/auth";
import { loadCrmDashboardData } from "@/lib/crm/backend";
import { buildMobilePaymentQueue } from "@/lib/crm/mobile-payment-queue";
import { sendSquareOrderPaymentLink } from "@/lib/crm/square-payment-links";
vi.mock("@/lib/crm/auth", async original => ({ ...await original<typeof import("@/lib/crm/auth")>(), requireCrmUser: vi.fn() }));
vi.mock("@/lib/crm/backend", () => ({ loadCrmDashboardData: vi.fn() }));
vi.mock("@/lib/crm/mobile-payment-queue", async original => ({ ...await original<typeof import("@/lib/crm/mobile-payment-queue")>(), buildMobilePaymentQueue: vi.fn() }));
vi.mock("@/lib/crm/square-payment-links", async original => ({ ...await original<typeof import("@/lib/crm/square-payment-links")>(), sendSquareOrderPaymentLink: vi.fn() }));
const body = { quoteId: "q1", jobId: "j1", paymentType: "balance", channel: "text", idempotencyKey: "11111111-1111-4111-8111-111111111111", expectedAmount: 500, expectedRecipient: "8055551212" };
let from: ReturnType<typeof vi.fn>;
let insert: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); insert = vi.fn().mockResolvedValue({ error: null });
  from = vi.fn(table => {
    const data = table === "crm_quotes" ? { id: "q1", job_id: "j1", customer_phone: "8055551212" } : table === "crm_jobs" ? { id: "j1", phone: "8055551212", meta: {} } : null;
    const chain = { eq: vi.fn(() => chain), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    return { select: () => chain, insert, update: () => chain };
  });
  vi.mocked(requireCrmUser).mockResolvedValue({ supabase: { from }, email: "staff@example.test", user: { id: "staff" } } as never);
  vi.mocked(loadCrmDashboardData).mockResolvedValue({} as never);
  vi.mocked(buildMobilePaymentQueue).mockReturnValue([{ id: "row:q1", name: "Ada", priority: true, activePayment: true, archived: false }] as never);
  vi.mocked(sendSquareOrderPaymentLink).mockResolvedValue({ paymentType: "balance", amount: 500, url: "https://square.example.test/pay", linkId: "link", providerStatus: "queued" } as never);
});
const post = (data: Record<string, unknown> = body) => POST(new NextRequest("http://localhost/api/crm/mobile/customers", { method: "POST", body: JSON.stringify(data) }));
describe("mobile payment API", () => {
  it("requires authentication and loads the shared queue even without a search", async () => {
    const response = await GET(new NextRequest("http://localhost/api/crm/mobile/customers"));
    expect(requireCrmUser).toHaveBeenCalledOnce();
    expect(loadCrmDashboardData).toHaveBeenCalledOnce();
    expect((await response.json()).results).toHaveLength(1);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("returns paid or closed records only for a manual search", async () => {
    vi.mocked(buildMobilePaymentQueue).mockReturnValue([{ id: "paid", name: "Paid Customer", activePayment: false, closed: true, outstanding: 0 }] as never);
    expect((await (await GET(new NextRequest("http://localhost/api/crm/mobile/customers"))).json()).results).toEqual([]);
    expect((await (await GET(new NextRequest("http://localhost/api/crm/mobile/customers?q=Paid"))).json()).results).toHaveLength(1);
  });
  it("does not read customer data if authentication fails", async () => {
    vi.mocked(requireCrmUser).mockRejectedValue(new Error("No session"));
    await GET(new NextRequest("http://localhost/api/crm/mobile/customers"));
    expect(loadCrmDashboardData).not.toHaveBeenCalled();
  });
  it("passes the reviewed amount and normalized recipient through to the audited sender", async () => {
    expect((await post()).status).toBe(200);
    expect(insert).toHaveBeenCalledOnce();
    expect(sendSquareOrderPaymentLink).toHaveBeenCalledWith(expect.anything(), "q1", "balance", expect.anything(), "+18055551212", expect.objectContaining({ channel: "text" }), { expectedAmount: 500, expectedRecipient: "+18055551212" });
  });
  it("rejects a changed recipient before reserving or sending", async () => {
    expect((await post({ ...body, expectedRecipient: "8055559999" })).status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
    expect(sendSquareOrderPaymentLink).not.toHaveBeenCalled();
  });
  it("rejects an unreviewed request before sending", async () => {
    expect((await post({ ...body, expectedAmount: 0 })).status).toBe(400);
    expect(sendSquareOrderPaymentLink).not.toHaveBeenCalled();
  });
});


describe("Payment Hub API requests", () => {
  it("allows an authenticated all-customers view without changing the mobile default", async () => {
    vi.mocked(buildMobilePaymentQueue).mockReturnValue([{ id: "paid", name: "Paid", activePayment: false, outstanding: 0 }] as never);
    expect((await (await GET(new NextRequest("http://localhost/api/crm/mobile/customers?scope=all"))).json()).results).toHaveLength(1);
  });
  it.each(["full", "custom"])("passes %s amount choice through the governed sender", async requestKind => {
    expect((await post({ ...body, requestKind, ...(requestKind === "custom" ? { customAmount: 500 } : {}) })).status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, status: "sending" }));
    expect(sendSquareOrderPaymentLink).toHaveBeenCalledWith(expect.anything(), "q1", "balance", expect.anything(), "+18055551212", expect.anything(), expect.objectContaining({ requestKind, expectedAmount: 500 }));
  });
  it.each([
    { requestKind: "custom" }, { requestKind: "full", customAmount: 500 },
    { requestKind: "custom", customAmount: 200 }, { requestKind: "deposit", paymentType: "balance" },
    { requestKind: "invalid" }, { expectedAmount: 2.222 },
    { requestKind: "full", collectionMode: "full" },
  ])("rejects malformed amount options before external effects: %j", async patch => {
    expect((await post({ ...body, ...patch })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    expect(sendSquareOrderPaymentLink).not.toHaveBeenCalled();
  });
});
