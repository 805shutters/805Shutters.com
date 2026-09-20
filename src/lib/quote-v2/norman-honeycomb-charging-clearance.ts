import type { SelectionContext, ValidationIssue } from "./core";
import { normalizeIdentity } from "./catalog";
import { sourceProvenance } from "./source-manifest";

/** Motorization Guide p10: charging-port recess is distinct from bracket mounting depth. */
export function honeycombChargingClearance(s: SelectionContext) {
  if (s.productId !== "honeycomb" || !/norman-honeycomb-mounting-2026-09-20-r2$/.test(s.catalogVersion)) return null;
  const c=s.configuration;
  if (!/motor/i.test(String(c.lift_system)) || !normalizeIdentity(c.motor_type).includes("charging wand")) return null;
  const number=(v:unknown)=>v!==""&&v!=null&&Number.isFinite(Number(v))?Number(v):null;
  const recess=number(c.honeycomb_charging_port_recess_inches), openingHeight=number(c.honeycomb_charging_opening_height_inches);
  const obstruction=String(c.honeycomb_charging_obstruction??"");
  const issues:ValidationIssue[]=[];
  const add=(id:string,explanation:string,severity:ValidationIssue["severity"]="hard_block")=>issues.push({severity,ruleId:`honeycomb.charging_clearance.${id}`,source:sourceProvenance("norman-motorization-guide-2026-09-16",{page:10}),selectedValues:{...c},explanation});
  if(recess==null||recess<0)add("recess","Enter how far the charging port sits behind the opening face; use zero when it is not recessed.");
  if(openingHeight==null||openingHeight<=0)add("opening_height","Enter the clear opening height available to insert and hold the charging wand.");
  if(!["Yes","No"].includes(obstruction))add("obstruction","Confirm whether a sill or other obstruction limits charging-wand access.");
  if(recess!=null&&recess>=.75&&openingHeight!=null&&openingHeight<36)add("ac_required","The guide directs an AC adapter when the shade is recessed at least ¾ inch into an opening under 36 inches high. Select AC power or revise the actual mounting arrangement.");
  if(obstruction==="Yes"||openingHeight!=null&&openingHeight<37.75)add("printed_height_conflict","The charging-wand table calls its values minimum heights but prints ≤ restrictions. Confirm access against the actual obstruction and factory guidance; these ambiguous inequalities are not applied as an invented limit.","warning");
  return {issues,record:{version:1,sourceId:"norman-motorization-guide-2026-09-16",sourcePage:10,chargingPortRecessInches:recess,clearOpeningHeightInches:openingHeight,obstruction:obstruction||null,wandLengthInches:35.5,extensionPoleAddedClearanceInches:Number(c.honeycomb_charging_extension_poles??0)>0?33.75:0,printedHeightInequalityUnresolved:true}};
}
