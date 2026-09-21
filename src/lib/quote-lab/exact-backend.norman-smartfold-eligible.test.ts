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
describe("SmartFold narrow price eligibility through CRM",()=>{
 it("retains the measured Light Guard envelope and exact rejection through server save/reopen",()=>{
  const q=quote();q.designs[0].mount_type="Inside Mount";q.designs[0].options_json={...q.designs[0].options_json,basic_light_guard:"Yes",smartfold_light_guard_color:"3058 White",smartfold_light_guard_recess:"Fully Recessed",smartfold_full_recess_depth_inches:3.52};
  const valid=run(q);expect(valid.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({insideLightGuardClearance:{requiredFullAssemblyDepth:3.52,availableFullAssemblyDepth:3.52,recessArrangement:"Fully Recessed"}});
  expect(valid.designs[0].result.validationIssues.some(i=>i.ruleId==="norman.smartfold.inside_light_guard_depth")).toBe(false);expect(valid.sendability.sendable).toBe(false);
  const reopened=run(JSON.parse(JSON.stringify(q)));expect(reopened.designs[0].selection).toEqual(valid.designs[0].selection);
  q.designs[0].options_json.smartfold_full_recess_depth_inches=3.5;const rejected=run(q);expect(rejected.designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.inside_light_guard_depth");expect(rejected.designs[0].snapshot).toBeNull();
 });

 it.each(SMARTFOLD_FABRICS.map(f=>f.code))("prices and snapshots current fabric %s with verified outside clearance",code=>{
  const r=run(quote(code)),d=r.designs[0];expect(d.result.ok,JSON.stringify(d.result)).toBe(true);expect(d.result.productStatus).toBe("documented_limited");expect(d.snapshot).not.toBeNull();if(d.result.ok)expect(d.result.total).toBeGreaterThan(0);expect(r.sendability.sendable,JSON.stringify(r.sendability)).toBe(true);
 });
 it.each(SMARTFOLD_FABRICS.flatMap(f=>["Continuous Cord Loop","PrecisionLift Cordless"].map(lift=>[f.code,lift])))("prices manual fabric %s / %s through current saved server records",(code,lift)=>{
  const q=quote(code);q.designs[0].lift_system=lift;q.designs[0].motor_type=null;q.designs[0].remote_type=null;
  const r=run(q),d=r.designs[0];expect(d.result.ok,JSON.stringify(d.result)).toBe(true);expect(d.snapshot).not.toBeNull();expect(r.sendability.sendable).toBe(true);
  if(d.result.ok){expect(d.result.base).toBe(606);expect(d.result.surchargeLines).toEqual([]);}
  expect(run(JSON.parse(JSON.stringify(q)))).toEqual(r);
 });
 it("retains manual size and fold boundaries and rejects stale motor settings",()=>{
  const q=quote();q.designs[0].lift_system="PrecisionLift Cordless";q.designs[0].motor_type=null;q.designs[0].remote_type=null;q.lines[0].height_whole=72;
  expect(run(q).sendability.sendable).toBe(true);q.lines[0].height_fraction="1/16";expect(run(q).designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.louise_cordless_height");
  q.lines[0].height_whole=60;q.lines[0].height_fraction="0";q.lines[0].width_whole=19;expect(run(q).designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.cordless_narrow");
  q.lines[0].width_whole=36;q.designs[0].motor_type="AutoWand";expect(run(q).sendability.sendable).toBe(false);
  q.designs[0].motor_type=null;q.designs[0].lift_system="Continuous Cord Loop";q.lines[0].width_whole=8;q.lines[0].height_whole=12;expect(run(q).sendability.sendable).toBe(true);
  q.lines[0].width_whole=7;q.lines[0].width_fraction="15/16";expect(run(q).sendability.sendable).toBe(false);
  q.lines[0].width_whole=36;q.lines[0].width_fraction="0";q.designs[0].options_json={...q.designs[0].options_json,fold_size:8,full_fold_required:true};expect(run(q).designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.full_fold_height");
 });
 it.each([["30-inch Fiberglass Pole",28],["58-inch Fiberglass Pole",28],["36-inch Cordless Operating Pole",89],["60-inch Cordless Operating Pole",89],["Pole Attachment Only",40]] as const)("prices %s once per cordless shade and preserves one complimentary pole per order",(pole,price)=>{
  const q=quote();q.designs[0].lift_system="PrecisionLift Cordless";q.designs[0].motor_type=null;q.designs[0].remote_type=null;const baseline=run(q);
  q.designs[0].options_json={...q.designs[0].options_json,smartfold_pole:pole};const r=run(q);expect(r.sendability.sendable,JSON.stringify(r)).toBe(true);expect(r.total-baseline.total).toBe(price*4);expect(run(JSON.parse(JSON.stringify(q)))).toEqual(r);
  expect(r.designs[0].selection.configuration.norman_order_record_v1).toMatchObject({orderQuantity:1,retailCharge:0});
  q.designs[0].lift_system="Continuous Cord Loop";expect(run(q).designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.pole_control");
 });
 it("prices premium hem and magnetic catches per shade only with source finish and clearance",()=>{
  const q=quote(),baseline=run(q);q.designs[0].options_json={...q.designs[0].options_json,premium_hem_bar:"Yes",smartfold_hem_color:"Bronze",smartfold_hold_down:"Magnetic",smartfold_magnet_color:"Nickel-Plated",magnet_left_clearance_inches:.5625,magnet_right_clearance_inches:.5625,magnet_bottom_clearance_inches:.6875};
  const r=run(q);expect(r.sendability.sendable,JSON.stringify(r)).toBe(true);expect(r.total-baseline.total).toBe((16+28)*4);expect(run(JSON.parse(JSON.stringify(q)))).toEqual(r);
  q.designs[0].options_json.magnet_left_clearance_inches=.5;expect(run(q).sendability.sendable).toBe(false);q.designs[0].options_json.magnet_left_clearance_inches=.5625;q.designs[0].options_json.smartfold_hem_color="White";expect(run(q).sendability.sendable).toBe(false);
 });
 it.each(SMARTFOLD_FABRICS.flatMap(f=>[
  ["Curved Fascia",133,{smartfold_fascia_style:"Plain",smartfold_fascia_color:"Anodized Silver"}],
  ["Curved Fascia",133,{smartfold_fascia_style:"Fabric-Wrapped",smartfold_valance_fabric_code:"F1934"}],
  ["Square Fascia",133,{}],["Modern Wood",133,{smartfold_wood_valance_color:"001 Pure White"}],
  ["4.5-inch Fabric",155,{}],["6-inch Fabric",155,{}],["8-inch Fabric",216,{}],
 ].flatMap(([valance,price,options])=>["PrecisionLift Cordless","Continuous Cord Loop","Motorized"].map(lift=>({code:f.code,valance:valance as string,price:price as number,options:options as Record<string,unknown>,lift})))))("prices source standard valance $valance for $code / $lift with exact grid and saved records",({code,valance,price,options,lift})=>{
  const q=quote(code);q.designs[0].lift_system=lift;if(lift!=="Motorized"){q.designs[0].motor_type=null;q.designs[0].remote_type=null;}const base=run(q);
  q.designs[0].valance=valance;q.designs[0].options_json={...q.designs[0].options_json,...options};
  const r=run(q);expect(r.sendability.sendable,JSON.stringify(r.designs[0].result)).toBe(true);expect(r.total-base.total).toBe(price*4);
  expect(r.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({valance:{finishedWidth:36,widthBasis:"default",jointCount:0,returnQuantity:0}});
  expect(run(JSON.parse(JSON.stringify(q)))).toEqual(r);
 });
 it("holds custom/spliced/returned valances while enforcing tall Louise clearance for standard fabric valances",()=>{
  const q=quote();q.designs[0].valance="6-inch Fabric";q.lines[0].width_whole=95;
  const wide=run(q);expect(wide.designs[0].result.productStatus).toBe("documented_limited");expect(wide.designs[0].result.validationIssues.map(i=>i.ruleId)).toEqual(["norman.processing_fee.oversize_scope_unverified"]);q.lines[0].width_fraction="1/16";expect(run(q).designs[0].result.productStatus).toBe("restriction_source_incomplete");
  q.lines[0].width_whole=36;q.lines[0].width_fraction="0";q.lines[0].height_whole=73;
  expect(run(q).designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.outside_mounting_area");
  q.designs[0].options_json[KEY]={version:1,mountingAreaHeight:1.15,mountingSpaceHeight:2};expect(run(q).sendability.sendable).toBe(true);
  q.designs[0].valance="Square Fascia";expect(run(q).designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.louise_valance");
  q.designs[0].valance="6-inch Fabric";for(const options of [{smartfold_valance_width:36},{smartfold_valance_returns:"Both"},{smartfold_valance_joinery:"Square Keystone"}]){const copy=JSON.parse(JSON.stringify(q));copy.designs[0].options_json={...copy.designs[0].options_json,...options};expect(run(copy).sendability.sendable).toBe(false);}
 });
 it("prices the exact B0342 charging extras once, retains allocation/clearance and reopens unchanged",()=>{
  const q=quote(),base=run(q);q.designs[0].options_json={...q.designs[0].options_json,smartfold_charging_v1:{version:1,extraChargingKits:2,extensionCables:3,extensionColor:"Black"}};
  const r=run(q);expect(r.total-base.total).toBe(215);expect(r.sendability.sendable).toBe(true);expect(r.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({outsideClearance:{mountingAreaHeight:.75,mountingSpaceHeight:1.5},includedChargingKits:{motorQuantity:4,orderQuantity:2},motorAccessories:{extraChargingKits:2,extension:{quantity:3,length:78.74,color:"Black",adapterWatts:36}}});
  const reopened=run(JSON.parse(JSON.stringify(q)));expect(reopened.total).toBe(r.total);expect(reopened.designs[0].selection).toEqual(r.designs[0].selection);
 });
 it("keeps missing/insufficient clearance, excessive dimensions and incompatible power from customer output",()=>{
  const missing=quote();delete missing.designs[0].options_json![KEY];let r=run(missing);expect(r.sendability.sendable).toBe(false);expect(r.designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.outside_clearance_required");expect(r.designs[0].snapshot).toBeNull();
  for (const [area,space,rule] of [[.749,1.5,"norman.smartfold.outside_mounting_area"],[.75,1.499,"norman.smartfold.outside_mounting_space"]] as const) {
   const insufficient=quote();insufficient.designs[0].options_json={...insufficient.designs[0].options_json,[KEY]:{version:1,mountingAreaHeight:area,mountingSpaceHeight:space}};r=run(insufficient);expect(r.sendability.sendable).toBe(false);expect(r.designs[0].result.validationIssues.map(i=>i.ruleId)).toContain(rule);expect(r.designs[0].snapshot).toBeNull();
  }
  const wrongPower=quote();wrongPower.designs[0].motor_type="AutoWand";r=run(wrongPower);expect(r.sendability.sendable).toBe(false);expect(r.designs[0].result.productStatus).toBe("restriction_source_incomplete");
  const narrow=quote();narrow.lines[0].width_whole=23;r=run(narrow);expect(r.sendability.sendable).toBe(false);expect(r.designs[0].result.validationIssues.some(i=>i.ruleId.startsWith("smartfold.motorization.dimension"))).toBe(true);
  const tall=quote();tall.lines[0].height_whole=73;r=run(tall);expect(r.sendability.sendable).toBe(false);expect(r.designs[0].result.validationIssues.map(i=>i.ruleId)).toContain("norman.smartfold.louise_valance");
  const other=quote();other.designs[0].mount_type="Inside Mount";other.designs[0].options_json={...other.designs[0].options_json,smartfold_installation:"Top Mount with Raceway"};r=run(other);expect(r.sendability.sendable).toBe(false);expect(r.designs[0].result.productStatus).toBe("restriction_source_incomplete");
 });
});
