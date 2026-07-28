import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mts/QuoteWorkspace", () => ({
  QuoteWorkspace: () => createElement("div", { "data-testid": "july-10-quote-workspace" }, "July 10 quote workspace"),
}));

const source = readFileSync(fileURLToPath(new URL("./QuotesWorkspace.tsx", import.meta.url)), "utf8");
const mobileSource = readFileSync(fileURLToPath(new URL("../CrmMobileQuotesApp.tsx", import.meta.url)), "utf8");
const quoteWorkspaceSource = readFileSync(fileURLToPath(new URL("../../../mts-quote/QuoteWorkspace.tsx", import.meta.url)), "utf8");

describe("July 10 quote-system routing", () => {
  it("renders the historical quote workspace on desktop and mobile", async () => {
    expect(source).toContain("<QuoteWorkspace");
    expect(source).toContain('from "@mts/QuoteWorkspace"');
    expect(source).not.toContain('from "./QuotesWorkspace.legacy"');
    expect(mobileSource).toContain('from "@mts/QuoteWorkspace"');

    const { QuotesWorkspace } = await import("./QuotesWorkspace");
    const markup = renderToStaticMarkup(createElement(QuotesWorkspace, {
      session: {} as never,
      jobs: [],
      quotes: [],
      events: [],
      onChanged: () => undefined,
    }));
    expect(markup).toContain("July 10 quote workspace");
  });

  it("keeps the historical dashboard, builder, pricing, and contract tabs connected", () => {
    expect(quoteWorkspaceSource).toContain('value: "dashboard"');
    expect(quoteWorkspaceSource).toContain('value: "builder"');
    expect(quoteWorkspaceSource).toContain('value: "pricing"');
    expect(quoteWorkspaceSource).toContain('value: "contract"');
    expect(quoteWorkspaceSource).toContain("<QuoteDashboard");
    expect(quoteWorkspaceSource).toContain("<QuoteBuilder");
    expect(quoteWorkspaceSource).toContain("<PricingGrids");
    expect(quoteWorkspaceSource).toContain("<QuoteContract");
  });
});
