import { perfectsheerValance, perfectsheerCommon, validatePerfectsheerValance } from "./norman-perfectsheer-valance";
import { perfectsheerMotorAccessories } from "./norman-perfectsheer-motor-accessories";
import { perfectsheerHardware, validatePerfectsheerHardware } from "./norman-perfectsheer-hardware";
import type { SelectionContext, ValidationIssue } from "./core";
import { PERFECTSHEER_COORDINATION } from "./generated/norman-perfectsheer-coordination.generated";
import { sourceProvenance } from "./source-manifest";

export const PERFECTSHEER_POWER_SOURCES = ["Norman Smart Rechargeable Battery (AC Charger)", "Norman Smart AC Adapter", "Norman Smart DC Low Voltage", "Automate Home ARC Rechargeable Battery", "Automate Home 12V DC Low Voltage", "AutoWand"] as const;
export const PERFECTSHEER_VALANCES = ["Curved Fascia with Fabric", "Fabric Valance", "Modern Wood Valance"] as const;
export const PERFECTSHEER_WOOD_FINISHES = ["001 Pure White","003 Silk White","006 Pearl","012 Crisp Linen","049 Stone Gray","053 Clay","109 Weathered Teak","110 Limed White","212 Dark Teak","221 Black Walnut","237 Wenge","246 Matte Black"] as const;
export const PERFECTSHEER_WAND_COLORS = ["2208 Black", "2058 White", "2094 Cottage White"] as const;
export const PERFECTSHEER_FABRIC_CODES = PERFECTSHEER_COORDINATION.map(row => row.customerColorCode);
const norm = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const explicit = (value: unknown) => value != null && value !== "" && norm(value) !== "default";

export function perfectsheerFabric(code: unknown) {
  return PERFECTSHEER_COORDINATION.find(row => row.customerColorCode === String(code ?? "").toUpperCase());
}

export function perfectsheerComponents(context: SelectionContext) {
  if (context.productId !== "perfectsheer" || context.catalogAsOf < "2026-09-19") return null;
  const c = context.configuration;
  const common=perfectsheerCommon(context);
  const fabric = perfectsheerFabric(c.fabric_color_code);
  const type = norm(c.valance);
  const wood = ["wood", "modern wood valance"].includes(type);
  const fabricValance = ["fabric", "fabric valance"].includes(type);
  const valance = wood ? "Modern Wood Valance" : fabricValance ? "Fabric Valance" : "Curved Fascia with Fabric";
  const height = typeof common?.valanceHeight === "number" ? common.valanceHeight : wood ? 4.5 : explicit(c.perfectsheer_valance_height) ? Number(c.perfectsheer_valance_height) : context.heightInches > 72 ? 4.5 : 3.5;
  const large = height === 4.5;
  const motor = /motor|autowand/.test(norm(c.lift_system));
  const power = norm(c.motor_type);
  const autowand = /autowand/.test(power + norm(c.lift_system));
  const tube = Number(common?.tubeDiameter ?? c.perfectsheer_tube_diameter);
  const bracketClass = typeof common?.bracketClass === "string" ? common.bracketClass : autowand && [1.75,2].includes(tube) ? context.heightInches > (tube === 1.75 ? 84 : 72) ? "large" : "small" : wood ? null : large ? "large" : "small";
  const finishedWidth = context.widthInches - (["inside mount", "inside", "semi inside mount", "semi inside", "im", "ib"].includes(norm(c.mount_type)) ? .125 : 0);
  const defaultChain = context.heightInches <= 20 ? 9 : context.heightInches <= 30 ? 16 : context.heightInches <= 42 ? 24 : context.heightInches <= 55 ? 36 : context.heightInches <= 69 ? 48 : context.heightInches <= 95 ? 60 : 84;
  const chain = /cord.*loop/.test(norm(c.lift_system));
  return {
    version: 1, type: "perfectsheer_components", sourceId: "norman-perfectsheer-smartdrape-guide-2026-09", sourcePages: [32,34,35,40,41,42],
    motorMounting: autowand ? {tubeDiameter: Number.isFinite(tube) ? tube : null, bracketClass, sourceId:"norman-motorization-guide-2026-09-16",sourcePage:90} : null,
    finishedShadeWidth: finishedWidth,
    hardware: perfectsheerHardware(context)?.record ?? null,
    motorAccessories: perfectsheerMotorAccessories(context)?.record ?? null,
    fabric: fabric ? {
      customerFabricCode: fabric.customerFabricCode, customerColorCode: fabric.customerColorCode,
      factoryFabricCode: fabric.factoryFabricCode, factoryColorCode: fabric.factoryColorCode, opacity: fabric.opacity,
      sourceId: "norman-ps-sd-coordination-2026-08-11", sourceSheet: "Fabric Color List-PerfectSheer", sourceRange: fabric.factoryRange,
    } : null,
    coordination: fabric ? {
      hardware: fabric.hardware, endCapsAndClutch: fabric.endCapsAndClutch,
      cord: chain ? fabric.cord : null, tensionDevice: chain ? fabric.tensionDevice : null,
      motorBox: !motor ? null : power.includes("rechargeable") ? fabric.batteryBox : power.includes("low voltage") ? fabric.dcBox : power.includes("ac adapter") ? fabric.acConnectorBox : null,
      autoWandColor: /autowand/.test(power + norm(c.lift_system)) ? c.perfectsheer_wand_color ?? null : null,
      sourceId: "norman-ps-sd-coordination-2026-08-11", sourceSheet: "PerfectSheer", sourceRange: fabric.coordinationRange,
    } : null,
    valance: { ...perfectsheerValance(context)?.record, type: valance, height, bracketClass, fabricColorCode: wood ? null : explicit(c.perfectsheer_valance_fabric) ? c.perfectsheer_valance_fabric : fabric?.customerColorCode ?? null, woodFinish: wood ? c.perfectsheer_wood_finish ?? null : null },
    mounting: {
      installation: c.perfectsheer_installation ?? null,
      minimumInsideDepth: .75,
      woodFlushDepthByBracket: wood ? { small: 4, large: motor ? 4.5 : 4.625 } : null,
      flushInsideDepth: wood || (autowand && bracketClass !== (large ? "large" : "small")) ? null : fabricValance ? large ? motor ? 4.3125 : 4.125 : 3.75 : large ? motor ? 4.0625 : 4.1875 : 3.5625,
    },
    chain: chain ? { controlSide: c.control_side ?? "Right", length: explicit(c.perfectsheer_chain_length) ? Number(c.perfectsheer_chain_length) : defaultChain, defaultLength: defaultChain, recommendedCustomMaximum: (context.heightInches - 2) / 1.1, safetyTensionDeviceRequired: true, clearanceBelowDevice: 2 } : null,
  };
}

