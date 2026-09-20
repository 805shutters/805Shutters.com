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
 it.each(SMARTFOLD_FABRICS.map(f=>f.code))("prices and snapshots current fabric %s with verified outside clearance",code=>{
  const r=run(quote(code)),d=r.designs[0];expect(d.result.ok,JSON.stringify(d.result)).toBe(true);expect(d.result.productStatus).toBe("documented_limited");expect(d.snapshot).not.toBeNull();if(d.result.ok)expect(d.result.total).toBeGreaterThan(0);expect(r.sendability.sendable,JSON.stringify(r.sendability)).toBe(true);
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
