import { lotusColorsForSelection } from "@/lib/quote/lotus-colors";
import { LOTUS_AMX_PRODUCT, LOTUS_AMX_PROGRAM, LOTUS_AMX_VERSION, lotusAmxDonorSkus } from "@/lib/quote/lotus-amx";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

export function isTypedLotusAmx(context: SelectionContext): boolean {
  return context.productId === LOTUS_AMX_PRODUCT && context.programId === LOTUS_AMX_PROGRAM &&
    context.configuration.lotus_amx_configuration_version === LOTUS_AMX_VERSION;
}

export function validateLotusAmx(context: SelectionContext): ValidationIssue[] {
  if (!isTypedLotusAmx(context)) return [];
  const config = context.configuration;
  const issues: ValidationIssue[] = [];
  const add = (suffix: string, explanation: string) => issues.push({
    severity: "hard_block", ruleId: `lotus.amx.${suffix}`,
    source: { ...sourceProvenance("lotus-digital-catalog-v1-1-25"), pages: [12, 13, 34] },
    selectedValues: { width: context.widthInches, height: context.heightInches, color: config.color ?? null }, explanation,
  });
  if (!lotusColorsForSelection(context.productId, context.programId ?? "", context.widthInches, context.heightInches).includes(String(config.color ?? ""))) add("exact_color_sku", "Select a color with an exact ordering SKU in this custom price cell.");
  if (config.mount_type !== "Inside Mount") add("inside_mount_only", "This verified AMX route uses inside-mount nominal ordering dimensions. Outside or side mounting needs confirmed finished dimensions.");
  if (config.lift_system !== "Cordless" || config.valance !== "None") {
    add("standard_configuration", "AMX uses cordless lift and its standard headrail without a valance.");
  }
  if (config.lotus_measurement_basis !== "inside_opening") add("measurement_basis", "AMX ordering uses inside-opening measurements; the factory deducts ½ inch from the ordered width.");
  if (!Number.isInteger(context.widthInches * 4) || !Number.isInteger(context.heightInches)) add("cut_increments", "AMX custom width must use quarter-inch increments and custom height must use whole inches.");
  const donorSkus = lotusAmxDonorSkus(context.widthInches, context.heightInches, String(config.color ?? ""));
  if (donorSkus.length) issues.push({severity:"auto_derive", ruleId:"lotus.amx.eligible_stock_donors", source:{...sourceProvenance("lotus-west-a26-v1"),pages:[20,21,22,23,24,97]}, selectedValues:{width:context.widthInches,height:context.heightInches,color:String(config.color ?? "")}, derivedValues:{eligible_donor_skus:donorSkus}, explanation:"Eligible same-color stock donors are retained in the immutable pricing derivations; they do not replace the custom grid price or select a fulfillment SKU."});
  if (!donorSkus.length) add("donor_required", "No documented same-color stock blind within this price cell supports the requested cut. AMX blinds at or below 22 inches cannot be width-cut; wider donors allow ¼–6 inches removed. Height cuts over 10 inches require confirmation because the current guides conflict.");
  for (const key of ["motor_type", "remote_type", "motorization_type"]) {
    if (config[key] && !["None", "none"].includes(String(config[key]))) add("unsupported_motorization", "AMX source evidence supports cordless operation only.");
  }
  if (Array.isArray(context.options.motorization_selections) && context.options.motorization_selections.length) add("unsupported_motorization", "AMX has no verified motorization accessories.");
  return issues;
}
