import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync(new URL("./SquareClearanceReview.tsx", import.meta.url), "utf8");
const stripePage = readFileSync(new URL("./StripeFinanceWorkspace.tsx", import.meta.url), "utf8");

it("opens the existing single-quote clearance action and has no blanket clearance", () => {
  expect(source).toContain('fetch("/api/crm/stripe/clearance-review/"');
  expect(source).toContain('fetch("/api/crm/stripe/"');
  expect(source).toContain('action: "clearance"');
  expect(source).toContain("confirmObligationsResolved: true");
  expect(source).toContain("targetId: quoteId");
  expect(source).toContain("minLength={20}");
  expect(source).toContain("Record clearance for this quote");
  expect(source).not.toMatch(/targetIds|select all|select-all|clear all|clear-all|bulk|blanket/i);
  expect(source).not.toMatch(/@\/lib\/finance\/(?:stripe|square)|stripeConfig|createSquarePaymentLink|syncSquareFinance|syncStripeFinance/);
  expect(stripePage).toContain('href="/crm/stripe/clearance/"');
});
