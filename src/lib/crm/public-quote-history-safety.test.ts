import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/crm/public-quote.ts", "utf8");

describe("partial acceptance history safety", () => {
  it("never invokes the legacy same-job selection splitter from public acceptance", () => {
    expect(source).not.toContain("materializeSignedQuoteSelection(");
    expect(source).not.toContain("materializeSignedQuoteSelection,");
  });

  it("keeps historical repair explicit and guarded", () => {
    expect(source).toContain("backfillPartialPublicQuoteAcceptance");
    expect(source).toContain("expectedSignedAt");
    expect(source).toContain("expectedContractTotal");
  });
});
