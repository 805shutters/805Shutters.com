import { LOTUS_VERTICAL_VERSION, lotusVerticalColors, lotusVerticalProfile } from "@/lib/quote/lotus-vertical";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";
export function validateLotusVertical(context: SelectionContext): ValidationIssue[] {
  const config = context.configuration;
  if (context.productId !== "lotus_vertical_blinds" || config.lotus_vertical_configuration_version !== LOTUS_VERTICAL_VERSION) return [];
  const profile = lotusVerticalProfile(context.programId ?? "");
  const issues: ValidationIssue[] = [];
  const add = (suffix: string, explanation: string, color = false) => issues.push({ severity: "hard_block", ruleId: `lotus.vertical.${suffix}`, source: { ...sourceProvenance(color ? "lotus-west-a26-v1" : "lotus-digital-catalog-v1-1-25"), pages: color ? [106, 107, 108] : [30, 31, 32, 33, 34] }, selectedValues: { programId: context.programId, color: config.color ?? null, stack: config.lotus_vertical_stack ?? null, wand: config.lotus_vertical_wand_inches ?? null }, explanation });
  if (!profile) { add("program", "Select an exact vertical complete-blind, headrail or vane program."); return issues; }
  if (config.lotus_vertical_kind !== profile.kind || config.lotus_vertical_rail !== profile.rail || config.lotus_vertical_draw !== profile.draw) add("program_identity", "Component, rail material and draw system must match the selected program.");
  if (!lotusVerticalColors(context.programId ?? "", context.widthInches, context.heightInches).includes(String(config.color))) add("source_color", "Select a color with an exact ordering SKU in this program and size cell.", true);
  if (config.lotus_measurement_basis !== "exact_finished_size") add("measurement_basis", "Vertical blinds and components use exact finished dimensions, without an automatic inside deduction.");
  if (profile.rail) {
    if (config.lotus_vertical_headrail_color !== "White" || config.lift_system !== "Wand control") add("headrail_control", "The documented headrail is White with wand control.");
    if (!["Inside Mount", "Outside Mount"].includes(String(config.mount_type))) add("mount", "Select the mounting method and retain exact finished dimensions.");
    const allowedWands = profile.rail === "Steel" ? [30, 48, 60, 72] : [30];
    if (!allowedWands.includes(Number(config.lotus_vertical_wand_inches))) add("wand", "Choose the documented standard 30-inch wand or a source-supported steel-system accessory length; accessory charges require confirmation.");
    if (Number(config.lotus_vertical_wand_inches) !== 30 && !["White", "Alabaster"].includes(String(config.lotus_vertical_wand_color))) add("wand_color", "The optional steel-system wand must be ordered in White or Alabaster; its separate accessory price remains unverified.");
    if (profile.draw === "Center draw" ? config.lotus_vertical_stack !== "Center" : !["Left", "Right"].includes(String(config.lotus_vertical_stack))) add("stack", "Choose Left or Right for one-way draw; a center-draw program must retain center stacking.");
  } else if (config.lift_system !== "None" || config.lotus_vertical_wand_inches != null || config.lotus_vertical_stack != null) add("vane_only", "Vanes-only configuration cannot include a headrail control, wand or stack choice.");
  if ((config.valance ?? null) !== profile.valance) add("valance", profile.valance === null ? "Custom center-draw valance inclusion is unresolved; do not infer an included valance." : "Valance inclusion must match the documented complete package or component program.");
  if ([config.motor_type, config.remote_type, config.motorization_type].some(value => value && !["None", "none"].includes(String(value))) || (Array.isArray(context.options.motorization_selections) && context.options.motorization_selections.length)) add("motorization", "The current vertical source documents wand control; motorization is not verified.");
  return issues;
}
