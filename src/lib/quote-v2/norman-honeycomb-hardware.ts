import { normalizeHoneycombCellSize, normalizeHoneycombSystem } from "./honeycomb-matrix";
import { findHoneycombColor, normalizeIdentity } from "./catalog";
import type { SelectionContext, ValidationIssue } from "./core";
import { normanHoneycombV2Source } from "./generated/norman-honeycomb-v2.generated";
import { sourceProvenance } from "./source-manifest";

export const HONEYCOMB_GUARD_COLORS = ["3058 White", "3012 Bianca", "3094 Cottage White", "3578 Sahara", "3463 Chocolate", "3129 Silver", "3212 Black Ink"] as const;
export const HONEYCOMB_MAGNET_COLORS = ["Nickel-Plated", "Pure White", "Silk White", "Bisque", "Pearl", "Bright Brass", "Antique Brass", "Black", "Crisp Linen", "String", "Sea Mist", "Stone Gray", "Brown Gray", "Taupe Gray"] as const;
const yes = (v: unknown) => ["yes", "true"].includes(normalizeIdentity(v));

export function honeycombHardware(s: SelectionContext) {
  if (s.productId !== "honeycomb" || s.catalogAsOf < "2026-09-19") return null;
  const c = s.configuration;
  const system = normalizeHoneycombSystem(s);
  const cell = normalizeHoneycombCellSize(String(c.cell_size ?? ""));
  const inside = normalizeIdentity(c.mount_type) === "inside mount";
  const smartfit = system === "smartfit" || system === "smartfit_dual";
  const frame = Boolean(system?.includes("frame"));
  const skylight = system === "motorized_skylight";
  const specialty = system === "specialty_shape";
  const twoOnOne = /2 on 1|2 on one|two on one/.test(normalizeIdentity(c.shade_type));
  const plate = c.honeycomb_mounting_plate !== "Without Mounting Plate";
  const w = s.widthInches;
  let brackets: number | null = null;
  if (["smartrise_cordless", "cordless_tdbu", "cordless_day_night"].includes(system ?? "")) brackets = w <= 43 ? 2 : w <= 72 ? 3 : w <= 101 ? 4 : 5;
  else if (system?.startsWith("woven_cordless")) brackets = w <= 39 ? 2 : w <= 66 ? 3 : 4;
  else if (["cord_loop", "cord_loop_td", "cord_loop_day_night", "smartrelease"].includes(system ?? "")) brackets = w <= 39 ? 2 : w <= 66 ? 3 : w <= 93 ? 4 : 5;
  else if (system?.startsWith("smart_motorized")) brackets = w <= 64 ? 2 : w <= 112 ? 3 : 4;
  else if (["motorized_bottom_up", "motorized_top_down", "autowand_motorized_bottom_up"].includes(system ?? "")) brackets = w <= 56 ? 2 : w <= 105 ? 3 : 4;
  else if (smartfit && !inside && !["3_4_double", "1_1_4_single"].includes(cell ?? "")) brackets = cell === "3_8_single" ? (plate && w > 40 ? 5 : 4) : w <= 40 ? 4 : w <= 52 ? 5 : !plate && w > 65 ? 7 : 6;
  const layers = Number(c.honeycomb_shim_layers ?? 0);
  const shimsAllowed = !specialty && !skylight && !frame && system !== "smartfit_sloped" && !(smartfit && inside) && !twoOnOne;
  const polesAllowed = Boolean(system && (/cordless/.test(system) || system.startsWith("smartfit")));
  const pole = normalizeIdentity(c.poles);
  const poleSelected = pole !== "" && pole !== "none";
  const poleCount = poleSelected ? Number(c.honeycomb_pole_quantity ?? 1) : 0;
  const guardSelected = yes(c.honeycomb_light_guard);
  const sourceColor = findHoneycombColor(String(c.fabric_collection ?? ""), String(c.fabric_color_code ?? ""));
  const skylightRail = normanHoneycombV2Source.motorizedSkylightColors.find(row => row.family === sourceColor?.family && row.customerColorCode === sourceColor?.customerColorCode)?.coordination.rail;
  const railOverride = !["", "default"].includes(normalizeIdentity(c.rail_color)) ? HONEYCOMB_GUARD_COLORS.find(v => normalizeIdentity(v).endsWith(normalizeIdentity(c.rail_color))) : undefined;
  const guardColor = skylight ? (!["", "default"].includes(normalizeIdentity(c.rail_color)) ? railOverride ?? null : skylightRail ?? null) : c.honeycomb_light_guard_color ?? null;
  const sideMount = /side mount/.test(normalizeIdentity(c.installation_method));
  const sideKit = sideMount || yes(c.honeycomb_side_mount_kit);
  const sideAllowed = inside && !system?.startsWith("smartfit") && !skylight && !specialty;
  const guardAllowed = inside && !frame && !specialty && !twoOnOne;
  const hold = normalizeIdentity(c.hold_downs || "None");
  const holdAllowed = !system?.startsWith("smartfit") && !skylight && !specialty;
  const magnetic = hold === "magnetic";
  const guardCharge = guardSelected && !skylight ? 1 : 0;
  const attachmentCharge = pole === "attachment only" ? poleCount : 0;
  const poleCharge = pole === "pole with attachment" ? poleCount : 0;
  const cutoutCharge = yes(c.cutout) ? 1 : 0;
  const surchargeSelections = [
    ...(layers > 0 && brackets != null ? [{id: "shim", units: layers * brackets}] : []),
    ...(guardCharge + attachmentCharge > 0 ? [{id: "lightguard_pole_attachment_only", units: guardCharge + attachmentCharge}] : []),
    ...(poleCharge + cutoutCharge > 0 ? [{id: "cut_out_cordless_operating_pole", units: poleCharge + cutoutCharge}] : []),
    ...(sideKit ? [{id: "side_mount_bracket", units: 1}] : []),
    ...(magnetic ? [{id: "magnetic_hold_down", units: 1}] : []),
  ];
  return {system, cell, inside, frame, skylight, specialty, smartfit, twoOnOne, plate, brackets, layers, shimsAllowed, polesAllowed, pole, poleSelected, poleCount, guardSelected, guardAllowed, hold, holdAllowed, magnetic, guardColor, sideKit, sideMount, sideAllowed, surchargeSelections, record: {
    sourceId: "norman-honeycomb-guide-2026-07", sourcePages: [6, 45, 47, 48, 49],
    quantityBasis: "per_ordered_shade", mountingBracketCount: brackets,
    mountingPlate: smartfit ? plate : null,
    sideMountSupportKit: sideKit, regularSupportBracketsRequired: sideKit && w > 37,
    shimLayers: layers, shimQuantity: brackets == null ? 0 : layers * brackets,
    pole: poleSelected ? {type: c.poles, quantity: poleCount, length: pole === "pole with attachment" ? c.honeycomb_pole_length ?? null : null, color: pole === "attachment only" ? "White" : "Black", head: system?.startsWith("smartfit") ? "Stationary" : "Movable", holderIncluded: pole === "pole with attachment"} : null,
    lightGuard: guardSelected || skylight ? {included: skylight, color: guardColor, spliceRules: [{lengthAbove: 96, lengthThrough: 102, measuredFrom: "top", distance: 6}, {lengthAbove: 102, lengthThrough: null, measuredFrom: "bottom", distance: 96}]} : null,
    holdDown: hold === "none" ? null : {type: c.hold_downs, catchColor: magnetic ? c.honeycomb_magnet_color ?? "Nickel-Plated" : null, magnetFactoryInstalled: magnetic, extraSideClearance: magnetic ? 1.4375 : null, extraBottomClearance: magnetic ? .3125 : null},
  }};
}

