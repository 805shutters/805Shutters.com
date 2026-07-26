import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  resolveRoute: vi.fn(),
  importQuote: vi.fn(),
}));

vi.mock("@/lib/crm/auth", () => ({
  requireCrmUser: mocks.requireCrmUser,
  CrmAuthError: class CrmAuthError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  crmAuthErrorResponse: (error: unknown) =>
    NextResponse.json(
      { message: error instanceof Error ? error.message : "CRM request failed." },
      { status: 500 },
    ),
}));

vi.mock("@/lib/crm/sales-quote-v2-route-resolver", () => ({
  resolveSalesQuoteV2Route: mocks.resolveRoute,
}));

vi.mock("@/lib/crm/sales-quote-v2-import", () => ({
  importCrmQuoteToSalesQuoteV2: mocks.importQuote,
}));

import { GET, POST } from "./route";

const CRM_QUOTE_ID = "11111111-1111-4111-8111-111111111111";

describe("GET CRM quote V2 route resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({
      supabase: { service: true },
      user: { id: "actor-id" },
    });
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

  it("imports the exact source structure before resolving the new typed target", async () => {
    mocks.importQuote.mockResolvedValue({
      backend: "authoritative_v2",
      crmQuoteId: CRM_QUOTE_ID,
      quoteId: "22222222-2222-4222-8222-222222222222",
      quoteNumber: "805-0010",
      lineCount: 2,
      designCount: 3,
    });
    mocks.resolveRoute
      .mockResolvedValueOnce({
        status: "legacy_import_required",
        crmQuoteId: CRM_QUOTE_ID,
        salesQuoteId: "22222222-2222-4222-8222-222222222222",
        reason: "target_structure_empty",
      })
      .mockResolvedValueOnce({
        status: "ready",
        crmQuoteId: CRM_QUOTE_ID,
        salesQuoteId: "22222222-2222-4222-8222-222222222222",
        lineCount: 2,
        designCount: 3,
      });
    const request = new NextRequest(
      `http://localhost/api/crm/quotes/${CRM_QUOTE_ID}/v2-route`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ idempotencyKey: "import-request" }),
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: CRM_QUOTE_ID }),
    });

    expect(mocks.importQuote).toHaveBeenCalledWith(
      { service: true },
      CRM_QUOTE_ID,
      "actor-id",
      "import-request",
      "22222222-2222-4222-8222-222222222222",
    );
    expect(mocks.resolveRoute).toHaveBeenCalledTimes(2);
    expect(mocks.resolveRoute).toHaveBeenCalledWith(
      { service: true },
      CRM_QUOTE_ID,
    );
    expect(await response.json()).toMatchObject({
      imported: { quoteNumber: "805-0010", lineCount: 2 },
      route: { status: "ready", designCount: 3 },
    });
  });

  it("creates a fresh V2 target when the stored target identity no longer exists", async () => {
    mocks.importQuote.mockResolvedValue({
      backend: "authoritative_v2",
      crmQuoteId: CRM_QUOTE_ID,
      quoteId: "33333333-3333-4333-8333-333333333333",
      quoteNumber: "805-0010",
      lineCount: 2,
      designCount: 3,
    });
    mocks.resolveRoute
      .mockResolvedValueOnce({
        status: "legacy_import_required",
        crmQuoteId: CRM_QUOTE_ID,
        salesQuoteId: "22222222-2222-4222-8222-222222222222",
        reason: "target_not_found",
      })
      .mockResolvedValueOnce({
        status: "ready",
        crmQuoteId: CRM_QUOTE_ID,
        salesQuoteId: "33333333-3333-4333-8333-333333333333",
        lineCount: 2,
        designCount: 3,
      });
    const request = new NextRequest(
      `http://localhost/api/crm/quotes/${CRM_QUOTE_ID}/v2-route`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ idempotencyKey: "missing-target-import" }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: CRM_QUOTE_ID }),
    });

    expect(mocks.importQuote).toHaveBeenCalledWith(
      { service: true },
      CRM_QUOTE_ID,
      "actor-id",
      "missing-target-import",
      null,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: {
        quoteId: "33333333-3333-4333-8333-333333333333",
      },
      route: {
        status: "ready",
        salesQuoteId: "33333333-3333-4333-8333-333333333333",
      },
    });
  });
});
