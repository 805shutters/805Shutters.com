import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  parseBody: vi.fn(),
  createDraft: vi.fn(),
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

vi.mock("@/lib/crm/sales-quote-v2-structure", () => ({
  parseCreateSalesQuoteV2DraftBody: mocks.parseBody,
  createSalesQuoteV2Draft: mocks.createDraft,
}));

import { POST } from "./route";

const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const QUOTE_ID = "11111111-1111-4111-8111-111111111111";

describe("POST authoritative Quote V2 draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({
      supabase: { service: true },
      user: { id: ACTOR_ID },
    });
    mocks.parseBody.mockReturnValue({
      idempotencyKey: "draft:create:route",
      quotePatch: { customerName: "Test Customer" },
    });
    mocks.createDraft.mockResolvedValue({
      backend: "authoritative_v2",
      quoteId: QUOTE_ID,
      quoteNumber: "805-9999",
      revision: 1,
      status: "draft",
      quoteV2Status: "draft",
      lineCount: 0,
    });
  });

  it("authenticates, parses a price-free request, and returns the server draft", async () => {
    const rawBody = {
      idempotencyKey: "draft:create:route",
      customerName: "Test Customer",
    };
    const request = new NextRequest(
      "http://localhost/api/crm/sales-quotes/v2",
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

    expect(response.status).toBe(201);
    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(mocks.parseBody).toHaveBeenCalledWith(rawBody);
    expect(mocks.createDraft).toHaveBeenCalledWith(
      { service: true },
      ACTOR_ID,
      {
        idempotencyKey: "draft:create:route",
        quotePatch: { customerName: "Test Customer" },
      },
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        backend: "authoritative_v2",
        quoteId: QUOTE_ID,
      }),
    );
  });
});
