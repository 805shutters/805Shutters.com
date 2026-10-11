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
    expect(html).toContain("Quantity <strong>2</strong>");
    expect(html).toContain("honeycomb-tdbu.webp");
    const artworkIndex = html.indexOf('data-contract-illustration="c-v1"');
    expect(html.indexOf("Living room")).toBeLessThan(artworkIndex);
    expect(html).toContain("$498.95");
    expect(html.match(/Natural Tan/g)).toHaveLength(1);
    expect(html).toContain('data-contract-layout="grouped"');
    expect(html).not.toContain("Hide details");
    expect(html).not.toContain("Selection recap");
  });

  it("preserves actions, selection and geometry while omitting opening height", () => {
    const html=renderToStaticMarkup(createElement(QuoteLineItemCard,{...base,productType:'Shutters',dimensions:'70" × 45"',options:['Panel Config: LR','Tilt Type: Hidden Tilt','Split Tilt: Yes','Mount Type: Inside mount'],actions:createElement('button',null,'Save price'),selection:createElement('input',{type:'checkbox','aria-label':'Select item'}),notice:'10% off applied'}));
    for(const value of ['Save price','Select item','10% off applied','Inside mount','70″','shutter-hidden-split.webp','data-opening-aspect-ratio="1.5555555555555556"']) expect(html).toContain(value);
    expect(html).toContain('<summary>Edit price</summary>');
    expect(html).not.toContain('details open');
    expect(html.match(/<h2/g)).toHaveLength(1);
    expect(html).not.toContain('(Inside mount)');
    expect(html).not.toContain('45″');
    expect(html).not.toContain('45&quot;');
    expect(html).not.toContain('Width × height');
  });

  it("shows the complimentary shade once, only if the saved option includes it", () => {
    expect(render()).not.toContain("temporary-shade.webp");
    const html = render(["Lift System: Cordless TDBU", "Complementary temporary paper shade: Free"]);
    expect(html.match(/data-temporary-shade="included"/g)).toHaveLength(1);
    expect(html.match(/Complimentary temporary paper shade/g)).toHaveLength(1);
    expect(html).toContain("No charge");
    expect(render(["Temporary Shade: Yes", "Temporary Shade: No"])).not.toContain("temporary-shade.webp");
  });

  it("keeps notes after included accessories", () => {
    const html = render(["Lift System: Cordless", "Temporary Shade: Yes", "Notes: Keep sill clear"]);
    expect(html.indexOf('data-contract-notes=')).toBeGreaterThan(html.indexOf('data-temporary-shade="included"'));
    expect(html.match(/Keep sill clear/g)).toHaveLength(1);
  });

  it("retains unknown product specifications with a neutral reference instead of a blank", () => {
    const html = renderToStaticMarkup(createElement(QuoteLineItemCard, { ...base, productType: "Custom treatment", options: ["Customer request: Keep the existing hardware"] }));
    expect(html).toContain("Keep the existing hardware");
    expect(html).toContain("Additional details");
    expect(html).toContain('data-contract-illustration="c-v1"');
    expect(html).toContain('data-product-reference="custom"');
    expect(html).toContain('See specifications for configuration');
    expect(html).not.toContain("Natural Tan");
  });

  it("renders the special divider location and saved height on the customer contract", () => {
    const html = renderToStaticMarkup(createElement(QuoteLineItemCard, { ...base, productType: "Shutters", options: [
      "Divider rail: Yes", "Divider rail location: Custom", "Divider rail height: 32.625",
    ] }));
    expect(html).toContain("Divider rail location");
    expect(html).toContain("Custom");
    expect(html).toContain("Divider rail height");
    expect(html).toContain("32.625&quot;");
    expect(html).not.toContain("measurement not recorded");
  });
});
