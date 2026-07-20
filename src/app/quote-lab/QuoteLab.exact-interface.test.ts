import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Quote Lab exact interface contract", () => {
  it("mounts the production QuoteBuilder component under an isolated database provider", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./ExactQuoteLabWorkspace.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain('import { QuoteBuilder } from "@mts/components/crm/quote-builder/QuoteBuilder"');
    expect(source).toContain("<QuoteBuilderDatabaseProvider database={database} isolated preferStoredTotal>");
    expect(source).toContain("<QuoteBuilder />");
  });

  it("does not route the exact interface through the recreated QuoteLabBuilder", () => {
    const source = readFileSync(fileURLToPath(new URL("./QuoteLab.tsx", import.meta.url)), "utf8");
    expect(source).toContain("<ExactQuoteLabWorkspace database={database} />");
    expect(source).not.toContain("QuoteLabBuilder");
  });
});
