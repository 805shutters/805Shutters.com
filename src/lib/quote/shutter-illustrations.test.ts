import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractProductIllustration } from "@/components/quote/ContractProductIllustration";
import { QuoteLineItemCard } from "@/components/quote/QuoteLineItemCard";
import { ShutterAssembly } from "@/components/quote/ShutterAssembly";
import { contractIllustration } from "./contract-illustrations";
import { shutterIllustration } from "./shutter-illustrations";
import { customerQuoteOptions } from "@/lib/crm/customer-quote-branding";
import { v2CustomerConfigurationOptions } from "@/lib/crm/sales-quote-v2-customer-configuration";

const legacyAssembly = (options: string[]) => {
  const art = contractIllustration('Shutters', options)!;
  return createElement(ShutterAssembly, {src:art.src,alt:art.alt,panels:art.panels!,layout:art.shutterLayout || ''});
};
describe("configured shutter pencil catalog", () => {
  it.each([["L",1],["R",1],["L R",2],["LLRR",4],["LLRRR",5],["LLLRRR",6],["LLLRRRR",7],["LLLLRRRR",8],["LRTLR",4],["LTLRTR",4],["LRR",3],["3SP",3],["3FC",3],["3 Invert",3]] as const)("shows %s as %i joined panels in one frame", (config, count) => {
    const options = [`Panel Config: ${config}`, "Tilt Type: Standard Tilt"];
    expect(contractIllustration("Shutters", options)?.panels).toBe(count);
    const html = renderToStaticMarkup(legacyAssembly(options));
    expect((html.match(/data-shutter-panel=/g)||[])).toHaveLength(count);
    expect((html.match(/data-shutter-frame="outer"/g)||[])).toHaveLength(1);
    expect(html).toContain('data-shutter-assembly="shared-frame"');
    expect(html).toContain(`data-panel-count="${count}"`);
  });
  it("retains LRR versus LLR hinge positions", () => {
    const render = (layout: string) => renderToStaticMarkup(legacyAssembly([`Panel Config: ${layout}`, "Tilt Type: Standard Tilt"]));
    const lrr = render("LRR");
    const llr = render("LLR");
    expect(lrr).toContain('data-shutter-layout="LRR"');
    expect(lrr).toContain('data-shutter-hinge="212"');
    expect(lrr).not.toContain('data-shutter-hinge="112"');
    expect(llr).toContain('data-shutter-hinge="112"');
    expect(llr).not.toContain('data-shutter-hinge="212"');
  });
  it("preserves T-posts without counting them as panels", () => {
    const html = renderToStaticMarkup(legacyAssembly(["Panel Config: LRTLR", "Tilt Type: Invisible Tilt"]));
    expect((html.match(/data-shutter-panel=/g)||[])).toHaveLength(4);
    expect((html.match(/data-shutter-post=/g)||[])).toHaveLength(1);
  });
  it("rejects conflicting layouts even when their panel counts match", () => {
    expect(contractIllustration("Shutters", ["Panel Config: LRR", "Panel configuration: LLR", "Tilt Type: Standard Tilt"])).toBeNull();
  });
  it.each(["Standard Tilt", "Invisible Tilt"])("matches every split/divider combination for %s", tilt => {
    for (const split of [false,true]) for (const divider of [false,true]) {
      const art = contractIllustration("Shutters", ["Panel configuration: LLRR", `Tilt: ${tilt}`, `Split tilt: ${split ? "Yes":"No"}`, `Divider rail: ${divider ? "Yes":"No"}`]);
      const kind = tilt.startsWith("Invisible") ? "hidden" : "center";
      const variant = split && divider ? "split-divider" : split ? "split" : divider ? "divider" : "plain";
      expect(art?.src).toContain(`shutter-${kind}-${variant}.webp`);
      expect(existsSync(`public${art?.src}`)).toBe(true);
      expect(art?.remote).toBe(false);
    }
  });
  it.each(["H1 - Hidden Tiltrod Notch On Stile","H2 - Hidden Tiltrod Notch On Louver","H3 - Hidden Tiltrod In Stile"])("recognizes saved Onyx hidden tilt %s", tilt=>{
    expect(contractIllustration("Shutters",["Panel Config: LR",`Tilt Type: ${tilt}`])?.src).toContain("shutter-hidden-plain");
  });
  it("preserves split tilt and divider details across the public configuration boundary",()=>{
    const options=customerQuoteOptions(v2CustomerConfigurationOptions({manufacturerId:"onyx",selections:{panel_config:"LLRR",tilt_type:"C - Front Center Tiltrod",split_tilt:"Yes",divider_rail:"Yes"}}));
    expect(contractIllustration("Shutters",options)?.src).toContain("shutter-center-split-divider");
  });
  it("excludes offset tilt from the approved sketch catalog",()=>{
    expect(contractIllustration("Shutters",["Panel Config: LR","Tilt Type: Offset Tilt"])).toBeNull();
  });
  it.each([[],["Panel Config: LR"],["Panel Config: Unknown","Tilt Type: Standard Tilt"],["Panel Config: LR","Tilt Type: Unknown"],["Panel Config: LR","Tilt Type: Standard Tilt","Panel configuration: LLRR"]].map(options=>({options})))("does not guess missing or conflicting panel information $options",({options})=>{
    expect(contractIllustration("Shutters",options)).toBeNull();
  });
});

