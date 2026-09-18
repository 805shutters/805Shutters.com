import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { repriceExactQuoteBuilderForServerDate } from "./exact-backend";
import { getProductColorOptions } from "@/lib/quote/product-color-options";

function quote(quantities = [5, 7]) {
  const color = getProductColorOptions("roman").find(c => c.colorCode === "F0031")!;
  const lines = quantities.map((quantity, i) => ({id:`line-${i}`,quote_id:"verification",room_name:`Room ${i}`,product_type:"Roman Shades",width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0",quantity,sort_order:i,created_at:"2026-09-18T00:00:00Z"} as SalesQuoteLineItem));
  const designs = lines.map(line => ({ id:`${line.id}-A`,line_item_id:line.id,variant:"A",product_type:"Roman Shades",supplier:"Norman",mount_type:"Outside Mount",shade_type:"Single",lift_system:"Motorized",motor_type:"Norman Smart DC Low Voltage",fabric:color.collection,valance:"None",unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:"roman",quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fold_style:"Flat Fold without Seams",fabric_orientation:"Standard",seaming:"No",lining:"Translucent",remote_type:"SmartDial G2 Remote",motor_position:"Right",hub_required:false,dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 1",shipping_region:"continental_us"}} as unknown as SalesQuoteDesign));
  return {lines,designs,selectedVariantByLine:Object.fromEntries(lines.map(l=>[l.id,"A"]))};
}
const price = (q:ReturnType<typeof quote>)=>{
 const result=repriceExactQuoteBuilderForServerDate(q,"2026-09-18");
 if (!("backend" in result) || result.backend !== "v2") throw new Error("Expected V2 pricing");
 return result;
};

describe("Norman shared accessories through the authoritative CRM backend",()=>{
 it("charges one panel and rebuilds identical allocations after JSON save/reopen",()=>{
  const q=quote(); const first=price(q);
  for(const d of first.designs) expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
  const panels=first.designs.flatMap(d=>(d.selection.configuration.motorization_selections??[]) as {optionId:string}[]).filter(s=>s.optionId==="power_distribution_panel");
  expect(panels).toHaveLength(1);
  const reopened=JSON.parse(JSON.stringify(q));
  for(const d of reopened.designs) d.options_json={...d.options_json,...first.designs.find(p=>p.designId===d.id)!.selection.configuration};
  const second=price(reopened);
  expect(second.designs.map(d=>d.selection)).toEqual(first.designs.map(d=>d.selection));
  expect(second.total).toBe(first.total);
 });
 it("reassigns the panel after its former owner is removed and blocks overload",()=>{
  const q=quote(); q.lines=q.lines.slice(1);q.designs=q.designs.slice(1);
  const result=price(q);
  expect(result.designs[0].selection.configuration.norman_order_record_v1).toMatchObject({ownerLineId:"line-1",chargePanel:true,totalConnections:7});
  const overload=price(quote([5,8]));
  expect(overload.designs.every(d=>!d.result.ok)).toBe(true);
 });

 it("prices and snapshots both Roman common-valance panels and motors",()=>{
  const q=quote([1]);q.lines[0].width_whole=71;
  q.designs[0].shade_type="Common Valance";
  q.designs[0].options_json={...q.designs[0].options_json,common_valance_panel_widths:[30,40],common_valance_gap:1};
  const result=price(q).designs[0];
  expect(result.result.ok,JSON.stringify(result.result)).toBe(true);
  expect(result.selection.configuration.norman_assembly_v1).toMatchObject({panelWidths:[30,40],motorCount:2});
  expect(result.selection.configuration.norman_order_record_v1).toMatchObject({totalConnections:2});
  expect(result.snapshot).not.toBeNull();
 });
});
