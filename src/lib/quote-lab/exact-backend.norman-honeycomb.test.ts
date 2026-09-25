import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { repriceExactQuoteBuilderForServerDate } from "./exact-backend";
import { expectedHoneycombProgramId, expectedVerticalHoneycombProgramId } from "@/lib/quote-v2/catalog";
import { normanHoneycombV2Source } from "@/lib/quote-v2/generated/norman-honeycomb-v2.generated";
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from "@/lib/crm/sales-quote-v2-customer-configuration";
import { getQuoteDesignDetails } from "@mts/lib/quoteDesignDetails";
import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";

function price(q: ReturnType<typeof dualQuote>, date = "2026-09-19") {
 const p=repriceExactQuoteBuilderForServerDate(q,date);
 if(!("backend"in p)||p.backend!=="v2")throw new Error("Expected V2");
 return p.designs[0];
}

function dualQuote(rearFamily = "Light Filtering", frontFamily = "Light Filtering", cell = '3/4" Single Cell') {
 const front=normanHoneycombV2Source.activeColors.find(c=>c.family===frontFamily && c.cellSizes.some(size=>size===cell))!;
 const rear=normanHoneycombV2Source.activeColors.find(c=>c.family===rearFamily && c.cellSizes.some(size=>size===cell))!;
 const line={id:"hc",quote_id:"audit",room_name:"Office",product_type:"Honeycomb Shades",width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0",quantity:1,sort_order:0,created_at:"2026-09-19T00:00:00Z"} as SalesQuoteLineItem;
 const design={id:"hc-A",line_item_id:line.id,variant:"A",product_type:"Honeycomb Shades",supplier:"Norman",mount_type:"Inside Mount",lift_system:"SmartFit Dual Shade",fabric:front.family,unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:"honeycomb",quote_lab_program_id:expectedHoneycombProgramId(front.family,front.customerColorCode,cell),fabric_color_collection:front.family,fabric_color_code:front.customerColorCode,fabric_color_name:front.colorName,cell_size:cell,honeycomb_application:"Standard Horizontal",slope_angle_degrees:0,day_night_top_layer:"Front",rear_cell_size:cell,back_fabric:rear.family,back_fabric_color_collection:rear.family,back_fabric_color_code:rear.customerColorCode,back_fabric_color_name:rear.colorName}} as unknown as SalesQuoteDesign;
 return {lines:[line],designs:[design],selectedVariantByLine:{hc:"A"}};
}

