import { describe, expect, it } from "vitest";
import {
  fuzzyReviewReason,
  levenshtein,
  normalizeSidemark,
  shippingReviewQuoteText,
  shippingReviewWhyText,
  suggestFuzzyNames,
  type FuzzyNamePerson,
} from "./fuzzy-name";

const castiel: FuzzyNamePerson = {
  quoteId: "quote-0431",
  quoteNumber: "805-0431",
  jobId: "job-0431",
  customerName: "Castiel",
  signerName: null,
  status: "sold",
};

describe("sidemark normalization", () => {
  it("strips a dealer prefix, drops the first name, and removes punctuation", () => {
    expect(normalizeSidemark("CHE01-Mike Castile")).toEqual({ full: "mike castile", last: "castile" });
    expect(normalizeSidemark("CHE01-O'Brien, Mike")).toEqual({ full: "o brien mike", last: "mike" });
    expect(levenshtein("castile", "castiel")).toBe(2);
    expect(levenshtein("castile", "cast")).toBe(3);
  });
});

describe("fuzzy name suggestions", () => {
  it("suggests Castiel for CHE01-Mike Castile at distance 2", () => {
    const suggestions = suggestFuzzyNames("CHE01-Mike Castile", [castiel]);
    expect(suggestions).toEqual([expect.objectContaining({ quoteId: "quote-0431", quoteNumber: "805-0431", distance: 2 })]);
    expect(fuzzyReviewReason(suggestions)).toBe("fuzzy_name, distance 2");
  });

  it("matches a contract signer when the customer name does not", () => {
    const suggestions = suggestFuzzyNames("CHE01-Mike Castile", [{
      ...castiel,
      customerName: "Pat Smith",
      signerName: "M. Castiel",
    }]);
    expect(suggestions).toEqual([expect.objectContaining({ quoteId: "quote-0431", distance: 2 })]);
  });

  it("gives no suggestion at distance 3", () => {
    expect(suggestFuzzyNames("CHE01-Mike Castile", [{ ...castiel, customerName: "Cast", signerName: null }])).toEqual([]);
  });

  it("lists two close names", () => {
    const suggestions = suggestFuzzyNames("CHE01-Mike Castile", [
      castiel,
      { ...castiel, quoteId: "quote-b", quoteNumber: "805-0502", jobId: "job-b", customerName: "Castrile" },
    ]);
    expect(fuzzyReviewReason(suggestions)).toContain("805-0431");
    expect(fuzzyReviewReason(suggestions)).toContain("805-0502");
    expect(suggestions).toHaveLength(2);
  });

  it("ignores quotes that are not sold yet and quote numbers outside 805", () => {
    expect(suggestFuzzyNames("CHE01-Mike Castile", [{ ...castiel, status: "sent" }])).toEqual([]);
    expect(suggestFuzzyNames("CHE01-Mike Castile", [{ ...castiel, quoteNumber: "MTS-0431" }])).toEqual([]);
  });
});

describe("shipping review labels", () => {
  it("shows the suggested quote and the fuzzy reason", () => {
    expect(shippingReviewQuoteText({ detail: "fuzzy_name, distance 2", quoteNumber: "805-0431", quoteId: "quote-0431" })).toBe("Suggested 805-0431");
    expect(shippingReviewWhyText("fuzzy_name, distance 2")).toBe("fuzzy_name, distance 2");
    expect(shippingReviewQuoteText({
      detail: "fuzzy_name; candidates: 805-0431 Castiel distance 2; 805-0502 Castrile distance 1",
      quoteNumber: null,
    })).toBe("Suggested 805-0431 Castiel distance 2; 805-0502 Castrile distance 1");
  });
});
