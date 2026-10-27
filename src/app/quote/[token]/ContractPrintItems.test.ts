import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { manufacturerBrandingFixture } from "@/lib/crm/customer-quote-branding.test-fixture";
import { QuoteSelection } from "./QuoteSelection";
import { CustomerContractDocument } from "./CustomerContractDocument";

describe("customer contract pagination", () => {
  it.each([1, 2] as const)("keeps each odd-count item and its saved designs together at %i per page", (count) => {
    const quote = manufacturerBrandingFixture();
    quote.lines = quote.lines.slice(0, 3);
    const line = quote.lines[0];
    line.designOptions.push({ ...line.designOptions[0], id: "second", label: "B", options: ["Installation notes: Preserve the existing trim."] });
    const window = new Window();
    try {
      window.document.body.innerHTML = renderToStaticMarkup(createElement(QuoteSelection, { quote, previewOnly: true, printItemsPerPage: count }));
      const pages = [...window.document.querySelectorAll("[data-print-page]")];
      expect(pages).toHaveLength(Math.ceil(3 / count));
      expect(pages.map(page => page.querySelectorAll("[data-print-item]").length)).toEqual(count === 1 ? [1, 1, 1] : [2, 1]);
      const slots = [...window.document.querySelectorAll("[data-print-item]")];
      expect(slots).toHaveLength(3);
      quote.lines.forEach((item, index) => expect(slots[index].textContent).toContain(item.room));
      expect(slots[0].querySelectorAll("[data-quote-line-card]")).toHaveLength(2);
      expect(slots[0].textContent).toContain("Preserve the existing trim.");
      expect(slots[0].textContent).toContain("$402.90");
      expect(pages.every(page => page.textContent?.includes(quote.customerName))).toBe(true);
      expect(pages.at(-1)?.textContent).toContain("Items 3 of 3");
      expect(window.document.body.textContent).toContain("Payment at Installation");
      expect(window.document.querySelectorAll("[data-quote-line-card]")).toHaveLength(4);
    } finally { window.close(); }
  });

  it("defaults to two items, offers both choices, and leaves commercial schedules intact", () => {
    const window = new Window();
    try {
      const quote = manufacturerBrandingFixture();
      window.document.body.innerHTML = renderToStaticMarkup(createElement(CustomerContractDocument, { quote, previewOnly: true }));
      const select = window.document.querySelector("select");
      expect(select?.value).toBe("2");
      expect([...select!.options].map(option => option.textContent)).toEqual(["1 item per page", "2 items per page"]);
      window.document.body.innerHTML = renderToStaticMarkup(createElement(CustomerContractDocument, { quote: { ...quote, quoteType: "commercial" }, previewOnly: true }));
      expect(window.document.querySelector("select")).toBeNull();
      expect(window.document.querySelector("[data-print-page]")).toBeNull();
      expect(window.document.body.textContent).toContain("Commercial scope and pricing");
    } finally { window.close(); }
  });
});
