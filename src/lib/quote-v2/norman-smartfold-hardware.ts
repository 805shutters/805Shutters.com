import {smartfoldInsideFascia} from "./norman-smartfold-inside-fascia";
import {smartfoldAutoWand} from "./norman-smartfold-autowand";
import { magneticClearanceRecord, validateMagneticClearance } from "./norman-magnet-clearance";
import { SMARTFOLD_FABRICS } from "@/lib/quote/norman-current-assortment";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";
import { smartfoldStyle } from "./norman-smartfold-style";

export const SMARTFOLD_HARDWARE_DATE = "2026-09-19";
export const SMARTFOLD_INSTALLATIONS = ["Top Mount with Raceway", "Back / Wall Mount with Raceway"] as const;
export const SMARTFOLD_HOLD_DOWNS = ["None", "Traditional", "Magnetic"] as const;
export const SMARTFOLD_MAGNET_COLORS = ["Nickel-Plated", "Pure White", "Silk White", "Bisque", "Pearl", "Bright Brass", "Antique Brass", "Black", "Crisp Linen", "String", "Sea Mist", "Stone Gray", "Brown Gray", "Taupe Gray"] as const;
export const SMARTFOLD_POLES = ["None", "30-inch Fiberglass Pole", "58-inch Fiberglass Pole", "36-inch Cordless Operating Pole", "60-inch Cordless Operating Pole", "Pole Attachment Only"] as const;
export const SMARTFOLD_LIGHT_GUARD_COLORS = ["3058 White", "3012 Bianca", "3094 Cottage White", "3578 Sahara", "3463 Chocolate", "3129 Silver", "3212 Black Ink"] as const;
const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** September guide pp24,37–38. Counts are per shade, before line quantity. */
export function smartfoldHardware(context: SelectionContext) {
  if (context.productId !== "smartfold" || context.catalogAsOf < SMARTFOLD_HARDWARE_DATE) return null;
  const c = context.configuration;
  const mount = normalize(c.mount_type);
  const inside = ["inside mount", "inside", "im", "ib", "semi inside mount", "semi inside"].includes(mount);
  const outside = ["outside mount", "outside", "om", "ob"].includes(mount);
  const installation = normalize(c.smartfold_installation);
  const top = installation === normalize(SMARTFOLD_INSTALLATIONS[0]);
  const back = installation === normalize(SMARTFOLD_INSTALLATIONS[1]);
  const validMount = (inside && (top || back)) || (outside && back);
  const finishedWidth = context.widthInches - (inside ? 0.125 : 0);
  const shimLayers = c.smartfold_shim_layers == null || c.smartfold_shim_layers === "" ? null : Number(c.smartfold_shim_layers);
  const validLayers = shimLayers != null && Number.isInteger(shimLayers) && shimLayers >= 0 && shimLayers <= 3;
  const supports = top ? finishedWidth <= 80 ? 3 : 5 : finishedWidth <= 40 ? 2 : finishedWidth <= 80 ? 3 : 4;
  const collection = SMARTFOLD_FABRICS.find(f => f.code === String(c.fabric_color_code ?? "").toUpperCase())?.collection;
  const lift = normalize(c.lift_system ?? c.control_type);
  const cordless = lift.includes("cordless");
  const knownLift = cordless || /cord.*loop|motor|autowand/.test(lift);
  const bracketSize = !collection || !knownLift ? null : collection === "Louise"
    ? cordless || context.heightInches <= 72 ? 4.5 : 6
    : collection === "Moonlight" && !cordless ? 3.5 : context.heightInches <= 60 ? 3.5 : 4.5;
  const customChain = c.smartfold_chain_length != null && c.smartfold_chain_length !== "";
  const chainLength = customChain ? Number(c.smartfold_chain_length) : context.heightInches <= 25.5 ? context.heightInches - 2 : context.heightInches * 2 / 3 + 6;
  const autoWand = smartfoldAutoWand(context);
  const insideFascia = smartfoldInsideFascia(context);
  return {
    validMount, validLayers,
    record: {
      version: 1, type: "smartfold_hardware", sourceId: "norman-smartfold-guide-2026-09-10",
      sourcePages: [24, 37, 38], installation: validMount ? top ? SMARTFOLD_INSTALLATIONS[0] : SMARTFOLD_INSTALLATIONS[1] : null,
      finishedShadeWidth: Number.isFinite(finishedWidth) ? finishedWidth : null,
      finishedShadeHeight: Number.isFinite(context.heightInches) ? context.heightInches : null,
      shadeBracketCount: 2, mountingBracketCount: validMount ? top ? 0 : supports : null,
      mountingBracketSize: validMount && back ? bracketSize : null,
      shimLayers: validLayers ? shimLayers : null,
      shimQuantity: validMount && validLayers ? supports * shimLayers! : null,
      quantityBasis: "per_shade",
      style: smartfoldStyle(context),
      ...(autoWand ? {autoWand:autoWand.record} : {}),
      ...(insideFascia ? {insideFasciaClearance:insideFascia.record} : {}),
      magneticClearance: magneticClearanceRecord(context),
      chain: /cord.*loop/.test(lift) ? {
        sourceId: "norman-smartfold-guide-2026-09-10", sourcePage:21,
        length: Number.isFinite(chainLength) && chainLength > 0 ? chainLength : null,
        lengthBasis: customChain ? "custom" : "default",
        measurementBasis: "top_of_mounting_bracket_to_bottom_of_tension_device",
        unobstructedBelow: ["true","yes"].includes(normalize(c.smartfold_chain_unobstructed)),
        requiredClearanceBelow:2,
      } : null,
    },
  };
}

