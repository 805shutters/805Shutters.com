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
    it(`opens ${version} CRM rows through the standard quote editor route`, () => {
      expect(dashboardSource).toMatch(
        /const openQuoteRowInBuilder = \(quote: QuoteTableRow\) => \{\s*if \(quote\.source === "crm"\) \{\s*onOpenCrmQuote\?\.\(quote\.id, "builder"\);\s*return;\s*\}\s*setActiveQuote\(quote\.id\);\s*setActiveTab\("builder"\);\s*\};/
      );
      expect(dashboardSource).toMatch(
        /const handleOpenQuote = \(quote: QuoteTableRow\) => \{\s*openQuoteRowInBuilder\(quote\);\s*\};/
      );
      expect(dashboardSource).toContain("onOpenContract={openQuoteRowInBuilder}");
      expect(tableSource).toContain('title="Edit quote in builder"');
      expect(tableSource).toMatch(/<ExternalLink[\s\S]*?>\s*Edit\s*<\/Button>/);
    });
  }

  it("deduplicates the server-owned sales quote created for an imported CRM row", () => {
    const currentDashboardSource = quoteWorkspaceVersions.find(
      ({ version }) => version === "mts-quote",
    )!.dashboardSource;
    expect(currentDashboardSource).toContain(
      "meta.target_sales_quote_id || meta.mts_quote_id || meta.sales_quote_id",
    );
    expect(currentDashboardSource).toContain(
      ".filter((quote) => !sourceSalesQuoteIds.has(quote.id))",
    );
  });
});
