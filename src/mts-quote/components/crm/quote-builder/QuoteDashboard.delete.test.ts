import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "src/mts-quote/components/crm/quote-builder/QuoteDashboard.tsx"), "utf8");

describe("QuoteDashboard delete transport", () => {
  it("routes sales quote deletion through the authenticated CRM API", () => {
    expect(source).toContain("/api/crm/sales-quotes/${encodeURIComponent(quoteId)}");
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("body.quoteId !== quoteId");
    expect(source).not.toContain('.from("sales_quotes").delete()');
  });
});
