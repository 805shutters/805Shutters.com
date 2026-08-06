import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mts/QuoteWorkspace", () => ({
  QuoteWorkspace: () => createElement("div", { "data-testid": "historical-quote-workspace" }, "Historical quote workspace"),
}));

const source = readFileSync(fileURLToPath(new URL("./QuotesWorkspace.tsx", import.meta.url)), "utf8");
const mobileSource = readFileSync(fileURLToPath(new URL("../CrmMobileQuotesApp.tsx", import.meta.url)), "utf8");
const quoteWorkspaceSource = readFileSync(fileURLToPath(new URL("../../../mts-quote/QuoteWorkspace.tsx", import.meta.url)), "utf8");
const crmAppSource = readFileSync(fileURLToPath(new URL("../CrmApp.tsx", import.meta.url)), "utf8");
const quoteBuilderSource = readFileSync(fileURLToPath(new URL("../../../mts-quote/components/crm/quote-builder/QuoteBuilder.tsx", import.meta.url)), "utf8");
const designCardSource = readFileSync(fileURLToPath(new URL("../../../mts-quote/components/crm/quote-builder/DesignCard.tsx", import.meta.url)), "utf8");

describe("quote-system routing", () => {
  it("mounts the historical in-place workspace as V1 by default", async () => {
    expect(source).toContain('useState<QuoteVersion>("v1")');
    expect(source).toContain("V1 quote builder");
    expect(source).toContain("Open V4 — In progress");
    expect(source).toContain("Return to V1");
    expect(source).not.toContain("Choose a quote builder");
    expect(source).not.toContain("onOpenOriginalV1Quote");
    expect(source).toContain("<QuoteWorkspace");
    expect(mobileSource).toContain('from "@/components/crm/quotes/QuotesWorkspace"');
    expect(mobileSource).not.toContain("onOpenOriginalV1Quote");
    expect(crmAppSource).not.toContain("onOpenOriginalV1Quote=");

    const { QuotesWorkspace } = await import("./QuotesWorkspace");
    const markup = renderToStaticMarkup(createElement(QuotesWorkspace, {
      session: {} as never,
      jobs: [],
      quotes: [],
      events: [],
      onChanged: () => undefined,
    }));
    expect(markup).toContain("V1 quote builder");
    expect(markup).toContain("Open V4 — In progress");
    expect(markup).toContain("Historical quote workspace");
  });

  it("keeps the familiar grouped editable quote workflow behind V1", () => {
    expect(quoteWorkspaceSource).toContain("<QuoteBuilder");
    expect(quoteBuilderSource).toContain("<QuoteGroupTabs");
    expect(quoteBuilderSource).toContain("<ManufacturerProductButtons");
    expect(quoteBuilderSource).toContain("<RoomPresetButtons");
    expect(quoteBuilderSource).toContain("<DesignCard");
    expect(quoteBuilderSource).toContain("<MeasurementGridModal");
    expect(designCardSource).toContain("onOpenMeasurement");
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

  it("keeps existing CRM quote open requests on the default V1 workspace", async () => {
    expect(crmAppSource).toContain("if (quote)");
    expect(crmAppSource).toContain("setBuilderQuoteId(quoteId)");
    expect(source).toContain('useState<QuoteVersion>("v1")');

    const { QuotesWorkspace } = await import("./QuotesWorkspace");
    const markup = renderToStaticMarkup(createElement(QuotesWorkspace, {
      session: {} as never,
      jobs: [],
      quotes: [],
      events: [],
      openRequest: { quoteId: "v4-saved-quote", tab: "builder", requestId: 1 },
      onChanged: () => undefined,
    }));
    expect(markup).toContain("Historical quote workspace");
    expect(markup).toContain("V1 quote builder");
    expect(markup).not.toContain("Choose a quote builder");
  });
});
