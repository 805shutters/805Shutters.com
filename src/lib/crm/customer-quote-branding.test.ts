import { describe, expect, it } from "vitest";
import { customerQuoteOptions, customerQuoteProductName, customerQuoteText } from "./customer-quote-branding";
import { quoteProductDetails } from "./customer-quote-details";
import { getQuoteDesignDetails } from "@mts/lib/quoteDesignDetails";
import { getCustomerLineItemProductImage, getLineItemProductImage } from "@mts/lib/quoteProductImages";
import type { SalesQuoteDesign } from "@mts/types/quote";

describe("customer quote branding boundary", () => {
  it.each([
    ["Norman Soluna® Roller Shades", "Roller Shades"],
    ["ONYX Shutters", "Shutters"],
    ["Polar Roller Shades", "Roller Shades"],
    ["Lotus Faux Wood Blinds", "Faux Wood Blinds"],
    ["Portrait Honeycomb Shades", "Honeycomb Shades"],
    ["Ultimate Normandy Cordless Wood Blinds", "Cordless Wood Blinds"],
    ["PerfectSheer Shades", "Sheer Shades"],
    ["SmartDrape", "Drapery"],
    ["", "Window treatment"],
  ])("presents %s without product branding", (input, expected) => {
    expect(customerQuoteProductName(input)).toBe(expected);
  });

  it("omits manufacturer fields, including custom manufacturers, and keeps physical specifications", () => {
    expect(customerQuoteOptions([
      "Supplier: Acme Custom Factory", "MFR: NORMAN", "Manufacturer selection: Polar",
      "Brand: Lotus", "Catalog Product Id: onyx_shutters", "Material: Poly Composite",
      "Motor: Somfy Rechargeable", "Lift System: SmartRise Cordless", 'Louver Size: 3 1/2"',
    ])).toEqual(["Material: Poly Composite", "Motor: Rechargeable", "Lift System: Cordless", 'Louver Size: 3 1/2"']);
  });

  it("preserves internal supplier and design records", () => {
    const design = { supplier: "Norman", material: "Woodlore", unit_price: 123.45, options_json: {} } as SalesQuoteDesign;
    const before = structuredClone(design);
    const internal = getQuoteDesignDetails(design);
    const customer = quoteProductDetails("", internal.map((d) => `${d.label}: ${d.value}`));
    expect(internal).toContainEqual({ label: "Supplier", value: "Norman" });
    expect(customer).not.toContainEqual({ label: "Supplier", value: "Norman" });
    expect(design).toEqual(before);
  });

  it("keeps vendor inspiration in the builder but not the contract", () => {
    const item = { product_type: "Shutters" };
    expect(getLineItemProductImage(item, [{ supplier: "Norman" }])?.manufacturer).toBe("Norman");
    const image = getCustomerLineItemProductImage(item);
    expect(image.title).toBe("Shutters");
    expect(image.imageUrl).toMatch(/^\/images\//);
    expect(JSON.stringify(image)).not.toMatch(/norman|onyx|manufacturer/i);
  });

  it("preserves 805 branding and ordinary installation specifications", () => {
    expect(customerQuoteText("805 Shutters — 3 1/2 inch — White — Inside Mount")).toBe("805 Shutters — 3 1/2 inch — White — Inside Mount");
  });

  it("does not mistake actual color names for manufacturer attribution", () => {
    expect(customerQuoteOptions(["Supplier: Polar", "Fabric Color: F1244 - Polar White", "Color: Onyx", "Fabric: F1957 - Lotus White"]))
      .toEqual(["Fabric Color: F1244 - Polar White", "Color: Onyx", "Fabric: F1957 - Lotus White"]);
  });
});
