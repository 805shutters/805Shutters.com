import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { manufacturerBrandingFixture } from "@/lib/crm/customer-quote-branding.test-fixture";
import { buildQuoteEmail } from "@/lib/notify/email";
import { CustomerContractDocument } from "./CustomerContractDocument";

function expectUnbranded(text: string) {
  // Polar White is a selected fabric color, not attribution to Polar Shades.
  expect(text.replaceAll("Polar White", "selected color")).not.toMatch(/Norman|Onyx|Polar|Lotus|Soluna|SmartRise|Somfy|Supplier|\bMFR\b/i);
  expect(text).toContain("805 Shutters");
  expect(text).toContain("Polar White");
  expect(text).toContain("Cordless");
  expect(text).toContain("Painted Basswood");
  expect(text).toContain("1,679.90");
}

describe("customer quote branding across delivery surfaces", () => {
  it.each([false, true])("removes legacy costs from contract and email when signed=%s", (signed) => {
    const quote = manufacturerBrandingFixture(signed);
    const internal = ["Dealer Cost: 111.3", "Quote B Source Price: 248", "Quote B Uplift Percent: 10"];
    for (const line of quote.lines) {
      line.options.push(...internal);
      for (const option of line.designOptions) option.options.push(...internal);
    }
    const original = structuredClone(quote);
    const html = renderToStaticMarkup(createElement(CustomerContractDocument, { quote, previewOnly: true }));
    const email = buildQuoteEmail(quote.customerName, "https://example.invalid/quote/test", quote.total, quote);
    for (const output of [html, email.html, email.text]) {
      expect(output).not.toMatch(/111\.3|Dealer Cost|Source Price|Uplift Percent/);
      expectUnbranded(output);
    }
    expect(quote).toEqual(original);
  });

  it.each([false, true])("renders an unbranded contract when signed=%s without changing prices or source records", (signed) => {
    const quote = manufacturerBrandingFixture(signed);
    const original = structuredClone(quote);
    const html = renderToStaticMarkup(createElement(CustomerContractDocument, { quote, previewOnly: true }));
    expectUnbranded(html);
    expect(html).toContain("7-year warranty against warping and cracking");
    expect(html).toContain("Shutter Manufacturer Warranty");
    expect(html).not.toMatch(/normanusa\.com|onyxshutters\.com|data-manufacturer|manufacturer-stamp/);
    expect(quote).toEqual(original);
  });

  it("uses the same branding rules for HTML and plain-text customer email", () => {
    const quote = manufacturerBrandingFixture();
    const email = buildQuoteEmail(quote.customerName, "https://example.invalid/quote/test", quote.total, {
      ...quote, personalNote: "Your Norman Soluna Roller Shades quote is ready.",
    });
    expectUnbranded(email.html);
    expectUnbranded(email.text);
  });
});
