import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync(
  "src/mts-quote/components/crm/quote-builder/QuoteOrderStatusPanel.tsx",
  "utf8",
);
const dashboard = readFileSync(
  "src/mts-quote/components/crm/quote-builder/QuoteDashboard.tsx",
  "utf8",
);
const statusPill = readFileSync(
  "src/mts-quote/components/crm/quote-builder/QuoteStatusPill.tsx",
  "utf8",
);
const crmApp = readFileSync("src/components/crm/CrmApp.tsx", "utf8");

describe("product-line order controls", () => {
  it("renders an independent amber control for every outstanding line", () => {
    expect(panel).toContain("quote.line_items.map");
    expect(panel).toContain('isOutstanding && "bg-amber-500 text-white hover:bg-amber-600"');
    expect(panel).toContain('variant={isOutstanding ? "default" : "outline"}');
    expect(panel).toContain("onMarkLineOrdered(quote, lineItem, orderRef)");
  });

  it("mounts the line-level order queue in the live quote dashboard", () => {
    expect(dashboard).toContain("<QuoteOrderStatusPanel");
    expect(dashboard).toContain("quotes={filteredOrderPanelQuotes}");
    expect(dashboard).toContain('activeFilter === "all" || filteredOrderPanelQuotes.length > 0');
    expect(dashboard).toContain("onMarkLineOrdered");
    expect(dashboard).toContain("sales-quote-order-lines");
  });

  it("does not expose a generic sold-to-ordered advance button", () => {
    expect(statusPill).toContain('status !== "sold"');
    expect(crmApp).not.toContain('key: "mark-ordered"');
    expect(crmApp).toContain("No product line was marked ordered.");
  });
});
