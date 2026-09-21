import {customerConfigurationFromSelection,v2CustomerConfigurationOptions} from "@/lib/crm/sales-quote-v2-customer-configuration";
import {describe,it,expect} from "vitest";
import type {SalesQuoteDesign,SalesQuoteLineItem} from "@mts/types/quote";
import {getProductColorOptions} from "@/lib/quote/product-color-options";
import {SMARTFOLD_FABRICS} from "@/lib/quote/norman-current-assortment";
import {repriceExactQuoteBuilderForServerDate} from "./exact-backend";
const KEY="smartfold_clearance_v1";
function quote(code="F1709"){
 const color=getProductColorOptions("smartfold").find(c=>c.colorCode===code)!;
 const line={id:"line",quote_id:"verification",room_name:"Office",product_type:"SmartFold Shades",width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0",quantity:4,sort_order:0,created_at:"2026-09-20T00:00:00Z"} as SalesQuoteLineItem;
 const design={id:"line-B",line_item_id:"line",variant:"B",product_type:"SmartFold Shades",supplier:"Norman",mount_type:"Outside Mount",lift_system:"Motorized",motor_type:"Norman Smart Rechargeable Battery (AC Charger)",remote_type:"Basic Remote",fabric:color.collection,valance:"No Valance",unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:"smartfold",quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fold_size:6,basic_light_guard:"No",premium_hem_bar:"No",smartfold_installation:"Back / Wall Mount with Raceway",smartfold_shim_layers:0,motor_position:"Right",hub_required:false,[KEY]:{version:1,mountingAreaHeight:.75,mountingSpaceHeight:1.5}}} as unknown as SalesQuoteDesign;
 return {lines:[line],designs:[design],selectedVariantByLine:{line:"B"}};
}
function run(q:ReturnType<typeof quote>){const r=repriceExactQuoteBuilderForServerDate(q,"2026-09-20");if(!("backend"in r)||r.backend!=="v2")throw Error("Expected V2");return r;}
describe("SmartFold individual fully recessed Basic Light Guard",()=>{
 const controls=["PrecisionLift Cordless","Continuous Cord Loop","Norman Smart Rechargeable Battery (AC Charger)","AutoWand"];
 function configure(code:string,control:string,top:boolean,height:number){
  const q=quote(code),d=q.designs[0];q.lines[0].height_whole=height;d.mount_type="Inside Mount";d.lift_system=controls.slice(0,2).includes(control)?control:"Motorized";d.motor_type=d.lift_system==="Motorized"?control:null;d.remote_type=control==="Norman Smart Rechargeable Battery (AC Charger)"?"Basic Remote":null;
  const large=d.fabric==="Louise"&&height>72,depth=large?4.53:top?control==="Continuous Cord Loop"?3.87:3.84:control==="Continuous Cord Loop"?3.51:3.52;
  d.options_json={...d.options_json,basic_light_guard:"Yes",smartfold_light_guard_color:"3058 White",smartfold_installation:top?"Top Mount with Raceway":"Back / Wall Mount with Raceway",smartfold_light_guard_recess:"Fully Recessed",smartfold_full_recess_depth_inches:depth,smartfold_wand_length:"36",smartfold_wand_color:"White"};return q;
 }
 it.each(SMARTFOLD_FABRICS.flatMap(f=>controls.flatMap(control=>[true,false].flatMap(top=>[60,84].filter(h=>!(f.collection==="Louise"&&h>72)).map(height=>({code:f.code,control,top,height}))))))("prices $code / $control / top=$top / height=$height and rejects insufficient recess",({code,control,top,height})=>{
  const q=configure(code,control,top,height),r=run(q),d=r.designs[0];expect(r.sendability.sendable,JSON.stringify(d.result)).toBe(true);expect(d.snapshot).not.toBeNull();
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({finishedShadeWidth:35.875,insideLightGuardClearance:{requiredFullAssemblyDepth:q.designs[0].options_json.smartfold_full_recess_depth_inches}});
  expect(run(JSON.parse(JSON.stringify(q)))).toEqual(r);
  const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(d.selection)).join(" ");expect(customer).toContain("Fully Recessed");
  if(d.result.ok)expect(d.result.surchargeLines.filter(line=>line.id==="basic_light_guard")).toEqual([expect.objectContaining({id:"basic_light_guard",amount:45})]);
  q.designs[0].options_json.smartfold_full_recess_depth_inches=Number(q.designs[0].options_json.smartfold_full_recess_depth_inches)-.001;const bad=run(q);expect(bad.sendability.sendable).toBe(false);expect(bad.designs[0].snapshot).toBeNull();expect(bad.designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.inside_light_guard_depth");
 });
 it("requires a complete valid individual assembly and retains unverified combinations",()=>{
  const q=configure("F1709","PrecisionLift Cordless",false,60);
  for(const patch of [{smartfold_light_guard_recess:"Partial Projection"},{smartfold_full_recess_depth_inches:null},{smartfold_full_recess_depth_inches:"3.52"},{smartfold_light_guard_color:"Purple"},{smartfold_common_valance_id:"shared"},{smartfold_side_by_side_id:"group"}]){const bad=JSON.parse(JSON.stringify(q));bad.designs[0].options_json={...bad.designs[0].options_json,...patch};expect(run(bad).sendability.sendable,JSON.stringify(patch)).toBe(false);}
  const tall=configure("F1709","Continuous Cord Loop",false,84);expect(run(tall).sendability.sendable).toBe(false);
  for(const valance of ["Square Fascia","Modern Wood","6 inch Fabric"]){const bad=JSON.parse(JSON.stringify(q));bad.designs[0].valance=valance;expect(run(bad).sendability.sendable).toBe(false);}
  for(const mount of ["Outside Mount","Semi-Inside Mount"]){const bad=JSON.parse(JSON.stringify(q));bad.designs[0].mount_type=mount;expect(run(bad).sendability.sendable).toBe(false);}
 });
});