describe("Norman Honeycomb multiple-fabric authoritative pricing",()=>{
 // Exhaustive coverage reprices all 642 color/cell combinations in both fabric
 // positions; allow headroom over the observed 6.5-8.2 seconds on shared CI.
 it("routes every SmartFit Dual workbook color/cell in both fabric positions",()=>{
  let routes=0;
  for(const color of normanHoneycombV2Source.activeColors){
   if(/flame resistant|fr essentials/i.test(color.family))continue;
   for(const cell of color.cellSizes){
    const picker=getMtsProductColorRows("Honeycomb Shades",{quote_v2_backend:true,lift_system:"SmartFit Dual Shade",cell_size:cell});
    expect(picker.some(row=>row.collection===color.family&&(row.colorCode===color.customerColorCode||row.colorCode===color.factoryColorCode)),`${color.family}/${color.customerColorCode}/${cell} picker`).toBe(true);
    for(const rear of [false,true]){
     const q=dualQuote(rear?color.family:"Light Filtering",rear?"Light Filtering":color.family,cell);
     q.designs[0].options_json={...q.designs[0].options_json,[rear?"back_fabric_color_code":"fabric_color_code"]:color.customerColorCode};
     const d=price(q);expect(d.result.ok,`${color.family}/${color.customerColorCode}/${cell}/${rear?"rear":"front"}: ${JSON.stringify(d.result)}`).toBe(true);
    }
    routes++;
   }
  }
  expect(routes).toBe(642);
 },20_000);
 it("keeps internal rear fabric identifiers out of customer details",()=>{
  const q=dualQuote("Room Darkening");q.designs[0].options_json={...q.designs[0].options_json,back_fabric_color_id:"internal-color",back_fabric_product_id:"honeycomb",back_fabric_program_id:"internal-grid",back_fabric_surcharge_id:"room_darkening"};
  const details=getQuoteDesignDetails(q.designs[0]);
  expect(details.some(d=>/Brilliant White RD/.test(d.value))).toBe(true);
  expect(JSON.stringify(details)).not.toMatch(/internal-color|internal-grid|Surcharge Id|Product Id/);
 });
 it.each([
  ["Light Filtering","Room Darkening",1091],
  ["Room Darkening","Room Darkening",1174],
  ["Light Filtering","Sheer",1091],
  ["Sheer","Light Filtering",1091],
  ["Designer Fabric (RD) (Langley)","Light Filtering",1091],
  ["Breeze AB0658","Windsong AB0632",1508],
  ["Windsong AB0632","Breeze AB0658",1508],
  ["Light Filtering","Breeze AB0658",1305],
  ["Designer Fabric (RD) (Ashton)","Light Filtering",1447.4],
 ])("prices the exact grids for %s plus %s",(front,rear,total)=>{
  const q=dualQuote(rear,front);q.lines[0].quantity=3;
  const d=price(q);expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
  if(!d.result.ok)throw new Error("Expected price");
  expect(d.result.total).toBeCloseTo(total*3,2);expect(d.result.configurationUnits).toBe(2);
  expect(d.result.componentTotals.catalogPerWindow).toBe(total);
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({type:"honeycomb_smartfit_dual",fabrics:[{family:front},{family:rear}]});
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};
  expect(price(reopened)).toEqual(d);
  const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(d.selection));
  expect(customer).toContain("Top shade selection: Front");
  expect(customer.join(" ")).not.toMatch(/factoryColor|programId|norman_assembly/);
 });
 it.each([[8.5,12,true],[8.4375,12,false],[50,86,true],[50.0625,60,false],[36,86.0625,false],[72,86,true],[72.0625,60,false]])("enforces both shades at %s by %s",(w,h,ok)=>{
  const q=dualQuote(w===50||w===50.0625?"Breeze AB0658":"Light Filtering");
  q.lines[0].width_whole=Math.floor(w);q.lines[0].width_fraction=w%1===0.5?"1/2":w%1?`${Math.round(w%1*16)}/16`:"0";q.lines[0].height_whole=Math.floor(h);q.lines[0].height_fraction=h%1?`${Math.round(h%1*16)}/16`:"0";
  expect(price(q).result.ok).toBe(ok);
 });
 it("does not let a forged rear class evade the Breeze 50-inch limit",()=>{
  const q=dualQuote("Breeze AB0658");q.lines[0].width_whole=60;
  q.designs[0].options_json={...q.designs[0].options_json,rear_fabric_class:"Light Filtering"};
  expect(price(q).result.ok).toBe(false);
 });
 it("retains the prior date behavior without rewriting historical quote snapshots",()=>{
  expect(price(dualQuote("Room Darkening"),"2026-09-18").result).toMatchObject({ok:true,total:1174});
 });
 it("blocks unsupported horizontal Day and Night price assumptions",()=>{
  const q=dualQuote("Room Darkening");q.designs[0].lift_system="Cordless Day & Night";
  const d=price(q);expect(d.result.ok).toBe(false);
  expect(d.result.validationIssues.some(i=>i.ruleId==="honeycomb.multi_fabric.horizontal_day_night_evidence")).toBe(true);
 });
 it("charges both full-size SmartFit shades and the dual operating surcharge",()=>{
  const p=repriceExactQuoteBuilderForServerDate(dualQuote(),"2026-09-19");
  if(!("backend" in p)||p.backend!=="v2")throw new Error("Expected V2");
  expect(p.designs[0].result.ok,JSON.stringify(p.designs[0].result)).toBe(true);
  if(!p.designs[0].result.ok)throw new Error("Expected price");
  // September retail PDF p10: 36 x 60 is $415 per fabric; Dual SmartFit is $178.
  expect(p.designs[0].result.total).toBe(415+415+178);
 });
 it("rejects a forged second color instead of pricing one shade",()=>{
  const q=dualQuote();q.designs[0].options_json={...q.designs[0].options_json,back_fabric_color_code:"C9999"};
  const p=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if(!("backend"in p)||p.backend!=="v2")throw new Error("Expected V2");
  expect(p.designs[0].result.ok).toBe(false);
 });
 it("prices the room-darkening premium only on the selected rear shade",()=>{
  const p=repriceExactQuoteBuilderForServerDate(dualQuote("Room Darkening"),"2026-09-19");
  if(!("backend"in p)||p.backend!=="v2")throw new Error("Expected V2");
  expect(p.designs[0].result.ok,JSON.stringify(p.designs[0].result)).toBe(true);
  if(!p.designs[0].result.ok)throw new Error("Expected price");
  expect(p.designs[0].result.total).toBe(415+498+178);
 });
});


