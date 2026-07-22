import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/lib/quote-lab/test-database", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/quote-lab/test-database")
  >();
  return {
    ...original,
    sharedQuoteV2TestDatabase: () => ({
      load: mocks.load,
      save: mocks.save,
      reset: mocks.reset,
    }),
  };
});

import {
  QUOTE_LAB_COOKIE,
  QUOTE_LAB_WORKSPACE_COOKIE,
  quoteLabSessionToken,
  quoteLabWorkspaceId,
} from "@/lib/quote-lab/auth";
import { QuoteLabRevisionConflictError } from "@/lib/quote-lab/test-database";
import { GET, POST } from "./route";

const originalCode = process.env.QUOTE_LAB_ACCESS_CODE;
const NONCE_A = "a".repeat(64);
const NONCE_B = "b".repeat(64);

function request(
  method: "GET" | "POST",
  options: { nonce?: string; body?: unknown; auth?: string } = {},
) {
  const cookies = [
    `${QUOTE_LAB_COOKIE}=${options.auth ?? quoteLabSessionToken()}`,
    options.nonce
      ? `${QUOTE_LAB_WORKSPACE_COOKIE}=${options.nonce}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");
  return new NextRequest("http://localhost/api/quote-lab/state", {
    method,
    headers: {
      cookie: cookies,
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(options.body ?? {}) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.QUOTE_LAB_ACCESS_CODE = "state-route-test-code";
  mocks.load.mockReturnValue(null);
  mocks.reset.mockImplementation(
    (_workspaceId: string, state: unknown, expectedRevision: number) => ({
      state,
      revision: expectedRevision + 1,
      updatedAt: "2026-07-22T23:01:00.000Z",
    }),
  );
});

describe("Quote Lab state workspace API", () => {
  it("requires both valid auth and the random workspace cookie", async () => {
    expect((await GET(request("GET"))).status).toBe(401);
    expect(
      (
        await GET(
          request("GET", { nonce: NONCE_A, auth: "0".repeat(64) }),
        )
      ).status,
    ).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("uses different database rows for different unlock nonces", async () => {
    const firstRequest = request("GET", { nonce: NONCE_A });
    const secondRequest = request("GET", { nonce: NONCE_B });
    const firstId = quoteLabWorkspaceId(firstRequest);
    const secondId = quoteLabWorkspaceId(secondRequest);
    await GET(firstRequest);
    await GET(secondRequest);
    expect(firstId).toMatch(/^[a-f0-9]{64}$/);
    expect(secondId).not.toBe(firstId);
    expect(mocks.load.mock.calls).toEqual([[firstId], [secondId]]);
  });

  it("server-generates a complete empty run and submits only it to reset", async () => {
    const req = request("POST", {
      nonce: NONCE_A,
      body: { expectedRevision: 0 },
    });
    const workspaceId = quoteLabWorkspaceId(req);
    const response = await POST(req);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(payload.quoteNumber).toBe(`V2-${payload.runId}`);
    expect(payload.revision).toBe(1);
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    const [savedWorkspaceId, savedState, expectedRevision] =
      mocks.reset.mock.calls[0];
    expect(savedWorkspaceId).toBe(workspaceId);
    expect(expectedRevision).toBe(0);
    expect(savedState).toMatchObject({
      quotes: [
        {
          id: "quote-lab-exact",
          quote_number: `V2-${payload.runId}`,
          status: "draft",
          total_amount: 0,
        },
      ],
      lineItems: [],
      designs: [],
      selectedVariantByLine: {},
    });
    const note = JSON.parse(savedState.quotes[0].installer_notes);
    expect(note.__quoteLabRunId).toBe(payload.runId);
    expect(JSON.stringify(savedState)).not.toContain("TEST-805-40");
    expect(JSON.stringify(savedState)).not.toContain("quote-lab-line-1");
  });

  it("rejects client-supplied reset rows and stale revisions", async () => {
    const injected = await POST(
      request("POST", {
        nonce: NONCE_A,
        body: {
          expectedRevision: 0,
          state: { quotes: [{ customer_name: "Injected" }] },
        },
      }),
    );
    expect(injected.status).toBe(400);
    expect(mocks.reset).not.toHaveBeenCalled();

    mocks.reset.mockImplementationOnce(() => {
      throw new QuoteLabRevisionConflictError("stale reset");
    });
    const stale = await POST(
      request("POST", { nonce: NONCE_A, body: { expectedRevision: 7 } }),
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toEqual({ error: "stale reset" });
  });
});

afterEach(() => {
  if (originalCode === undefined) delete process.env.QUOTE_LAB_ACCESS_CODE;
  else process.env.QUOTE_LAB_ACCESS_CODE = originalCode;
});
