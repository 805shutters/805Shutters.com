import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/crm/sales-quote-order-lines/route.ts", "utf8");

describe("sales quote product-line order API", () => {
  it("requires an authenticated CRM user and verifies line ownership", () => {
    expect(route).toContain("requireCrmUser(request)");
    expect(route).toContain('.eq("quote_id", quoteId)');
    expect(route).toContain('.eq("id", lineItemId)');
  });

  it("persists an auditable line event before deriving the quote summary", () => {
    expect(route).toContain('action: "sales_quote_line.ordered"');
    expect(route).toContain('entity_type: "quote"');
    expect(route).toContain("deriveQuoteOrderPatch");
  });
});
