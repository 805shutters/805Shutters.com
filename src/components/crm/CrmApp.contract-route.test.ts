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

  it("opens historical CRM quotes in the unchanged original builder", () => {
    expect(source).toContain('if (tab === "contract") void openQuoteContract(quoteId)');
    expect(source).toContain("else setBuilderQuoteId(quoteId)");
    expect(source).not.toContain("readOnlyLegacyQuoteId");
    expect(source).not.toContain("Historical quote opened read-only");
  });
});
