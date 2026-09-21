import { describe, expect, it } from "vitest";
import { customerQuoteOptions } from "./customer-quote-branding";
import { quoteProductDetails } from "./customer-quote-details";
import { getQuoteDesignDetails } from "@mts/lib/quoteDesignDetails";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from "./sales-quote-v2-customer-configuration";
import type { SelectionContext } from "@/lib/quote-v2/core";

describe("purchase details instead of manufacturing worksheets", () => {
  it.each([
    "Mount Depth (inches)", "available_depth_inches", "Opening diagonal difference",
    "Hardware clearance", "Flat mounting area", "Recess Arrangement", "Contract Mount Fit",
    "Screw Mounting-Area Height (inches)", "Available Shade Mounting-Space Height (inches)",
    "Left Magnetic Catch Side Clearance (inches)", "Ceiling pocket depth",
    "Bracket Installation", "Shim Layers per Bracket", "Wand Drop (inches)",
    "Light Guard Channel Lengths", "Custom Chain Length", "AutoWand Length (inches)",
    "Unobstructed Below Tension Device", "Keystone 1 from Left in Inches", "Splice Locations",
    "Joint 3 from Valance Left", "Keystone centers from inner left end",
    "Divider-rail positions", "T-post positions", "Offset tilt distance", "Tilt-rod section lengths",
    "Left Cut-out Top from Headrail in Inches", "Handle center from bottom", "Lock center from bottom",
    "Panel net widths", "Finished Net Shade Height", "Net Left Leg Height",
    "Common Valance Group", "Side-by-Side Matching Group", "Butt Together Group",
    "Shade Remote Channel", "Motor Network Number", "Shared power panel", "Shared Automate Hub",
    "Lotus Observed Offering Id", "Lotus Part Installed Reference", "Donor Candidate Skus",
    "Norman Shutter Panels V1", "Fabric Group", "Measurements", "Order Type",
    "Hard Surface Install", "Requires Ladder Over 15ft", "Requires Takedown",
    "Sundance Cellular Template Reference", "Sundance Cellular Shape Side 1", "Sundance Blind Depth",
    "Sundance Walden Flush", "Cutout Width Inches", "Frame T Post 1 Location", "Onyx Panel 1 Height Inches",
    "Onyx Tilt Section 1 Length Inches", "Inside Mount Arrangement", "Clear Opening Height for Charging (inches)",
  ])("omits internal %s at serialization and rendering without changing source", label => {
    const source = [`${label}: 17`, "Fabric Color: F0183 — Milk", "Charging Extension Wand Length: 39 inches"];
    const original = [...source];
    const expected = source.slice(1);
    expect(customerQuoteOptions(source)).toEqual(expected);
    expect(quoteProductDetails("", source).map(detail => `${detail.label}: ${detail.value}`)).toEqual(expected);
    expect(source).toEqual(original);
  });

  it.each([
    "Material: Ash", "Louver Size: 3.5 inches", "Tilt: Hidden tilt", "Frame: Z frame",
    "Panel configuration: 2 panels", "Divider-rail count: 1", "Specialty shape: Arch",
    "Fabric: Lakeside", "Fabric Color: F0183 — Milk", "Cell size: 3/4 inch",
    "Light Control: Room Darkening", "Rear fabric: Mist", "Banding Layout: Three sides",
    "Lining: Blackout", "Fold Style: Flat Fold", "Fabric orientation: Railroaded",
    "Valance Returns: Both ends", "Custom Valance Width: 92 inches", "Keystone Quantity: 2",
    "Hem-Bar Color: White", "Fascia End Caps: Metal", "Operating Chain: White Plastic",
    "Mount Type: Inside Mount", "Operating system: Cordless", "Charging Extension Wand Length: 39 inches",
    "Charging Wand Color: White", "Extra Charging Kits for This Line: 2", "Remote: 5-channel",
    "Pole Length: 36 inches", "Shelf depth: 4 inches", "Vanes per pack: 20",
    "Requested vane length in inches: 80", "Yards per cut: 5", "Cover size in inches: 20 × 20",
    "SKU: 12345-W", "Item: Replacement bracket", "Privacy accessory pieces: Side channels × 2",
    "Vertical component: Vanes only — 14 × 60 inches", "Aluminum Shims: 2",
    "Installation: $25.00", "Shipping: $14.00", "Complementary temporary paper shade: Free",
    "Notes: Five-panel sliding panel track with white finish",
  ])("retains the purchased specification %s", option => {
    expect(customerQuoteOptions([option])).toEqual([option]);
    expect(quoteProductDetails("", [option])).toHaveLength(1);
  });

  it("gives legacy and V2 contracts the same customer specification while preserving saved amounts", () => {
    const design = {
      supplier: "Norman", unit_price: 2047, quantity: 2, lift_system: "Cordless",
      options_json: { fabric_color_code: "F0183", fabric_color_name: "Milk", mount_depth_inches: 2.125,
        roman_mount_fit: "Flush Inside", roman_banding_layout: "Three sides", roman_shim_layers: 2 },
    } as unknown as SalesQuoteDesign;
    const source = structuredClone(design);
    const legacy = customerQuoteOptions(getQuoteDesignDetails(design).map(detail => `${detail.label}: ${detail.value}`));
    expect(legacy.join("\n")).toContain("Banding Layout: Three sides");
    expect(legacy.join("\n")).not.toMatch(/mount depth|recess|shim layers/i);
    const selection = { manufacturerId: "norman", productId: "roman", configuration: {
      ...design.options_json, lift_system: "Cordless", shared_power_panel_id: "private-assembly-17",
      smartdrape_charging_wand_length: "39", smartdrape_charging_wand_color: "White",
    }, options: [] } as unknown as SelectionContext;
    const config = customerConfigurationFromSelection(selection);
    const serialized = customerQuoteOptions(v2CustomerConfigurationOptions(config));
    expect(serialized.join("\n")).not.toMatch(/mount depth|private-assembly|recess|shim layers/i);
    expect(serialized).toContain("Charging Extension Wand Length: 39");
    expect(design).toEqual(source);
    expect(selection.configuration.mount_depth_inches).toBe(2.125);
  });

  it.each([
    ["Sundance roller · PDF 6, table 1", "Sundance roller"],
    ["Price Group 1", ""],
    ["Cordless Fabric - Price Group 1", "Cordless Fabric"],
    ["Lakeside — F0183 Milk", "Lakeside — F0183 Milk"],
  ])("removes import routing from style %s without losing real styles", (source, expected) => {
    expect(quoteProductDetails(source, [])).toEqual(expected ? [{ label: "Style", value: expected }] : []);
  });

  it("shows a selected fabric once and omits returns when no valance is purchased", () => {
    expect(quoteProductDetails("", [
      "Fabric: F0183 - Milk | Lakeside", "Fabric Color: F0183 - Milk", "Roman Fabric Category: Lakeside",
      "Valance: No Valance", "Valance Returns: No Returns", "Rear fabric: Mist",
    ])).toEqual([
      { label: "Fabric", value: "F0183 - Milk | Lakeside" },
      { label: "Valance", value: "No Valance" }, { label: "Rear fabric", value: "Mist" },
    ]);
  });

  it("retains a color that adds information to the fabric collection", () => {
    expect(quoteProductDetails("", ["Fabric: Lakeside", "Fabric Color: F0183 - Milk | Lakeside"]))
      .toContainEqual({ label: "Fabric Color", value: "F0183 - Milk | Lakeside" });
    expect(quoteProductDetails("", ["Fabric: Off White", "Fabric Color: White"]))
      .toContainEqual({ label: "Fabric Color", value: "White" });
  });

  it("keeps the shutter application while hiding unrelated order metadata", () => {
    const options = v2CustomerConfigurationOptions({ manufacturerId: "onyx", selections: { onyx_order_type: "French Door" } });
    expect(customerQuoteOptions(options)).toContain("Shutter type: French Door");
  });

  it("names purchased motorization components without displaying internal catalog keys", () => {
    const selections = { motorization_selections: [
      { groupId: "automate_home", optionId: "power_distribution_panel", role: "power_supply", units: 1 },
      { groupId: "private-unknown", optionId: "internal-17", role: "accessory", units: 1 },
    ] };
    const original = structuredClone(selections);
    const output = customerQuoteOptions(v2CustomerConfigurationOptions({ manufacturerId: "Norman", selections })).join("\n");
    expect(output).toMatch(/power distribution panel/i);
    expect(output).not.toMatch(/automate_home|private-unknown|internal-17/i);
    expect(selections).toEqual(original);
  });

  it("retains shutter purchase choices in V2 without serializing the panel worksheet", () => {
    const selection = { manufacturerId: "Norman", productId: "norman_shutters", options: {}, configuration: {
      norman_shutter_panels_v1: { version: 1, application: "bypass_closed", motor: "perfect_tilt_g4",
        existingDoorGlassOrSidelight: false, panels: [{ heightInches: 80, divider: "present" }] },
    } } as unknown as SelectionContext;
    const original = structuredClone(selection);
    const output = customerQuoteOptions(v2CustomerConfigurationOptions(customerConfigurationFromSelection(selection)));
    expect(output).toEqual(expect.arrayContaining(["Shutter type: Closed Bypass", "Motor: Motorized tilt", "Divider rail: Yes"]));
    expect(JSON.stringify(output)).not.toMatch(/heightInches|80|version|panels_v1/);
    expect(selection).toEqual(original);
  });
});
