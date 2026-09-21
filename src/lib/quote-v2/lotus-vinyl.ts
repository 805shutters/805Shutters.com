import { LOTUS_VINYL_PRODUCT, LOTUS_VINYL_VERSION, lotusVinylDonorSkus, lotusVinylProfile } from "@/lib/quote/lotus-vinyl";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

export function validateLotusVinyl(context: SelectionContext): ValidationIssue[] {
  if (context.productId !== LOTUS_VINYL_PRODUCT || context.catalogAsOf < "2026-09-20" || context.configuration.lotus_vinyl_configuration_version !== LOTUS_VINYL_VERSION) return [];
  const profile = lotusVinylProfile(context.programId);
  const config = context.configuration;
  const issues: ValidationIssue[] = [];
  const source = { ...sourceProvenance("lotus-digital-catalog-v1-1-25"), pages: profile ? [...profile.pages] : [8, 9, 10, 11, 34] };
  const selectedValues = { programId: context.programId, width: context.widthInches, height: context.heightInches, color: config.color ?? null };
  const add = (suffix: string, explanation: string) => issues.push({ severity: "hard_block", ruleId: `lotus.vinyl.${suffix}`, source, selectedValues, explanation });
  if (!profile) { add("program", "The typed 1-inch vinyl cut schedule applies only to MLX or RLX. Select the exact source program."); return issues; }
  if (config.mount_type !== "Inside Mount" || config.lotus_measurement_basis !== "inside_opening") add("measurement_basis", "This MLX/RLX route uses nominal inside-opening measurements; the manufacturer deducts ½ inch from width. Outside/side mounting needs separately confirmed ordering dimensions.");
  if (config.lift_system !== "Cordless" || config.valance !== "None") add("standard_configuration", "MLX/RLX use cordless lift and the source designer headrail without a valance.");
  if (!Number.isInteger(context.widthInches * 4) || !Number.isInteger(context.heightInches)) add("cut_increments", "Custom widths must use quarter-inch increments; custom heights must use whole inches.");
  const donorSkus = lotusVinylDonorSkus(context.programId!, context.widthInches, context.heightInches, String(config.color ?? ""));
  if (!donorSkus.length) add("donor_required", `No same-program, same-color source stock blind in this price cell supports the requested cut. ${profile.code} donors at or below 22 inches cannot be width-cut; wider donors permit ${profile.minimumWidthCut === 0.5 ? "½" : "¼"}–6 inches removed. Height reductions over 10 inches require clarification of the conflicting general 12-inch guide.`);
  else issues.push({ severity: "auto_derive", ruleId: "lotus.vinyl.eligible_stock_donors", source: { ...sourceProvenance("lotus-west-a26-v1"), pages: profile.code === "MLX" ? [5,6,7,8,9,10,11,12,95] : [14,15,16,17,18,96] }, selectedValues, derivedValues: { eligible_donor_skus: donorSkus }, explanation: "Same-program/color physically eligible donor SKUs retained with the server validation evidence. This does not confirm stock, choose fulfillment or approve the conflicting custom price." });
  for (const key of ["motor_type", "remote_type", "motorization_type"]) if (config[key] && !["None", "none"].includes(String(config[key]))) add("motorization", "MLX/RLX support cordless operation only; no verified motorization selection is available.");
  if (Array.isArray(context.options.motorization_selections) && context.options.motorization_selections.length) add("motorization", "MLX/RLX have no verified motorization accessories.");
  return issues;
}
