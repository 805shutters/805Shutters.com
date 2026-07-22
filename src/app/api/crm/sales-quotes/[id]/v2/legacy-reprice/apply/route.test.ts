import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  parseBody: vi.fn(),
  apply: vi.fn(),
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
  parseLegacyV2RepriceApplyBody: mocks.parseBody,
  applyLegacySalesQuoteV2Reprice: mocks.apply,
}));

import { POST } from "./route";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const PREVIEW_ID = "55555555-5555-4555-8555-555555555555";
const PREVIEW_DIGEST = `sha256:${"a".repeat(64)}`;

describe("POST explicit legacy quote V2 reprice apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({
      supabase: { service: true },
      user: { id: ACTOR_ID },
    });
    mocks.parseBody.mockReturnValue({
      expectedRevision: 0,
      idempotencyKey: "legacy-apply:route",
      previewId: PREVIEW_ID,
      previewDigest: PREVIEW_DIGEST,
      confirmation: "APPLY_V2_REPRICE",
    });
    mocks.apply.mockResolvedValue({
      backend: "authoritative_v2",
      mode: "legacy_reprice_applied",
      quoteId: QUOTE_ID,
      previewId: PREVIEW_ID,
      revision: 1,
      quoteStatus: "priced",
      quoteTotal: 432,
      pricedDesignCount: 1,
      blockedDesignCount: 0,
      lines: [],
    });
  });

  it("requires auth and passes only the parsed preview proof plus authenticated actor", async () => {
    const rawBody = {
      expectedRevision: 0,
      idempotencyKey: "legacy-apply:route",
      previewId: PREVIEW_ID,
      previewDigest: PREVIEW_DIGEST,
      confirmation: "APPLY_V2_REPRICE",
    };
    const request = new NextRequest(
      `http://localhost/api/crm/sales-quotes/${QUOTE_ID}/v2/legacy-reprice/apply`,
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
    expect(mocks.apply).toHaveBeenCalledWith(
      { service: true },
      {
        quoteId: QUOTE_ID,
        actorId: ACTOR_ID,
        ...mocks.parseBody.mock.results[0].value,
      },
    );
  });
});
