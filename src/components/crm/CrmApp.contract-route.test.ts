import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");

describe("CRM customer contract route", () => {
  it("opens Customer Contract in the quote workspace Contract tab", () => {
    expect(source).toContain('if (page.quoteId) openQuoteWorkspaceQuote(page.quoteId, "contract")');
    expect(source).toContain("quoteId: quote?.id || null");
  });

  it("keeps Quote Workspace pointed at the Builder tab", () => {
    expect(source).toContain('if (page.quoteId) openQuoteWorkspaceQuote(page.quoteId, "builder")');
  });

  it("opens unconverted historical CRM quotes in an explicit read-only fallback", () => {
    expect(source).toContain("setReadOnlyLegacyQuoteId(quoteId)");
    expect(source).toContain("readOnly={readOnlyLegacyQuoteId === builderQuoteId}");
    expect(source).toContain(
      'readOnlyReason="This historical quote has not been losslessly converted into authoritative V2."',
    );
  });
});
