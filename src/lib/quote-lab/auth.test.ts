import { afterEach, describe, expect, it } from "vitest";
import { QuoteLabConfigurationError, quoteLabSessionToken, verifyQuoteLabAccessCode } from "./auth";

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
});
