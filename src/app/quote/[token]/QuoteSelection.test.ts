import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicQuote } from "@/lib/crm/public-quote";
import { DEFAULT_ADJUSTMENTS } from "@/lib/crm/quote-builder";
import { QuoteSelection } from "./QuoteSelection";
import { CustomerContractDocument } from "./CustomerContractDocument";

const quoteSelectionCss = readFileSync(new URL("./QuoteSelection.module.css", import.meta.url), "utf8");

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
    payment: {
      available: true,
      dueType: "deposit",
      amountDue: 254.7,
      outstanding: 509.4,
      depositPaid: 0,
      paidTotal: 0,
    },
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
  const paymentOptions = {
    venmoHandle: "approved-venmo",
    venmoQrSvg: "<svg></svg>",
    zelleDestination: "805-806-9344",
  };

  it("renders saved legacy product specifications on the customer contract", () => {
    const html = renderToStaticMarkup(createElement(QuoteSelection, { quote: quoteWithLegacyDetails() }));

    expect(html).toContain("Roller Shades");
    expect(html).toContain("Callie");
    expect(html).toContain("Fabric");
    expect(html).toContain("Callie - Linen");
    expect(html).toContain("Lift System");
    expect(html).toContain("Cordless");
    expect(html).toContain("Mount Type");
    expect(html).toContain("Inside Mount");
    expect(html).toContain("Valance");
    expect(html).toContain("Cassette");
    const roomIndex = html.indexOf("Kitchen");
    const linePriceIndex = html.indexOf("$509.40", roomIndex);
    expect(roomIndex).toBeGreaterThan(-1);
    expect(linePriceIndex - roomIndex).toBeLessThan(500);
    expect(html).not.toContain('48&quot; W');
  });

  it("puts a compact order summary before the signing and deposit actions", () => {
    const html = renderToStaticMarkup(createElement(QuoteSelection, {
      quote: quoteWithLegacyDetails(false),
      paymentOptions,
    }));
    expect(html.match(/Sign the contract/g)).toHaveLength(1);
    expect(html.match(/Sign &amp; approve/g)).toHaveLength(1);
    expect(html).toContain("Sign contract here");
    expect(html).not.toContain("Next steps");
    expect(html).not.toContain("Finish your order");
    expect(html.indexOf("Contract")).toBeLessThan(html.indexOf("Sign contract here"));
    expect(html.indexOf("Kitchen")).toBeLessThan(html.indexOf("Sign contract here"));
    expect(html.indexOf("$509.40")).toBeLessThan(html.indexOf("Sign contract here"));
    expect(html).toContain("Make a deposit");
  });

  it("keeps the desktop action panel fixed over the full-width contract", () => {
    expect(quoteSelectionCss).toMatch(/\.contractLayout\s*{\s*display:\s*block;/);
    expect(quoteSelectionCss).toMatch(/\.actionPanel\s*{[^}]*position:\s*fixed;[^}]*top:\s*16px;[^}]*right:\s*16px;/s);
    expect(quoteSelectionCss).toMatch(/\.actionPanel\s*{[^}]*z-index:\s*30;/s);
    expect(quoteSelectionCss).toContain("@media (max-width: 1100px)");
  });

  it("reserves a desktop rail so the pinned action panel cannot cover the quote", () => {
    const html = renderToStaticMarkup(createElement(CustomerContractDocument, {
      quote: quoteWithLegacyDetails(false),
      paymentOptions,
    }));

    expect(html).toContain("customer-contract-main-content--with-actions");
    expect(html).toContain("@media screen and (min-width: 1101px)");
    expect(html).toContain("padding-right: 362px");
    expect(html).toContain("max-width:none");
  });

  it("shows the ledger-derived deposit due with card, Zelle, and Venmo paths", () => {
    const html = renderToStaticMarkup(createElement(QuoteSelection, {
      quote: quoteWithLegacyDetails(false),
      paymentOptions,
    }));

    expect(html).toContain("Deposit due");
    expect(html).toContain("$254.70");
    expect(html).toContain("Pay deposit with card");
    expect(html).toContain("@approved-venmo");
    expect(html).toContain("805-806-9344");
    expect(html).toContain("Copy Zelle phone number 805-806-9344");
    expect(html).toContain("Copy Venmo address @approved-venmo");
    expect(html.match(/Tap to copy/g)).toHaveLength(2);
  });

  it("switches the side panel to the authoritative balance after the deposit is paid", () => {
    const quote = quoteWithLegacyDetails(true);
    quote.payment = {
      available: true,
      dueType: "balance",
      amountDue: 254.7,
      outstanding: 254.7,
      depositPaid: 254.7,
      paidTotal: 254.7,
    };
    const html = renderToStaticMarkup(createElement(QuoteSelection, { quote, paymentOptions }));

    expect(html).toContain("Balance due");
    expect(html).toContain("Deposit paid");
    expect(html).toContain("Pay balance with card");
    expect(html).not.toContain("Pay deposit with card");
  });

  it("renders the complete customer document without action controls in an internal preview", () => {
    const html = renderToStaticMarkup(createElement(QuoteSelection, {
      quote: quoteWithLegacyDetails(false),
      previewOnly: true,
      paymentOptions,
    }));

    expect(html).toContain("Contract");
    expect(html).toContain("Roller Shades");
    expect(html).not.toContain("Purchase:");
    expect(html).not.toContain("Sign &amp; approve");
    expect(html).not.toContain("Pay deposit with card");
    expect(html).not.toContain("Make a payment");
  });

  it("isolates the contract from website chrome when printing", () => {
    const html = renderToStaticMarkup(createElement(CustomerContractDocument, {
      quote: quoteWithLegacyDetails(true),
    }));

    expect(html).toContain("customer-contract-print-root");
    expect(html).toContain("805-shutters-logo-header.png");
    expect(html).toContain("customer-contract-screen-brand");
    expect(html).toContain(".customer-contract-print-only { display: none !important; }");
    expect(html).toContain("class=\"customer-contract-print-only\"");
    expect(html).toContain("body * { visibility: hidden !important; }");
    expect(html).toContain(".site-header-shell,");
    expect(html).toContain(".site-footer { display: none !important; }");
    expect(html).toContain(".no-print { display: none !important; }");
  });
});
