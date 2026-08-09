import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mts/QuoteWorkspace", () => ({
  QuoteWorkspace: () => createElement("div", { "data-testid": "standard-quote-workspace" }, "Standard quote workspace"),
}));

const source = readFileSync(fileURLToPath(new URL("./QuotesWorkspace.tsx", import.meta.url)), "utf8");
const quoteWorkspaceSource = readFileSync(fileURLToPath(new URL("../../../mts-quote/QuoteWorkspace.tsx", import.meta.url)), "utf8");
const builderSource = readFileSync(fileURLToPath(new URL("../../../mts-quote/components/crm/quote-builder/QuoteBuilder.tsx", import.meta.url)), "utf8");
const totalBadgeSource = readFileSync(fileURLToPath(new URL("../../../mts-quote/components/crm/quote-builder/FloatingQuoteTotalBadge.tsx", import.meta.url)), "utf8");

describe("standard quote-system routing", () => {
  it("renders the MTS quote workspace shown by the standard quote flow", async () => {
    expect(source).toContain('from "@mts/QuoteWorkspace"');
    expect(source).toContain("<QuoteWorkspace");
    expect(source).not.toContain('from "@mts-v1/QuoteWorkspace"');

    const { QuotesWorkspace } = await import("./QuotesWorkspace");
    const markup = renderToStaticMarkup(createElement(QuotesWorkspace, {
      session: {} as never,
      jobs: [],
      quotes: [],
      events: [],
      customers: [],
      onChanged: () => undefined,
    }));
    expect(markup).toContain("Standard quote workspace");
  });

  it("uses the exact saved-state, empty-state, and contract-total UI from the supplied target", () => {
    expect(quoteWorkspaceSource).toContain("<QuoteBuilder");
    expect(quoteWorkspaceSource).toContain("historicalPriceLock=");
    expect(quoteWorkspaceSource).toMatch(
      /<QuoteContract\s+historicalPriceLock=\{\s*openRequest\?\.quoteId === activeQuoteId\s*\? openRequest\.historicalPriceLock\s*:\s*null\s*\}/,
    );
    expect(builderSource).toContain('"Quote saved"');
    expect(builderSource).toContain("Select a manufacturer, exact product, and room to add a line item.");
    expect(builderSource).toContain("<FloatingQuoteTotalBadge");
    expect(totalBadgeSource).toContain("Contract Total");
  });
});
