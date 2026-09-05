import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractProductIllustration } from "@/components/quote/ContractProductIllustration";
import { customerQuoteOptions } from "@/lib/crm/customer-quote-branding";
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from "@/lib/crm/sales-quote-v2-customer-configuration";
import type { SelectionContext } from "@/lib/quote-v2/core";
import { contractIllustration } from "./contract-illustrations";

describe("approved C contract illustrations", () => {
  it.each(["Roller Shades", "Honeycomb Shades"])("shows both loop sides and cordless / motorized for %s", (product) => {
    for (const side of ["Left", "Right"]) {
      const art = contractIllustration(product, ["Operating system: Continuous Cord Loop", `Chain location: ${side}`]);
      expect(art?.src).toContain(`loop-${side.toLowerCase()}.webp`);
      expect(art?.alt).toContain(side.toLowerCase());
      expect(art?.remote).toBe(false);
      expect(existsSync(`public${art?.src}`)).toBe(true);
    }
    const cordless = contractIllustration(product, ["Lift System: Cordless", "Control Side: Right"]);
    expect(cordless?.src).not.toContain("loop");
    expect(cordless?.remote).toBe(false);
    const motor = contractIllustration(product, ["Lift System: Motorized", "Control Side: Left"]);
    expect(motor?.src).toEqual(cordless?.src);
    expect(motor?.remote).toBe(true);
  });

  it.each(["Faux Wood Blinds", "Wood Blinds", "Mini Blinds"])("uses the requested wand side for %s", (product) => {
    const left = contractIllustration(product, ["Control side: Left"]);
    const right = contractIllustration(product, ["Control side: Right"]);
    expect(left?.mirror).toBe(false);
    expect(right?.alt).toContain("Wand tilt · right");
    expect(left?.remote).toBe(false);
    expect(right?.remote).toBe(false);
    if (product === "Faux Wood Blinds") expect(right?.src).toContain("faux-wood-wand-right");
    else expect(right?.mirror).toBe(true);
  });

  it.each([
    ["Shutters", ["Panel Config: LR", "Tilt Type: Standard Tilt"]], ["Roman Shades", ["Lift System: Cordless"]],
    ["Sheer Shades", ["Lift System: Cordless"]], ["Vertical Blinds", []], ["Smart Drapes", []],
  ] as const)("ships the approved standalone asset for %s", (product, options) => {
    const art = contractIllustration(product, options);
    expect(art).not.toBeNull();
    expect(existsSync(`public${art?.src}`)).toBe(true);
  });

  it.each([
    ["Roller Shades", []],
    ["Roller Shades", ["Lift System: Not motorized"]],
    ["Roller Shades", ["Lift System: Unsupported cordless system"]],
    ["Shutters", ["Specialty Shape: Triangle"]],
    ["Roller Shades", ["Lift System: Continuous Cord Loop"]],
    ["Roller Shades", ["Lift System: Continuous Cord Loop", "Control Side: Left", "Chain Location: Right"]],
    ["Faux Wood Blinds", []],
    ["Faux Wood Blinds", ["Control Side: Both"]],
    ["Faux Wood Blinds", ["Control Side: Left", "Lotus Blind Count: 3"]],
    ["Roller Shades", ["Lift System: Cordless", "Operating System: Motorized"]],
    ["Roller Shades", ["Lift System: Motorized", "Power Configuration: AutoWand"]],
    ["Roller Shades", ["Lift System: Cordless", "Shade Type: Dual Rollers"]],
    ["Honeycomb Shades", ["Lift System: Cord Loop TDBU", "Chain Location: Left"]],
    ["Honeycomb Shades", ["Lift System: Cord Loop TD", "Chain Location: Left"]],
    ["Roman Shades", ["Lift System: Continuous Cord Loop", "Control Side: Left"]],
    ["Unknown product", ["Lift System: Cordless"]],
  ] as const)("does not invent artwork for %s with %j", (product, options) => {
    expect(contractIllustration(product, options)).toBeNull();
  });

  it("preserves chain side through the authoritative public configuration boundary", () => {
    const selection: SelectionContext = { productId: "honeycomb_shade", programId: null, catalogVersion: "test", catalogAsOf: "2026-09-05", widthInches: 48, heightInches: 60, quantity: 1, manufacturerId: "norman", configuration: { lift_system: "Cord Loop", chain_location: "Left" }, options: {} };
    const projected = customerQuoteOptions(v2CustomerConfigurationOptions(customerConfigurationFromSelection(selection)));
    expect(projected).toContain("Chain location: Left");
    expect(contractIllustration("Honeycomb Shades", projected)?.src).toContain("honeycomb-loop-left");
  });

  it.each(["Cordless TDBU", "Top Down-Bottom Up", "Motorized TDBU"])("renders the cellular top-down/bottom-up configuration %s", (system) => {
    const options = customerQuoteOptions([`Operating system: ${system}`]);
    const art = contractIllustration("Cellular Shades", options);
    expect(art?.src).toContain("honeycomb-tdbu.webp");
    expect(art?.alt).toContain("Top-down/bottom-up");
    expect(art?.remote).toBe(system === "Motorized TDBU");
    expect(existsSync(`public${art?.src}`)).toBe(true);
  });

  it("keeps TDBU specialty and conflicting operations out of the standard illustration", () => {
    expect(contractIllustration("Honeycomb Shades", ["Lift System: Motorized TDBU", "Application: Skylight"])).toBeNull();
    expect(contractIllustration("Honeycomb Shades", ["Lift System: Cordless TDBU", "Operating System: Motorized"])).toBeNull();
    expect(contractIllustration("Roller Shades", ["Lift System: Cordless TDBU"])).toBeNull();
  });

  it("omits cleared sides from customer specifications", () => {
    expect(v2CustomerConfigurationOptions({manufacturerId: "norman", selections: {lift_system: "Motorized", control_side: null, chain_location: null}})).toEqual(["Manufacturer: Norman", "Operating system: Motorized"]);
  });

  it("renders the upright remote after the product without a visible remote caption", () => {
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, { productType: "Roller Shades", options: ["Lift System: Motorized"] }));
    expect(html).toContain('data-contract-illustration="c-v1"');
    expect(html.indexOf('alt="Roller Shades')).toBeLessThan(html.indexOf('alt="Motorized shade handheld control"'));
    expect(html).not.toContain("<figcaption");
    expect(html).not.toContain("rotate(");
    expect(html).not.toContain(">Remote<");
  });
});
