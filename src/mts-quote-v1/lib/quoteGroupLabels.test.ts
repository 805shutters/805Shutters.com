import { describe, expect, it } from "vitest";
import { buildVisibleQuoteTabs, createQuoteGroupId, nextQuoteLetter } from "./quoteGroupLabels";

describe("quote group labels", () => {
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
