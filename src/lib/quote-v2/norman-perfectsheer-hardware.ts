import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

export const PERFECTSHEER_LIGHT_GUARDS = ["None", "Basic Light Guard", "Premium Wood Light Guard"] as const;
export const PERFECTSHEER_BASIC_GUARD_COLORS = ["3058 White", "3012 Bianca", "3094 Cottage White", "3578 Sahara", "3463 Chocolate", "3129 Silver", "3212 Black Ink"] as const;
export const PERFECTSHEER_WOOD_GUARD_COLORS = ["049 Stone Gray", "053 Clay", "110 Limed White", "212 Dark Teak", "109 Weathered Teak", "237 Wenge", "221 Black Walnut"] as const;
export const PERFECTSHEER_MAGNET_COLORS = ["Nickel-Plated", "Pure White", "Silk White", "Bisque", "Pearl", "Bright Brass", "Antique Brass", "Black", "Crisp Linen", "String", "Sea Mist", "Stone Gray", "Brown Gray", "Taupe Gray"] as const;
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const yes = (v: unknown) => ["yes","true","on"].includes(norm(v));
export function perfectsheerHardware(context: SelectionContext) {
  if(context.productId !== "perfectsheer" || context.catalogAsOf < "2026-09-19")return null;
  const c=context.configuration;
  const inside=["inside mount","inside","im","ib","semi inside mount","semi inside"].includes(norm(c.mount_type));
  const width=context.widthInches-(inside?.125:0);
  const bracketCount=width<=40?2:width<=80?3:4;
  const layers=c.perfectsheer_shim_layers == null || c.perfectsheer_shim_layers === "" ? 0 : Number(c.perfectsheer_shim_layers);
  const validLayers=Number.isInteger(layers)&&layers>=0&&layers<=3;
  const guard=norm(c.perfectsheer_light_guard ?? "None");
  const activeGuard=guard!=="none";
  const magnetic=yes(c.perfectsheer_magnetic_hold_down);
  return {
    validLayers,
    record:{
      version:1,sourceId:"norman-perfectsheer-smartdrape-guide-2026-09",sourcePages:[44,45],quantityBasis:"per_shade",
      mountingBracketCount:bracketCount,shimLayers:validLayers?layers:null,shimQuantity:validLayers?bracketCount*layers:null,shimDimensions:[1.625,.375],
      magneticHoldDown:magnetic?{bracketCount:2,catchColor:c.perfectsheer_magnet_color||"Nickel-Plated",extraSideClearance:.5625,extraBottomClearance:.6875,magnetFactoryInstalled:true}:null,
      lightGuard:activeGuard?{type:guard,color:c.perfectsheer_light_guard_color??null,sideBlockCount:2,topBlockCount:1,topBlockSize:4.5,topBlockColor:"White",spliceRules:[{lengthAbove:96,lengthThrough:102,measuredFrom:"top",distance:6},{lengthAbove:102,lengthThrough:null,measuredFrom:"bottom",distance:96}]}:null,
    },
    surchargeDetails:{shim_quantity:validLayers?bracketCount*layers:0,shim:validLayers&&layers>0,magnetic_hold_down:magnetic,light_guard:guard==="basic light guard"?"basic_light_guard":guard==="premium wood light guard"?"premium_wood_light_guard":"none"},
  };
}
export function validatePerfectsheerHardware(context: SelectionContext): ValidationIssue[] {
  const hardware=perfectsheerHardware(context);if(!hardware)return [];
  const c=context.configuration;const issues:ValidationIssue[]=[];
  const add=(id:string,page:number,explanation:string)=>issues.push({severity:"hard_block",ruleId:`norman.perfectsheer.${id}`,source:sourceProvenance("norman-perfectsheer-smartdrape-guide-2026-09",{page}),selectedValues:{...c},explanation});
  if(c.perfectsheer_magnetic_hold_down != null && !["yes","no","true","false"].includes(norm(c.perfectsheer_magnetic_hold_down)))add("magnetic_hold_down",45,"Choose Yes or No for magnetic hold-downs.");
  if(!hardware.validLayers)add("shim_layers",45,"Select zero through three shim layers. The piece count follows the finished shade width.");
  if(c.perfectsheer_light_guard && !PERFECTSHEER_LIGHT_GUARDS.some(v=>norm(v)===norm(c.perfectsheer_light_guard)))add("light_guard",44,"Select no Light Guard, Basic Light Guard or Premium Wood Light Guard.");
  if(hardware.record.lightGuard) {
    const colors=hardware.record.lightGuard.type==="basic light guard"?PERFECTSHEER_BASIC_GUARD_COLORS:PERFECTSHEER_WOOD_GUARD_COLORS;
    if(!colors.some(v=>norm(v)===norm(c.perfectsheer_light_guard_color)))add("light_guard_color",44,"Select a current finish for the chosen Light Guard material.");
  }
  if(hardware.record.magneticHoldDown && !PERFECTSHEER_MAGNET_COLORS.some(v=>norm(v)===norm(hardware.record.magneticHoldDown?.catchColor)))add("magnet_color",45,"Select a documented magnetic catch finish; Nickel-Plated is the default.");
  if(yes(c.magnetic_hold_down) && !hardware.surchargeDetails.magnetic_hold_down)add("legacy_magnet",45,"Reconfirm the magnetic hold-down selection before repricing.");
  if ((yes(c.shim) || Number(c.shims)>0 || Number(c.shim_quantity)>0) && c.perfectsheer_shim_layers == null) add("legacy_shim",45,"Reconfirm the number of shim layers before repricing.");
  const legacy=norm(c.light_guard);
  if((yes(c.basic_light_guard)||legacy==="basic light guard") && hardware.surchargeDetails.light_guard!=="basic_light_guard" || (yes(c.premium_wood_light_guard)||legacy==="premium wood light guard") && hardware.surchargeDetails.light_guard!=="premium_wood_light_guard")add("legacy_light_guard",44,"Reconfirm the Light Guard type and finish before repricing.");
  return issues;
}