export function validatePerfectsheerComponents(context: SelectionContext): ValidationIssue[] {
  const record = perfectsheerComponents(context);
  if (!record) return [];
  const c = context.configuration;
  const issues: ValidationIssue[] = [...validatePerfectsheerValance(context), ...validatePerfectsheerHardware(context), ...(/motor|autowand/.test(norm(c.lift_system)) ? [] : perfectsheerMotorAccessories(context)?.issues ?? [])];
  const add = (id: string, page: number, explanation: string) => issues.push({ severity: "hard_block", ruleId: `norman.perfectsheer.${id}`, source: sourceProvenance("norman-perfectsheer-smartdrape-guide-2026-09", { page }), selectedValues: { ...c }, explanation });
  const choice = (key: string, values: readonly string[], page: number, required = false) => {
    if ((required || explicit(c[key])) && !values.some(v => norm(v) === norm(c[key]))) add(key, page, `Select ${key.replace("perfectsheer_", "").replaceAll("_", " ")} from the current PerfectSheer choices.`);
  };
  if (c.fabric_color_code && !record.fabric) add("fabric",46,"Select a current PerfectSheer ordering color; discontinued colors remain available only on historical quotes.");
  const light = norm(c.light_control);
  if (record.fabric && light && light !== norm(record.fabric.opacity)) add("fabric_opacity",46,"The selected fabric color must match its Light Filtering or Room Darkening opacity.");
  choice("valance", [...PERFECTSHEER_VALANCES,"standard","wood","fabric"],35);
  choice("perfectsheer_installation",["Top Mount","Back Mount"],42);
  choice("perfectsheer_valance_height",["3.5","4.5"],35);
  if (context.heightInches > 72 && record.valance.height !== 4.5) add("valance_height",35,"PerfectSheer shades over 72 inches high require a 4½-inch valance/fascia and large brackets.");
  if (record.valance.type === "Modern Wood Valance") {
    choice("perfectsheer_wood_finish",PERFECTSHEER_WOOD_FINISHES,35,true);
    if (explicit(c.perfectsheer_valance_height) && Number(c.perfectsheer_valance_height) !== 4.5) add("wood_height",35,"Modern Wood Valance is available at 4½ inches only.");
  } else choice("perfectsheer_valance_fabric",PERFECTSHEER_FABRIC_CODES,35);
  if (record.chain) {
    choice("control_side",["Left","Right"],34);
    const length = record.chain.length;
    if (!Number.isFinite(length) || length < 9 || length > 280) add("chain_length",34,"PerfectSheer custom cord length must be at least 9 inches and cannot exceed 280 inches.");
    if (explicit(c.perfectsheer_chain_length) && length > record.chain.recommendedCustomMaximum && norm(c.perfectsheer_chain_unobstructed) !== "yes") add("chain_clearance",34,"Confirm there is no sill or obstruction below the tension device before extending the cord beyond the recommended window-height length.");
  } else if (explicit(c.perfectsheer_chain_length)) add("chain_control",34,"Custom cord-loop length requires Continuous Cord Loop operation.");
  if (/autowand/.test(norm(c.motor_type) + norm(c.lift_system)) && !PERFECTSHEER_WAND_COLORS.some(color => norm(color) === norm(c.perfectsheer_wand_color))) issues.push({severity:"hard_block",ruleId:"norman.perfectsheer.wand_color",source:sourceProvenance("norman-ps-sd-coordination-2026-08-11",{sheet:"PerfectSheer",range:"L7:L38"}),selectedValues:{...c},explanation:"Choose Black, White or Cottage White for AutoWand; Norman specifies no default wand color."});
  return issues;
}
