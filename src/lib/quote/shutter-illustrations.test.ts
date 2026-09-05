import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractProductIllustration } from "@/components/quote/ContractProductIllustration";
import { contractIllustration } from "./contract-illustrations";
import { customerQuoteOptions } from "@/lib/crm/customer-quote-branding";
import { v2CustomerConfigurationOptions } from "@/lib/crm/sales-quote-v2-customer-configuration";

describe("configured shutter pencil catalog", () => {
  it.each([["L",1],["R",1],["L R",2],["LLRR",4],["LRTLR",4],["LTLRTR",4],["LRR",3],["3SP",3],["3FC",3],["3 Invert",3]] as const)("shows %s as %i separate panels", (config, count) => {
    const options = [`Panel Config: ${config}`, "Tilt Type: Standard Tilt"];
    expect(contractIllustration("Shutters", options)?.panels).toBe(count);
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {productType:"Shutters",options}));
    expect((html.match(/<img /g)||[])).toHaveLength(count);
    expect(html).toContain(`data-panel-count="${count}"`);
  });
  it.each(["Standard Tilt", "Invisible Tilt"])("matches every split/divider combination for %s", tilt => {
    for (const split of [false,true]) for (const divider of [false,true]) {
      const art = contractIllustration("Shutters", ["Panel configuration: LLRR", `Tilt: ${tilt}`, `Split tilt: ${split ? "Yes":"No"}`, `Divider rail: ${divider ? "Yes":"No"}`]);
      const kind = tilt.startsWith("Invisible") ? "hidden" : "center";
      const variant = split && divider ? "split-divider" : split ? "split" : divider ? "divider" : "plain";
      expect(art?.src).toContain(`shutter-${kind}-${variant}-angled.webp`);
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
