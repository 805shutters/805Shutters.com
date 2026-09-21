import { describe, expect, it } from "vitest";
import { authoritativeDesignPriceIssue, isSavedQuotePricingIncomplete, manualMerchandisePriceForDisplay } from "./quotePricingDisplay";

describe("saved quote pricing presentation", () => {
  it("reads normalized saved pricing status without losing exact catalog failures", () => {
    expect(authoritativeDesignPriceIssue({ unit_price: 123, quote_v2_price_status: "authoritative" })).toBeNull();
    expect(authoritativeDesignPriceIssue({ unit_price: 123, quote_v2_price_status: "stale", options_json: { authoritative_price_error: "Requested catalog identity is not the server-selected catalog." } })).toBe("Requested catalog identity is not the server-selected catalog.");
  });
  it("reopens new manual merchandise amounts without adding fixed charges again and preserves old records", () => {
    const options_json = { manual_customer_charge_policy: "blind-shade-install-ship-v1", manual_merchandise_unit_price: 900 };
    expect(manualMerchandisePriceForDisplay({ options_json }, 939)).toBe(900);
    expect(manualMerchandisePriceForDisplay({ options_json: { manual_merchandise_unit_price: 900 } }, 939)).toBe(939);
    expect(manualMerchandisePriceForDisplay({ options_json: { ...options_json, manual_merchandise_unit_price: 0 } }, 39)).toBe(0);
    expect(manualMerchandisePriceForDisplay({ options_json: { ...options_json, manual_merchandise_unit_price: -1 } }, 939)).toBe(939);
  });
  it("suppresses partial totals for blocked, stale and unfinished authoritative drafts", () => {
    for (const quote_v2_status of ["blocked", "stale", "draft", undefined] as const) {
      expect(isSavedQuotePricingIncomplete({ status: "draft", quote_v2_backend: true, quote_v2_status, total_amount: 726.78 })).toBe(true);
    }
    expect(isSavedQuotePricingIncomplete({ status: "draft", quote_v2_backend: true, quote_v2_status: "priced" })).toBe(false);
  });

  it("preserves sent and signed prices and legacy totals regardless of later catalog status", () => {
    for (const status of ["sent", "sold", "ordered", "received", "installed", "archived"] as const) {
      expect(isSavedQuotePricingIncomplete({ status, quote_v2_backend: true, quote_v2_status: "blocked" })).toBe(false);
    }
    expect(isSavedQuotePricingIncomplete({ status: "draft", sent_at: "2026-09-02", quote_v2_backend: true, quote_v2_status: "stale" })).toBe(false);
    expect(isSavedQuotePricingIncomplete({ status: "draft", quote_v2_backend: false })).toBe(false);
  });

  it("explains persisted blocked and stale prices even when the save omitted an error string", () => {
    expect(authoritativeDesignPriceIssue({ unit_price: 0, options_json: { authoritative_price_status: "blocked" } })).toContain("Pricing is blocked");
    expect(authoritativeDesignPriceIssue({ unit_price: 230, options_json: { authoritative_price_status: "stale" } })).toContain("needs authoritative repricing");
    expect(authoritativeDesignPriceIssue({ options_json: { authoritative_price_status: "unpriceable" } })).toContain("No verified price");
    expect(authoritativeDesignPriceIssue({ options_json: { authoritative_price_error: " Select a motor. " } })).toBe("Select a motor.");
  });

  it("allows an authoritative free line, rejects missing or invalid amounts, and clears obsolete errors", () => {
    for (const unit_price of [0, 123.45]) {
      expect(authoritativeDesignPriceIssue({ unit_price, options_json: { authoritative_price_status: "authoritative", authoritative_price_error: "Old error" } })).toBeNull();
    }
    for (const unit_price of [null, undefined, NaN, Infinity, -1]) {
      expect(authoritativeDesignPriceIssue({ unit_price, options_json: { authoritative_price_status: "authoritative" } })).not.toBeNull();
    }
    expect(authoritativeDesignPriceIssue(undefined)).not.toBeNull();
  });
});
