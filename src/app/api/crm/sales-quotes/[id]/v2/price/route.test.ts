import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  parseBody: vi.fn(),
  savePrice: vi.fn(),
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

vi.mock("@/lib/crm/sales-quote-v2-price-save", () => ({
  parseSalesQuoteV2PriceSaveBody: mocks.parseBody,
  saveSalesQuoteV2AuthoritativePrice: mocks.savePrice,
}));

import { POST } from "./route";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const DESIGN_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";

describe("POST sales quote V2 authoritative price", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({
      supabase: { service: true },
      user: { id: ACTOR_ID },
    });
    mocks.parseBody.mockReturnValue({
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      expectedRevision: 7,
      idempotencyKey: "price-save:route-test",
    });
    mocks.savePrice.mockResolvedValue({
      backend: "authoritative_v2",
      quoteId: QUOTE_ID,
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      revision: 8,
      quoteStatus: "priced",
      quoteTotal: 370.5,
      priceStatus: "authoritative",
      price: { ok: true, total: 370.5 },
      pricedDesignCount: 1,
      blockedDesignCount: 0,
      lines: [
        {
          lineItemId: LINE_ID,
          designId: DESIGN_ID,
          priceStatus: "authoritative",
          price: { ok: true, total: 370.5 },
        },
      ],
    });
  });

  it("authenticates first and passes only parsed identities plus the auth actor", async () => {
    const rawBody = {
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      expectedRevision: 7,
      idempotencyKey: "price-save:route-test",
    };
    const request = new NextRequest(
      `http://localhost/api/crm/sales-quotes/${QUOTE_ID}/v2/price`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(rawBody),
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: QUOTE_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireCrmUser).toHaveBeenCalledWith(request);
    expect(mocks.parseBody).toHaveBeenCalledWith(rawBody);
    expect(mocks.savePrice).toHaveBeenCalledWith(
      { service: true },
      {
        quoteId: QUOTE_ID,
        lineItemId: LINE_ID,
        designId: DESIGN_ID,
        expectedRevision: 7,
        idempotencyKey: "price-save:route-test",
        actorId: ACTOR_ID,
      },
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        backend: "authoritative_v2",
        priceStatus: "authoritative",
      }),
    );
  });
});
