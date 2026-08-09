import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStoredSignedSelection, type PublicQuote, type PublicQuoteLine } from "@/lib/crm/public-quote";
import { DEFAULT_ADJUSTMENTS } from "@/lib/crm/quote-builder";
import { QuoteSelection } from "./QuoteSelection";

function line(id: string, room: string, total: number): PublicQuoteLine {
  return {
    id,
    lineItemId: id,
    room,
    productName: "Honeycomb Shades",
    styleName: "",
    options: [],
    designOptions: [],
    showDesignOptions: false,
    unitPrice: total,
    quantity: 1,
    lineTotal: total,
    discountPercent: 0,
    priceReady: true,
  };
}

describe("signed partial quote rendering", () => {
  it("renders only the persisted bedroom selection and its accepted total", () => {
    const originalLines = [
      line("sunroom-1", "Sunroom 1", 858.6),
      line("sunroom-2", "Sunroom 2", 858.6),
      line("primary-bedroom", "Primary Bedroom", 685.8),
      line("bed-2", "Bed 2", 450),
      line("bed-3", "Bed 3", 450),
    ];
    const lines = applyStoredSignedSelection(
      {
        signed_at: "2026-08-06T19:06:00.000Z",
        meta: { signed_selection: { lineItemIds: ["primary-bedroom"] } },
      },
      originalLines,
    );
    const quote: PublicQuote = {
      token: "isolated-token",
      id: "quote-805-0172",
      quoteNumber: "805-0172",
      customerName: "Isolated Customer",
      customerAddress: null,
      customerPhone: null,
      customerEmail: null,
      status: "sold",
      signed: true,
      signedAt: "2026-08-06T19:06:00.000Z",
      lines,
      subtotal: 685.8,
      fees: [],
      discount: 0,
      tax: 0,
      sourceTotalAdjustment: 0,
      depositDue: 342.9,
      balanceDue: 342.9,
      payment: { available: true, dueType: "balance", amountDue: 342.9, outstanding: 342.9, depositPaid: 342.9, paidTotal: 342.9 },
      total: 685.8,
      allPriced: true,
      hasOnyxShutters: false,
      adjustments: {
        ...DEFAULT_ADJUSTMENTS,
        discountPercent: 0,
        discountFlat: 0,
        taxPercent: 0,
        depositPercent: 50,
        fees: [],
      },
      business: {
        name: "805 Shutters",
        phone: "805-806-9344",
        website: "805Shutters.com",
        email: "805@805shutters.com",
      },
      versions: [],
    };

    const html = renderToStaticMarkup(createElement(QuoteSelection, { quote }));
    expect(html).toContain("Primary Bedroom");
    expect(html).toContain("$685.80");
    expect(html).not.toContain("Sunroom 1");
    expect(html).not.toContain("Bed 2");
    expect(html).not.toContain("$3,303.00");
  });
});
