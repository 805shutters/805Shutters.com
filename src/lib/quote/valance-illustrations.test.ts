import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractProductIllustration } from "@/components/quote/ContractProductIllustration";
import { customerQuoteOptions } from "@/lib/crm/customer-quote-branding";
import { VALANCE_ARTWORK, valanceArtwork, valanceIllustration } from "./valance-illustrations";

describe("manufacturer-specific valance artwork", () => {
  it.each(VALANCE_ARTWORK)("ships a matching profile for $id", art => {
    expect(existsSync(`public${valanceArtwork(art.id)?.src}`)).toBe(true);
    expect(valanceIllustration(art.products[0], [`Supplier: ${art.manufacturer}`, `Valance: ${art.aliases[0]}*`])).toBe(art.id);
  });
  it("keeps identical names separate by manufacturer", () => {
    expect(valanceIllustration("Roller Shades", ["Supplier: Norman", "Valance: Square Cassette"])).toBe("norman-square-cassette");
    expect(valanceIllustration("Roller Shades", ["Supplier: Polar", "Valance: Square Cassette"])).toBe("polar-square-cassette");
  });
  it.each([
    ["Valance: Square Cassette"], ["Supplier: Onyx", "Valance: Square Cassette"],
    ["Supplier: Norman", "Manufacturer: Polar", "Valance: Square Cassette"],
    ["Supplier: Norman", "Valance: Unknown"], ["Supplier: Norman", "Valance: No Valance", "Top treatment: Square Fascia"],
    ["Supplier: Norman", "Valance: Square Fascia", "Valance: Curved Fascia"],
  ])("does not invent a missing or conflicting profile: %s", (...options) => {
    expect(valanceIllustration("Roller Shades", options)).toBeNull();
  });
  it("uses the specific valance before the broad top treatment", () => {
    expect(valanceIllustration("Roller Shades", ["Supplier: Norman", "Valance: Square Cassette", "Top treatment: Cassette"])).toBe("norman-square-cassette");
  });
  it("reads Polar selected fascia adders without confusing motor or color adders", () => {
    expect(valanceIllustration("Roller Shades", [], "polar", ["fascia_4", "ral_fascia_4", "motor"])).toBe("polar-fascia");
    expect(valanceIllustration("Roller Shades", [], "polar", ["interior_cassette"])).toBeNull();
    expect(valanceIllustration("Roller Shades", [], "norman", ["fascia_4"])).toBeNull();
  });
  it("preserves the art when manufacturer text is removed and keeps the motor control upright", () => {
    const raw = ["Supplier: Norman", "Valance: Square Fascia", "Lift System: Motorized"];
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {productType:"Roller Shades", options:customerQuoteOptions(raw), valanceArtId:valanceIllustration("Roller Shades",raw)}));
    expect(html).toContain('data-valance-artwork="norman-square-fascia"');
    expect(html).toContain('/remote.webp');
    expect(html).not.toContain('>Remote<');
    expect(html).not.toContain('>Norman<');
  });
  it("does not suppress a supported valance when the main operating system lacks a drawing", () => {
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {productType:"Roller Shades", options:["Supplier: Norman", "Valance: Square Fascia", "Lift System: Unsupported"]}));
    expect(html).toContain('data-valance-artwork="norman-square-fascia"');
    expect(html).not.toContain('/roller.webp');
  });
});
