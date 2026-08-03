import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/crm/quotes/QuotesWorkspace.legacy", () => ({
  QuotesWorkspace: () => createElement("div", { "data-testid": "v1-quote-workspace" }, "V1 quote workspace"),
}));
vi.mock("@mts/QuoteWorkspace", () => ({
  QuoteWorkspace: () => createElement("div", { "data-testid": "v4-quote-workspace" }, "V4 quote workspace"),
}));

const source = readFileSync(fileURLToPath(new URL("./QuotesWorkspace.tsx", import.meta.url)), "utf8");
const mobileSource = readFileSync(fileURLToPath(new URL("../CrmMobileQuotesApp.tsx", import.meta.url)), "utf8");
const quoteWorkspaceSource = readFileSync(fileURLToPath(new URL("../../../mts-quote/QuoteWorkspace.tsx", import.meta.url)), "utf8");
const crmAppSource = readFileSync(fileURLToPath(new URL("../CrmApp.tsx", import.meta.url)), "utf8");

describe("quote-system routing", () => {
  it("presents an explicit V1/V4 chooser on desktop and mobile", async () => {
    expect(source).toContain("Open V1 — Reliable fallback");
    expect(source).toContain("Open V4 — In progress");
    expect(source).toContain("Switch quote builder");
    expect(source).toContain("<LegacyQuotesWorkspace");
    expect(source).toContain("<QuoteWorkspace");
    expect(mobileSource).toContain('from "@/components/crm/quotes/QuotesWorkspace"');

    const { QuotesWorkspace } = await import("./QuotesWorkspace");
    const markup = renderToStaticMarkup(createElement(QuotesWorkspace, {
      session: {} as never,
      jobs: [],
      quotes: [],
      events: [],
      onChanged: () => undefined,
    }));
    expect(markup).toContain("Choose a quote builder");
    expect(markup).toContain("Open V1 — Reliable fallback");
    expect(markup).toContain("Open V4 — In progress");
  });

  it("preserves V4 dashboard, builder, pricing, and contract code for rollback", () => {
    expect(quoteWorkspaceSource).toContain('value: "dashboard"');
    expect(quoteWorkspaceSource).toContain('value: "builder"');
    expect(quoteWorkspaceSource).toContain('value: "pricing"');
    expect(quoteWorkspaceSource).toContain('value: "contract"');
    expect(quoteWorkspaceSource).toContain("<QuoteDashboard");
    expect(quoteWorkspaceSource).toContain("<QuoteBuilder");
    expect(quoteWorkspaceSource).toContain("<PricingGrids");
    expect(quoteWorkspaceSource).toContain("<QuoteContract");
  });

  it("keeps existing CRM quotes on V1 and explicit V4 open requests on V4", async () => {
    expect(crmAppSource).toContain("if (quote)");
    expect(crmAppSource).toContain("setBuilderQuoteId(quoteId)");
    expect(source).toContain('openRequest?.quoteId ? "v4" : null');

    const { QuotesWorkspace } = await import("./QuotesWorkspace");
    const markup = renderToStaticMarkup(createElement(QuotesWorkspace, {
      session: {} as never,
      jobs: [],
      quotes: [],
      events: [],
      openRequest: { quoteId: "v4-saved-quote", tab: "builder", requestId: 1 },
      onChanged: () => undefined,
    }));
    expect(markup).toContain("V4 quote workspace");
    expect(markup).not.toContain("Choose a quote builder");
  });
});
