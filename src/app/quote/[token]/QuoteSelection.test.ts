import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicQuote } from "@/lib/crm/public-quote";
import { DEFAULT_ADJUSTMENTS } from "@/lib/crm/quote-builder";
import { QuoteSelection } from "./QuoteSelection";

function quoteWithLegacyDetails(signed = true): PublicQuote {
  return {
    token: "test-token",
    id: "quote-1",
    quoteNumber: "805-0109",
    customerName: "Test Customer",
    customerAddress: "123 Main St, Ventura, CA 93001",
    customerPhone: "805-555-1212",
    customerEmail: "test@example.com",
    status: "sent",
    signed,
    signedAt: null,
    lines: [
      {
        id: "line-1",
        lineItemId: "line-1",
        room: "Kitchen",
        productName: "Roller Shades",
        styleName: "",
        options: ["Fabric: Callie - Linen", "Lift System: Cordless"],
        designOptions: [
          {
            id: "design-1",
            label: "A",
            productName: "Roller Shades",
            styleName: "Callie",
            options: [
              "Fabric: Callie - Linen",
              "Lift System: Cordless",
              "Mount Type: Inside Mount",
              "Valance: Cassette",
            ],
            unitPrice: 509.4,
            lineTotal: 509.4,
            priceReady: true,
          },
        ],
        showDesignOptions: true,
        unitPrice: 509.4,
        quantity: 1,
        lineTotal: 509.4,
        discountPercent: 0,
        priceReady: true,
      },
    ],
    subtotal: 509.4,
    fees: [],
    discount: 0,
    tax: 0,
    sourceTotalAdjustment: 0,
    depositDue: 254.7,
    balanceDue: 254.7,
    total: 509.4,
    allPriced: true,
    hasOnyxShutters: false,
    adjustments: DEFAULT_ADJUSTMENTS,
    business: {
      name: "805 Shutters",
      phone: "805-806-9344",
      website: "https://www.805shutters.com",
      email: "805@805shutters.com",
    },
    versions: [],
  };
}

describe("QuoteSelection", () => {
  it("renders saved legacy product specifications on the customer contract", () => {
    const html = renderToStaticMarkup(createElement(QuoteSelection, { quote: quoteWithLegacyDetails() }));

    expect(html).toContain("Roller Shades");
    expect(html).toContain("Callie");
    expect(html).toContain("Fabric: Callie - Linen");
    expect(html).toContain("Lift System: Cordless");
    expect(html).toContain("Mount Type: Inside Mount");
    expect(html).toContain("Valance: Cassette");
    expect(html).not.toContain('48&quot; W');
  });

  it("puts review and sign actions at both ends with pricing before full details", () => {
    const html = renderToStaticMarkup(createElement(QuoteSelection, { quote: quoteWithLegacyDetails(false) }));
    expect(html.match(/Review &amp; sign this contract/g)).toHaveLength(2);
    expect(html.match(/Sign &amp; approve/g)).toHaveLength(2);
    expect(html.indexOf("Start here")).toBeLessThan(html.indexOf("Contract pricing"));
    expect(html.indexOf("Contract pricing")).toBeLessThan(html.indexOf("Complete contract"));
    expect(html.indexOf("Complete contract")).toBeLessThan(html.indexOf("Ready to proceed?"));
  });
});
