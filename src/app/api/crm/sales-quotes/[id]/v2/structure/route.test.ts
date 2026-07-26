import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  parseBody: vi.fn(),
  mutateStructure: vi.fn(),
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
  parseSalesQuoteV2StructureBody: mocks.parseBody,
  mutateSalesQuoteV2Structure: mocks.mutateStructure,
}));

import { POST } from "./route";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";

describe("POST authoritative Quote V2 structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCrmUser.mockResolvedValue({
      supabase: { service: true },
      user: { id: ACTOR_ID },
    });
    mocks.parseBody.mockReturnValue({
      expectedRevision: 1,
      idempotencyKey: "structure:route:test",
      operations: [
        {
          type: "line.create",
          lineItemId: LINE_ID,
          patch: {
            roomName: "Living Room",
            productType: "Roller Shades",
            widthWhole: 30,
            widthFraction: "0",
            heightWhole: 48,
            heightFraction: "0",
            quantity: 1,
            sortOrder: 0,
          },
        },
      ],
    });
    mocks.mutateStructure.mockResolvedValue({
      backend: "authoritative_v2",
      quoteId: QUOTE_ID,
      revision: 2,
      status: "draft",
      quoteV2Status: "stale",
      lineCount: 1,
      selectedDesigns: { [LINE_ID]: null },
      operations: [{ index: 1, type: "line.create", lineItemId: LINE_ID }],
    });
  });

  it("authenticates and delegates only normalized structure plus the actor", async () => {
    const rawBody = {
      expectedRevision: 1,
      idempotencyKey: "structure:route:test",
      operations: [
        {
          type: "line.create",
          lineItemId: LINE_ID,
          patch: {
            roomName: "Living Room",
            productType: "Roller Shades",
          },
        },
      ],
    };
    const request = new NextRequest(
      `http://localhost/api/crm/sales-quotes/${QUOTE_ID}/v2/structure`,
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
    expect(mocks.mutateStructure).toHaveBeenCalledWith(
      { service: true },
      QUOTE_ID,
      ACTOR_ID,
      mocks.parseBody.mock.results[0]?.value,
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        backend: "authoritative_v2",
        revision: 2,
      }),
    );
  });
});
