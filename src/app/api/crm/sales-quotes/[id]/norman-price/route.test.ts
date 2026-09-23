import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocked = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/crm/auth", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/crm/auth")>(), requireCrmUser: mocked.auth }));
vi.mock("@/lib/crm/sales-quote-norman-price", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/crm/sales-quote-norman-price")>(), saveNormanLegacyPricing: mocked.save }));
import { CrmAuthError } from "@/lib/crm/auth";
import { POST } from "./route";

describe("authenticated Norman grid pricing route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocked.auth.mockResolvedValue({ supabase: "server-client", user: { id: "actor" } }); mocked.save.mockResolvedValue({ quoteId: "quote", total: 423, pricedDesignCount: 1, blockedDesignCount: 0 }); });
  const request = (body: unknown) => new NextRequest("http://localhost/api/crm/sales-quotes/quote/norman-price", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  it("uses only authenticated identity and saved quote data", async () => {
    const response = await POST(request({}), { params: Promise.resolve({ id: "quote" }) });
    expect(response.status).toBe(200);
    expect(mocked.save).toHaveBeenCalledWith("server-client", { quoteId: "quote", actorId: "actor" });
    expect(await response.json()).toEqual({ quoteId: "quote", total: 423, pricedDesignCount: 1, blockedDesignCount: 0 });
  });
  it.each([401, 403])("does not calculate or save for rejected authentication %i", async status => {
    mocked.auth.mockRejectedValue(new CrmAuthError(status, "Session or write access required."));
    expect((await POST(request({}), { params: Promise.resolve({ id: "quote" }) })).status).toBe(status);
    expect(mocked.save).not.toHaveBeenCalled();
  });
  it("rejects supplied prices before invoking persistence", async () => {
    expect((await POST(request({ total: 1, catalogDate: "2027-01-01" }), { params: Promise.resolve({ id: "quote" }) })).status).toBe(400);
    expect(mocked.save).not.toHaveBeenCalled();
  });
  it("retains an actionable conflict response", async () => {
    mocked.save.mockRejectedValue(new CrmAuthError(409, "Quote changed. Reload current selections."));
    const response = await POST(request({}), { params: Promise.resolve({ id: "quote" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "Quote changed. Reload current selections." });
  });
});
