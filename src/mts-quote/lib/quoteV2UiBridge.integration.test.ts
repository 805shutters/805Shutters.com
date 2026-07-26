import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relative: string) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("production Quote V2 server-owned UI bridge", () => {
  it("enables authoritative server ownership on the active quote workspace", () => {
    const workspace = source("../QuoteWorkspace.tsx");
    expect(workspace).toContain("<QuoteBuilderDatabaseProvider");
    expect(workspace).toMatch(/\bauthoritativeV2\b/);
    expect(workspace).toMatch(/\bserverOwnedV2\b/);
    expect(workspace).toContain("<QuoteDashboard");
    expect(workspace).toMatch(/\bquoteOperatorMode\b/);
  });

  it("routes new drafts and quote alternatives through authenticated V2 APIs", () => {
    const dashboard = source(
      "../components/crm/quote-builder/QuoteDashboard.tsx",
    );
    const groups = source(
      "../components/crm/quote-builder/QuoteGroupTabs.tsx",
    );

    expect(dashboard).toContain("createQuoteV2Draft(supabase");
    expect(dashboard).toContain("if (serverOwnedV2)");
    expect(groups).toContain("createQuoteV2Draft(supabase");
    expect(groups).toContain("mutateQuoteV2Structure(");
    expect(groups).toContain("priceQuoteV2(");
    expect(groups).toContain(
      "Quote V2 alternatives cannot be hard-deleted",
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
