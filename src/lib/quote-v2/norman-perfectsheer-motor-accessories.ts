import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import type { CanonicalMotorizationSelection } from "./roller-motor-contract";
import { sourceProvenance } from "./source-manifest";

export const PERFECTSHEER_WAND_LENGTHS = ["8", "16", "24", "36", "48", "60", "72"] as const;
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const yes = (v: unknown) => ["yes", "true"].includes(norm(v));

/** Accessory counts are for the whole line; base motors still multiply by shade quantity. */
export function perfectsheerMotorAccessories(context: SelectionContext) {
  if (context.productId !== "perfectsheer" || context.catalogAsOf < "2026-09-19") return null;
  const c = context.configuration;
  const power = norm(c.motor_type);
  const motorized = /motor|autowand/.test(norm(c.lift_system));
  const wand = motorized && power === "autowand";
  const automate = motorized && power.includes("automate");
  const smart = motorized && power.startsWith("norman smart");
  const dc = /low voltage|12v/.test(power);
  const battery = /rechargeable|arc/.test(power);
  const rawOrder=c.norman_order_record_v1;
  const order=rawOrder && typeof rawOrder === "object" && !Array.isArray(rawOrder) ? rawOrder as SelectionRecord : null;
  const adapterWatts=order && typeof order === "object" && !Array.isArray(order) && [36,65].includes(Number(order.adapterWatts)) ? Number(order.adapterWatts) : null;
  const group = wand ? "autowand" : automate ? "automate_home" : "smart_motorization";
  const issues: ValidationIssue[] = [];
  const selections: CanonicalMotorizationSelection[] = [];
  const add = (id: string, page: number, explanation: string) => issues.push({severity:"hard_block", ruleId:`perfectsheer.accessory.${id}`, source:sourceProvenance("norman-motorization-guide-2026-09-16",{page}), selectedValues:{...c}, explanation});
  const count = (key: string, max: number, page: number) => {
    const v = c[key] == null || c[key] === "" ? 0 : Number(c[key]);
    if (!Number.isSafeInteger(v) || v < 0 || v > max) {add(key,page,`Enter a whole accessory count between zero and ${max} for this line.`);return 0;}
    return v;
  };
  const component = (optionId: string, units: number) => {if(units)selections.push({groupId:group,optionId,role:"accessory",units,billingScope:"once_per_line"});};
  if(wand && context.heightInches > (context.widthInches-(["inside mount","inside","im","semi inside mount","semi inside"].includes(norm(c.mount_type))?.125:0))*4)add("wand_ratio",90,"AutoWand shade height cannot exceed four times its finished shade width.");
  const kits=count("perfectsheer_extra_charging_kits",context.quantity,wand?91:42);
  const cables=count("perfectsheer_extension_cables",wand?context.quantity:Number.MAX_SAFE_INTEGER,wand?91:42);
  const harnesses=count("perfectsheer_extra_harnesses",Number.MAX_SAFE_INTEGER,automate?75:41);
  const repeaters=count("perfectsheer_repeaters",automate?2:5,automate?76:43);
  if(kits && !(wand || smart && battery))add("charging_kit",wand?91:42,"Additional charging kits are supported for AutoWand and Norman Smart rechargeable motors. The current Automate charging-kit price identity still requires reconciliation.");
  else component("charging_kit",kits);
  if(cables && !(wand || smart && (battery || power.includes("ac adapter"))))add("extension",wand?91:42,"This extension cable is available only for AutoWand or the selected Norman Smart AC/battery power source.");
  else component("extension_cable",cables);
  if(harnesses && !(dc && (smart || automate)))add("harness",automate?75:41,"Extra connection harnesses require a compatible DC low-voltage motor.");
  else component("dc_connection_harness",harnesses);
  if(repeaters && !(smart || automate))add("repeater",43,"Repeaters require Norman Smart or Automate Home motorization.");
  else component("repeater",repeaters);
  const solar=yes(c.perfectsheer_solar_panel);
  if(solar && !(automate && battery))add("solar",74,"Solar panels require Automate ARC with its standard rechargeable battery.");
  else if(solar)component("solar_panel",context.quantity);
  if(wand && c.perfectsheer_wand_length != null && !PERFECTSHEER_WAND_LENGTHS.includes(String(c.perfectsheer_wand_length) as typeof PERFECTSHEER_WAND_LENGTHS[number]))add("wand_length",91,"Select a documented 8, 16, 24, 36, 48, 60 or 72-inch AutoWand.");
  if(!wand && (c.perfectsheer_wand_length != null || yes(c.perfectsheer_installed_on_door)))add("wand_only",90,"Wand length and the AutoWand door configuration require AutoWand.");
  if(wand && cables && !["white","black"].includes(norm(c.perfectsheer_extension_color)))add("extension_color",91,"Choose White or Black for the 118-inch AutoWand extension cable.");
  for(const key of ["perfectsheer_solar_panel","perfectsheer_installed_on_door"])if(c[key]!=null && !["yes","no","true","false"].includes(norm(c[key])))add(key,wand?90:74,"Choose Yes or No for this option.");
  const network = c.perfectsheer_motor_network == null || c.perfectsheer_motor_network === "" ? 1 : Number(c.perfectsheer_motor_network);
  if (!Number.isSafeInteger(network) || network < 1) add("network",automate?76:43,"Use a positive whole motor-network number.");
  return {selections,issues,record:{
    family:group,network:Number.isSafeInteger(network)&&network>0?network:null,
    version:1,sourceId:"norman-motorization-guide-2026-09-16",sourcePages:wand?[90,91]:automate?[74,75,76]:[40,41,42,43],
    extraChargingKits:kits,extraHarnesses:harnesses,includedHarnesses:dc?context.quantity:0,repeaters,solarPanels:solar?context.quantity:0,
    repeaterPowerAdapter:repeaters?automate?"Required; not included":"Included black adapter":null,
    extension:cables?{quantity:cables,length:wand?118:78.74,color:wand?c.perfectsheer_extension_color??null:battery?"Black":adapterWatts===36?"White":adapterWatts===65?"Black":null,adapterWatts:wand?null:battery?36:adapterWatts,adapterCompatibility:wand?"AutoWand":battery?"36W":adapterWatts?`${adapterWatts}W`:null}:null,
    wand:wand?{length:c.perfectsheer_wand_length??null,color:c.perfectsheer_wand_color??null,ringIncluded:true,hookIncluded:true,installedOnDoor:yes(c.perfectsheer_installed_on_door),additionalDoorFabricDeductionEachSide:yes(c.perfectsheer_installed_on_door)?.0625:0}:null,
    quantityBasis:"per_line",
  }};
}
