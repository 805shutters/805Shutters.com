import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractProductIllustration } from "@/components/quote/ContractProductIllustration";
import { customerQuoteOptions } from "@/lib/crm/customer-quote-branding";
import { VALANCE_ARTWORK, valanceArtwork, valanceIllustration } from "./valance-illustrations";
import { anatomyPreviewProduct } from './contract-anatomy-catalog';

describe("manufacturer-specific valance artwork", () => {
  it.each(VALANCE_ARTWORK)("shows the selected $id with its full profile below", art => {
    expect(existsSync(`public/images/contract-illustrations/valances-installed-v1/${art.id}.webp`)).toBe(true);
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {
      productType: art.products[0], valanceArtId: art.id, size: 'anatomy',
      options: (art.products as readonly string[]).includes('roller shades') ? ['Control Side: Left', 'Lift System: Continuous Cord Loop'] : ['Control Side: Left'],
    }));
    expect(html).toContain(`data-valance-detail="${art.id}"`);
    expect(html).toContain('data-valance-layout="below"');
    expect(html).toContain(`${art.label} — full pencil profile`);
    expect(html).toContain(`data-valance-artwork="${art.id}"`);
  });
  it('keeps unknown controls unspecified and rejects a profile from another product family', () => {
    const unknown = renderToStaticMarkup(createElement(ContractProductIllustration, {productType:'Wood Blinds', valanceArtId:'norman-contempo', size:'anatomy'}));
    expect(unknown).toContain('Wand side not recorded');
    expect(unknown).not.toContain('data-anatomy-anchor="wand"');
    expect(unknown).not.toContain('src="/images/contract-illustrations/valances-installed-v1/norman-contempo.webp"');
    for (const id of [null, 'norman-contempo']) {
      const html = renderToStaticMarkup(createElement(ContractProductIllustration, {productType:'Roller Shades', valanceArtId:id, options:['Lift System: Cordless']}));
      expect(html).not.toContain('data-valance-detail=');
    }
  });
  it('keeps the right control installed while showing the full profile below', () => {
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {productType:'Wood Blinds', valanceArtId:'norman-designer-crown', options:['Control Side: Right'], size:'anatomy'}));
    expect(html).toContain('scaleX(-1)');
    expect(html).toContain('Designer crown valance — full pencil profile');
    expect(html).toContain('data-anatomy-anchor="wand"');
    expect(html).toContain('left:75.5%');
  });

  it('installs the selected crown even when the blind operating system lacks a drawing', () => {
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {productType:'Wood Blinds', valanceArtId:'norman-designer-crown', size:'anatomy', options:['Lift System: Continuous Cord Loop', 'Control Side: Left']}));
    expect(html).toContain('data-family-reference="true"');
    expect(html).toContain('data-valance-artwork="norman-designer-crown"');
    expect(html).toContain('data-valance-layout="below"');
    expect(html).not.toContain('data-anatomy-anchor="wand"');
    expect(html).not.toContain('<dialog');
  });
  it('assembles every named Soluna valance menu choice on the shade', () => {
    const product=anatomyPreviewProduct('roller')!;
    const choices=product.groups.find(g=>g.label==='Valance')!.choices;
    expect(choices).toHaveLength(10);
    const fabricMarkup=new Set<string>();
    for(const choice of choices.filter(c=>!/^No Valance/i.test(c.label))) {
      const options=['Manufacturer: Norman','Lift System: Motorized',...choice.options];
      const id=valanceIllustration(product.name,options);
      expect(id,choice.label).toBeTruthy();
      const html=renderToStaticMarkup(createElement(ContractProductIllustration,{productType:product.name,options,size:'anatomy'}));
      expect(html,choice.label).toContain('data-roller-top-treatment="valance"');
      expect(html,choice.label).toContain(`data-valance-artwork="${id}"`);
      if(/Fabric Valance/.test(choice.label)) fabricMarkup.add(html.match(/--valance-height:([^;]+)/)?.[1]||'');
    }
    expect(fabricMarkup.size).toBe(4);
  });
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
  it("preserves a supported valance on the official category reference when the control lacks exact artwork", () => {
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {productType:"Roller Shades", options:["Supplier: Norman", "Valance: Square Fascia", "Lift System: Unsupported"]}));
    expect(html).toContain('data-valance-artwork="norman-square-fascia"');
    expect(html).not.toContain('/roller.webp');
    expect(html).toContain('/roller-open-roll.webp');
    expect(html).toContain('data-family-reference="true"');
    expect(html).toContain('Official 805 category sketch');
    expect(html).not.toContain('remote.webp');
  });
});