describe("Norman Patio Door Vertical routing",()=>{
 it("uses the existing vertical grid rather than a horizontal cell grid",()=>{
  const q=dualQuote();q.designs[0].lift_system="Patio Door Vertical";
  q.designs[0].options_json={...q.designs[0].options_json,honeycomb_application:"Patio Door Vertical",split_splice:"Left Stack",vertical_mounting:"Installation Brackets"};
  const d=price(q);
  expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
  expect(d.selection.productId).toBe("vertical_honeycomb");
  if(d.result.ok)expect(d.result.total).toBe(869);
 });
});

function verticalQuote(family="Light Filtering", cell='3/4" Single Cell') {
 const q=dualQuote("Light Filtering",family,cell);q.designs[0].lift_system="Patio Door Vertical";
 const c={...q.designs[0].options_json} as Record<string,unknown>;
 for(const k of Object.keys(c))if(k.startsWith("back_")||k.startsWith("rear_")||["day_night_top_layer","slope_angle_degrees"].includes(k))delete c[k];
 q.designs[0].options_json={...c,honeycomb_application:"Patio Door Vertical",split_splice:"Left Stack",vertical_mounting:"Installation Brackets"};return q;
}
describe("Vertical Honeycomb assortment and hardware",()=>{
 it("routes every eligible workbook color/cell through the picker and exact vertical grid",()=>{
  let routes=0;
  for(const color of normanHoneycombV2Source.verticalColors)for(const size of color.availableCells){
   const cell=`${size} Cell`; const program=expectedVerticalHoneycombProgramId(color.family,color.customerColorCode,cell);expect(program,`${color.customerColorCode}/${cell} routing`).toBeTruthy();
   const q=verticalQuote(color.family,cell);q.designs[0].options_json={...q.designs[0].options_json,fabric_color_code:color.customerColorCode};
   const rows=getMtsProductColorRows("Honeycomb Shades",{quote_v2_backend:true,honeycomb_application:"Patio Door Vertical",lift_system:"Patio Door Vertical",cell_size:cell});
   expect(rows.some(r=>(r.colorCode===color.customerColorCode||r.colorCode===color.factoryColorCode)&&r.programId===program),`${color.customerColorCode}/${cell} picker`).toBe(true);
   const d=price(q);expect(d.result.ok,`${color.customerColorCode}/${cell}: ${JSON.stringify(d.result)}`).toBe(true);expect(d.selection.programId).toBe(program);routes++;
  }
  expect(routes).toBe(266);
 });
 it.each([["Light Filtering",869],["Room Darkening",1042.8],["Sheer",1042.8],["Flame Resistant (LF)",1519]])("prices %s from the vertical retail page",(family,total)=>{
  const d=price(verticalQuote(family));expect(d.result).toMatchObject({ok:true,total});
 });
 it.each([[39,2],[39.0625,3],[66,3],[66.0625,4],[93,4],[93.0625,5],[120,5],[120.0625,6]])("derives bracket count at width %s",(w,count)=>{
  const q=verticalQuote();q.lines[0].width_whole=Math.floor(w);q.lines[0].width_fraction=w%1?"1/16":"0";q.designs[0].options_json={...q.designs[0].options_json,vertical_shim_layers:2};
  const d=price(q);expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({mountingBracketCount:count,floorBracketCount:1,shimQuantity:2*(count+1)});
 });
 it("charges only derived shims and preserves its server-owned assembly after reopening",()=>{
  const q=verticalQuote();q.designs[0].options_json={...q.designs[0].options_json,vertical_shim_layers:2,norman_assembly_v1:{shimQuantity:999}};
  const d=price(q);expect(d.result).toMatchObject({ok:true,total:911});
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({shimQuantity:6,finishedWidth:35.8125,finishedHeight:59.375});
  const saved=JSON.parse(JSON.stringify(q));saved.designs[0].options_json={...saved.designs[0].options_json,...d.selection.configuration};expect(price(saved)).toEqual(d);
 });
 it.each([[29.9375,60,false],[30,24,true],[146,120,true],[146.0625,60,false],[36,120.0625,false]])("enforces %s by %s",(w,h,ok)=>{
  const q=verticalQuote();q.lines[0].width_whole=Math.floor(w);q.lines[0].width_fraction=w%1?`${Math.round(w%1*16)}/16`:"0";q.lines[0].height_whole=Math.floor(h);q.lines[0].height_fraction=h%1?`${Math.round(h%1*16)}/16`:"0";expect(price(q).result.ok).toBe(ok);
 });
 it("rejects horizontal operating systems on the vertical grid",()=>{const q=verticalQuote();q.designs[0].lift_system="SmartRise Cordless";expect(price(q).result.ok).toBe(false);});
 it("rejects shims with pre-drilled mounting",()=>{const q=verticalQuote();q.designs[0].options_json={...q.designs[0].options_json,vertical_mounting:"Pre-Drilled Headrail",vertical_shim_layers:1};expect(price(q).result.ok).toBe(false);});
});