describe('tracked shutter operation references',()=>{
  it.each([['Bypass Track','shutter-bypass'],['Bifold 180','shutter-bifold-180-v2'],['Bi-fold 180','shutter-bifold-180-v2']])('uses explicit %s selection', (system,asset)=>{
    const art=contractIllustration('Shutters',['Shutter Type: Tracked Shutter',`Track System: ${system}`,'Panel Config: LLRR','Tilt Type: Standard Tilt','Split Tilt: Yes','Divider Rail: Yes']);
    expect(art?.operationReference?.src).toContain(asset+'.webp');
    expect(existsSync('public'+art?.operationReference?.src)).toBe(true);
    expect(art?.panels).toBe(4);
    expect(art?.src).toContain('center-split-divider');
  });
  it('shows an operation reference when panel details are not yet chosen',()=>{
    expect(contractIllustration('Shutters',['Track Type: Bypass'])?.src).toContain('shutter-bypass.webp');
  });
  it.each(['Bifold','Floating 90 Bifold','Bifold 90'])('does not mislabel %s as bifold 180',system=>{
    expect(contractIllustration('Shutters',[`Track System: ${system}`])?.operationReference).toBeUndefined();
  });
  it('preserves tracked selection through public V2 configuration',()=>{
    const options=customerQuoteOptions(v2CustomerConfigurationOptions({manufacturerId:'norman',selections:{track_system:'Bifold 180',shutter_type:'Tracked Shutter',panel_config:'LLRR',tilt_type:'Invisible Tilt'}}));
    expect(contractIllustration('Shutters',options)?.operationReference?.src).toContain('bifold-180');
  });
});


describe("saved Onyx split tilt contracts", () => {
  it.each(["L", "R"])("renders saved standard tilt and split selection for %s without a divider", layout => {
    const options = ["Shutter type: standard", "Shutter type: Regular", "Tilt: standard", `Panel configuration: ${layout}`, "Divider-rail count: 0", "Split tilt: Yes"];
    const art = contractIllustration("Shutters", options);
    expect(art?.src).toContain("shutter-center-split.webp");
    expect(art?.src).not.toContain("divider");
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {productType:"Shutters", options, illustrationGeometry:{aspectRatio:34.25/58.5}}));
    expect(html).toContain('/c-v1/shutter-center-split.webp');
    expect(html).toContain('data-panel-count="1"');
    expect(html).not.toContain('Front tilt detail');
  });
  it("continues rejecting conflicting or unknown tilt selections", () => {
    expect(contractIllustration("Shutters", ["Tilt: standard", "Tilt: hidden", "Panel configuration: L", "Split tilt: Yes"])).toBeNull();
    expect(contractIllustration("Shutters", ["Tilt: nonstandard", "Panel configuration: L", "Split tilt: Yes"])).toBeNull();
  });
});

