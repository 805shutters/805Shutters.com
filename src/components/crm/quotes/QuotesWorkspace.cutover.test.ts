import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./QuotesWorkspace.tsx", import.meta.url)),
  "utf8",
);

describe("Quote V2 production cutover", () => {
  it("defaults to V2 and keeps an immediate shareable V1 rollback", () => {
    expect(source).toContain('type QuoteSystem = "v1" | "v2"');
    expect(source).toContain('return "v2"');
    expect(source).toContain('get("quoteSystem")');
    expect(source).toContain("LegacyQuotesWorkspace");
    expect(source).toContain('system === "v1" ? " rollback" : ""');
  });
});
