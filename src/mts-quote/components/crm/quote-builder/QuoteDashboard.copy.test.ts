import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboardSource = fs.readFileSync(
  path.join(process.cwd(), "src/mts-quote/components/crm/quote-builder/QuoteDashboard.tsx"),
  "utf8",
);
const tableSource = fs.readFileSync(
  path.join(process.cwd(), "src/mts-quote/components/crm/quote-builder/QuotesTable.tsx"),
  "utf8",
);

describe("QuoteDashboard copy transport", () => {
  it("uses the authenticated alternative endpoint only for persisted V2 quotes", () => {
    expect(dashboardSource).toContain("if (original.quote_v2_backend === true)");
    expect(dashboardSource).toContain("createQuoteV2Alternative(supabase, quoteId");
    expect(dashboardSource).toContain('mode: "copy"');
    expect(dashboardSource).toContain("expectedRevision: Number(original.quote_v2_revision)");
    expect(dashboardSource).toContain('.rpc(\n        "next_quote_number"');
  });

  it("retains the V2 idempotency key on failure and clears it after success", () => {
    expect(dashboardSource).toContain("copyQuoteRequests.current.get(quoteId)");
    expect(dashboardSource).toContain("copyQuoteRequests.current.set(quoteId, idempotencyKey)");
    expect(dashboardSource).toContain("copyQuoteRequests.current.delete(quoteId)");
    expect(dashboardSource).not.toMatch(/onError:[\s\S]{0,200}copyQuoteRequests\.current\.delete/);
  });

  it("opens a copied V2 quote and reports failures", () => {
    expect(dashboardSource).toMatch(/if \(serverOwnedV2\) \{[\s\S]*setActiveQuote\(quote\.id\);[\s\S]*setActiveTab\("builder"\)/);
    expect(dashboardSource).toContain('toast.error("Failed to copy quote: " + error.message)');
  });

  it("disables the matching copy button while its mutation is pending", () => {
    expect(dashboardSource).toContain("copyingQuoteId={copyQuote.isPending ? copyQuote.variables : null}");
    expect(tableSource).toContain("disabled={copyingQuoteId === salesQuoteId}");
    expect(tableSource).toContain('copyingQuoteId === salesQuoteId ? "Copying quote" : "Copy quote"');
  });
});
