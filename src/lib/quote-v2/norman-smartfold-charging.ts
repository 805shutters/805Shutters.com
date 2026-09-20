import { SMARTFOLD_CHARGING_KEY, emptySmartfoldCharging, parseSmartfoldCharging } from "@/lib/quote/norman-smartfold-charging";
import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import type { CanonicalMotorizationSelection } from "./roller-motor-contract";
import { sourceProvenance } from "./source-manifest";
const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function smartfoldCharging(context:SelectionContext) {
  if(context.productId!=="smartfold" || context.catalogAsOf<"2026-09-20" || context.catalogVersion.endsWith("-norman-smartfold-hardware-2026-09-19-r6"))return null;
  const c=context.configuration,power=norm(c.motor_type),lift=norm(c.lift_system??c.control_type);
  const motorized=/motor|autowand/.test(lift);
  const wand=motorized&&(power==="autowand"||lift==="autowand");
  const smart=motorized&&power.startsWith("norman smart");
  const battery=smart&&power.includes("rechargeable battery"),ac=smart&&power.includes("ac adapter");
  const page=wand?94:57;
  const issues:ValidationIssue[]=[];
  const add=(id:string,explanation:string)=>issues.push({severity:"hard_block",ruleId:`smartfold.charging.${id}`,source:sourceProvenance("norman-motorization-guide-2026-09-16",{page}),selectedValues:{...c},explanation});
  const raw=c[SMARTFOLD_CHARGING_KEY],parsed=raw==null?emptySmartfoldCharging():parseSmartfoldCharging(raw);
  if(!parsed)add("record","Save whole, nonnegative SmartFold accessory counts and a documented cable color.");
  const r=parsed??emptySmartfoldCharging();
  if(r.extraChargingKits>context.quantity)add("kit_limit","Extra charging kits cannot exceed the number of shades on this line.");
  if(r.extraChargingKits&&!(wand||battery))add("kit_power","Extra charging kits require SmartFold AutoWand or Norman Smart rechargeable battery motors.");
  if(r.extensionCables&&!(wand||battery||ac))add("cable_power","Extension cables require SmartFold AutoWand or Norman Smart rechargeable/AC motors.");
  if(wand&&r.extensionCables>context.quantity)add("cable_limit","Supply at most one extension cable per SmartFold AutoWand.");
  if(wand&&r.extensionCables&&!r.extensionColor)add("cable_color","Choose White or Black for the 118-inch AutoWand extension cable.");
  const order=c.norman_order_record_v1 as SelectionRecord|undefined;
  const watts=battery?36:order&&[36,65].includes(Number(order.adapterWatts))?Number(order.adapterWatts):null;
  const selections:CanonicalMotorizationSelection[]=[];
  if(!issues.length)for(const [optionId,units] of [["charging_kit",r.extraChargingKits],["extension_cable",r.extensionCables]] as const)if(units)selections.push({groupId:wand?"autowand":"smart_motorization",optionId,role:"accessory",units,billingScope:"once_per_line"});
  return {issues,selections,includedFamily:wand?"smartfold_autowand":battery?"smartfold_smart_36w":null,record:{version:1,sourceId:"norman-motorization-guide-2026-09-16",sourcePage:page,quantityBasis:"per_line",extraChargingKits:r.extraChargingKits,extension:r.extensionCables?{quantity:r.extensionCables,length:wand?118:78.74,color:wand?r.extensionColor:battery?"Black":watts===36?"White":watts===65?"Black":null,adapterWatts:wand?null:watts,adapterCompatibility:wand?"AutoWand":watts?`${watts}W`:null}:null}};
}