describe("Vertical Honeycomb splice and unavailable selections",()=>{
 it.each([[97.5,60,false],[97.625,60,true],[100,103,false],[100,100,true]])("derives the source splice threshold at %s by %s",(w,h,spliced)=>{
  const q=verticalQuote();q.lines[0].width_whole=Math.floor(w);q.lines[0].width_fraction=w%1===.5?"1/2":w%1?"5/8":"0";q.lines[0].height_whole=h;
  const d=price(q);expect(d.result.ok,JSON.stringify(d.result)).toBe(true);expect(d.selection.configuration.norman_assembly_v1).toMatchObject({headrailSpliced:spliced,includedKeystoneCount:spliced?1:0});
 });
 it.each(["Windsong AB0632","Breeze AB0658","Solus","Designer Fabric (LF) (Ashton)"])("rejects unavailable vertical %s",family=>expect(price(verticalQuote(family)).result.ok).toBe(false));
 it("rejects an unknown exact vertical color",()=>{const q=verticalQuote();q.designs[0].options_json={...q.designs[0].options_json,fabric_color_code:"C9999"};expect(price(q).result.ok).toBe(false);});
});

it.each(["hold_downs","magnetic_hold_down","light_guard","poles"])("rejects incompatible vertical %s",key=>{const q=verticalQuote();q.designs[0].options_json={...q.designs[0].options_json,[key]:"Yes"};expect(price(q).result.ok).toBe(false);});

function horizontalQuote(options: Record<string,unknown> = {}, lift="SmartRise Cordless") {
 const q=verticalQuote();q.designs[0].lift_system=lift;
 q.designs[0].options_json={...q.designs[0].options_json,honeycomb_application:"Standard",split_splice:null,vertical_mounting:null,...options};return q;
}
describe("Honeycomb accessory charges and persistence",()=>{
 it("charges both poles, the separate Light Guard, and width-derived shims",()=>{
  const q=horizontalQuote({poles:"Pole with Attachment",honeycomb_pole_length:"60",honeycomb_pole_quantity:"2",honeycomb_light_guard:"Yes",honeycomb_light_guard_color:"3058 White",honeycomb_shim_layers:"2"});
  const d=price(q);expect(d.result).toMatchObject({ok:true,total:666});
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({hardware:{mountingBracketCount:2,shimQuantity:4,pole:{quantity:2,length:"60",head:"Movable",holderIncluded:true}}});
  const saved=JSON.parse(JSON.stringify(q));saved.designs[0].options_json={...saved.designs[0].options_json,...d.selection.configuration};expect(price(saved)).toEqual(d);
  expect(v2CustomerConfigurationOptions(customerConfigurationFromSelection(d.selection)).join(" ")).toContain("Pole length: 60");
 });
 it("charges a Light Guard and an attachment independently despite their shared retail price identifier",()=>{
  expect(price(horizontalQuote({poles:"Attachment Only",honeycomb_pole_quantity:1,honeycomb_light_guard:"Yes",honeycomb_light_guard_color:"3212 Black Ink"})).result).toMatchObject({ok:true,total:505});
 });
 it("charges magnetic hold-downs only once per shade",()=>{
  const q=horizontalQuote({hold_downs:"Magnetic",honeycomb_magnet_color:"Black",honeycomb_shim_layers:2});q.designs[0].mount_type="Outside Mount";expect(price(q).result).toMatchObject({ok:true,total:471});
 });
 it.each([[43,2],[43.0625,3],[72,3],[72.0625,4],[101,4],[101.0625,5]])("derives cordless mounting brackets at %s",(w,count)=>{
  const q=horizontalQuote({honeycomb_shim_layers:1});q.lines[0].width_whole=Math.floor(w);q.lines[0].width_fraction=w%1?"1/16":"0";
  const d=price(q);expect(d.result.ok,JSON.stringify(d.result)).toBe(true);expect(d.selection.configuration.norman_assembly_v1).toMatchObject({hardware:{mountingBracketCount:count,shimQuantity:count}});
 });
 it.each([
  [{poles:"Pole with Attachment",honeycomb_pole_length:48}],
  [{poles:"Attachment Only",honeycomb_pole_quantity:3}],
  [{honeycomb_light_guard:"Yes",honeycomb_light_guard_color:"invented"}],
  [{honeycomb_shim_layers:3}],
  [{hold_downs:"Magnetic"}],
 ])("rejects invalid hardware %j",opts=>expect(price(horizontalQuote(opts)).result.ok).toBe(false));
 it("rejects forged saved quantities",()=>{
  const q=horizontalQuote({honeycomb_shim_layers:1,shim_quantity:999,norman_assembly_v1:{hardware:{shimQuantity:999}}});expect(price(q).result).toMatchObject({ok:true,total:429});
 });
 it("does not offer SmartFit inside-mount shims or hold-downs",()=>{
  expect(price(horizontalQuote({slope_angle_degrees:0,honeycomb_shim_layers:1},"SmartFit")).result.ok).toBe(false);
  expect(price(horizontalQuote({slope_angle_degrees:0,hold_downs:"Standard"},"SmartFit")).result.ok).toBe(false);
 });
});


