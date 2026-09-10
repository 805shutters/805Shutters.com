import { describe, expect, it } from "vitest";
import { buildVisibleQuoteTabs, createQuoteGroupId, nextQuoteLetter, isPendingQuoteAlternative } from "./quoteGroupLabels";

describe("quote group labels", () => {
  it("labels only unsigned retained alternatives in a sold group without changing stored status", () => {
    const sold = { id: "a", quote_group_id: "group", status: "sold" };
    const pending = { id: "b", quote_group_id: "group", status: "sent" };
    const original = JSON.stringify([sold, pending]);
    expect(isPendingQuoteAlternative(pending, [sold, pending])).toBe(true);
    expect(isPendingQuoteAlternative(sold, [sold, pending])).toBe(false);
    expect(isPendingQuoteAlternative({ ...pending, signed_at: "2026-09-10" }, [sold])).toBe(false);
    expect(isPendingQuoteAlternative({ ...pending, quote_group_id: "unrelated" }, [sold])).toBe(false);
    expect(isPendingQuoteAlternative(pending, [{ ...sold, status: "draft" }])).toBe(false);
    expect(JSON.stringify([sold, pending])).toBe(original);
  });
  it("uses B for the first additional whole-quote option", () => {
    expect(nextQuoteLetter(["A"])).toBe("B");
  });

  it("fills the next open quote letter instead of relying on row count", () => {
    expect(nextQuoteLetter(["A", "C"])).toBe("B");
    expect(nextQuoteLetter(["a", null, "", "B"])).toBe("C");
  });

  it("shows the active A quote even before the quote has a saved group", () => {
    const visibleTabs = buildVisibleQuoteTabs({ id: "quote-a", quote_letter: "A" }, []);

    expect(visibleTabs).toEqual([{ id: "quote-a", quote_letter: "A" }]);
  });

  it("keeps grouped tabs sorted by quote letter", () => {
    const visibleTabs = buildVisibleQuoteTabs(
      { id: "quote-c", quote_letter: "C" },
      [
        { id: "quote-c", quote_letter: "C" },
        { id: "quote-a", quote_letter: "A" },
        { id: "quote-b", quote_letter: "B" },
      ]
    );

    expect(visibleTabs.map((quote) => quote.quote_letter)).toEqual(["A", "B", "C"]);
  });

  it("creates ids that fit a uuid column", () => {
    expect(createQuoteGroupId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
