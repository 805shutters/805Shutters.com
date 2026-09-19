import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import type { CanonicalMotorizationSelection } from "./roller-motor-contract";
import { sourceProvenance } from "./source-manifest";
import { normalizeIdentity as norm } from "./catalog";

export const HONEYCOMB_WAND_LENGTHS = ["8", "16", "24", "36", "48", "60", "72"] as const;
export const HONEYCOMB_MOTOR_ACCESSORY_KEYS = ["honeycomb_extra_charging_kits", "honeycomb_extension_cables", "honeycomb_extension_color", "honeycomb_charging_extension_poles", "honeycomb_extra_harnesses", "honeycomb_repeaters", "honeycomb_color_ring_sets", "honeycomb_remote_quantity", "honeycomb_remote_channel", "honeycomb_solar_panel", "honeycomb_wand_length", "honeycomb_wand_color", "honeycomb_motor_network", "honeycomb_power_cable_exit"] as const;
const yes = (v: unknown) => ["yes", "true"].includes(norm(v));

/** Counts are per quote line, while motor and solar-panel quantities follow ordered shades. */
export function honeycombMotorAccessories(s: SelectionContext) {
  if (s.productId !== "honeycomb" || s.catalogAsOf < "2026-09-19") return null;
  const c=s.configuration, power=norm(c.motor_type), lift=norm(c.lift_system);
  const motorized=/motor|autowand/.test(lift), wand=motorized&&power==="autowand";
  const automate=motorized&&power.includes("automate");
  const smart=motorized&&!automate&&(power.startsWith("norman smart")||/charging wand|ac adapter|dc low voltage/.test(power));
  const chargingWand=smart&&power.includes("charging wand"), dc=smart&&power.includes("low voltage");
  const battery=automate&&/battery|rechargeable/.test(power);
  const family=wand?"autowand":automate?"automate_home":"smart_motorization";
  const issues: ValidationIssue[]=[], selections: CanonicalMotorizationSelection[]=[];
  const add=(id:string,page:number,explanation:string)=>issues.push({severity:"hard_block",ruleId:`honeycomb.accessory.${id}`,source:sourceProvenance("norman-motorization-guide-2026-09-16",{page}),selectedValues:{...c},explanation});
  if(wand && /breeze/.test(norm(c.fabric_class ?? c.fabric_collection ?? c.fabric_family)))add("autowand_breeze",80,"AutoWand woven Honeycomb is available in Windsong and Ashton; Breeze is not listed for this system.");
  const present=(key:string)=>c[key]!=null&&c[key]!=="";
  const count=(key:string,max=Number.MAX_SAFE_INTEGER,fallback=0)=>{
    const n=present(key)?Number(c[key]):fallback;
    if(!Number.isSafeInteger(n)||n<0||n>max){add(key,wand?81:15,`Enter a whole accessory count between zero and ${max}.`);return 0;}return n;
  };
  const component=(optionId:string,units:number)=>{if(units)selections.push({groupId:family,optionId,role:"accessory",units,billingScope:"once_per_line"});};
  const kits=count("honeycomb_extra_charging_kits",s.quantity), extensions=count("honeycomb_extension_cables",s.quantity);
  const extensionPoles=count("honeycomb_charging_extension_poles",s.quantity), harnesses=count("honeycomb_extra_harnesses");
  const repeaters=count("honeycomb_repeaters",automate?2:5), ringSets=count("honeycomb_color_ring_sets");
  if(kits&&!wand)add("charging_kit",automate?67:12,"Extra AutoWand charging kits are priced here. Other Honeycomb charger identities require dealer confirmation; the Automate guide specifies 5V/2A while the retail kit names 5V/1A.");else component("charging_kit",kits);
  if(extensions&&!wand)add("extension_cable",13,"Honeycomb Norman Smart extensions are parts-order-only, work with 36W only, and have no shade-order retail price. Do not substitute another product's extension cable.");else component("extension_cable",extensions);
  if(extensionPoles&&!chargingWand)add("extension_pole",12,"The 36-inch charging extension pole requires a wired or wireless Norman Smart charging wand.");else component("extension_pole_for_charging_wand",extensionPoles);
  if(harnesses&&!dc)add("harness",14,"Additional DC harnesses require Norman Smart DC Low Voltage power.");else component("dc_connection_harness",harnesses);
  if(repeaters&&!(smart||automate))add("repeater",15,"Repeaters require Norman Smart or Automate Home motorization.");else component("repeater",repeaters);
  const remote=norm(c.remote_type), quantityExplicit=present("honeycomb_remote_quantity");
  const remoteQuantity=count("honeycomb_remote_quantity",Number.MAX_SAFE_INTEGER,remote?s.quantity:0);
  if(quantityExplicit&&(!(smart||automate)||!remote))add("remote_quantity",15,"Select a compatible remote before specifying its supplied quantity.");
  const maxChannel=automate&&remote.includes("15 channel")?15:5;
  const channel=present("honeycomb_remote_channel")?Number(c.honeycomb_remote_channel):1;
  if(present("honeycomb_remote_channel")&&(!(smart||automate)||!remote||!Number.isInteger(channel)||channel<1||channel>maxChannel))add("channel",automate?68:15,`Select channel 1 through ${maxChannel}; channel zero operates all shades and is not an individual shade assignment.`);
  if(ringSets&&!(smart&&remote.includes("smartdial")))add("rings",15,"Four-color ring sets require a SmartDial G2 remote.");else component("color_rings_for_smartdial_g2_remote",ringSets);
  const solar=yes(c.honeycomb_solar_panel);
  if(c.honeycomb_solar_panel!=null&&!["yes","no","true","false"].includes(norm(c.honeycomb_solar_panel)))add("solar_choice",67,"Choose Yes or No for the solar panel.");
  if(solar&&!battery)add("solar",67,"A Honeycomb solar panel requires the Automate external rechargeable battery power source.");else if(solar)component("solar_panel",s.quantity);
  if(present("honeycomb_wand_length")&&(!wand||!HONEYCOMB_WAND_LENGTHS.includes(String(c.honeycomb_wand_length) as typeof HONEYCOMB_WAND_LENGTHS[number])))add("wand_length",81,"Choose a documented AutoWand length from 8 through 72 inches.");
  if(present("honeycomb_wand_color")&&(!wand||!["White","Cottage White","Black"].includes(String(c.honeycomb_wand_color))))add("wand_color",81,"AutoWand, hook and ring are White, Cottage White or Black.");
  if(extensions&&!["White","Black"].includes(String(c.honeycomb_extension_color)))add("extension_color",81,"Choose White or Black for the 118-inch AutoWand extension cable.");
  const network=count("honeycomb_motor_network",Number.MAX_SAFE_INTEGER,1);if(network<1)add("network",15,"Use a positive whole motor-network number.");
  const raw=c.norman_order_record_v1, order=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as SelectionRecord:null;
  const cableExit=String(c.honeycomb_power_cable_exit??"Front of Headrail");
  if(present("honeycomb_power_cable_exit")&&(!(smart&&!chargingWand)||!["Front of Headrail","Back of Headrail","Top of Headrail"].includes(cableExit)||cableExit==="Top of Headrail"&&norm(c.mount_type)!=="outside mount"))add("cable_exit",11,"AC/DC cable exit is front or back of the headrail; top exit requires outside mount.");
  if(smart&&power.includes("ac adapter")&&order?.adapterWatts===65&&norm(c.mount_type)==="outside mount"&&cableExit==="Back of Headrail"&&Number(c.honeycomb_shim_layers??0)<1)add("65w_back_shim",17,"Outside-mounted 65W Honeycomb with a back cable exit requires at least one shim behind each mounting bracket.");
  return {selections,issues,record:{version:1,family,network,sourceId:"norman-motorization-guide-2026-09-16",sourcePages:wand?[80,81,82]:automate?[66,67,68,69]:[10,11,12,13,14,15,16,17,18],quantityBasis:"per_line",extraChargingKits:kits,extraHarnesses:harnesses,includedHarnesses:dc?s.quantity:0,repeaters,solarPanels:solar?s.quantity:0,
    extension:extensions?{quantity:extensions,length:118,color:c.honeycomb_extension_color??null}:null,
    chargingExtensionPoles:extensionPoles,chargingExtensionPoleLength:extensionPoles?36:null,
    chargingWand:chargingWand?{type:c.motor_type,length:35.5,color:"Black",wiredConnectorLength:power.includes("wired charging")?59:null,includedExtensionLength:power.includes("wired charging")?78.74:null}:null,
    wand:wand?{length:c.honeycomb_wand_length??null,color:c.honeycomb_wand_color??null,hookIncluded:true,ringIncluded:true,chargingConnector:"USB-C",chargerIncluded:false}:null,
    cableExit:smart&&!chargingWand?cableExit:null,
    controller:smart||automate?{type:c.remote_type??null,quantity:remoteQuantity,quantityExplicit,channel,maxChannel,color:automate?"White":"Black",extraFourColorRingSets:ringSets,existingRemoteWorkOrder:c.existing_remote_work_order_number??null}:null,
  }};
}
