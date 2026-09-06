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

const quoteWorkspaceSource = readFileSync("src/mts-quote/QuoteWorkspace.tsx", "utf8");
const quoteSearchSource = readFileSync("src/mts-quote/lib/quoteSearch.ts", "utf8");
const crmQuotesWorkspaceSource = readFileSync(
  "src/components/crm/quotes/QuotesWorkspace.tsx",
  "utf8"
);

describe("quote dashboard routing", () => {
  it("passes the loaded CRM customer list all the way to New Quote", () => {
    const crmSource = readFileSync("src/components/crm/CrmApp.tsx", "utf8");
    const dashboardSource = quoteWorkspaceVersions[0].dashboardSource;
    expect(crmSource).toMatch(/<QuotesWorkspace\b[^>]*customers=\{customers\}/);
    expect(crmQuotesWorkspaceSource).toMatch(/export function QuotesWorkspace\(\{[^}]*\bcustomers\b/);
    expect(crmQuotesWorkspaceSource).toMatch(/<QuoteWorkspace\b[^>]*crmCustomers=\{customers\}/);
    expect(quoteWorkspaceSource).toMatch(/export function QuoteWorkspace\(\{[^}]*\bcrmCustomers\b/);
    expect(quoteWorkspaceSource).toMatch(/<QuoteDashboard\b[^>]*crmCustomers=\{crmCustomers\}/);
    expect(dashboardSource).toMatch(/export function QuoteDashboard\(\{[^}]*\bcrmCustomers\b/);
    expect(dashboardSource).toMatch(/<NewQuoteDialog\b[^>]*customers=\{crmCustomers\}/);
  });

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

  it("does not inherit sold bookkeeping from a signed source onto future-partition quotes", () => {
    for (const { dashboardSource } of quoteWorkspaceVersions) {
      expect(dashboardSource).toContain("partialAcceptance");
      expect(dashboardSource).toContain('.role === "future"');
      expect(dashboardSource).toMatch(/role === "future"[\s\S]*?return null;/);
    }
  });

  it("hides soft-deleted sales quotes and refreshes CRM rows after deletion", () => {
    const currentDashboardSource = quoteWorkspaceVersions.find(
      ({ version }) => version === "mts-quote",
    )!.dashboardSource;

    expect(currentDashboardSource).toContain('.is("deleted_at", null)');
    expect(currentDashboardSource).toContain("loadAllSalesQuotes<SalesQuote>");
    expect(currentDashboardSource).toContain('.order("id", { ascending: true })');
    expect(currentDashboardSource).toContain(".range(from, to)");
    expect(quoteSearchSource).toContain("excludeDeletedSalesQuotes(result.data || [])");
    expect(quoteSearchSource).toContain("isMissingSalesQuoteDeletedAtColumn(result.error)");
    expect(currentDashboardSource).toContain("onChanged?.();");
    expect(quoteWorkspaceSource).toContain("onChanged={onChanged}");
    expect(crmQuotesWorkspaceSource).toContain("onChanged={onChanged}");
  });
});
