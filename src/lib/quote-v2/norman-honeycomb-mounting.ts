import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { normalizeHoneycombCellSize, normalizeHoneycombSystem } from "./honeycomb-matrix";
import { normalizeIdentity } from "./catalog";
import { resolveNormanShadeMotorization } from "./norman-shade-motorization";
import { sourceProvenance } from "./source-manifest";

export const HONEYCOMB_MOUNT_FITS = ["Flush Inside", "Semi-Inside"] as const;
const manualSource = "norman-honeycomb-guide-2026-07" as const;
const motorSource = "norman-motorization-guide-2026-09-16" as const;
const yes = (v: unknown) => ["yes", "true"].includes(normalizeIdentity(v));
const finite = (v: unknown) => v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : null;

/** Exact printed mounting tables; null is an unavailable or unresolved table cell. */
export function honeycombMounting(s: SelectionContext) {
  if (!["honeycomb", "vertical_honeycomb"].includes(s.productId) || !/norman-(?:vertical-)?honeycomb-mounting-2026-09-20-r[123]$/.test(s.catalogVersion)) return null;
  const c = s.configuration;
  const inside = normalizeIdentity(c.mount_type) === "inside mount";
  if (!inside) return null;
  const system = normalizeHoneycombSystem(s), cell = normalizeHoneycombCellSize(String(c.cell_size ?? ""));
  const index = cell === "3_8_single" ? 0 : cell === "9_16_single" ? 1 : ["3_4_single", "1_2_double"].includes(cell ?? "") ? 2 : ["3_4_double", "1_1_4_single"].includes(cell ?? "") ? 3 : -1;
  const large = index === 3, guard = yes(c.honeycomb_light_guard);
  const fit = String(c.honeycomb_mount_fit ?? ""), depth = finite(c.honeycomb_recess_depth_inches);
  const holder = yes(c.honeycomb_semi_inside_tensioner_holder);
  let flush: number | null = null, semi: number | null = null;
  let sourceId: typeof manualSource | typeof motorSource = manualSource, page = 10, unresolved: string | null = null;
  const at = (values: readonly (number | null)[]) => values[index] ?? null;
  if (system === "smartrise_cordless") { flush = at(guard ? [1.8125,1.8125,1.9375,2.75] : [1.75,1.75,1.9375,2.6875]); semi = guard ? null : large ? 1.4375 : 1.25; }
  else if (["cordless_tdbu", "cordless_day_night"].includes(system ?? "")) { flush = at([1.9375,1.9375,1.9375,guard ? 2.75 : 2.6875]); semi = guard ? null : large ? 1.4375 : 1.25; }
  else if (["cord_loop", "cord_loop_td", "cord_loop_day_night", "smartrelease"].includes(system ?? "")) {
    const topDown = ["cord_loop_td", "cord_loop_day_night"].includes(system ?? "");
    flush = holder ? large ? guard ? 3.25 : 3.1875 : guard && !topDown ? 2.75 : 2.8125 : large ? guard ? 2.75 : 2.6875 : 2.3125;
    semi = guard || holder ? null : large ? 1.4375 : 1.25;
  } else if (system?.startsWith("woven_cordless")) { flush = cell === "3_4_single" ? 2.125 : cell === "1_1_4_single" ? 2.6875 : null; semi = cell === "3_4_single" ? 1.3125 : cell === "1_1_4_single" ? 1.5 : null; }
  else if (["smartfit", "smartfit_dual"].includes(system ?? "")) {
    if (c.honeycomb_mounting_plate === "Without Mounting Plate") unresolved = "The mounting-depth table specifies a mounting plate; confirm the depth for installation without one.";
    else flush = at(guard ? [1.3125,1.875,1.875,2.6875] : [1.25,1.875,1.875,2.625]);
  } else if (system === "smartfit_sloped") flush = cell === "3_8_single" ? guard ? 1.4375 : 1.375 : null;
  else if (system === "specialty_shape") flush = at([1.75,2.125,2.625,null]);
  else if (s.productId === "vertical_honeycomb") {
    const validCell = ["3_4_single", "1_1_4_single"].includes(cell ?? "");
    flush = validCell ? 3.0625 : null;
    semi = validCell ? c.vertical_mounting === "Installation Brackets" ? 1.25 : c.vertical_mounting === "Pre-Drilled Headrail" ? 1.5625 : null : null;
    if (fit === "Semi-Inside" && cell === "1_1_4_single" && c.vertical_mounting === "Pre-Drilled Headrail") { semi = null; unresolved = "The large-cell without-bracket Semi-IB cell repeats the ¾-inch label. Confirm its applicability to 1¼-inch Vertical Honeycomb."; }
  } else if (system && /motor|autowand/.test(system)) {
    sourceId = motorSource;
    const power = normalizeIdentity(c.motor_type);
    if (system === "motorized_skylight") { page = 18; flush = ["3_4_single", "1_2_double"].includes(cell ?? "") ? 2.1875 : null; }
    else if (power === "autowand") { page = 82; flush = large ? 3.0625 : 2.625; semi = guard ? null : large ? 1.4375 : 1.25; }
    else if (power.includes("automate")) { page = 69; flush = large ? guard ? 2.75 : 2.6875 : guard ? 2.25 : 2.3125; semi = guard ? null : large ? 1.4375 : 1.25; }
    else if (/norman smart|charging wand|ac adapter|dc low voltage/.test(power)) {
      const motor = resolveNormanShadeMotorization(s);
      const order = c.norman_order_record_v1 as SelectionRecord | undefined;
      const watts = order?.adapterWatts ?? (motor?.ok ? motor.derivedAdapterWattage : undefined);
      const ac = power.includes("ac adapter"), use65 = ac && watts === 65;
      page = use65 ? 17 : 16;
      if (ac && watts == null) unresolved = "Complete the motor configuration so the order-wide 36W or 65W adapter determines mounting depth.";
      const back = c.honeycomb_power_cable_exit === "Back of Headrail";
      flush = large ? guard ? use65 ? 2.8125 : 2.875 : 2.75 : use65 ? back ? 2.5 : 2.3125 : guard ? 2.375 : 2.3125;
      semi = large ? 1.75 : use65 && back ? 1.4375 : 1.25;
      if (guard) semi = null;
    } else unresolved = "Choose the exact motor power source before confirming mounting depth.";
  } else if (system?.includes("frame")) {
    // Framed openings use their separate frame geometry rules, not this headrail table.
    return null;
  } else unresolved = "Select the operating system and cell size before confirming mounting depth.";
  if (index < 0) { flush = null; semi = null; }
  const required = fit === "Flush Inside" ? flush : fit === "Semi-Inside" ? semi : null;
  const issues: ValidationIssue[] = [];
  const add = (id: string, explanation: string) => issues.push({severity:"hard_block",ruleId:`honeycomb.mounting.${id}`,source:sourceProvenance(sourceId,{page}),selectedValues:{...c},explanation});
  if (!HONEYCOMB_MOUNT_FITS.includes(fit as typeof HONEYCOMB_MOUNT_FITS[number])) add("fit", "Select Flush Inside or Semi-Inside mounting.");
  else if (unresolved) add("source_scope", unresolved);
  else if (required == null) add("unavailable", "The selected cell, operating system and accessories do not offer this inside-mount arrangement.");
  if (depth == null || depth <= 0) add("depth_required", "Enter the measured unobstructed recess depth in inches.");
  else if (required != null && depth < required) add("depth", `This mounting arrangement requires at least ${required} inches of unobstructed recess depth.`);
  if (holder && !["cord_loop", "cord_loop_td", "cord_loop_day_night", "smartrelease"].includes(system ?? "")) add("holder", "The Semi-IM cord-tensioner holder applies only to Cord Loop and SmartRelease systems.");
  return {issues, record:{version:1,sourceId,sourcePage:page,fit,measuredDepth:depth,requiredDepth:required,flushDepth:flush,semiInsideDepth:semi,lightGuard:guard,semiInsideCordTensionerHolder:holder,sourceException:unresolved,bracketRunningChange:sourceId === manualSource ? "The guide notes that new bracket depths can vary slightly; one order uses one bracket style." : null}};
}
export const validateHoneycombMounting = (s: SelectionContext) => honeycombMounting(s)?.issues ?? [];
