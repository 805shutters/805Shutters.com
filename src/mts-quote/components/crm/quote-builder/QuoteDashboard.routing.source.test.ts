import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const quoteWorkspaceVersions = ["mts-quote", "mts-quote-v1"].map((version) => ({
  version,
  dashboardSource: readFileSync(
    `src/${version}/components/crm/quote-builder/QuoteDashboard.tsx`,
    "utf8"
  ),
  tableSource: readFileSync(
    `src/${version}/components/crm/quote-builder/QuotesTable.tsx`,
    "utf8"
  ),
}));

describe("quote dashboard routing", () => {
  for (const { version, dashboardSource, tableSource } of quoteWorkspaceVersions) {
    it(`opens ${version} quote-table and contract-list rows in the editable builder`, () => {
      expect(dashboardSource).toMatch(
        /const openQuoteRowInBuilder = \(quote: QuoteTableRow\) => \{[\s\S]*?onOpenCrmQuote\?\.\(quote\.id, "builder"\);[\s\S]*?setActiveTab\("builder"\);[\s\S]*?\};/
      );
      expect(dashboardSource).toMatch(
        /const handleOpenQuote = \(quote: QuoteTableRow\) => \{\s*openQuoteRowInBuilder\(quote\);\s*\};/
      );
      expect(dashboardSource).toContain("onOpenContract={openQuoteRowInBuilder}");
      expect(tableSource).toContain('title="Edit quote in builder"');
      expect(tableSource).toMatch(/<ExternalLink[\s\S]*?>\s*Edit\s*<\/Button>/);
    });
  }
});