describe("Honeycomb side support kit",()=>{
 it("charges the support kit once and distinguishes a true side installation",()=>{
  const q=horizontalQuote({installation_method:"Side Mount"});
  expect(price(q).result).toMatchObject({ok:true,total:438});
  expect(price(q).selection.configuration.norman_assembly_v1).toMatchObject({hardware:{sideMountSupportKit:true,regularSupportBracketsRequired:false}});
 });
 it("permits a wider support kit only with regular mounting brackets",()=>{
  const q=horizontalQuote({honeycomb_side_mount_kit:"Yes",installation_method:"Regular Support Brackets"});q.lines[0].width_whole=38;
  const d=price(q);expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({hardware:{sideMountSupportKit:true,regularSupportBracketsRequired:true}});
  q.designs[0].options_json={...q.designs[0].options_json,installation_method:"Side Mount"};expect(price(q).result.ok).toBe(false);
 });
 it("rejects outside-mount kits and unknown accessory choices",()=>{
  const q=horizontalQuote({honeycomb_side_mount_kit:"Yes"});q.designs[0].mount_type="Outside Mount";expect(price(q).result.ok).toBe(false);
  expect(price(horizontalQuote({honeycomb_light_guard:"invented"})).result.ok).toBe(false);
 });
});

 it("rejects a Skylight rail override unavailable for its included Light Guard",()=>{
  const q=horizontalQuote({honeycomb_application:"Motorized Skylights",rail_color:"Agave"},"Motorized");
  expect(price(q).result.validationIssues.some(i=>i.ruleId==="honeycomb.hardware.skylight_guard_color")).toBe(true);
 });

