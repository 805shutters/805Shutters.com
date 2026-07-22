import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  gate: vi.fn(),
  parseBody: vi.fn(),
  preview: vi.fn(),
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

vi.mock("@/lib/crm/sales-quote-v2-legacy-reprice", () => ({
  assertLegacyV2RepriceRuntimeEnabled: mocks.gate,
  parseLegacyV2RepricePreviewBody: mocks.parseBody,
  previewLegacySalesQuoteV2Reprice: mocks.preview,
}));

import { POST } from "./route";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const DESIGN_ID = "33333333-3333-4333-8333-333333333333";

describe("POST legacy quote V2 reprice preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockReset();
    mocks.requireCrmUser.mockResolvedValue({
      supabase: { service: true },
      user: { id: ACTOR_ID },
    });
    mocks.parseBody.mockReturnValue({
      expectedRevision: 0,
      idempotencyKey: "legacy-preview:route",
      selectedDesigns: [{ lineItemId: LINE_ID, designId: DESIGN_ID }],
    });
    mocks.preview.mockResolvedValue({
      backend: "authoritative_v2",
      mode: "legacy_reprice_preview",
      quoteId: QUOTE_ID,
      canApply: true,
      previewId: "55555555-5555-4555-8555-555555555555",
      lines: [],
    });
  });

  it("authenticates and delegates only parsed identities and the authenticated actor", async () => {
    const rawBody = {
      expectedRevision: 0,
      idempotencyKey: "legacy-preview:route",
      selectedDesigns: [{ lineItemId: LINE_ID, designId: DESIGN_ID }],
    };
    const request = new NextRequest(
      `http://localhost/api/crm/sales-quotes/${QUOTE_ID}/v2/legacy-reprice/preview`,
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
    expect(mocks.gate).toHaveBeenCalledOnce();
    expect(mocks.parseBody).toHaveBeenCalledWith(rawBody);
    expect(mocks.preview).toHaveBeenCalledWith(
      { service: true },
      {
        quoteId: QUOTE_ID,
        actorId: ACTOR_ID,
        ...mocks.parseBody.mock.results[0].value,
      },
    );
  });

  it("fails closed before parsing or pricing when runtime cutover is disabled", async () => {
    mocks.gate.mockImplementation(() => {
      const error = new Error("Legacy V2 repricing is disabled") as Error & {
        status: number;
      };
      error.status = 409;
      throw error;
    });
    const request = new NextRequest(
      `http://localhost/api/crm/sales-quotes/${QUOTE_ID}/v2/legacy-reprice/preview`,
      { method: "POST", headers: { authorization: "Bearer test-token" } },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: QUOTE_ID }),
    });
    expect(response.status).toBe(409);
    expect(mocks.parseBody).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
