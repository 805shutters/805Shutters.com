import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/crm/auth", async (original) => ({
  ...(await original<typeof import("@/lib/crm/auth")>()),
  requireCrmUser: mocks.auth,
}));
vi.mock("@/lib/crm/sales-quote-v2-alternatives", async (original) => ({
  ...(await original<typeof import("@/lib/crm/sales-quote-v2-alternatives")>()),
  createSalesQuoteAlternative: mocks.create,
}));
import { CrmAuthError } from "@/lib/crm/auth";
import { POST } from "./route";
const context = { params: Promise.resolve({ id: "source-id" }) };
const body = {
  mode: "blank",
  idempotencyKey: "alternative:route:1",
  expectedRevision: 3,
};
const request = (value = body) =>
  new NextRequest(
    "https://example.com/api/crm/sales-quotes/source-id/v2/alternatives",
    { method: "POST", body: JSON.stringify(value) },
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    supabase: "server-client",
    user: { id: "actor-id" },
  });
  mocks.create.mockResolvedValue({
    quote: { id: "new-id", quote_letter: "B" },
  });
});
describe("V2 alternative route", () => {
  it("passes only validated mode and revision to the authenticated server operation", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      "server-client",
      "actor-id",
      "source-id",
      body,
    );
    expect(await response.json()).toEqual({
      quote: { id: "new-id", quote_letter: "B" },
    });
  });
  it.each([401, 403])(
    "rejects unauthorized and read-only CRM users (%s)",
    async (status) => {
      mocks.auth.mockRejectedValue(new CrmAuthError(status, "Not permitted"));
      expect((await POST(request(), context)).status).toBe(status);
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it("rejects injected price fields before any operation", async () => {
    expect(
      (
        await POST(
          request({ ...body, total_amount: 5 } as typeof body),
          context,
        )
      ).status,
    ).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("returns actionable server errors to the button", async () => {
    mocks.create.mockRejectedValue(
      new CrmAuthError(409, "Refresh this quote."),
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "Refresh this quote." });
  });
});
