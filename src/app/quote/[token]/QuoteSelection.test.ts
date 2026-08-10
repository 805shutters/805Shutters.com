import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicQuote } from "@/lib/crm/public-quote";
import { DEFAULT_ADJUSTMENTS } from "@/lib/crm/quote-builder";
import { QuoteSelection } from "./QuoteSelection";
import { CustomerContractDocument } from "./CustomerContractDocument";

const quoteSelectionCss = readFileSync(new URL("./QuoteSelection.module.css", import.meta.url), "utf8");
const signQuoteSource = readFileSync(new URL("./SignQuote.tsx", import.meta.url), "utf8");
const walletButtonsSource = readFileSync(new URL("./QuoteWalletButtons.tsx", import.meta.url), "utf8");

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
  const walletConfig = {
    applicationId: "sq0idp-test",
    locationId: "LOCATION1",
    sdkUrl: "https://web.squarecdn.com/v1/square.js",
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

  it("puts contract details before the full signing and deposit forms", () => {
    const html = renderToStaticMarkup(createElement(QuoteSelection, {
      quote: quoteWithLegacyDetails(false),
      paymentOptions,
    }));
    expect(html.match(/Sign the contract/g)).toHaveLength(1);
    expect(html.match(/Sign &amp; approve/g)).toHaveLength(1);
    expect(html).toContain("Sign contract here");
    expect(html).toContain("I have reviewed my contract and agreed to the details and terms.");
    expect(html).not.toContain("I authorize 805 Shutters to proceed");
    expect(html).not.toContain("Next steps");
    expect(html).not.toContain("Finish your order");
    expect(html.indexOf("Kitchen")).toBeLessThan(html.indexOf('id="sign-contract"'));
    expect(html.indexOf("$509.40")).toBeLessThan(html.indexOf('id="sign-contract"'));
    expect(html).toContain("Make a deposit");
  });

  it("provides a thin fixed mobile action bar that links to the full forms", () => {
    const html = renderToStaticMarkup(createElement(QuoteSelection, {
      quote: quoteWithLegacyDetails(false),
      paymentOptions,
    }));

    expect(html).toContain('aria-label="Contract actions"');
    expect(html).toContain('href="#sign-contract"');
    expect(html).toContain('href="#payment"');
    expect(html).toContain("Sign contract here");
    expect(html).toContain("Pay deposit here");
    expect(quoteSelectionCss).toMatch(/\.mobileActionBar\s*{\s*display:\s*none;/);
    expect(quoteSelectionCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.mobileActionBar\s*{[^}]*position:\s*fixed;[^}]*bottom:[^;]+;[^}]*z-index:\s*1210;/s);
    expect(quoteSelectionCss).toMatch(/\.contractLayoutWithMobileActions\s*{[^}]*padding-bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\);/s);
  });

  it("keeps a signed customer on the contract and emphasizes the deposit as the next step", () => {
    const quote = quoteWithLegacyDetails(true);
    const html = renderToStaticMarkup(createElement(CustomerContractDocument, { quote, paymentOptions }));

    expect(html).toContain("Contract Signed");
    expect(html).toContain('role="status"');
    expect(html).toContain('data-payment-ready="true"');
    expect(html).toContain("Pay deposit here");
    expect(html).not.toContain("Sign &amp; approve");
    expect(html).not.toContain("This contract has been approved and signed.");
    expect(quoteSelectionCss).toMatch(/\.signedBadge\s*{[^}]*border:\s*2px solid #aeb3b8;/s);
    expect(quoteSelectionCss).toMatch(/\.actionSectionPaymentReady\s*{[^}]*border:\s*2px solid #aeb3b8;/s);
    expect(signQuoteSource).toContain("onSigned?.();");
    expect(signQuoteSource).toContain("Continue below to make your deposit.");
    expect(signQuoteSource).not.toMatch(/window\.location|location\.href|router\.(?:push|replace)/);
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

  it("uses a responsive four-column grid for product details", () => {
    expect(quoteSelectionCss).toMatch(/\.productConfiguration\s*{[^}]*container:\s*product-details\s*\/\s*inline-size;/s);
    expect(quoteSelectionCss).toMatch(/\.productDetails\s*{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s);
    expect(quoteSelectionCss).toContain("@container product-details (max-width: 839px)");
    expect(quoteSelectionCss).toContain("@container product-details (max-width: 599px)");
    expect(quoteSelectionCss).toContain("@container product-details (max-width: 279px)");
  });

  it("shows separate card, official Google Pay, Apple Pay, Zelle, and Venmo paths", () => {
    const html = renderToStaticMarkup(createElement(QuoteSelection, {
      quote: quoteWithLegacyDetails(false),
      paymentOptions,
      walletConfig,
    }));

    expect(html).toContain("Deposit due");
    expect(html).toContain("$254.70");
    expect(html).toContain("Pay deposit with card");
    expect(html).not.toContain("card or Google Pay");
    expect(html).toContain("Pay deposit with Apple Pay");
    expect(html).toContain("Pay deposit with Google Pay");
    expect(html).toContain("quote-google-pay-");
    expect(quoteSelectionCss).toContain("-webkit-appearance: -apple-pay-button");
    expect(quoteSelectionCss).toContain("-apple-pay-button-type: buy");
    expect(quoteSelectionCss).not.toMatch(/\.applePayButton\s*{[^}]*appearance:\s*none;/s);
    expect(walletButtonsSource).toContain("applePayButtonText");
    expect(walletButtonsSource).toContain("applePayButtonLogo");
    expect(quoteSelectionCss).toMatch(/\.walletButtons\[data-layout="single"\]\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
    expect(walletButtonsSource).toContain('buttonSizeMode: "fill"');
    expect(walletButtonsSource).toContain('data-layout={available.apple && available.google ? "split" : "single"}');
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
    expect(html).not.toContain('data-payment-ready="true"');
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
    expect(html).toContain("body:has(.customer-contract-print-root) .mobile-action-bar,");
    expect(html).toContain("body:has(.customer-contract-print-root) .assistant-widget { display: none !important; }");
  });
});
