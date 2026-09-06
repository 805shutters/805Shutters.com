import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuoteLineItemCard } from "./QuoteLineItemCard";

const base = { lineNumber: 1, room: "Living room", productType: "Honeycomb Shades", optionLabel: "A", price: "$498.95", quantity: 2 };
const render = (options: string[] = []) => renderToStaticMarkup(createElement(QuoteLineItemCard, { ...base, options }));

describe("approved quote line item card", () => {
  it("pairs actual item, room, product, quantity and price with the option artwork", () => {
    const html = render(["Lift System: Cordless TDBU", "Fabric Color: Natural Tan", "Cell Size: 3/8 inch single cell"]);
    expect(html).toContain('data-quote-line-card="805-light"');
    expect(html).toContain("Item 01");
    expect(html).toContain("Option A");
    expect(html).toContain("Living room");
    expect(html).toContain("Honeycomb Shades");
    expect(html).toContain("Quantity 2");
    expect(html).toContain("honeycomb-tdbu.webp");
    const artworkIndex = html.indexOf('data-contract-illustration="c-v1"');
    expect(html.indexOf("Living room")).toBeLessThan(artworkIndex);
    expect(artworkIndex).toBeLessThan(html.indexOf("$498.95"));
    expect(html.match(/Natural Tan/g)).toHaveLength(1);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Hide details");
  });

  it("shows the complimentary shade once, only if the saved option includes it", () => {
    expect(render()).not.toContain("temporary-shade.webp");
    const html = render(["Lift System: Cordless TDBU", "Complementary temporary paper shade: Free"]);
    expect(html.match(/data-temporary-shade="included"/g)).toHaveLength(1);
    expect(html.match(/Complimentary temporary paper shade/g)).toHaveLength(1);
    expect(html).toContain("No charge");
    expect(render(["Temporary Shade: Yes", "Temporary Shade: No"])).not.toContain("temporary-shade.webp");
  });

  it("retains unknown product specifications without inventing a sketch or finish", () => {
    const html = renderToStaticMarkup(createElement(QuoteLineItemCard, { ...base, productType: "Custom treatment", options: ["Customer request: Keep the existing hardware"] }));
    expect(html).toContain("Keep the existing hardware");
    expect(html).toContain("Additional details");
    expect(html).not.toContain('data-contract-illustration="c-v1"');
    expect(html).not.toContain("Natural Tan");
  });
});
