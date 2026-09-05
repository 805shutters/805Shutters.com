import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QuoteLabCatalogProduct } from "@/lib/quote-lab/types";
import { choiceGroupAction, ManufacturerProductButtons } from "./ManufacturerProductButtons";

const noop = () => undefined;
const products = [
  { id: "roller-one", name: "Roller One", productType: "Roller Shades", manufacturer: "Norman" },
  { id: "roller-two", name: "Roller Two", productType: "Roller Shades", manufacturer: "Norman" },
  { id: "roller-other", name: "Roller Other", productType: "Roller Shades", manufacturer: "Onyx" },
  { id: "shutter-one", name: "Shutter One", productType: "Shutters", manufacturer: "Norman" },
].map((product) => ({ ...product, provisional: false, source: null, programs: [{ id: "program", name: "Program", priceAxis: "wh" as const, priceBasis: "dealer_net" as const }], surcharges: [], motorizationGroups: [] })) as unknown as QuoteLabCatalogProduct[];

function render(selectedManufacturer: string | null, selectedProductId: string | null, family: string | null, compactMobile = true) {
  return renderToStaticMarkup(React.createElement(ManufacturerProductButtons, {
    products,
    selectedManufacturer,
    selectedProductId,
    mobileProductFamily: family,
    compactMobile,
    onSelectMobileProductFamily: noop,
    onSelectManufacturer: noop,
    onSelectProduct: noop,
  }));
}

describe("ManufacturerProductButtons compact groups", () => {
  it("starts each valid mobile selection as one accessible summary button", () => {
    const html = render("Norman", "roller-one", "Roller Shades");
    expect((html.match(/<button/g) || [])).toHaveLength(3);
    expect(html).toContain("Product family: Roller Shades. Show choices");
    expect(html).toContain("Manufacturer: Norman. Show choices");
    expect(html).toContain("Exact product: Roller One. Show choices");
    expect(html).not.toContain("Roller Two");
    expect(html).not.toContain("Onyx");
  });

  it("expands valid dependent choices when a saved manufacturer or product is unavailable", () => {
    const badManufacturer = render("Missing", "roller-one", "Roller Shades");
    expect(badManufacturer).toContain(">Norman</button>");
    expect(badManufacturer).toContain(">Onyx</button>");
    expect(badManufacturer).not.toContain("Roller One");

    const badProduct = render("Norman", "missing-product", "Roller Shades");
    expect(badProduct).toContain("Roller One");
    expect(badProduct).toContain("Roller Two");
  });

  it("reopens selected mobile choices without a callback and collapses real choices", () => {
    expect(choiceGroupAction("Shutters", true, true)).toEqual({ toggleExpanded: true });
    expect(choiceGroupAction("Roller Shades", false, true)).toEqual({ toggleExpanded: false, nextValue: "Roller Shades" });
    expect(choiceGroupAction("Shutters", true, false)).toEqual({ toggleExpanded: false, nextValue: null });
  });

  it("retains the original expanded desktop markup, classes, data, and callbacks", () => {
    const html = render("Norman", "roller-one", "Roller Shades", false);
    expect((html.match(/<button/g) || [])).toHaveLength(6);
    expect(html).toContain("Roller Two");
    expect(html).toContain("Onyx");
    expect(html).toContain("quote-product-option rounded-2xl");
    expect(html).toContain("quote-product-option--selected");
    expect(html).toContain("bg-gradient-to-br");
    expect(html).toContain("data-catalog-product-id=\"roller-one\"");
    expect(html).not.toContain("aria-expanded");
  });

  it("keeps catalog IDs as data while naming compact exact-product summaries for humans", () => {
    const html = render("Norman", "roller-one", "Roller Shades");
    expect(html).toContain("data-catalog-product-id=\"roller-one\"");
    expect(html).toContain("aria-label=\"Exact product: Roller One. Show choices\"");
    expect(html).not.toContain("aria-label=\"Exact product: roller-one");
  });
});
