import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  authorize: vi.fn(),
  parseBody: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("@/lib/crm/auth", () => {
  class MockCrmAuthError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    CrmAuthError: MockCrmAuthError,
    requireCrmUser: mocks.requireCrmUser,
    crmAuthErrorResponse: (error: unknown) => {
      const source = error as { status?: number; message?: string };
      return NextResponse.json(
        { message: source.message ?? "CRM request failed." },
        { status: source.status ?? 500 },
      );
    },
  };
});

vi.mock("@/lib/crm/sales-quote-v2-wholesale-ledger", () => ({
  assertSalesQuoteV2WholesaleLedgerAccess: mocks.authorize,
  parseSalesQuoteV2WholesaleLookupBody: mocks.parseBody,
  lookupPublishedSalesQuoteV2WholesaleCost: mocks.lookup,
}));

import { POST, dynamic, revalidate, runtime } from "./route";

describe("POST internal Quote V2 wholesale lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockImplementation(() => undefined);
    mocks.requireCrmUser.mockResolvedValue({
      supabase: { service: true },
      user: { id: "11111111-1111-4111-8111-111111111111" },
      email: "805shutters@gmail.com",
    });
    mocks.parseBody.mockReturnValue({
      manufacturerCode: "norman",
      productKey: "faux_wood_blinds",
      programKey: "smartprivacy_2in",
      styleKey: "smartprivacy",
      colorKey: "pure_white",
      width: 36,
      height: 60,
      options: {},
      asOf: "2026-07-26",
    });
    mocks.lookup.mockResolvedValue({
      status: "blocked",
      code: "WHOLESALE_VERSION_NOT_PUBLISHED",
    });
  });

  it("uses CRM Bearer auth, explicit cost authorization, and normalized input", async () => {
    const rawBody = {
      manufacturerCode: "Norman",
      productKey: "faux_wood_blinds",
      programKey: "smartprivacy_2in",
      dimensions: { width: 36, height: 60 },
    };
    const request = new NextRequest(
      "http://localhost/api/crm/quote-v2/wholesale/lookup",
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(rawBody),
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(mocks.authorize).toHaveBeenCalledWith("805shutters@gmail.com");
    expect(mocks.parseBody).toHaveBeenCalledWith(rawBody);
    expect(mocks.lookup).toHaveBeenCalledWith(
      { service: true },
      mocks.parseBody.mock.results[0]?.value,
    );
    expect(await response.json()).toEqual({
      status: "blocked",
      code: "WHOLESALE_VERSION_NOT_PUBLISHED",
    });
  });

  it("never allows an intermediary or browser cache to retain internal cost", async () => {
    const request = new NextRequest(
      "http://localhost/api/crm/quote-v2/wholesale/lookup",
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    const response = await POST(request);

    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
  });

  it("stops before parsing or lookup when the account is not cost-authorized", async () => {
    mocks.authorize.mockImplementation(() => {
      const error = new Error(
        "Wholesale cost lookup is restricted to authorized 805 pricing accounts.",
      ) as Error & { status: number };
      error.status = 403;
      throw error;
    });
    const request = new NextRequest(
      "http://localhost/api/crm/quote-v2/wholesale/lookup",
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ wholesaleUnitCostCents: 1 }),
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.parseBody).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects malformed JSON without calling the ledger", async () => {
    const request = new NextRequest(
      "http://localhost/api/crm/quote-v2/wholesale/lookup",
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: "{",
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "A valid JSON request object is required.",
    });
    expect(mocks.parseBody).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
