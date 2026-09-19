import type { SelectionContext, ValidationIssue } from "./core";
import type { CanonicalMotorizationSelection } from "./roller-motor-contract";
import { sourceProvenance } from "./source-manifest";

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const present = (v: unknown) => v != null && v !== "";
export const SMARTDRAPE_CHARGING_WAND_LENGTHS = ["None", "19.25", "39"] as const;

export function smartdrapeMotorAccessories(s: SelectionContext) {
  if (s.productId !== "smartdrape" || s.catalogAsOf < "2026-09-19") return null;
  const c = s.configuration;
  const motorized = /motor/.test(norm(c.control_type ?? c.lift_system));
  const battery = motorized && norm(c.motor_type) === "norman smart rechargeable battery";
  const issues: ValidationIssue[] = [];
  const selections: CanonicalMotorizationSelection[] = [];
  const add = (id: string, page: number, explanation: string) => issues.push({severity:"hard_block",ruleId:`smartdrape.accessory.${id}`,source:sourceProvenance("norman-motorization-guide-2026-09-16",{page}),selectedValues:{...c},explanation});
  const count = (key: string, max = Number.MAX_SAFE_INTEGER, fallback = 0) => {
    const value = present(c[key]) ? Number(c[key]) : fallback;
    if (!Number.isSafeInteger(value) || value < 0 || value > max) {add(key,49,`Enter a whole count between zero and ${max} for this line.`);return 0;}
    return value;
  };
  const component = (optionId: string, units: number) => {if(units)selections.push({groupId:"smart_motorization",optionId,role:"accessory",units,billingScope:"once_per_line"});};
  const kits = count("smartdrape_extra_charging_kits",s.quantity);
  const repeaters = count("smartdrape_repeaters",5);
  const ringSets = count("smartdrape_color_ring_sets");
  const remote = norm(c.remote_type);
  const remoteQuantityExplicit = present(c.smartdrape_remote_quantity);
  const remoteQuantity = count("smartdrape_remote_quantity",Number.MAX_SAFE_INTEGER,remote?s.quantity:0);
  const channel = present(c.smartdrape_remote_channel) ? Number(c.smartdrape_remote_channel) : 1;
  const hubQuantityExplicit = present(c.smartdrape_hub_quantity);
  const hubQuantity = count("smartdrape_hub_quantity",Number.MAX_SAFE_INTEGER,["yes","true"].includes(norm(c.hub_required))?s.quantity:0);
  const network = present(c.smartdrape_motor_network)?Number(c.smartdrape_motor_network):1;
  const wandLength = !present(c.smartdrape_charging_wand_length) || norm(c.smartdrape_charging_wand_length)==="none" ? null : Number(c.smartdrape_charging_wand_length);
  if(kits && !battery)add("charging_kit",46,"Extra charging kits require the SmartDrape rechargeable battery motor.");
  else component("charging_kit",kits);
  if(wandLength != null) {
    if(!battery || ![19.25,39].includes(wandLength))add("charging_wand",47,"Charging extension wands require the rechargeable battery motor and a 19¼-inch or 39-inch length.");
    else component("charging_extension_wand",s.quantity);
  }
  if(present(c.smartdrape_charging_wand_color) && norm(c.smartdrape_charging_wand_color)!=="default" && wandLength==null)add("wand_color",47,"Select a charging extension wand before overriding its color.");
  if(repeaters && !motorized)add("repeaters",49,"Repeaters require Norman Smart motorization.");
  else component("repeater",repeaters);
  if(ringSets && !(motorized && remote.includes("smartdial")))add("rings",49,"Four-color ring sets require a SmartDial G2 remote.");
  else component("color_rings_for_smartdial_g2_remote",ringSets);
  if(remoteQuantityExplicit && (!motorized || !remote))add("remote_quantity",49,"Select a compatible remote type before setting its quantity.");
  if(present(c.smartdrape_remote_channel) && (!motorized || !remote || !Number.isSafeInteger(channel) || channel<1 || channel>5))add("channel",49,"Assign a remote channel from 1 through 5.");
  if(hubQuantityExplicit && (!motorized || !["yes","true"].includes(norm(c.hub_required))))add("hub_quantity",49,"Select Hub Required before specifying its quantity.");
  if(!Number.isSafeInteger(network)||network<1)add("network",49,"Use a positive whole motor-network number.");
  return {selections,issues,record:{version:1,family:"smart_motorization",network,repeaters,extraChargingKits:kits,quantityBasis:"per_line",sourceId:"norman-motorization-guide-2026-09-16",sourcePages:[46,47,48,49],
    chargingWand:wandLength==null?null:{length:wandLength,quantity:s.quantity,cableColor:"Black",cableHolderColor:"Clear",measurement:"Top of headrail to bottom of wand"},
    controller:{type:c.remote_type??null,quantity:remoteQuantity,quantityExplicit:remoteQuantityExplicit,channel,color:"Black",includedHolder:remote.includes("basic")?"Black":null,defaultRing:remote.includes("smartdial")?"Black":null,extraFourColorRingSets:ringSets,existingRemoteWorkOrder:c.existing_remote_work_order_number??null},
    hub:{quantity:hubQuantity,quantityExplicit:hubQuantityExplicit,color:"Black"},
    repeaterPowerAdapter:repeaters?"Included black adapter":null,
    acAdapter:motorized&&!battery?{color:"White",adapterCord:70.87,plugCord:39.37}:null,
  }};
}
