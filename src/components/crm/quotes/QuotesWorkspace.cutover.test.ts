import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/crm/quotes/OriginalV1QuotesWorkspace", () => ({
  OriginalV1QuotesWorkspace: () => createElement("div", { "data-testid": "v1-quote-workspace" }, "Original V1 quote workspace"),
}));
vi.mock("@mts/QuoteWorkspace", () => ({
  QuoteWorkspace: () => createElement("div", { "data-testid": "v4-quote-workspace" }, "V4 quote workspace"),
}));

const source = readFileSync(fileURLToPath(new URL("./QuotesWorkspace.tsx", import.meta.url)), "utf8");
const mobileSource = readFileSync(fileURLToPath(new URL("../CrmMobileQuotesApp.tsx", import.meta.url)), "utf8");
const quoteWorkspaceSource = readFileSync(fileURLToPath(new URL("../../../mts-quote/QuoteWorkspace.tsx", import.meta.url)), "utf8");
const crmAppSource = readFileSync(fileURLToPath(new URL("../CrmApp.tsx", import.meta.url)), "utf8");
const standaloneSource = readFileSync(fileURLToPath(new URL("./QuoteBuilderStandalone.tsx", import.meta.url)), "utf8");
const originalV1BuilderSource = readFileSync(fileURLToPath(new URL("../quote-v1/QuoteBuilderPanel.tsx", import.meta.url)));
const july29BuilderSource = readFileSync(fileURLToPath(new URL("../QuoteBuilderPanel.tsx", import.meta.url)), "utf8");

describe("quote-system routing", () => {
  it("presents an explicit V1/V4 chooser on desktop and mobile", async () => {
    expect(source).toContain("Open original V1");
    expect(source).toContain("Open V4 — In progress");
    expect(source).toContain("Switch quote builder");
    expect(source).toContain("<OriginalV1QuotesWorkspace");
    expect(source).toContain("<QuoteWorkspace");
    expect(mobileSource).toContain('from "@/components/crm/quotes/QuotesWorkspace"');

    const { QuotesWorkspace } = await import("./QuotesWorkspace");
    const markup = renderToStaticMarkup(createElement(QuotesWorkspace, {
      session: {} as never,
      jobs: [],
      quotes: [],
      events: [],
      onOpenOriginalV1Quote: () => undefined,
      onChanged: () => undefined,
    }));
    expect(markup).toContain("Choose a quote builder");
    expect(markup).toContain("Open original V1");
    expect(markup).toContain("Open V4 — In progress");
  });

  it("keeps the pre-redesign V1 builder byte-for-byte unchanged", () => {
    expect(createHash("sha256").update(originalV1BuilderSource).digest("hex"))
      .toBe("3a5f2fc90452f956ad7b5ef729e15e69bedb29ec651b3c3dfd74c43e49d09373");
    expect(crmAppSource).toContain("<OriginalV1QuoteBuilderPanel");
    expect(crmAppSource).toContain('builderVersion === "original-v1"');
  });

  it("routes V1 selections through the original full-page builder", () => {
    expect(crmAppSource).toContain("window.location.assign(`/crm/quote/${quoteId}`)");
    expect(mobileSource).toContain("window.location.assign(`/crm/quote/${quoteId}`)");
    expect(standaloneSource).toContain('from "@/components/crm/QuoteBuilderPanel"');
    expect(standaloneSource).toContain("embedded");
    expect(createHash("sha256").update(july29BuilderSource).digest("hex"))
      .toBe("b1f4890ff07f2054fbb77c2aa2c4be4bf1cb204bb58329f4ce34ef3a48323c7e");
    expect(july29BuilderSource).toContain("Add Quote");
    expect(july29BuilderSource).toContain("Copy Current");
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
      onOpenOriginalV1Quote: () => undefined,
      onChanged: () => undefined,
    }));
    expect(markup).toContain("V4 quote workspace");
    expect(markup).not.toContain("Choose a quote builder");
  });
});
