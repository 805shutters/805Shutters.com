import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./QuotesWorkspace.legacy", () => ({
  QuotesWorkspace: () => createElement("div", { "data-testid": "historical-v1-workspace" }, "Historical V1 workspace"),
}));

const source = readFileSync(fileURLToPath(new URL("./QuotesWorkspace.tsx", import.meta.url)), "utf8");
const legacySource = readFileSync(fileURLToPath(new URL("./QuotesWorkspace.legacy.tsx", import.meta.url)), "utf8");
const standaloneSource = readFileSync(fileURLToPath(new URL("./QuoteBuilderStandalone.tsx", import.meta.url)), "utf8");
const builderSource = readFileSync(fileURLToPath(new URL("../QuoteBuilderPanel.tsx", import.meta.url)), "utf8");
const groupSource = readFileSync(fileURLToPath(new URL("../../../lib/crm/quote-groups.ts", import.meta.url)), "utf8");

describe("historical quote-system routing", () => {
  it("renders the real historical workspace instead of relabeling the newer workspace", async () => {
    expect(source).toContain('from "./QuotesWorkspace.legacy"');
    expect(source).not.toContain("<QuoteWorkspace");
    expect(source).not.toContain("V1 quote builder");
    expect(source).not.toContain("Open V4");

    const { QuotesWorkspace } = await import("./QuotesWorkspace");
    const markup = renderToStaticMarkup(createElement(QuotesWorkspace, {
      session: {} as never,
      jobs: [],
      quotes: [],
      events: [],
      onChanged: () => undefined,
    }));
    expect(markup).toContain("Historical V1 workspace");
  });

  it("opens quote editing on the historical dedicated route", () => {
    expect(legacySource).toContain("router.push(`/crm/quote/${quoteId}`)");
    expect(standaloneSource).toContain('from "@/components/crm/QuoteBuilderPanel"');
    expect(standaloneSource).toContain("<QuoteBuilderPanel");
  });

  it("keeps Copy Current separate and snapshot preserving", () => {
    expect(builderSource).toMatch(/onClick=\{\(\) => createVersion\(true\)\}[^>]*>\s*Copy Current/s);
    expect(builderSource).toMatch(/onClick=\{\(\) => createVersion\(false\)\}[^>]*>\s*Add Quote/s);
    expect(groupSource).toContain("await cloneQuoteBuilderRows(supabase, source, createdId, undefined, true, true)");
    expect(groupSource).toContain("if (preserveQuoteTotals) return");
  });
});
