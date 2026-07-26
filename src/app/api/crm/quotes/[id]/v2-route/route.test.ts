import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  resolveRoute: vi.fn(),
}));

vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.requireCrmUser,
  crmAuthErrorResponse: (error: unknown) =>
    NextResponse.json(
      { message: error instanceof Error ? error.message : "CRM request failed." },
      { status: 500 },
    ),
}));

vi.mock("@/lib/crm/sales-quote-v2-route-resolver", () => ({
  resolveSalesQuoteV2Route: mocks.resolveRoute,
}));

import { GET } from "./route";

const CRM_QUOTE_ID = "11111111-1111-4111-8111-111111111111";

describe("GET CRM quote V2 route resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({ supabase: { service: true } });
    mocks.resolveRoute.mockResolvedValue({
      status: "legacy_import_required",
      crmQuoteId: CRM_QUOTE_ID,
      salesQuoteId: "22222222-2222-4222-8222-222222222222",
      reason: "target_not_found",
    });
  });

  it("authenticates and resolves the target without changing quote data", async () => {
    const request = new NextRequest(
      `http://localhost/api/crm/quotes/${CRM_QUOTE_ID}/v2-route`,
      {
        method: "GET",
        headers: { authorization: "Bearer test-token" },
      },
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: CRM_QUOTE_ID }),
    });

    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(mocks.resolveRoute).toHaveBeenCalledWith(
      { service: true },
      CRM_QUOTE_ID,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "legacy_import_required",
      reason: "target_not_found",
    });
  });
});
