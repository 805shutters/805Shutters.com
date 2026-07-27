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

  it("opens every CRM quote in the unchanged original builder or contract", () => {
    expect(source).toContain('if (tab === "contract") {');
    expect(source).toContain("void openQuoteContract(quoteId)");
    expect(source).toContain("setBuilderQuoteId(quoteId)");
    expect(source).not.toContain("setQuoteWorkspaceOpenRequest");
    expect(source).not.toContain("readOnlyLegacyQuoteId");
    expect(source).not.toContain("Historical quote opened read-only");
  });
});
