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
describe("SmartFold fully recessed 4.5-inch fascia source branches",()=>{
 const controls=["PrecisionLift Cordless","Continuous Cord Loop","Norman Smart Rechargeable Battery (AC Charger)","AutoWand"];
 function configure(code:string,control:string,top:boolean,valance:string,style:string){
  const q=quote(code),d=q.designs[0];d.mount_type="Inside Mount";d.valance=valance;d.lift_system=controls.slice(0,2).includes(control)?control:"Motorized";d.motor_type=d.lift_system==="Motorized"?control:null;d.remote_type=control==="Norman Smart Rechargeable Battery (AC Charger)"?"Basic Remote":null;
  const depth=top?control==="Continuous Cord Loop"?4.2:4.19:4.087;
  d.options_json={...d.options_json,smartfold_installation:top?"Top Mount with Raceway":"Back / Wall Mount with Raceway",smartfold_fascia_style:style,smartfold_fascia_color:"Anodized Silver",smartfold_valance_fabric_code:"F1934",smartfold_fascia_recess:"Fully Recessed",smartfold_fascia_recess_depth_inches:depth,smartfold_wand_length:"36",smartfold_wand_color:"White"};return q;
 }
 it.each(SMARTFOLD_FABRICS.flatMap(f=>controls.flatMap(control=>[true,false].flatMap(top=>[["Square Fascia","Plain"],["Curved Fascia","Plain"],["Curved Fascia","Fabric-Wrapped"]].map(([valance,style])=>({code:f.code,control,top,valance,style}))))))("prices $code / $control / top=$top / $valance / $style with exact depth",({code,control,top,valance,style})=>{
  const q=configure(code,control,top,valance,style),r=run(q),d=r.designs[0];expect(r.sendability.sendable,JSON.stringify(d.result)).toBe(true);expect(d.snapshot).not.toBeNull();
  expect(d.selection.configuration.norman_assembly_v1).toMatchObject({finishedShadeWidth:35.875,insideFasciaClearance:{requiredFullAssemblyDepth:q.designs[0].options_json.smartfold_fascia_recess_depth_inches},valance:{finishedWidth:35.875,jointCount:0}});
  const customer=v2CustomerConfigurationOptions(customerConfigurationFromSelection(d.selection)).join(" ");expect(customer).toContain("Fascia Recess Arrangement: Fully Recessed");expect(run(JSON.parse(JSON.stringify(q)))).toEqual(r);
  q.designs[0].options_json.smartfold_fascia_recess_depth_inches=Number(q.designs[0].options_json.smartfold_fascia_recess_depth_inches)-.001;const rejected=run(q);expect(rejected.sendability.sendable).toBe(false);expect(rejected.designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.inside_fascia_depth");expect(rejected.designs[0].snapshot).toBeNull();
 });
 it("holds partial projection, missing/malformed depths and other inside arrangements",()=>{
  const q=configure("F1709","AutoWand",true,"Square Fascia","Plain");
  for(const patch of [{smartfold_fascia_recess:"Partial Projection"},{smartfold_fascia_recess_depth_inches:null},{smartfold_fascia_recess_depth_inches:"4.2"},{smartfold_common_valance_id:"1"},{basic_light_guard:"Yes",smartfold_light_guard_color:"3058 White"},{smartfold_valance_width:36}]){const bad=JSON.parse(JSON.stringify(q));bad.designs[0].options_json={...bad.designs[0].options_json,...patch};expect(run(bad).sendability.sendable).toBe(false);}
  q.designs[0].mount_type="Semi-Inside Mount";expect(run(q).sendability.sendable).toBe(false);
 });
});
