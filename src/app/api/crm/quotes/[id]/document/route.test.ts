import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  loadPublicQuoteById: vi.fn(),
}));

vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.requireCrmUser,
  crmAuthErrorResponse: (error: unknown) =>
    NextResponse.json({ message: error instanceof Error ? error.message : "CRM request failed." }, { status: 500 }),
}));

vi.mock("@/lib/crm/public-quote", () => ({
  loadPublicQuoteById: mocks.loadPublicQuoteById,
}));

import { GET } from "./route";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";

describe("GET authenticated customer-document preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({ supabase: { service: true } });
    mocks.loadPublicQuoteById.mockResolvedValue({ id: QUOTE_ID, quoteNumber: "805-0161-FUTURE" });
  });

  it("loads the CRM quote by exact id without creating or sharing a customer token", async () => {
    const request = new NextRequest(`http://localhost/api/crm/quotes/${QUOTE_ID}/document`, {
      headers: { authorization: "Bearer test-token" },
    });
    const response = await GET(request, { params: Promise.resolve({ id: QUOTE_ID }) });

    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(mocks.loadPublicQuoteById).toHaveBeenCalledWith({ service: true }, QUOTE_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ quote: { id: QUOTE_ID, quoteNumber: "805-0161-FUTURE" } });
  });

  it("returns 404 so authenticated sales quotes can use their standalone customer contract", async () => {
    mocks.loadPublicQuoteById.mockResolvedValue(null);
    const request = new NextRequest(`http://localhost/api/crm/quotes/${QUOTE_ID}/document`, {
      headers: { authorization: "Bearer test-token" },
    });
    const response = await GET(request, { params: Promise.resolve({ id: QUOTE_ID }) });

    expect(response.status).toBe(404);
  });
});
