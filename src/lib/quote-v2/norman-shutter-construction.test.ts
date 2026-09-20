import { describe, it, expect } from "vitest";
import { NORMAN_SHUTTER_PROGRAMS } from "@/lib/quote/norman-shutter-assortment";
import { normanStileJoins, normanStileWidths } from "@/lib/quote/norman-shutter-construction";
import { validateNormanShutterAssortment } from "./norman-shutter-assortment";
import { selectionContextFromExactInterface } from "./exact-interface-adapter";
import { getQuoteDesignDetails } from "@mts/lib/quoteDesignDetails";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import type { SelectionContext } from "./core";

const selection = (programId: string, configuration: SelectionContext["configuration"]): SelectionContext => ({productId:"norman_shutters",manufacturerId:"Norman",catalogVersion:"",catalogAsOf:"2026-09-19",programId,widthInches:36,heightInches:60,quantity:1,options:{},configuration:{color:programId==='normandy_stained'?'200 - Natural':'001 - Pure White',louver_size:'3 1/2"',panel_config:'L R',...configuration}});
const rules = (s: SelectionContext) => validateNormanShutterAssortment(s).map(i=>i.ruleId.split('.').pop());
describe("regular Norman stile construction", () => {
  it("accepts both documented profiles and closure directions across all six programs", () => {
    for(const p of NORMAN_SHUTTER_PROGRAMS) for(const stile_profile of ['Beaded','Chamfer']) for(const panel_closure of ['Right Over Left','Left Over Right']) for(const stile_join of ['Rabbet','Astragal']) {
      expect(rules(selection(p.id,{stile_profile,panel_closure,stile_join,stile_width:'2"'}))).toEqual([]);
    }
  });
  it("restricts AquaShield to its two-inch stile", () => {
    expect(normanStileWidths('woodlore_aquashield',10)).toEqual(['2"']);
    for(const stile_width of ['1 5/8"','2 1/4"']) expect(rules(selection('woodlore_aquashield',{stile_width,widest_panel_width_inches:10}))).toContain('stile_width');
  });
  it.each([6,11.9375,12])("permits narrow stiles when the widest finished panel is %s inches", widest_panel_width_inches => {
    expect(rules(selection('woodlore',{stile_width:'1 5/8"',widest_panel_width_inches}))).toEqual([]);
  });
  it.each([null,0,5.9375,12.0625,36])("rejects a narrow stile with missing or incompatible panel width %s", widest_panel_width_inches => {
    expect(rules(selection('woodlore',{stile_width:'1 5/8"',widest_panel_width_inches}))).toContain('stile_width');
  });
  it.each([
    ["woodlore", '1 7/8"', "LR", 24], ["woodlore", '2 1/2"', "LR", 30],
    ["woodlore_plus", '2 1/2"', "LR", 36], ["woodlore_aquashield", '3"', "LR", 31],
    ["brightwood", '3 1/2"', "LR", 42], ["normandy_painted", '3 1/2"', "LLRR", 26],
    ["woodlore_aquashield", '3 1/2"', "LL", 24],
  ])("checks %s %s %s panel maximum %s", (programId,louver_size,panel_config,max) => {
    expect(rules(selection(programId,{louver_size,panel_config,widest_panel_width_inches:max}))).toEqual([]);
    expect(rules(selection(programId,{louver_size,panel_config,widest_panel_width_inches:Number(max)+0.0625}))).toContain('panel_width');
  });
  it("uses finished panel width, never opening width, at the nine-inch join boundary", () => {
    expect(rules(selection('woodlore',{panel_config:'LLR',widest_panel_width_inches:30}))).toContain('mixed_panel_width');
    expect(rules(selection('woodlore',{panel_config:'LLR',widest_panel_width_inches:24}))).toEqual([]);
    expect(normanStileJoins('L',9)).toEqual(['Butt']);
    expect(rules(selection('woodlore',{panel_config:'L',widest_panel_width_inches:9,stile_join:'Rabbet'}))).toContain('stile_join');
    expect(rules(selection('woodlore',{panel_config:'L',widest_panel_width_inches:9,stile_join:'Butt'}))).toEqual([]);
    expect(rules(selection('woodlore',{panel_config:'L',widest_panel_width_inches:8.9375,stile_join:'Rabbet'}))).toContain('single_panel_join');
    expect(rules(selection('woodlore',{stile_join:'Butt'}))).toContain('stile_join');
    expect(rules(selection('woodlore',{panel_config:'L',panel_closure:'Left Over Right'}))).toContain('panel_closure');
  });
  it("rejects unknown fields and retains explicit exceptions for specialized layouts", () => {
    expect(rules(selection('woodlore',{stile_profile:'Flat',stile_join:'Unverified',panel_closure:'Custom'}))).toEqual(['stile_profile','stile_join','panel_closure']);
    expect(rules(selection('woodlore',{panel_config:'LTLRTR',stile_join:'Rabbet'}))).toContain('construction_layout');
    const historical=selection('woodlore_aquashield',{stile_width:'2 1/4"'});
    expect(rules({...historical,catalogAsOf:'2026-09-18'})).toEqual([]);
  });
  it("preserves construction in server input and customer details without adding an invented charge", () => {
    const line={id:'l',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1} as SalesQuoteLineItem;
    const design={supplier:'Norman',panel_config:'L R',options_json:{stile_width:'2"',stile_join:'Astragal',stile_profile:'Chamfer',panel_closure:'Left Over Right'}} as unknown as SalesQuoteDesign;
    const saved=JSON.parse(JSON.stringify(design));
    expect(selectionContextFromExactInterface(line,saved,{productId:'norman_shutters',programId:'woodlore'}).configuration).toMatchObject(design.options_json);
    expect(getQuoteDesignDetails(saved)).toEqual(expect.arrayContaining([{label:'Stile Width',value:'2"'},{label:'Stile Join',value:'Astragal'},{label:'Stile Profile',value:'Chamfer'},{label:'Panel Closure',value:'Left Over Right'}]));
  });
});
