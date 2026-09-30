import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { manufacturerBrandingFixture } from "@/lib/crm/customer-quote-branding.test-fixture";
import { CustomerContractDocument } from "./CustomerContractDocument";
import styles from "./QuoteIdentity.module.css";

describe("customer quote identity", () => {
  it.each(["B", "C", "D", "E", "AA"])("colors separately delivered quote %s without exposing sibling drafts or changing financial facts", (quoteLabel) => {
    const quote = { ...manufacturerBrandingFixture(), quoteLabel };
    const original = structuredClone(quote);
    const html = renderToStaticMarkup(createElement(CustomerContractDocument, { quote }));
    expect(html).toContain(styles.ribbonTitle);
    expect(html).toContain(`>Quote ${quoteLabel}</strong>`);
    expect(html).toContain(styles.frame);
    expect(html).not.toContain("Choose a quote to review");
    expect(html).toContain("1,679.90");
    expect(quote).toEqual(original);
  });
  it("keeps A neutral and single or internal previews free of alternative ribbons", () => {
    for (const quoteLabel of [undefined, "A"]) {
      const html = renderToStaticMarkup(createElement(CustomerContractDocument, { quote: { ...manufacturerBrandingFixture(), quoteLabel } }));
      expect(html).not.toContain(styles.ribbonTitle);
      expect(html.includes(styles.standardIdentity)).toBe(quoteLabel === "A");
    }
    const html = renderToStaticMarkup(createElement(CustomerContractDocument, { quote: { ...manufacturerBrandingFixture(), quoteLabel: "B" }, previewOnly: true }));
    expect(html).not.toContain(styles.ribbonTitle);
  });
  it("uses persistent letter colors and a viewing label when explicit quote links are supplied", () => {
    const quote = manufacturerBrandingFixture();
    quote.versions = ["A", "B", "C"].map(label => ({ token: label, label, total: quote.total, signed: false, current: label === "B" }));
    const html = renderToStaticMarkup(createElement(CustomerContractDocument, { quote }));
    expect(html).toContain("Viewing ✓");
    expect(html).toContain('href="/quote/C"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("--quote-color:#2263aa");
  });
});
