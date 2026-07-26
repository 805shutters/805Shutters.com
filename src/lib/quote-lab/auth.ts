import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const QUOTE_LAB_COOKIE = "quote_lab_session";
export const QUOTE_LAB_WORKSPACE_COOKIE = "quote_lab_workspace";
export const QUOTE_LAB_COOKIE_MAX_AGE = 60 * 60 * 12;

const QUOTE_LAB_WORKSPACE_NONCE_PATTERN = /^[a-f0-9]{64}$/;

export class QuoteLabConfigurationError extends Error {}

function configuredAccessCode(): string {
  const code = process.env.QUOTE_LAB_ACCESS_CODE?.trim();
  if (!code) {
    throw new QuoteLabConfigurationError("Quote Lab access is not configured for this deployment.");
  }
  return code;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function quoteLabSessionToken(): string {
  return digest(`805-quote-lab:${configuredAccessCode()}`).toString("hex");
}

export function createQuoteLabWorkspaceNonce(): string {
  return randomBytes(32).toString("hex");
}

export function verifyQuoteLabAccessCode(candidate: unknown): boolean {
  if (typeof candidate !== "string" || !candidate) return false;
  const expected = digest(configuredAccessCode());
  const actual = digest(candidate);
  return timingSafeEqual(actual, expected);
}

export function isQuoteLabAuthorized(request: NextRequest): boolean {
  const candidate = request.cookies.get(QUOTE_LAB_COOKIE)?.value;
  if (!candidate) return false;
  const expected = Buffer.from(quoteLabSessionToken(), "hex");
  const actual = Buffer.from(candidate, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function quoteLabWorkspaceId(request: NextRequest): string | null {
  if (!isQuoteLabAuthorized(request)) return null;
  const session = request.cookies.get(QUOTE_LAB_COOKIE)?.value;
  const nonce = request.cookies.get(QUOTE_LAB_WORKSPACE_COOKIE)?.value;
  if (
    !session ||
    !nonce ||
    !QUOTE_LAB_WORKSPACE_NONCE_PATTERN.test(nonce)
  ) {
    return null;
  }
  return createHash("sha256")
    .update(`805-quote-v2-test:${session}:${nonce}`, "utf8")
    .digest("hex");
}

export function quoteLabUnauthorizedResponse() {
  return Response.json({ error: "Quote Lab access code required." }, { status: 401 });
}
