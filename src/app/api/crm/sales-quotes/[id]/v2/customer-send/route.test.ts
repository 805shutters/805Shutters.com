import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  runtimeGate: vi.fn(),
  parseBody: vi.fn(),
  prepare: vi.fn(),
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

vi.mock("@/lib/crm/sales-quote-v2-send-persist", () => ({
  assertV2CustomerSendPreparationRuntimeEnabled: mocks.runtimeGate,
  parseSalesQuoteV2CustomerSendBody: mocks.parseBody,
  prepareSalesQuoteV2CustomerSend: mocks.prepare,
}));

import { POST } from "./route";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";

describe("POST sales quote V2 customer-send preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtimeGate.mockReset();
    mocks.runtimeGate.mockImplementation(() => undefined);
    mocks.requireCrmUser.mockResolvedValue({
      supabase: { service: true },
      user: { id: ACTOR_ID },
    });
    mocks.parseBody.mockReturnValue({
      expectedRevision: 7,
      idempotencyKey: "v2-send:route-test",
      sentVia: "email",
    });
    mocks.prepare.mockResolvedValue({
      backend: "authoritative_v2",
      quoteId: QUOTE_ID,
      sendPreparationId: "55555555-5555-4555-8555-555555555555",
      crmQuoteId: "66666666-6666-4666-8666-666666666666",
      quoteRevision: 7,
      catalogVersion: "norman-roller-minmax-2026-08-01",
      total: 358,
      preparedAt: "2026-07-22T20:00:00.000Z",
      preparedVia: "email",
      customerPayload: {
        backend: "authoritative_v2",
        total: 358,
        lines: [],
      },
    });
  });

  function request(body: unknown) {
    return new NextRequest(
      `http://localhost/api/crm/sales-quotes/${QUOTE_ID}/v2/customer-send`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  }

  it("authenticates, checks the disabled-by-default gate, and passes only parsed intent plus server actor", async () => {
    const rawBody = {
      expectedRevision: 7,
      idempotencyKey: "v2-send:route-test",
      sentVia: "email",
    };
    const req = request(rawBody);
    const response = await POST(req, {
      params: Promise.resolve({ id: QUOTE_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireCrmUser).toHaveBeenCalledWith(req);
    expect(mocks.runtimeGate).toHaveBeenCalledTimes(1);
    expect(mocks.parseBody).toHaveBeenCalledWith(rawBody);
    expect(mocks.prepare).toHaveBeenCalledWith(
      { service: true },
      {
        quoteId: QUOTE_ID,
        expectedRevision: 7,
        idempotencyKey: "v2-send:route-test",
        sentVia: "email",
        actorId: ACTOR_ID,
      },
    );
    const payload = await response.json();
    expect(payload).toMatchObject({
      backend: "authoritative_v2",
      quoteId: QUOTE_ID,
      quoteRevision: 7,
      total: 358,
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /dealer.?cost|internal.?cost|landed.?cost|wholesale|margin|markup|multiplier/i,
    );
  });

  it("fails closed at the runtime gate before parsing or persistence", async () => {
    const { CrmAuthError } = await import("@/lib/crm/auth");
    mocks.runtimeGate.mockImplementation(() => {
      throw new CrmAuthError(409, "V2 customer-send persistence is disabled.");
    });
    const response = await POST(request({}), {
      params: Promise.resolve({ id: QUOTE_ID }),
    });

    expect(response.status).toBe(409);
    expect(mocks.parseBody).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("never reaches persistence when authentication fails", async () => {
    const { CrmAuthError } = await import("@/lib/crm/auth");
    mocks.requireCrmUser.mockRejectedValue(
      new CrmAuthError(401, "CRM session is required."),
    );
    const response = await POST(request({}), {
      params: Promise.resolve({ id: QUOTE_ID }),
    });

    expect(response.status).toBe(401);
    expect(mocks.runtimeGate).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("returns a safe client error for malformed JSON", async () => {
    const req = new NextRequest(
      `http://localhost/api/crm/sales-quotes/${QUOTE_ID}/v2/customer-send`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: "{not-json",
      },
    );
    const response = await POST(req, {
      params: Promise.resolve({ id: QUOTE_ID }),
    });
    expect(response.status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
