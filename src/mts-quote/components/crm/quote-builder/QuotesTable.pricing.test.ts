import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SalesQuote } from "@mts/types/quote";
import { QuotesTable } from "./QuotesTable";

vi.mock("./QuoteStatusPill", () => ({ QuoteStatusPill: () => null }));

describe("quote dashboard amount", () => {
  function render(status: SalesQuote["status"], priceStatus: SalesQuote["quote_v2_status"]) {
    const quote = { id: "test-quote", status, total_amount: 726.78, quote_v2_backend: true, quote_v2_status: priceStatus } as SalesQuote;
    return renderToStaticMarkup(createElement(QuotesTable, {
      quotes: [{ ...quote, source: "sales", salesQuote: quote }], isLoading: false,
      onOpen() {}, onCopy() {}, onPortfolio() {}, onDelete() {},
    }));
  }
  it("does not advertise the priced portion of a blocked draft as its amount", () => {
    const html = render("draft", "blocked");
    expect(html).toContain("Pricing incomplete");
    expect(html).not.toContain("$726.78");
  });
  it("keeps completed draft and signed historical amounts visible", () => {
    expect(render("draft", "priced")).toContain("$726.78");
    expect(render("sold", "blocked")).toContain("$726.78");
  });
});
