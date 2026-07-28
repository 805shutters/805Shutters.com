import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relative: string) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("production Quote V2 server-owned UI bridge", () => {
  it("keeps the dashboard authoritative while active quotes get record-specific runtimes", () => {
    const workspace = source("../QuoteWorkspace.tsx");
    expect(workspace).toContain("<QuoteBuilderDatabaseProvider");
    expect(workspace).toMatch(/\bauthoritativeV2\b/);
    expect(workspace).toMatch(/\bserverOwnedV2\b/);
    expect(workspace).toContain("<QuoteDashboard");
    expect(workspace).toMatch(/\bquoteOperatorMode\b/);
    expect(workspace).toContain("resolveActiveQuoteRuntime(activeQuote)");
    expect(workspace).toContain(
      "authoritativeV2={activeRuntime.authoritativeV2}",
    );
    expect(workspace).toContain(
      "serverOwnedV2={activeRuntime.serverOwnedV2}",
    );
    expect(workspace.match(/<ActiveQuoteRuntimeProvider/g)).toHaveLength(2);
  });

  it("keeps new drafts on authenticated V2 APIs", () => {
    const dashboard = source(
      "../components/crm/quote-builder/QuoteDashboard.tsx",
    );
    const groups = source(
      "../components/crm/quote-builder/QuoteGroupTabs.tsx",
    );

    expect(dashboard).toContain("createQuoteV2Draft(supabase");
    expect(dashboard).toContain("if (serverOwnedV2)");
    expect(dashboard).toContain("setActiveQuote(quote.quoteId)");
    expect(groups).toContain("createQuoteV2Draft(supabase");
    expect(groups).toContain("mutateQuoteV2Structure(");
    expect(groups).toContain("priceQuoteV2(");
    expect(groups).toContain(
      "Quote V2 alternatives cannot be hard-deleted",
    );
  });

  it("keeps grouped alternatives under the active quote runtime and opening read-only", () => {
    const workspace = source("../QuoteWorkspace.tsx");
    const builder = source(
      "../components/crm/quote-builder/QuoteBuilder.tsx",
    );
    const groups = source(
      "../components/crm/quote-builder/QuoteGroupTabs.tsx",
    );

    expect(workspace).toMatch(
      /<ActiveQuoteRuntimeProvider activeQuoteId=\{activeQuoteId\}>[\s\S]*?<QuoteBuilder \/>[\s\S]*?<\/ActiveQuoteRuntimeProvider>/,
    );
    expect(builder).toContain("<QuoteGroupTabs />");
    expect(groups).toContain("if (serverOwnedV2)");
    expect(builder).toContain(
      "observedLineItemsQuoteIdRef.current !== activeQuoteId",
    );
  });

  it("serializes structural edits, reprices server-side, and blocks client total writes", () => {
    const builder = source(
      "../components/crm/quote-builder/QuoteBuilder.tsx",
    );

    expect(builder).toContain("v2MutationQueueRef");
    expect(builder).toContain("mutateQuoteV2Structure(");
    expect(builder).toContain("priceQuoteV2(");
    expect(builder).toContain(
      "Quote V2 totals are server-owned and cannot be written by the browser.",
    );
    for (const operation of [
      "line.create",
      "line.update",
      "line.delete",
      "line.copy",
      "lines.clear",
      "design.upsert",
      "design.copySet",
      "quote.update",
    ]) {
      expect(builder).toContain(`type: "${operation}"`);
    }
  });
});