describe("Honeycomb motor accessory server prices",()=>{
 it.each([
  ["AutoWand",null,{honeycomb_wand_length:"60",honeycomb_wand_color:"White",honeycomb_extra_charging_kits:2,honeycomb_extension_cables:3,honeycomb_extension_color:"Black"},1962],
  ["Norman Smart Rechargeable Battery with Wireless Charging Wand","SmartDial Remote",{honeycomb_remote_quantity:1,honeycomb_remote_channel:5,honeycomb_charging_extension_poles:2,honeycomb_color_ring_sets:2},4479],
 ] as const)("prices %s accessories exactly and preserves reopened configuration",(motor,remote,options,total)=>{
  const q=horizontalQuote({motor_position:"Right",hub_required:false,...options},"Motorized");q.designs[0].motor_type=motor;q.designs[0].remote_type=remote;q.lines[0].quantity=3;
  const d=price(q);expect(d.result,JSON.stringify(d.result)).toMatchObject({ok:true,total});
  const reopened=JSON.parse(JSON.stringify(q));reopened.designs[0].options_json={...reopened.designs[0].options_json,...d.selection.configuration};expect(price(reopened)).toEqual(d);
  const visible=v2CustomerConfigurationOptions(customerConfigurationFromSelection(d.selection)).join(" ");expect(visible).not.toMatch(/norman_assembly|catalogVersion|dealerCost/);
  if(motor==="AutoWand")expect(visible).toContain("60");else expect(visible).toContain("Shade Remote Channel: 5");
 });
 it("rejects AutoWand Breeze while preserving supported woven families",()=>{
  for(const family of ["Breeze AB0658","Windsong AB0632","Designer Fabric (RD) (Ashton)"]){
   const q=dualQuote("Light Filtering",family);q.designs[0].lift_system="Motorized";q.designs[0].motor_type="AutoWand";
   q.designs[0].options_json={...q.designs[0].options_json,rear_cell_size:null,back_fabric:null,back_fabric_color_code:null,day_night_top_layer:null,motor_position:"Right",hub_required:false};
   expect(price(q).result.ok,JSON.stringify(price(q).result)).toBe(family!=="Breeze AB0658");
  }
 });
});


describe("Vertical Honeycomb full standard configuration crosswalk (Guide pp7,36–38,49)",()=>{
 it("prices and preserves every current fabric/cell with each published stack and mounting method",()=>{
  const stacks=[["Left Stack",1],["Right Stack",1],["Traveling Center Stack",0],["Center Opening",2],["Split Evenly",2],["Custom Split",2]] as const;
  const mounts=[["Inside Mount","Installation Brackets",2,35.8125,59.375],["Inside Mount","Pre-Drilled Headrail",0,35.8125,59.375],["Outside Mount","Wall Mount Brackets",2,36,59.5]] as const;
  let count=0;
  for(const color of normanHoneycombV2Source.verticalColors)for(const size of color.availableCells)for(const [stack,floor] of stacks)for(const [mount,attachment,layers,finishedWidth,finishedHeight] of mounts){
   const q=verticalQuote(color.family,`${size} Cell`);q.designs[0].mount_type=mount;
   q.designs[0].options_json={...q.designs[0].options_json,fabric_color_code:color.customerColorCode,split_splice:stack,vertical_mounting:attachment,vertical_shim_layers:layers,...(stack==="Custom Split"?{vertical_left_width_inches:18,vertical_right_width_inches:18}:{})};
   const d=price(q);expect(d.result.ok,`${color.customerColorCode}/${size}/${stack}/${attachment}: ${JSON.stringify(d.result)}`).toBe(true);
   expect(d.selection.configuration.norman_assembly_v1).toMatchObject({mounting:attachment,mountingBracketCount:attachment==="Pre-Drilled Headrail"?0:2,floorBracketCount:floor,shimQuantity:layers*(2+floor),finishedWidth,finishedHeight,stacking:stack,headrailSpliced:false});
   const saved=JSON.parse(JSON.stringify(q));saved.designs[0].options_json={...saved.designs[0].options_json,...d.selection.configuration};
   const reopened=price(saved);expect(reopened.result).toEqual(d.result);expect(reopened.selection.configuration.norman_assembly_v1).toEqual(d.selection.configuration.norman_assembly_v1);count++;
  }
  expect(count).toBe(4788);
 },60000);
 it.each([["Inside Mount",102.3125,false],["Inside Mount",102.25,true],["Outside Mount",102.1875,false],["Outside Mount",102.125,true]] as const)("uses exact splice inequality at100x%s/%s",(mount,height,spliced)=>{
  const q=verticalQuote();q.designs[0].mount_type=mount;q.lines[0].width_whole=100;q.lines[0].height_whole=Math.floor(height);q.lines[0].height_fraction=height%1===.25?"1/4":height%1===.125?"1/8":`${Math.round(height%1*16)}/16`;
  const d=price(q);expect(d.result.ok,JSON.stringify(d.result)).toBe(true);expect(d.selection.configuration.norman_assembly_v1).toMatchObject({headrailSpliced:spliced,headrailSectionWidths:spliced?[50,50]:[100],headrailConnectorCount:spliced?1:0,includedKeystoneCount:spliced?1:0});
 });
});
