import { repriceExactQuoteBuilderForServerDate } from "@/lib/quote-lab/exact-backend";
import { normanHoneycombV2Source } from "./generated/norman-honeycomb-v2.generated";
import { expectedVerticalHoneycombProgramId } from "./catalog";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from "@/lib/crm/sales-quote-v2-customer-configuration";
import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import { deriveVerticalHoneycombPairs, validateVerticalHoneycombPair, VERTICAL_HONEYCOMB_PAIR_KEY } from "./norman-vertical-pair";
import { deriveNormanOrderRecords } from "./norman-assemblies";
import { selectionContextFromExactInterface } from "./exact-interface-adapter";
import { validateSelection } from "./rules";
import { sanitizeCopiedDesignOptions } from "@mts/lib/quoteDesignCopy";

const shade = (position = "Left", config: SelectionContext["configuration"] = {}): SelectionContext => ({
  manufacturerId: "norman", productId: "vertical_honeycomb", programId: "vertical-test", catalogAsOf: "2026-09-20", catalogVersion: "test",
  widthInches: position === "Left" ? 40 : 60, heightInches: 84, quantity: 1, options: {},
  configuration: {application: "Patio Door Vertical", lift_system: "Patio Door Vertical", mount_type: "Outside Mount", stacking_configuration: `${position} Stack`, vertical_pair_mode: "Butt Together", vertical_pair_group: "1", vertical_pair_position: position, ...config},
});
const pair = () => [{lineId: "left", selection: shade()}, {lineId: "right", selection: shade("Right")}];
const pairIds = (s: SelectionContext) => validateSelection(s).map(i => i.ruleId).filter(id => id.startsWith("honeycomb.vertical.pair_"));

