import { describe, expect, it } from "vitest";
import { customerQuoteOptions, customerQuoteProductName, customerQuoteText } from "./customer-quote-branding";
import { quoteProductDetails } from "./customer-quote-details";
import { getQuoteDesignDetails } from "@mts/lib/quoteDesignDetails";
import { getCustomerLineItemProductImage, getLineItemProductImage } from "@mts/lib/quoteProductImages";
import type { SalesQuoteDesign } from "@mts/types/quote";

describe("customer quote branding boundary", () => {
  it.each([
    "Dealer Cost: 111.3", "dealer_cost: 111.3", "dealerCost: 111.3",
    "DEALER-COST: 111.3", "Wholesale Unit Price: 111.3", "internalCost: 111.3",
    "Landed Cost: 111.3", "Product Cost: 111.3", "Freight Cost: 25",
    "Margin Percent: 30", "Profit Dollars: 222.6", "Markup: 3",
    "Quote B Source Price: 248", "Quote B Uplift Percent: 10",
    "Dealer Cost 111.3", "Commission: 10", "COGS: 111.3",
  ])("excludes internal pricing from serialized options and rendered details: %s", (detail) => {
    const options = ["Hem Bar: Fabric Covered", detail, "Reverse Roll: Yes"];
    const original = [...options];
    expect(customerQuoteOptions(options)).toEqual(["Hem Bar: Fabric Covered", "Reverse Roll: Yes"]);
    expect(quoteProductDetails("", options)).toEqual([
      { label: "Hem Bar", value: "Fabric Covered" }, { label: "Reverse Roll", value: "Yes" },
    ]);
    expect(options).toEqual(original);
  });

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

it("filters V2 engine identifiers from previously formatted contract detail strings", () => {
  expect(quoteProductDetails("", [
    "Quote V2 Backend: Yes", "Priced Catalog Version: internal-v1",
    "Quote V2 Catalog As Of: 2026-09-19", "Priced Selection Fingerprint: sha256:internal",
    "Norman Assembly V1: internal", "Norman Order Record V1: internal",
    "Hardware Color: Nature", "Wand Drop (inches): 49", "Shim Layers per Bracket: 2",
  ])).toEqual([
    {label:"Hardware Color",value:"Nature"}, {label:"Wand Drop (inches)",value:"49"}, {label:"Shim Layers per Bracket",value:"2"},
  ]);
});


it("keeps complete neutral Sundance track details in customer output without changing stored portal values", () => {
  const source = [
    "Sundance Track Motor Type: IRISMO 45/LI-ON RECHARGEABLE/0.8 NM",
    "Sundance Track Headrail Colors: Bronze",
    "Sundance Track Motor Position: Motor Right",
    "Sundance Track Curved Track: No",
    "Sundance Track Stack Type: Split.",
    "Sundance Track Drapery Style Track: Ripple Fold Drapery style.",
    "Sundance Track Remote Control: Situo 5 (5 Lines)",
  ];
  const before = [...source];
  expect(quoteProductDetails("", source)).toEqual([
    {label:"Track Motor",value:"Rechargeable motor 45 / lithium-ion / 0.8 Nm"},
    {label:"Track Color",value:"Bronze"},
    {label:"Track Motor Position",value:"Motor Right"},
    {label:"Track Shape",value:"Straight"},
    {label:"Track Stack",value:"Split."},
    {label:"Drapery Style",value:"Ripple Fold Drapery style."},
    {label:"Track Remote",value:"5-channel remote"},
  ]);
  expect(source).toEqual(before);
  expect(customerQuoteOptions(["Sundance Track Motor Type: No", "Sundance Track Remote Control: No"]))
    .toEqual(["Track Motor: No motor", "Track Remote: No remote"]);
  expect(customerQuoteOptions(["Sundance Track Motor Type: IRISMO 35/ 24VOLTS/ 0.6 NM (WITH   TRANSFORMER)"]))
    .toEqual(["Track Motor: Low-voltage motor 35 / 24 volts / 0.6 Nm / transformer included"]);
});
