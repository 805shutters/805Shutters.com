import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/crm/historical-partial-repair.ts", "utf8");

describe("historical partial repair source safety", () => {
  it("uses exact staging guards, guarded backfill, and rollback without sends", () => {
    expect(source).toContain('.eq("updated_at", quote.updated_at)');
    expect(source).toContain('.eq("updated_at", contract.updated_at)');
    expect(source).toContain('.eq("updated_at", stagedQuote.updated_at)');
    expect(source).toContain('.eq("updated_at", stagedContract.updated_at)');
    expect(source).toContain('.eq("total_amount", input.expectedSourceTotal)');
    expect(source).toContain("backfillPartialPublicQuoteAcceptance");
    expect(source).toContain("rolledBackQuote");
    expect(source).not.toMatch(/sendQuote|notify|installer/i);
  });
});