export function validateHoneycombHardware(s: SelectionContext): ValidationIssue[] {
  const h = honeycombHardware(s); if (!h) return [];
  const c = s.configuration, issues: ValidationIssue[] = [];
  const add = (id: string, page: number, explanation: string) => issues.push({severity: "hard_block", ruleId: `honeycomb.hardware.${id}`, source: sourceProvenance("norman-honeycomb-guide-2026-07", {page}), selectedValues: {...c}, explanation});
  for (const key of ["honeycomb_light_guard", "honeycomb_side_mount_kit"]) if (c[key] != null && !["yes", "no", "true", "false"].includes(normalizeIdentity(c[key]))) add("choice",45,"Choose Yes or No for the requested accessory.");
  if (c.installation_method && !["side mount", "regular support brackets"].includes(normalizeIdentity(c.installation_method))) add("installation",6,"Select regular support brackets or a valid side-mount installation.");
  if (h.sideKit && !h.sideAllowed) add("side_mount_kit",6,"The side-mount support kit requires an eligible inside-mounted shade.");
  if (h.skylight && !["3058 White", "3094 Cottage White", "3129 Silver", "3212 Black Ink"].includes(String(h.guardColor))) add("skylight_guard_color",45,"Motorized Skylight Light Guard must match an available rail finish.");
  if (!Number.isInteger(h.layers) || h.layers < 0 || h.layers > 2 || h.layers > 0 && (!h.shimsAllowed || h.brackets == null)) add("shims",47,"Choose zero through two shim layers for an eligible mounting system. Multi-shade headrails require individual hardware reconciliation.");
  if (c.honeycomb_mounting_plate && !["With Mounting Plate", "Without Mounting Plate"].includes(String(c.honeycomb_mounting_plate))) add("plate",47,"Select a documented mounting-plate choice.");
  if (!h.plate && (!h.smartfit || ["3_4_double", "1_1_4_single"].includes(h.cell ?? ""))) add("plate_required",47,"Large-cell SmartFit requires the mounting plate; the removable-plate option applies only to SmartFit and SmartFit Dual.");
  if (h.poleSelected && (!h.polesAllowed || !["pole with attachment", "attachment only"].includes(h.pole) || !Number.isInteger(h.poleCount) || h.poleCount < 1 || h.poleCount > 2)) add("pole",47,"Select one or two documented poles or attachments for a compatible cordless/SmartFit shade.");
  if (h.pole === "pole with attachment" && ![36,60].includes(Number(c.honeycomb_pole_length))) add("pole_length",47,"Choose a 36-inch or 60-inch operating pole.");
  if (h.guardSelected && !h.guardAllowed) add("light_guard_mount",45,"Light Guard requires inside mount and is unavailable for framed SmartFit, specialty shapes or 2-on-1 shades.");
  if (h.guardSelected && !HONEYCOMB_GUARD_COLORS.some(v => v === c.honeycomb_light_guard_color)) add("light_guard_color",45,"Choose a documented Light Guard finish.");
  if (!["none", "standard", "magnetic"].includes(h.hold) || h.hold !== "none" && !h.holdAllowed || h.magnetic && h.inside) add("hold_down",45,"This system does not support the requested hold-down. Magnetic hold-downs require outside mount.");
  if (h.magnetic && !HONEYCOMB_MAGNET_COLORS.some(v => v === (c.honeycomb_magnet_color ?? "Nickel-Plated"))) add("magnet_color",45,"Choose a documented magnetic catch finish.");
  if ((yes(c.shim) || Number(c.shims)>0 || Number(c.shim_quantity)>0) && c.honeycomb_shim_layers == null) add("legacy_shims",48,"Reconfirm shim layers so the correct bracket-based quantity can be priced.");
  if ((yes(c.light_guard_rails) || yes(c.basic_light_guard) || c.light_guard && !["none","no"].includes(normalizeIdentity(c.light_guard))) && !h.guardSelected) add("legacy_guard",45,"Reconfirm the Light Guard and its finish before repricing.");
  if (yes(c.side_mount_bracket) && !h.sideKit) add("legacy_side_mount",6,"Reconfirm the side-mount support kit before repricing.");
  if (yes(c.magnetic_hold_down) && !h.magnetic) add("legacy_magnet",45,"Reconfirm the magnetic hold-down selection before repricing.");
  return issues;
}
