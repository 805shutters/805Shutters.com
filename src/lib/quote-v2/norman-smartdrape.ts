import { smartdrapeVanePacks } from "./norman-smartdrape-vane-packs";
import { smartdrapeTrack } from "./norman-smartdrape-tracks";
import { smartdrapeHardware } from "./norman-smartdrape-hardware";
import type { SelectionContext, ValidationIssue } from "./core";
import { SMARTDRAPE_COORDINATION, SMARTDRAPE_HARDWARE } from "./generated/norman-smartdrape-coordination.generated";
import { sourceProvenance } from "./source-manifest";

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const explicit = (v: unknown) => v != null && v !== "" && norm(v) !== "default";
export const SMARTDRAPE_HEADRAIL_COLORS = Object.keys(SMARTDRAPE_HARDWARE);
export const SMARTDRAPE_CHARGING_WAND_COLORS = [...new Set(SMARTDRAPE_COORDINATION.map(r=>r.chargingWand))];
export function smartdrapeFabric(code: unknown) {
  return SMARTDRAPE_COORDINATION.find(r=>r.customerColorCode===String(code??"").toUpperCase());
}
export function smartdrapeSecondColors(code: unknown) {
  const first=smartdrapeFabric(code);
  return SMARTDRAPE_COORDINATION.filter(r=>r.category===first?.category).map(r=>r.customerColorCode);
}
export function smartdrapeComponents(s: SelectionContext) {
  if(s.productId!=="smartdrape" || s.catalogAsOf<"2026-09-19")return null;
  const c=s.configuration, first=smartdrapeFabric(c.fabric_color_code);
  const alternating=norm(c.vane_style)==="alternating";
  const second=alternating?smartdrapeFabric(c.smartdrape_second_color):null;
  const motorized=/motor/.test(norm(c.control_type??c.lift_system));
  const headrail=explicit(c.smartdrape_headrail_color)?SMARTDRAPE_HEADRAIL_COLORS.find(v=>norm(v)===norm(c.smartdrape_headrail_color))??null:alternating?null:first?.defaultHeadrail??null;
  const hardware=headrail?SMARTDRAPE_HARDWARE[headrail as keyof typeof SMARTDRAPE_HARDWARE]??null:null;
  const stack=norm(c.stack_option);
  const defaultWandDrop=s.heightInches<36?24:s.heightInches<70?36:s.heightInches<90?40:s.heightInches<105?45:s.heightInches<110?55:s.heightInches<=120?65:78.75;
  const fabricRecord=(row:NonNullable<typeof first>)=>({customerFabricCode:row.customerFabricCode,customerColorCode:row.customerColorCode,colorName:row.colorName,category:row.category,pattern:row.pattern,factoryFabricCode:row.factoryFabricCode,factoryColorCode:row.factoryColorCode,factoryColorName:row.factoryColorName,factoryAliasStatus:row.factoryColorCode?"documented":"blank_in_source",fabricClip:row.fabricClip,sourceSheet:"Fabric Color List-SmartDrape",sourceRange:row.factoryRange});
  return {version:1,type:"smartdrape_components",sourceId:"norman-ps-sd-coordination-2026-08-11",sourceSheet:"SmartDrape",sourceRange:first?.coordinationRange??null,
    mounting:smartdrapeHardware(s)?.record??null,track:smartdrapeTrack(s),extraVanesAndWands:smartdrapeVanePacks(s)?.record??null,
    fabrics:[...(first?[fabricRecord(first)]:[]),...(second?[fabricRecord(second)]:[])],alternating,
    coordination:{headrail,hardware,chargingWandColor:motorized && [19.25,39].includes(Number(c.smartdrape_charging_wand_length))?explicit(c.smartdrape_charging_wand_color)?c.smartdrape_charging_wand_color:first?.chargingWand??null:null},
    wand:motorized?null:{color:explicit(c.smartdrape_wand_color)?c.smartdrape_wand_color:alternating?null:headrail,quantity:stack==="traveling center stack"?2:1,side:stack==="stack left"?"Right":stack==="stack right"?"Left":stack==="traveling center stack"?"Both":c.control_side??null,drop:c.wand_drop_inches??defaultWandDrop,defaultDrop:defaultWandDrop,sourceId:"norman-perfectsheer-smartdrape-guide-2026-09",sourcePage:23},
  };
}
export function validateSmartdrapeComponents(s:SelectionContext):ValidationIssue[] {
  const r=smartdrapeComponents(s);if(!r)return [];
  const c=s.configuration,first=smartdrapeFabric(c.fabric_color_code),second=smartdrapeFabric(c.smartdrape_second_color),issues:ValidationIssue[]=[];
  const add=(id:string,page:number,explanation:string)=>issues.push({severity:"hard_block",ruleId:`norman.smartdrape.${id}`,source:sourceProvenance("norman-perfectsheer-smartdrape-guide-2026-09",{page}),selectedValues:{...c},explanation});
  if(c.fabric_color_code&&!first)add("fabric",25,"Choose a current SmartDrape ordering color.");
  const category=first?.category.replace(":","");
  if(first&&c.shade_type&&norm(c.shade_type)!==norm(category))add("fabric_category",24,"Shade type must match the selected fabric's LF, Room Darkening or LF Essentials category.");
  if(explicit(c.vane_style)&&!["single color","alternating","room darkening"].includes(norm(c.vane_style)))add("vane_style",24,"Choose Single Color or Alternating vanes.");
  if(r.alternating) {
    if(!first||!second||first.category!==second.category)add("alternating_category",24,"Alternating colors require two documented colors within the same LF, Room Darkening or LF Essentials category.");
    if(!explicit(c.smartdrape_headrail_color)||!r.coordination.hardware)add("alternating_hardware",24,"Specify the headrail and hardware color for alternating fabrics; Norman provides no default.");
    if(r.wand&&!explicit(c.smartdrape_wand_color))add("alternating_wand",24,"Specify the wand color for alternating fabrics; Norman provides no default.");
  } else if(explicit(c.smartdrape_second_color))add("second_color",24,"A second fabric color requires Alternating vanes.");
  for(const [key,choices] of [["smartdrape_headrail_color",SMARTDRAPE_HEADRAIL_COLORS],["smartdrape_wand_color",SMARTDRAPE_HEADRAIL_COLORS],["smartdrape_charging_wand_color",SMARTDRAPE_CHARGING_WAND_COLORS]] as const)if(explicit(c[key])&&!choices.some(v=>norm(v)===norm(c[key])))add(key,25,"Choose a color from Norman's current component coordination chart.");
  if(!r.wand && (explicit(c.smartdrape_wand_color)||explicit(c.wand_drop_inches)))add("manual_wand",23,"Tilt/draw wand color and drop apply only to manual SmartDrape operation.");
  if(r.wand && explicit(c.smartdrape_charging_wand_color))add("charging_wand",26,"A charging-extension wand color applies only to motorized SmartDrape.");
  if(r.wand&&(!Number.isFinite(Number(r.wand.drop))||Number(r.wand.drop)<12||Number(r.wand.drop)>90))add("wand_drop",23,"The wand drop must be from 12 through 90 inches, measured from the top of the headrail.");
  if(r.wand&&["Left","Right","Both"].includes(String(r.wand.side))&&explicit(c.control_side)&&norm(c.control_side)!==norm(r.wand.side))add("wand_side",23,"The manual wand is opposite the stack; Traveling Center Stack includes one wand on each side.");
  return issues;
}
