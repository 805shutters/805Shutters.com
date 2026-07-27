import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const quotesTableSource = readFileSync(
  fileURLToPath(new URL("./QuotesTable.tsx", import.meta.url)),
  "utf8",
);

describe("quote alternative labels", () => {
  it("shows grouped sales quotes as Quote A, Quote B, or Quote C in the dashboard", () => {
    expect(quotesTableSource).toContain("quote_group_id?: string | null");
    expect(quotesTableSource).toContain("quote_letter?: string | null");
    expect(quotesTableSource).toContain("Quote {quote.quote_letter}");
    expect(quotesTableSource).toContain(
      "aria-label={`Quote alternative ${quote.quote_letter}`}",
    );
  });
});