describe("stored Onyx tilt and divider values", () => {
  it.each(["standard", "Standard", "STANDARD"])("draws a center front tilt picture for tilt %s", (tilt) => {
    const art = shutterIllustration([["panel config", "l"], ["tilt", tilt], ["split tilt", "No"], ["divider rail", "No"]]);
    expect(art).toMatchObject({ asset: "shutter-center-plain", detail: expect.stringContaining("Center tilt bar") });
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {
      productType: "Shutters", size: "anatomy", options: [`Panel configuration: L`, `Tilt: ${tilt}`, "Split tilt: No", "Divider rail: No"],
    }));
    expect(html).toContain("/c-v1/shutter-center-plain.webp");
    expect(html).toContain('data-shutter-target="tilt-detail"');
    expect(html).not.toContain('data-shutter-target="divider-detail"');
  });

  it.each(["Standard", "standard", "STANDARD"])("treats Onyx divider rail %s as no divider", (divider) => {
    const art = shutterIllustration([["panel configuration", "lr"], ["tilt type", "standard"], ["divider rail", divider]]);
    expect(art).toMatchObject({ asset: "shutter-center-plain" });
    expect(art?.detail).not.toContain("Divider rail");
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {
      productType: "Onyx Shutters", size: "anatomy", options: ["Panel configuration: LR", "Tilt: standard", `Divider rail: ${divider}`],
    }));
    expect(html).toContain("/c-v1/shutter-center-plain.webp");
    expect(html).not.toContain("shutter-center-divider");
    expect(html).not.toContain('data-shutter-target="divider-detail"');
  });

  it("keeps existing tilt and divider selections", () => {
    expect(shutterIllustration([["panel config", "llrr"], ["tilt", "Standard Tilt"], ["split tilt", "Yes"], ["divider rail", "Yes"]]))
      .toMatchObject({ asset: "shutter-center-split-divider" });
    expect(shutterIllustration([["panel config", "lr"], ["tilt type", "Invisible Tilt"], ["split tilt", "No"], ["divider rail", "No"]]))
      .toMatchObject({ asset: "shutter-hidden-plain" });
    expect(shutterIllustration([["panel config", "l"], ["tilt", "hidden"], ["split tilt", "Yes"], ["divider rail count", "0"]]))
      .toMatchObject({ asset: "shutter-hidden-split" });
    expect(shutterIllustration([["panel config", "l"], ["tilt", "c front center tiltrod"], ["divider rail", "Yes"]]))
      .toMatchObject({ asset: "shutter-center-divider" });
    expect(contractIllustration("Shutters", ["Panel Config: L", "Tilt: C - Front Center Tiltrod", "Divider rail: Yes"])?.src)
      .toContain("shutter-center-divider.webp");
    expect(shutterIllustration([["panel config", "lr"], ["tilt type", "Offset Tilt"]])).toBeNull();
    expect(shutterIllustration([["panel config", "l"], ["tilt", "standard"], ["divider rail", "Yes"], ["divider rail", "Standard"]])).toBeNull();
  });

  it("draws the stored 805-0563 and 805-0485 shutter selections without changing their prices", () => {
    const draw = (selections: Record<string, string | number | boolean>, price: string) => {
      const before = structuredClone(selections);
      const options = customerQuoteOptions(v2CustomerConfigurationOptions({ manufacturerId: "onyx", selections }));
      const html = renderToStaticMarkup(createElement(ContractProductIllustration, { productType: "Onyx Shutters", size: "anatomy", options }));
      const card = renderToStaticMarkup(createElement(QuoteLineItemCard, { lineNumber: 1, room: "Window", productType: "Onyx Shutters", options: [...options], price, quantity: 1 }));
      expect(selections).toEqual(before);
      expect(card).toContain(price);
      return html;
    };
    const laundry = draw({
      tilt_type: "standard", divider_rail: "Standard", panel_config: "L", panel_configuration: "L",
      order_type: "standard", onyx_order_type: "Regular", frame_type: "L Frame", louver_size: '4 1/2"',
      mount_type: "outside", folding_direction: "L",
    }, "$482.75");
    expect(laundry).toContain("/c-v1/shutter-center-plain.webp");
    expect(laundry).toContain('data-shutter-target="tilt-detail"');
    expect(laundry).not.toContain('data-shutter-target="divider-detail"');
    expect(laundry).not.toContain('data-family-reference="true"');

    const bedroom = draw({
      tilt_type: "standard", divider_rail: "No", divider_rail_count: 0, split_tilt: "No",
      panel_config: "L", panel_configuration: "L", order_type: "standard", onyx_order_type: "Regular", frame_type: "Z Crest FS",
    }, "$622.85");
    expect(bedroom).toContain("/c-v1/shutter-center-plain.webp");
    expect(bedroom).toContain('data-shutter-target="tilt-detail"');

    const split = draw({
      tilt_type: "standard", divider_rail: "No", divider_rail_count: 0, split_tilt: "Yes",
      panel_config: "L", panel_configuration: "L", order_type: "standard", onyx_order_type: "Regular",
    }, "$428.72");
    expect(split).toContain("/c-v1/shutter-center-split.webp");
    expect(split).not.toContain("divider");

    const hidden = draw({
      tilt_type: "hidden", divider_rail: "No", divider_rail_count: 0, split_tilt: "Yes",
      panel_config: "R", panel_configuration: "R", order_type: "standard", onyx_order_type: "Regular",
    }, "$624.41");
    expect(hidden).toContain("/c-v1/shutter-hidden-split.webp");
    expect(hidden).not.toContain("shutter-center");

    const arch = draw({
      tilt_type: "standard", divider_rail: "No", divider_rail_count: 0, split_tilt: "No",
      panel_config: "R", panel_configuration: "R", order_type: "arch_shutters", onyx_order_type: "Arch Shutters",
    }, "$943.68");
    expect(arch).toContain('data-front-tilt-rod="center"');
    expect(arch).not.toContain('data-divider-rail="true"');
  });
});
