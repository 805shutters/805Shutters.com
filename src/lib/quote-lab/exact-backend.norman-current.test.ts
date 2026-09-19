import { SMARTDRAPE_COORDINATION } from "@/lib/quote-v2/generated/norman-smartdrape-coordination.generated";
import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { repriceExactQuoteBuilderForServerDate } from "./exact-backend";
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from "@/lib/crm/sales-quote-v2-customer-configuration";
import { getProductColorOptions } from "@/lib/quote/product-color-options";

function currentQuote(productId: string, productType: string, code: string, options: Record<string, unknown> = {}) {
 const color=getProductColorOptions(productId).find(c=>c.colorCode===code)!;
 const line={id:"audit-line",quote_id:"audit",room_name:"Office",product_type:productType,width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0",quantity:1,sort_order:0,created_at:"2026-09-19T00:00:00Z"} as SalesQuoteLineItem;
 const design={id:"audit-A",line_item_id:line.id,variant:"A",product_type:productType,supplier:"Norman",mount_type:"Inside Mount",lift_system:"PrecisionLift Cordless",fabric:color.collection,valance:productId==="smartfold"?"6-inch Fabric":"Standard",unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:productId,quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fold_size:"7",basic_light_guard:"No",premium_hem_bar:"No",...options}} as unknown as SalesQuoteDesign;
 return {lines:[line],designs:[design],selectedVariantByLine:{[line.id]:"A"}};
}
describe("Current Norman production configurations",()=>{
 it("prices room-darkening vane packs with the extra 20 percent and persists their contents",()=>{
  const q=currentQuote("smartdrape","Smart Drapes","F1604",{control_type:"Manual",stack_option:"Stack Left",control_side:"Right",installation_method:"Wall Mount",light_control:"Room Darkening"});
  q.designs[0].lift_system=null;q.designs[0].mount_type="Outside Mount";q.designs[0].shade_type="Room Darkening";q.lines[0].quantity=2;
  const base=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  q.designs[0].options_json={...q.designs[0].options_json,smartdrape_extra_vane_packs:2,smartdrape_vane_pack_style:"B — Middle Vanes Only",smartdrape_extra_wands:1};
  const p=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");if(!("backend"in p)||p.backend!=="v2"||!("backend"in base)||base.backend!=="v2")throw new Error("Expected V2");
  const d=p.designs[0],b=base.designs[0];expect(d.result.ok,JSON.stringify(d.result)).toBe(true);if(!d.result.ok||!b.result.ok)throw new Error("Expected prices");
  expect(Math.round((d.result.total-b.result.total)*100)).toBe(147400);
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({extraVanesAndWands:{extraWands:1,vanePacks:{quantity:2,priceHeight:60,middle:[{quantity:6,color:"F1604"}]}}});
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(p);
 });
 it("server-prices paired SmartDrape tracks independently and charges their center keystone once",()=>{
  const q=currentQuote("smartdrape","Smart Drapes","F1124",{control_type:"Manual",stack_option:"Stack Left",control_side:"Right",installation_method:"Wall Mount",application:"Side by Side",smartdrape_pair_id:"1",smartdrape_pair_position:"Left",smartdrape_keystone_joints:"1",smartdrape_center_keystone:"Yes"});
  q.designs[0].lift_system=null;q.designs[0].mount_type="Outside Mount";q.designs[0].shade_type="Light Filtering";q.lines[0].width_whole=100;
  q.lines.push({...q.lines[0],id:"right",width_whole:150});q.designs.push({...q.designs[0],id:"right-A",line_item_id:"right",options_json:{...q.designs[0].options_json,smartdrape_pair_position:"Right",stack_option:"Stack Right",control_side:"Left"}});q.selectedVariantByLine.right="A";
  const p=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");if(!("backend"in p)||p.backend!=="v2")throw new Error("Expected V2");
  for(const d of p.designs)expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
  expect(p.designs.map(d=>d.result.ok?d.result.components.filter(c=>c.priceLineId==="keystone").map(c=>c.catalogAmount):[])).toEqual([[146],[73]]);
  expect(p.designs[0].selection.configuration.smartdrape_pair_v1).toMatchObject({orderedWidths:[100,150],openCenterGap:2.25,chargeCenterKeystone:true});
  const reopened=JSON.parse(JSON.stringify(q));for(let i=0;i<2;i++)reopened.designs[i].options_json={...reopened.designs[i].options_json,...p.designs[i].selection.configuration};expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(p);
 });
 it("prices each SmartDrape joint and shim from source geometry and persists pocket heights",()=>{
  const q=currentQuote("smartdrape","Smart Drapes","F1124",{control_type:"Manual",stack_option:"Stack Left",control_side:"Right",installation_method:"Wall Mount"});
  q.designs[0].lift_system=null;q.designs[0].mount_type="Outside Mount";q.designs[0].shade_type="Light Filtering";q.lines[0].width_whole=190;q.lines[0].quantity=2;
  const base=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  q.designs[0].options_json={...q.designs[0].options_json,smartdrape_keystone_joints:"1, 2",aluminum_shim:"Yes"};
  const priced=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if(!("backend" in priced)||priced.backend!=="v2"||!("backend" in base)||base.backend!=="v2")throw new Error("Expected V2");
  const d=priced.designs[0],b=base.designs[0];expect(d.result.ok,JSON.stringify(d.result)).toBe(true);expect(b.result.ok).toBe(true);
  if(!d.result.ok||!b.result.ok)throw new Error("Expected valid hardware");
  expect(d.result.total-b.result.total).toBe(2*(2*73+6*28));
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({mounting:{smartJointCount:2,shimQuantity:6,keystoneJoints:[1,2]}});
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(priced);
  expect(v2CustomerConfigurationOptions(customerConfigurationFromSelection(d.selection))).toContain("Keystones at Track Joints: 1, 2");
  q.designs[0].options_json={...q.designs[0].options_json,aluminum_shim:null,installation_method:"Ceiling Pocket Mount",pocket_depth_inches:6,pocket_height_inches:3.75};
  const pocket=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");if(!("backend" in pocket)||pocket.backend!=="v2")throw new Error("Expected V2");
  expect(pocket.designs[0].result.ok).toBe(true);expect(pocket.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({mounting:{shadeHeight:57.625,pocket:{hangStripHeight:2.375}}});
 });
 it("prices SmartDrape motors and whole-line accessories with a persisted USB-C allocation",()=>{
  const q=currentQuote("smartdrape","Smart Drapes","F1124",{control_type:"Motorized",stack_option:"Stack Left",control_side:"Left",installation_method:"Wall Mount",hub_required:true});
  q.designs[0].lift_system=null;q.designs[0].mount_type="Outside Mount";q.designs[0].shade_type="Light Filtering";q.designs[0].motor_type="Norman Smart Rechargeable Battery";q.designs[0].remote_type="SmartDial Remote";q.lines[0].quantity=3;
  const base=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  q.designs[0].options_json={...q.designs[0].options_json,smartdrape_remote_quantity:1,smartdrape_remote_channel:4,smartdrape_hub_quantity:1,smartdrape_extra_charging_kits:2,smartdrape_charging_wand_length:39,smartdrape_charging_wand_color:"2052 Day Light",smartdrape_repeaters:2,smartdrape_color_ring_sets:2};
  const priced=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if(!("backend" in priced)||priced.backend!=="v2"||!("backend" in base)||base.backend!=="v2")throw new Error("Expected V2");
  const d=priced.designs[0],b=base.designs[0];expect(d.result.ok,JSON.stringify(d.result)).toBe(true);expect(b.result.ok,JSON.stringify(b.result)).toBe(true);
  if(!d.result.ok||!b.result.ok)throw new Error("Expected valid SmartDrape motor price");
  expect(d.result.total-b.result.total).toBe(-2*268-2*321+2*43+3*75+2*107+2*43);
  expect(d.result.components).toEqual(expect.arrayContaining([expect.objectContaining({id:"operating:motor:smart_motorization:motor",catalogAmount:642})]));
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({motorAccessories:{controller:{quantity:1,channel:4},chargingWand:{length:39,quantity:3}},includedChargingKits:{family:"smartdrape_usb_c",orderQuantity:1,fulfillmentQuantity:1}});
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(priced);
  expect(v2CustomerConfigurationOptions(customerConfigurationFromSelection(d.selection))).toEqual(expect.arrayContaining(["Remote Controls for This Line: 1","Shade Remote Channel: 4","Charging Extension Wand Length: 39"]));
 });
 it("server-prices and persists all 77 SmartDrape colors, including alternating colors and hardware overrides",()=>{
  for(const row of SMARTDRAPE_COORDINATION){
   const q=currentQuote("smartdrape","Smart Drapes",row.customerColorCode,{control_type:"Manual",stack_option:"Stack Left",control_side:"Right",installation_method:"Wall Mount",smartdrape_headrail_color:"4534 Brass",smartdrape_wand_color:"3058 White",wand_drop_inches:48,light_control:row.category.includes("Room")?"Room Darkening":"Light Filtering"});
   q.designs[0].lift_system=null;q.designs[0].mount_type="Outside Mount";q.designs[0].shade_type=row.category.replace(":","");
   const priced=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
   if(!("backend" in priced)||priced.backend!=="v2")throw new Error("Expected V2");
   const d=priced.designs[0];expect(d.selection.programId).toBe(row.category.includes("Essentials")?"smartdrape_smartdrape_lakeshore_stripe":"smartdrape_smartdrape_light_filtering");expect(d.result.ok,row.customerColorCode+JSON.stringify(d.result.validationIssues)).toBe(true);
   expect(d.selection.configuration.norman_assembly_v1).toMatchObject({fabrics:[{customerColorCode:row.customerColorCode,factoryColorCode:row.factoryColorCode}],coordination:{headrail:"4534 Brass"},wand:{color:"3058 White",drop:48}});
   const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};
   expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(priced);
  }
  const q=currentQuote("smartdrape","Smart Drapes","F1124",{control_type:"Manual",stack_option:"Stack Left",control_side:"Right",installation_method:"Wall Mount",smartdrape_headrail_color:"4534 Brass",smartdrape_wand_color:"3058 White",vane_style:"Alternating",smartdrape_second_color:"F1128"});
  q.designs[0].lift_system=null;q.designs[0].mount_type="Outside Mount";q.designs[0].shade_type="Light Filtering";
  const p=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");if(!("backend"in p)||p.backend!=="v2")throw new Error("Expected V2");
  expect(p.designs[0].result.ok).toBe(true);
  expect(p.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({alternating:true,fabrics:[{customerColorCode:"F1124"},{customerColorCode:"F1128"}]});
  const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(p.designs[0].selection));expect(customer.join(" ")).not.toMatch(/factoryColor|coordinationRange/);
  expect(customer).toContain("Second Alternating Fabric: F1128");
 });
 it("prices the shared PerfectSheer valance once at the full width and retains both shades",()=>{
  const q=currentQuote("perfectsheer","Sheer Shades","F1179",{light_control:"Light Filtering",perfectsheer_wood_finish:"003 Silk White",perfectsheer_common_valance_id:"1",perfectsheer_common_position:1,perfectsheer_common_gap_after:2,control_side:"Left",perfectsheer_valance_joinery:"Keystone",perfectsheer_keystone_count:1});
  q.designs[0].lift_system="Continuous Cord Loop";q.designs[0].valance="Modern Wood Valance";
  q.lines.push({...q.lines[0],id:"right",width_whole:42});
  q.designs.push({...q.designs[0],id:"right-A",line_item_id:"right",options_json:{...q.designs[0].options_json,perfectsheer_common_position:2,perfectsheer_common_gap_after:0,control_side:"Right"}});
  q.selectedVariantByLine.right="A";
  const result=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in result) || result.backend!=="v2")throw new Error("Expected V2 backend");
  for(const d of result.designs)expect(d.result).toMatchObject({ok:true,validationIssues:[]});
  const left=result.designs[0],right=result.designs[1];
  if(!left.result.ok||!right.result.ok)throw new Error("Expected valid common valance");
  expect(left.result.components.filter(c=>["wood_valance","keystone"].includes(c.priceLineId ?? "")).map(c=>[c.priceLineId,c.catalogAmount])).toEqual(expect.arrayContaining([["keystone",73],["wood_valance",232]]));
  expect(right.result.components.filter(c=>["wood_valance","keystone"].includes(c.priceLineId ?? ""))).toEqual([]);
  expect(left.selection.configuration.perfectsheer_common_valance_v1).toMatchObject({orderedWidths:[36,42],orderSpan:80});
  const reopened=JSON.parse(JSON.stringify(q));for(let i=0;i<2;i++)reopened.designs[i].options_json={...reopened.designs[i].options_json,...result.designs[i].selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(result);
 });

 it("prices an explicit remote quantity once and preserves channel and rings on reopening",()=>{
  const q=currentQuote("perfectsheer","Sheer Shades","F1179",{light_control:"Light Filtering",perfectsheer_tube_diameter:2,motor_position:"Right",hub_required:false});
  q.designs[0].lift_system="Motorized";q.designs[0].motor_type="Norman Smart AC Adapter";q.designs[0].remote_type="SmartDial Remote";q.lines[0].quantity=3;
  const base=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  q.designs[0].options_json={...q.designs[0].options_json,perfectsheer_remote_quantity:1,perfectsheer_remote_channel:5,perfectsheer_color_ring_sets:2};
  const priced=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if(!("backend" in priced)||priced.backend!=="v2"||!("backend" in base)||base.backend!=="v2")throw new Error("Expected V2");
  const d=priced.designs[0],b=base.designs[0];expect(d.result.ok).toBe(true);expect(d.result.validationIssues?.filter(i=>i.severity==="hard_block")).toEqual([]);
  if(!d.result.ok||!b.result.ok)throw new Error("Expected valid control pricing");
  expect(d.result.total-b.result.total).toBe(-2*268+2*43);
  expect(d.selection.configuration.motorization_selections).toContainEqual({groupId:"smart_motorization",optionId:"smartdial_g2_remote",role:"controller",units:1,billingScope:"once_per_line"});
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({motorAccessories:{controller:{quantity:1,channel:5,defaultRing:"Black",extraFourColorRingSets:2}}});
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(priced);
  expect(v2CustomerConfigurationOptions(customerConfigurationFromSelection(d.selection))).toEqual(expect.arrayContaining(["Remote Controls for This Line: 1","Shade Remote Channel: 5","Extra SmartDial Color Ring Sets: 2"]));
 });
 it("charges extra motor accessories once for the line instead of once per shade",()=>{
  const q=currentQuote("perfectsheer","Sheer Shades","F1179",{light_control:"Light Filtering",perfectsheer_tube_diameter:2,motor_position:"Right",hub_required:false});
  q.designs[0].lift_system="Motorized";q.designs[0].motor_type="Norman Smart Rechargeable Battery (AC Charger)";q.designs[0].remote_type="Basic Remote";q.lines[0].quantity=3;
  const base=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  q.designs[0].options_json={...q.designs[0].options_json,perfectsheer_extra_charging_kits:2,perfectsheer_extension_cables:1,perfectsheer_repeaters:2};
  const priced=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in priced) || priced.backend!=="v2" || !("backend" in base) || base.backend!=="v2") throw new Error("Expected V2 backend");
  const d=priced.designs[0], b=base.designs[0];expect(d.result).toMatchObject({ok:true,validationIssues:[]});
  if (!d.result.ok || !b.result.ok) throw new Error("Expected motor price");
  expect(d.result.total-b.result.total).toBe(2*43+43+2*107);
  expect(d.result.unitPrice).toBe(b.result.unitPrice);
  expect(d.result.components.filter(c=>c.billingScope==="once_per_line").map(c=>[c.id,c.units])).toEqual(expect.arrayContaining([["motor:smart_motorization:charging_kit",2],["motor:smart_motorization:extension_cable",1],["motor:smart_motorization:repeater",2]]));
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(priced);
 });
 it("charges PerfectSheer hardware per shade and persists customer choices",()=>{
  const q=currentQuote("perfectsheer","Sheer Shades","F1179",{light_control:"Light Filtering",perfectsheer_light_guard:"Premium Wood Light Guard",perfectsheer_light_guard_color:"049 Stone Gray",perfectsheer_magnetic_hold_down:"Yes",perfectsheer_magnet_color:"Black",perfectsheer_shim_layers:3});
  q.designs[0].lift_system="Continuous Cord Loop";q.lines[0].quantity=2;
  const priced=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in priced) || priced.backend!=="v2") throw new Error("Expected V2 backend");
  const d=priced.designs[0];expect(d.result).toMatchObject({ok:true,validationIssues:[]});
  if (!d.result.ok) throw new Error("Expected hardware price");
  expect(d.result.unitPrice-d.result.base).toBe(117+28+6*7);
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({hardware:{shimQuantity:6,lightGuard:{sideBlockCount:2,topBlockCount:1}}});
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(priced);
  const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(d.selection));
  expect(customer).toEqual(expect.arrayContaining(["Light Guard: Premium Wood Light Guard","Light Guard Finish: 049 Stone Gray","Shim Layers: 3","Magnet Catch Finish: Black"]));
  expect(customer.join(" ")).not.toMatch(/sourcePages|quantityBasis|shimQuantity|factoryColorCode/);
 });
 it("server-prices PerfectSheer motor components and retains tube selection after reopening",()=>{
  const q=currentQuote("perfectsheer","Sheer Shades","F1179",{light_control:"Light Filtering",perfectsheer_tube_diameter:2,motor_position:"Right",hub_required:false});
  q.designs[0].lift_system="Motorized";q.designs[0].motor_type="Norman Smart AC Adapter";q.designs[0].remote_type="Basic Remote";
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  const d=first.designs[0];expect(d.result.validationIssues?.filter(i=>i.severity === "hard_block")).toEqual([]);expect(d.result.ok).toBe(true);
  expect(d.selection.configuration.motorization_selections).toEqual(expect.arrayContaining([{groupId:"smart_motorization",optionId:"motor",role:"base_motor",units:1},{groupId:"smart_motorization",optionId:"basic_remote_black",role:"controller",units:1}]));
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(first);
  reopened.designs[0].options_json.perfectsheer_tube_diameter=3;
  const invalid=repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19");
  if (!("backend" in invalid) || invalid.backend!=="v2") throw new Error("Expected V2 backend");
  expect(invalid.designs[0].result.validationIssues?.some(i=>i.ruleId==="perfectsheer.motorization.tube")).toBe(true);
 });

 it("preserves PerfectSheer ordering identity, factory aliases, valance charges and customer choices",()=>{
  const q=currentQuote("perfectsheer","Sheer Shades","F1179",{light_control:"Light Filtering",perfectsheer_installation:"Back Mount",perfectsheer_wood_finish:"003 Silk White",perfectsheer_chain_length:90,perfectsheer_chain_unobstructed:"Yes",norman_assembly_v1:{fabric:{factoryColorCode:"FORGED"}}});
  q.designs[0].lift_system="Continuous Cord Loop";q.designs[0].valance="Modern Wood Valance";
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  const d=first.designs[0];expect(d.result).toMatchObject({ok:true,validationIssues:[]});
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({fabric:{customerFabricCode:"AA0326",customerColorCode:"F1179",factoryFabricCode:"AA0335",factoryColorCode:"F1359"},valance:{type:"Modern Wood Valance",height:4.5,woodFinish:"003 Silk White"},chain:{length:90}});
  const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(d.selection));
  expect(customer).toEqual(expect.arrayContaining(["Wood Valance Finish: 003 Silk White","Custom Cord Length: 90"]));
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(first);
  reopened.designs[0].options_json.perfectsheer_wood_finish="Unknown";
  const invalid=repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19");
  if (!("backend" in invalid) || invalid.backend!=="v2") throw new Error("Expected V2 backend");
  expect(invalid.designs[0].result.validationIssues?.some(i=>i.ruleId==="norman.perfectsheer.perfectsheer_wood_finish")).toBe(true);
 });
 it("prices two different SmartFold shade widths with one common valance and preserves shared charges",()=>{
  const q=currentQuote("smartfold","SmartFold Shades","F1794",{smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:0,smartfold_common_valance_id:"Valance 1",smartfold_common_position:1,smartfold_common_gap_after:2,smartfold_valance_joinery:"Square Keystone",smartfold_keystone_count:1,basic_light_guard:"Yes",smartfold_light_guard_color:"3058 White"});
  q.lines.push({...q.lines[0],id:"second",width_whole:42,sort_order:1});
  q.designs.push({...q.designs[0],id:"second-A",line_item_id:"second",options_json:{...q.designs[0].options_json,smartfold_common_position:2,smartfold_common_gap_after:0,smartfold_common_valance_v1:{chargeSharedOptions:true,orderSpan:1}}});
  q.selectedVariantByLine.second="A";
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  expect(first.designs.map(d=>d.result)).toMatchObject([{ok:true,base:606,unitPrice:995,validationIssues:[]},{ok:true,base:671,unitPrice:671,validationIssues:[]}]);
  expect(first.designs[0].selection.configuration.smartfold_common_valance_v1).toMatchObject({orderSpan:80,orderedWidths:[36,42],chargeSharedOptions:true});
  const reopened=JSON.parse(JSON.stringify(q));for(const [i,d]of first.designs.entries())reopened.designs[i].options_json={...reopened.designs[i].options_json,...d.selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(first);
  const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(first.designs[0].selection));expect(customer.join(" ")).not.toMatch(/ownerLineId|orderSpan|common_valance_v1/);
 });
 it("preserves independent CCL drops and full-fold choices under one common valance",()=>{
  const q=currentQuote("smartfold","SmartFold Shades","F1794",{smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:0,smartfold_common_valance_id:"Valance 1",smartfold_common_position:1,smartfold_common_gap_after:2,smartfold_side_by_side_id:"Group 1",room_name:"FORGED ROOM",control_side:"Left",smartfold_chain_length:90,smartfold_chain_unobstructed:"Yes",full_fold_required:"Yes"});
  q.designs[0].lift_system="Continuous Cord Loop";
  q.lines.push({...q.lines[0],id:"second",width_whole:42,height_whole:72,sort_order:1});
  q.designs.push({...q.designs[0],id:"second-A",line_item_id:"second",options_json:{...q.designs[0].options_json,smartfold_common_position:2,smartfold_common_gap_after:0,control_side:"Right",smartfold_chain_length:60,smartfold_chain_unobstructed:"No"}});
  q.selectedVariantByLine.second="A";
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  for (const [i,d] of first.designs.entries()) {
   expect(d.result).toMatchObject({ok:true,validationIssues:[]});
   expect(d.selection.configuration.norman_assembly_v1).toMatchObject({chain:{length:i===0?90:60,lengthBasis:"custom",unobstructedBelow:i===0}});
   expect(d.selection.configuration.full_fold_required).toBe("Yes");
   expect(d.selection.configuration.norman_assembly_v1).toMatchObject({sideBySide:{groupId:"Group 1",room:"Office",shadeQuantity:2}});
  }
  const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(first.designs[0].selection));
  expect(customer).toEqual(expect.arrayContaining(["Custom Chain Length: 90","Full Fold Required: Yes"]));
  const reopened=JSON.parse(JSON.stringify(q));for(const [i,d]of first.designs.entries())reopened.designs[i].options_json={...reopened.designs[i].options_json,...d.selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(first);
 });
 it("retains four motors and charges one power panel for two repeated shared-valance assemblies",()=>{
  const q=currentQuote("smartfold","SmartFold Shades","F1794",{smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:0,smartfold_common_valance_id:"Valance 1",smartfold_common_position:1,smartfold_common_gap_after:2,motor_type:"Norman Smart DC Low Voltage",motor_position:"Right",hub_required:false,existing_remote_work_order_number:"TEST-EXISTING-REMOTE",dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 1"});
  q.lines[0].quantity=2;q.designs[0].lift_system="Motorized";
  q.lines.push({...q.lines[0],id:"second",width_whole:42,sort_order:1});
  q.designs.push({...q.designs[0],id:"second-A",line_item_id:"second",options_json:{...q.designs[0].options_json,smartfold_common_position:2,smartfold_common_gap_after:0}});
  q.selectedVariantByLine.second="A";
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  for(const d of first.designs){
   expect(d.result).toMatchObject({ok:true,validationIssues:[]});
   expect(d.selection.configuration.norman_order_record_v1).toMatchObject({totalConnections:4,connectedLineIds:["audit-line","second"]});
  }
  expect(first.designs.map(d=>d.result)).toMatchObject([{base:606,total:3649},{base:671,total:2306}]);
  const reopened=JSON.parse(JSON.stringify(q));for(const [i,d]of first.designs.entries())reopened.designs[i].options_json={...reopened.designs[i].options_json,...d.selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(first);
  reopened.designs[0].options_json.smartfold_common_valance_id=null;
  const removed=repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19");
  if (!("backend" in removed) || removed.backend!=="v2") throw new Error("Expected V2 backend");
  expect(removed.designs[0].selection.configuration.smartfold_common_valance_v1).toBeUndefined();
  expect(removed.designs[1].result.validationIssues?.some(i=>i.ruleId==="norman.smartfold.common_count")).toBe(true);
 });
 it("saves an Impressions reverse pattern with silver fascia and premium hem finish",()=>{
  const q=currentQuote("smartfold","SmartFold Shades","F1794",{smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:3,smartfold_hold_down:"Magnetic",smartfold_magnet_color:"Nickel-Plated",smartfold_pole:"60-inch Cordless Operating Pole",smartfold_fabric_pattern:"Reverse",smartfold_fascia_color:"Anodized Silver",premium_hem_bar:"Yes",smartfold_hem_color:"Bronze"});
  q.designs[0].valance="Curved Fascia";
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  const priced=first.designs[0];expect(priced.result).toMatchObject({ok:true,base:606,unitPrice:935,validationIssues:[]});
  expect(priced.selection.configuration.norman_assembly_v1).toMatchObject({style:{fabricPattern:"Reverse",fasciaColor:"Anodized Silver",fasciaEndCap:"White",hemColor:"Bronze",hemEndCap:"Chocolate"}});
  const customer=customerConfigurationFromSelection(priced.selection);
  expect(v2CustomerConfigurationOptions(customer)).toEqual(expect.arrayContaining(["Fabric Pattern: Reverse","Fascia Color: Anodized Silver","Hem-Bar Color: Bronze"]));
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...priced.selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(first);
 });
 it("retains the exact SmartFold verification blocker",()=>{
  const result=repriceExactQuoteBuilderForServerDate(currentQuote("smartfold","SmartFold Shades","F1709",{smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:0}),"2026-09-19");
  expect(result).toMatchObject({backend:"v2"});
  if ("backend" in result && result.backend==="v2") {
   expect(result.designs[0].result).toMatchObject({ok:true,unitPrice:761,validationStatus:"blocked",productStatus:"restriction_source_incomplete",validationIssues:[]});
   expect(result.designs[0].snapshot).toBeNull();
  }
 });
 it("persists source-derived SmartFold hardware and prices actual shim pieces",()=>{
  const q=currentQuote("smartfold","SmartFold Shades","F1709",{smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:3,shim_quantity:999});
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  expect(first.designs[0].result).toMatchObject({ok:true,unitPrice:824,validationStatus:"blocked",validationIssues:[],surchargeLines:expect.arrayContaining([expect.objectContaining({id:"shim",amount:63,detail:"7 x 9 units"})])});
  expect(first.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({shimQuantity:9,finishedShadeWidth:35.875,mountingBracketCount:0});
  const reopened=JSON.parse(JSON.stringify(q));
  reopened.designs[0].options_json={...reopened.designs[0].options_json,...first.designs[0].selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(first);
 });
 it.each(getProductColorOptions("smartfold").filter(c=>c.available))("routes SmartFold $colorCode through its grid with saved accessories",color=>{
  const q=currentQuote("smartfold","SmartFold Shades",color.colorCode,{smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:3,smartfold_hold_down:"Magnetic",smartfold_magnet_color:"Nickel-Plated",smartfold_pole:"60-inch Cordless Operating Pole"});
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  const priced=first.designs[0];
  expect(priced.result).toMatchObject({ok:true,base:606,unitPrice:941,validationStatus:"blocked",validationIssues:[],surchargeLines:expect.arrayContaining([expect.objectContaining({id:"magnetic_hold_down",amount:28}),expect.objectContaining({id:"cordless_operating_pole",amount:89})])});
  expect(priced.selection.configuration.norman_order_record_v1).toMatchObject({orderQuantity:1,fulfillmentQuantity:1,retailCharge:0});
  const customer=customerConfigurationFromSelection(priced.selection);
  expect(v2CustomerConfigurationOptions(customer)).toEqual(expect.arrayContaining(["Mounting method: Top Mount with Raceway","Shim layers: 3","Hold-downs: Magnetic","Magnet catch color: Nickel-Plated","Additional pole per shade: 60-inch Cordless Operating Pole"]));
  expect(customer.selections).not.toHaveProperty("norman_order_record_v1");
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...priced.selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(first);
 });
 it("retains measured wood cut-outs and derives their price after serialization",()=>{
  const q=currentQuote("wood_blinds","Wood Blinds","ND001",{slat_size:'2"',cut_out_sides:"two",wood_cutout_left_type:"Corner (Bottom)",wood_cutout_left_width:1,wood_cutout_left_top:20});
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  const priced=first.designs[0];
  expect(priced.result.ok,JSON.stringify(priced.result)).toBe(true);
  if(priced.result.ok) expect(priced.result.surchargeLines).toContainEqual(expect.objectContaining({id:"cut_out",amount:99}));
  expect(priced.selection.configuration).toMatchObject({wood_cutout_left_type:"Corner (Bottom)",wood_cutout_left_width:1,wood_cutout_left_top:20});
  const output=customerConfigurationFromSelection({...priced.selection,configuration:{...priced.selection.configuration,wood_cutout_left_bottom:50,wood_cutout_right_width:4}});
  expect(output.selections).not.toHaveProperty("wood_cutout_left_bottom");
  expect(output.selections).not.toHaveProperty("wood_cutout_right_width");
  expect(v2CustomerConfigurationOptions(output)).toEqual(expect.arrayContaining(["Left cut-out: Corner (Bottom)","Left cut-out width: 1","Left cut-out top from headrail: 20"]));
  expect(JSON.stringify(output)).not.toContain("dealer");
  const reopened=JSON.parse(JSON.stringify(q));
  reopened.designs[0].options_json={...reopened.designs[0].options_json,...priced.selection.configuration};
  const second=repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19");
  expect(second).toEqual(first);
  q.designs[0].options_json={...q.designs[0].options_json,wood_cutout_left_width:5};
  const invalid=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in invalid) || invalid.backend!=="v2") throw new Error("Expected V2 backend");
  expect(invalid.designs[0].result).toMatchObject({ok:false,validationIssues:expect.arrayContaining([expect.objectContaining({ruleId:"norman.wood_blinds.cutout_left_width"})])});
  expect(invalid.designs[0].snapshot).toBeNull();
 });
});
