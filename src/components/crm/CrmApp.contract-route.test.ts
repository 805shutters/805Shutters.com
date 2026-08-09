import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");

describe("CRM customer contract route", () => {
  it("opens every saved contract view in the standalone customer document route", () => {
    expect(source).toContain('if (page.quoteId) openQuoteWorkspaceQuote(page.quoteId, "contract")');
    expect(source).toContain('window.open(`/crm/quote/${quoteId}/contract-preview`');
    expect(source).toContain("quoteId: quote?.id || null");
    expect(source).not.toContain('`/api/crm/quotes/${quoteId}/share`');
  });

  it("reserves the builder route for an explicitly labeled edit action", () => {
    expect(source).toContain('if (page.quoteId) openQuoteWorkspaceQuote(page.quoteId, "builder")');
    expect(source).toContain('label: "Edit Quote"');
  });

  it("exposes an unsent persisted remainder as a Future Contract route", () => {
    expect(source).toContain('label: "Future Contract"');
    expect(source).toContain('target: "contract" as const');
    expect(source).toContain('contract.status === "future" || partial?.role === "future"');
    expect(source).toContain("pages.push(...futureContractPagesForEntry(entry, quotes))");
  });

  it("provides an explicit X control to close the customer contract preview", () => {
    expect(source).toContain('aria-label="Close customer contract"');
    expect(source).toContain("onClose={() => setSelectedResultId(null)}");
  });

  it("keeps historical editing explicit without using a builder for contract views", () => {
    expect(source).toContain('if (tab === "contract")');
    expect(source).toContain('setBuilderVersion("current")');
    expect(source).toContain("<OriginalV1QuoteBuilderPanel");
    expect(source).not.toContain("readOnlyLegacyQuoteId");
    expect(source).not.toContain("Historical quote opened read-only");
  });
});
