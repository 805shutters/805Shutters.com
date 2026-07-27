import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mts/QuoteWorkspace", () => ({
  QuoteWorkspace: () => createElement("div", { "data-testid": "quote-v2-workspace" }, "Quote V2 workspace"),
}));

const source = readFileSync(
  fileURLToPath(new URL("./QuotesWorkspace.tsx", import.meta.url)),
  "utf8",
);
const legacySource = readFileSync(
  fileURLToPath(new URL("./QuotesWorkspace.legacy.tsx", import.meta.url)),
  "utf8",
);

describe("Quote V2 production cutover", () => {
  it("renders only V2 while retaining the disconnected V1 rollback implementation", async () => {
    expect(source).toContain("<QuoteWorkspace");
    expect(source).not.toContain('get("quoteSystem")');
    expect(source).not.toContain("LegacyQuotesWorkspace");
    expect(source).not.toContain("V1 rollback");
    expect(source).not.toContain('aria-label="Quote system"');
    expect(legacySource).toContain("export function QuotesWorkspace");

    const { QuotesWorkspace } = await import("./QuotesWorkspace");
    const markup = renderToStaticMarkup(createElement(QuotesWorkspace, {
      session: {} as never,
      jobs: [],
      quotes: [],
      events: [],
      customers: [],
      onChanged: () => undefined,
    }));
    expect(markup).toContain("Quote V2 workspace");
    expect(markup).not.toContain("Quote system");
    expect(markup).not.toContain("V1 rollback");
  });
});
