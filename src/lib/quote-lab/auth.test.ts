import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  QUOTE_LAB_COOKIE,
  QUOTE_LAB_WORKSPACE_COOKIE,
  QuoteLabConfigurationError,
  createQuoteLabWorkspaceNonce,
  quoteLabSessionToken,
  quoteLabWorkspaceId,
  verifyQuoteLabAccessCode,
} from "./auth";

const originalCode = process.env.QUOTE_LAB_ACCESS_CODE;

afterEach(() => {
  if (originalCode === undefined) delete process.env.QUOTE_LAB_ACCESS_CODE;
  else process.env.QUOTE_LAB_ACCESS_CODE = originalCode;
});

describe("Quote Lab access boundary", () => {
  it("fails closed when the deployment has no access code", () => {
    delete process.env.QUOTE_LAB_ACCESS_CODE;
    expect(() => quoteLabSessionToken()).toThrow(QuoteLabConfigurationError);
  });

  it("accepts only the configured code", () => {
    process.env.QUOTE_LAB_ACCESS_CODE = "correct-horse-battery-staple";
    expect(verifyQuoteLabAccessCode("correct-horse-battery-staple")).toBe(true);
    expect(verifyQuoteLabAccessCode("wrong")) .toBe(false);
    expect(quoteLabSessionToken()).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates a cryptographically random workspace nonce for every unlock", () => {
    const first = createQuoteLabWorkspaceNonce();
    const second = createQuoteLabWorkspaceNonce();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  it("binds workspace identity to both the valid auth token and random nonce", () => {
    process.env.QUOTE_LAB_ACCESS_CODE = "correct-horse-battery-staple";
    const session = quoteLabSessionToken();
    const request = (nonce?: string, auth = session) =>
      new NextRequest("http://localhost/api/quote-lab/state", {
        headers: {
          cookie: [
            `${QUOTE_LAB_COOKIE}=${auth}`,
            nonce ? `${QUOTE_LAB_WORKSPACE_COOKIE}=${nonce}` : null,
          ]
            .filter(Boolean)
            .join("; "),
        },
      });

    const first = quoteLabWorkspaceId(request("a".repeat(64)));
    const repeated = quoteLabWorkspaceId(request("a".repeat(64)));
    const second = quoteLabWorkspaceId(request("b".repeat(64)));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(repeated).toBe(first);
    expect(second).not.toBe(first);
    expect(quoteLabWorkspaceId(request())).toBeNull();
    expect(quoteLabWorkspaceId(request("not-a-valid-nonce"))).toBeNull();
    expect(quoteLabWorkspaceId(request("a".repeat(64), "0".repeat(64)))).toBeNull();
  });
});