export function validateSmartfoldHardware(context: SelectionContext): ValidationIssue[] {
  const hardware = smartfoldHardware(context);
  if (!hardware) return [];
  const issues: ValidationIssue[] = [];
  const add = (rule: string, page: number, explanation: string) => issues.push({
    severity: "hard_block", ruleId: `norman.smartfold.${rule}`,
    source: sourceProvenance("norman-smartfold-guide-2026-09-10", { page }),
    selectedValues: { ...context.configuration }, explanation,
  });
  if (!hardware.validMount) add("installation", 38, "Select top or back/wall mounting with raceway for inside mount. Outside mount requires back/wall mounting with raceway.");
  if (!hardware.validLayers) add("shim_layers", 38, "Select zero, one, two or three shim layers. Hardware quantities are calculated from the finished shade width and mounting method.");
  const fold = Number(context.configuration.fold_size);
  if (![6, 7, 8].includes(fold)) add("fold_size", 9, "Select a 6-inch, 7-inch or 8-inch fold.");
  const c=context.configuration;
  if (/cord.*loop/.test(normalize(c.lift_system ?? c.control_type)) && c.smartfold_chain_length != null && c.smartfold_chain_length !== "") {
    const length=Number(c.smartfold_chain_length);
    const defaultLength=context.heightInches <= 25.5 ? context.heightInches - 2 : context.heightInches * 2 / 3 + 6;
    const maximum=["true","yes"].includes(normalize(c.smartfold_chain_unobstructed)) ? 280 : context.heightInches-2;
    if (!Number.isFinite(length) || length <= defaultLength || length > maximum) add("chain_length",21,`Custom chain length must be longer than the standard ${Number(defaultLength.toFixed(3))} inches and no more than ${maximum} inches. Lengths beyond shade height minus 2 inches require an unobstructed area below the tension device.`);
  }
  return issues;
}

export function smartfoldAccessorySelections(context: SelectionContext) {
  const c=context.configuration;
  const holdDown=normalize(c.smartfold_hold_down || "None");
  const pole=normalize(c.smartfold_pole || "None");
  return {
    magnetic_hold_down: holdDown === "magnetic",
    additional_fiberglass_pole: /^(30|58) inch fiberglass pole$/.test(pole),
    cordless_operating_pole: /^(36|60) inch cordless operating pole$/.test(pole),
    pole_attachment_only: pole === "pole attachment only",
  };
}

export function validateSmartfoldAccessories(context: SelectionContext): ValidationIssue[] {
  if (context.productId !== "smartfold" || context.catalogAsOf < SMARTFOLD_HARDWARE_DATE) return [];
  const c=context.configuration;
  const issues: ValidationIssue[]=[];
  const add=(rule:string,page:number,explanation:string)=>issues.push({severity:"hard_block",ruleId:`norman.smartfold.${rule}`,source:sourceProvenance("norman-smartfold-guide-2026-09-10",{page}),selectedValues:{...c},explanation});
  const contains=(values:readonly string[],value:unknown)=>values.some(v=>normalize(v)===normalize(value));
  if (c.smartfold_hold_down && !contains(SMARTFOLD_HOLD_DOWNS,c.smartfold_hold_down)) add("hold_down",20,"Select no hold-down, traditional hold-downs or magnetic hold-downs.");
  if (normalize(c.smartfold_hold_down)==="magnetic" && !contains(SMARTFOLD_MAGNET_COLORS,c.smartfold_magnet_color)) add("magnet_color",20,"Select the magnetic catch color. Nickel-Plated is the manufacturer default.");
  if (c.smartfold_pole && !contains(SMARTFOLD_POLES,c.smartfold_pole)) add("pole",21,"Select one additional pole or one pole attachment per shade.");
  if (c.smartfold_pole && normalize(c.smartfold_pole)!=="none" && !normalize(c.lift_system ?? c.control_type).includes("cordless")) add("pole_control",21,"SmartFold operating poles and attachments are available for PrecisionLift Cordless shades only.");
  issues.push(...validateMagneticClearance(context),...(smartfoldAutoWand(context)?.issues??[]));
  const active=smartfoldAccessorySelections(context);
  for(const key of Object.keys(active) as (keyof typeof active)[]) {
    if (["yes","true","on"].includes(normalize(c[key])) && !active[key]) add("legacy_accessory",21,"Reconfirm the saved hold-down or pole choice before repricing this current configuration.");
  }
  if ([c.basic_light_guard,c.light_guard].some(value=>["yes","true","basic","basic light guard"].includes(normalize(value))) && !contains(SMARTFOLD_LIGHT_GUARD_COLORS,c.smartfold_light_guard_color)) add("light_guard_color",22,"Select a current Light Guard color.");
  return issues;
}