describe("Norman vertical Honeycomb Butt Together source p38", () => {
  it.each(["Inside Mount", "Outside Mount"])("preserves independently measured members and included magnets for %s", mount => {
    const rows = pair(); rows.forEach(r => r.selection.configuration = {...r.selection.configuration, mount_type: mount});
    expect(deriveVerticalHoneycombPairs(rows)).toEqual([]);
    expect(rows[0].selection.configuration[VERTICAL_HONEYCOMB_PAIR_KEY]).toMatchObject({version:1, sourcePage:38, lineIds:["left","right"], orderWidths:[40,60], orderHeight:84, mountType:mount, includedMagnetStrips:"center of each side of the moving rails", pricingBasis:"each_shade_separately", position:"Left"});
    expect(rows[1].selection.configuration[VERTICAL_HONEYCOMB_PAIR_KEY]).toMatchObject({position:"Right"});
    expect(rows.map(r => r.selection.options)).toEqual([{},{}]);
  });
  it("rebuilds records from selected server members and survives serialization", () => {
    const rows = pair(); rows[0].selection.configuration = {...rows[0].selection.configuration, [VERTICAL_HONEYCOMB_PAIR_KEY]: {lineIds:["forged"], orderHeight:1, charge:999}};
    deriveNormanOrderRecords(rows);
    expect(rows[0].selection.configuration[VERTICAL_HONEYCOMB_PAIR_KEY]).not.toHaveProperty("charge");
    const saved = JSON.parse(JSON.stringify(rows)); deriveNormanOrderRecords(saved); expect(saved).toEqual(rows);
    expect(deriveNormanOrderRecords(rows.slice(0,1)).map(i=>i.ruleId)).toContain("honeycomb.vertical.pair_members");
    expect(rows[0].selection.configuration).not.toHaveProperty(VERTICAL_HONEYCOMB_PAIR_KEY);
  });
  it.each(["height", "mount"])("rejects mismatched %s without emitting valid assembly", key => {
    const rows=pair(); if(key === "height") rows[1].selection.heightInches=84.0625; else rows[1].selection.configuration={...rows[1].selection.configuration,mount_type:"Inside Mount"};
    expect(deriveVerticalHoneycombPairs(rows).map(i=>i.ruleId)).toContain(`honeycomb.vertical.pair_${key}`);
    expect(rows[0].selection.configuration).not.toHaveProperty(VERTICAL_HONEYCOMB_PAIR_KEY);
  });
  it("rejects missing, duplicated and excess members", () => {
    const rows=pair();
    for (const members of [[rows[0]], [rows[0], {...rows[1],lineId:"left"}], [...rows,{lineId:"third",selection:shade()}]]) expect(deriveVerticalHoneycombPairs(members).map(i=>i.ruleId)).toContain("honeycomb.vertical.pair_members");
  });
  it.each([
    ["group", {vertical_pair_group:""}], ["position", {vertical_pair_position:"Center"}],
    ["stack", {stacking_configuration:"Right Stack"}], ["operation", {lift_system:"Patio Door Vertical Day & Night"}],
    ["mount_type", {mount_type:"Side Mount"}], ["mode", {vertical_pair_mode:"Single Shade"}],
  ] as const)("enforces %s through ordinary single-selection validation", (id, c) => {
    expect(pairIds(shade("Left", c))).toContain(`honeycomb.vertical.pair_${id}`);
  });
  it("requires quantity-one members without changing unrelated unpaired history", () => {
    const s=shade();s.quantity=2; expect(validateVerticalHoneycombPair(s).map(i=>i.ruleId)).toContain("honeycomb.vertical.pair_quantity");
    const old=shade();old.catalogAsOf="2026-09-19";old.configuration={...old.configuration,[VERTICAL_HONEYCOMB_PAIR_KEY]:{historic:true}}; const original=JSON.stringify(old);
    expect(deriveVerticalHoneycombPairs([{lineId:"old",selection:old}])).toEqual([]); expect(JSON.stringify(old)).toBe(original);
    const single=shade("Left",{vertical_pair_mode:null,vertical_pair_group:null,vertical_pair_position:null});expect(validateVerticalHoneycombPair(single)).toEqual([]);
  });
  it("retains UI pair fields and normalized stack through the saved-design adapter", () => {
    const s=selectionContextFromExactInterface({id:"a",quote_id:"q",room_name:"Living Room",product_type:"Honeycomb Shades",width_whole:40,width_fraction:"0",height_whole:84,height_fraction:"0",quantity:1,sort_order:0,created_at:"2026-09-20T00:00:00Z"}, {supplier:"Norman",mount_type:"Outside Mount",lift_system:"Patio Door Vertical",options_json:{honeycomb_application:"Patio Door Vertical",vertical_pair_mode:"Butt Together",vertical_pair_group:"1",vertical_pair_position:"Left",split_splice:"Left Stack"}}, {productId:"vertical_honeycomb",programId:"vertical-test",catalogAsOf:"2026-09-20"});
    expect(validateVerticalHoneycombPair(s)).toEqual([]);
    expect(s.configuration).toMatchObject({vertical_pair_mode:"Butt Together",vertical_pair_group:"1",vertical_pair_position:"Left",stacking_configuration:"Left Stack"});
  });
  it("copying a design cannot duplicate its pair membership or derived record", () => {
    const s=shade();s.configuration={...s.configuration,[VERTICAL_HONEYCOMB_PAIR_KEY]:{version:1}};const copied=sanitizeCopiedDesignOptions(s.configuration);
    for(const key of ["vertical_pair_mode","vertical_pair_group","vertical_pair_position",VERTICAL_HONEYCOMB_PAIR_KEY]) expect(copied).not.toHaveProperty(key);
    expect(copied.stacking_configuration).toBe("Left Stack");expect(s.configuration.vertical_pair_group).toBe("1");
  });
  it("blocks both affected saved line prices at the actual server repricing boundary", () => {
    const color = normanHoneycombV2Source.verticalColors.find(c => c.family === "Light Filtering")!;
    const lines: SalesQuoteLineItem[] = ["left", "right"].map((id, i) => ({id, quote_id:"test", room_name:"Office", product_type:"Honeycomb Shades", width_whole:i?60:40, width_fraction:"0", height_whole:84, height_fraction:"0", quantity:1, sort_order:i, created_at:"2026-09-20T00:00:00Z"}));
    const designs = lines.map((line, i) => ({id:line.id+"-A",line_item_id:line.id,variant:"A",product_type:"Honeycomb Shades",supplier:"Norman",mount_type:"Outside Mount",lift_system:"Patio Door Vertical",fabric:color.family,unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:"vertical_honeycomb",quote_lab_program_id:expectedVerticalHoneycombProgramId(color.family, color.customerColorCode, '3/4" Single Cell'),fabric_color_collection:color.family,fabric_color_code:color.customerColorCode,cell_size:'3/4" Single Cell',honeycomb_application:"Patio Door Vertical",split_splice:i?"Right Stack":"Left Stack",vertical_pair_mode:"Butt Together",vertical_pair_group:"1",vertical_pair_position:i?"Right":"Left"}} as unknown as SalesQuoteDesign));
    const input={lines,designs,selectedVariantByLine:{left:"A",right:"A"}};
    const valid=repriceExactQuoteBuilderForServerDate(input,"2026-09-20");
    if (!("backend" in valid) || valid.backend !== "v2") throw new Error("Expected V2");
    expect(valid.designs.every(d=>d.result.ok), JSON.stringify(valid.designs.map(d=>d.result))).toBe(true);
    expect(valid.designs[0].selection.configuration[VERTICAL_HONEYCOMB_PAIR_KEY]).toMatchObject({lineIds:["left","right"],orderWidths:[40,60]});
    expect(v2CustomerConfigurationOptions(customerConfigurationFromSelection(valid.designs[0].selection)).join(" ")).toContain("Butt Together");
    lines[1].height_whole=85;
    const invalid=repriceExactQuoteBuilderForServerDate(input,"2026-09-20");
    if (!("backend" in invalid) || invalid.backend !== "v2") throw new Error("Expected V2");
    for(const d of invalid.designs){expect(d.result.ok).toBe(false);expect(d.result.validationIssues.map(i=>i.ruleId)).toContain("honeycomb.vertical.pair_height");}
  });

});
