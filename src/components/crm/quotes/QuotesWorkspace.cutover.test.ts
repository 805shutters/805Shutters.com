import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./QuotesWorkspace.legacy", () => ({
  QuotesWorkspace: () => createElement("div", { "data-testid": "quote-v1-workspace" }, "Quote V1 workspace"),
}));

const source = readFileSync(fileURLToPath(new URL("./QuotesWorkspace.tsx", import.meta.url)), "utf8");
const legacySource = readFileSync(fileURLToPath(new URL("./QuotesWorkspace.legacy.tsx", import.meta.url)), "utf8");
const mobileSource = readFileSync(fileURLToPath(new URL("../CrmMobileQuotesApp.tsx", import.meta.url)), "utf8");
const builderSource = readFileSync(fileURLToPath(new URL("../QuoteBuilderPanel.tsx", import.meta.url)), "utf8");

describe("Quote V1-only routing", () => {
  it("renders V1 on desktop and mobile with no V2 workspace entry point", async () => {
    expect(source).toContain("<QuoteV1Workspace");
    expect(source).toContain('from "./QuotesWorkspace.legacy"');
    expect(source).not.toContain('from "@mts/QuoteWorkspace"');
    expect(mobileSource).toContain('from "@/components/crm/quotes/QuotesWorkspace"');
    expect(mobileSource).not.toContain('from "@mts/QuoteWorkspace"');

    const { QuotesWorkspace } = await import("./QuotesWorkspace");
    const markup = renderToStaticMarkup(createElement(QuotesWorkspace, {
      session: {} as never,
      jobs: [],
      quotes: [],
      onChanged: () => undefined,
    }));
    expect(markup).toContain("Quote V1 workspace");
  });

  it("keeps V1 create, reopen, builder, and full contract routes connected", () => {
    expect(legacySource).toContain('method: "POST"');
    expect(legacySource).toContain('"/api/crm/quotes"');
    expect(legacySource).toContain("openBuilder(result.quote.id)");
    expect(legacySource).toContain("router.push(`/crm/quote/${quoteId}`)");
    expect(legacySource).toContain("onOpen={openBuilder}");
    expect(legacySource).toContain('tabBtn("contract", "Contract"');
    expect(legacySource).toContain("onOpenContractLink={openCustomerContract}");
    expect(legacySource).toContain("`/api/crm/quotes/${quoteId}/share`");
    expect(builderSource).toContain("`/api/crm/quotes/${quoteId}/builder`");
  });
});
