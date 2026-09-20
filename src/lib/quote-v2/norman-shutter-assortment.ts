import { normanShutterColor, normanShutterLouvers, normanShutterProgram, normanShutterHinges, normanShutterTilts, normanShutterFrame, normanShutterMounts, NORMAN_SHUTTER_FRAME_SOURCE } from "@/lib/quote/norman-shutter-assortment";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

export function validateNormanShutterAssortment(s: SelectionContext): ValidationIssue[] {
  if (s.productId !== "norman_shutters" || s.catalogAsOf < "2026-09-19") return [];
  const p = normanShutterProgram(s.programId);
  if (!p) return []; // Unknown program is rejected by the engine's catalog validation.
  const issues: ValidationIssue[] = [];
  const add = (id: string, explanation: string, pages: readonly number[] = p.pages) => issues.push({ severity: "hard_block", ruleId: `norman.shutter.assortment.${id}`, source: sourceProvenance(p.sourceId, { pages }), selectedValues: { programId: s.programId, color: s.configuration.color ?? null, louver_size: s.configuration.louver_size ?? null }, explanation });
  const color = normanShutterColor(p.id, s.configuration.color ?? s.configuration.fabric_color_code);
  if (!color) add("color", "Choose a documented finish for the selected Norman shutter program.");
  if (color && s.configuration.fabric_color_code && normanShutterColor(p.id, s.configuration.fabric_color_code)?.code !== color.code) add("color_identity", "The saved finish code and displayed finish do not agree. Reselect the Norman finish.");
  if (!normanShutterLouvers(p.id).includes(String(s.configuration.louver_size) as never)) add("louver", p.id === "woodlore_aquashield" ? "Woodlore Plus with AquaShield does not offer 1⅞-inch louvers. Choose 2½, 3, 3½ or 4½ inches." : "Choose a documented Norman louver size.");
  const hardwarePages = p.id === "woodlore" ? [39] : p.id.startsWith("woodlore_") ? [46] : [40];
  if (s.configuration.hinge_color && !normanShutterHinges(p.id, normanShutterFrame(p.id, s.configuration.frame_type)?.label ?? s.configuration.frame_type).includes(String(s.configuration.hinge_color))) add("hinge", p.id === "woodlore_aquashield" ? "AquaShield requires stainless-steel hinges." : "This hinge finish is unavailable for the selected Norman frame or direct-mount hinge.", hardwarePages);
  if (s.configuration.tilt_type && !normanShutterTilts(p.id).includes(String(s.configuration.tilt_type))) add("tilt", p.id === "woodlore_aquashield" ? "AquaShield does not offer standard or offset tilt rods. Choose Invisible Tilt." : "Choose a documented Norman tilt system.", p.id.startsWith("woodlore_") ? [40, 41] : p.pages);
  if (s.configuration.frame_type && !normanShutterFrame(p.id, s.configuration.frame_type)) issues.push({
    severity: "hard_block", ruleId: "norman.shutter.assortment.frame",
    source: sourceProvenance(NORMAN_SHUTTER_FRAME_SOURCE),
    selectedValues: { programId: p.id, frame_type: s.configuration.frame_type },
    explanation: "This frame is not offered for the selected Norman shutter program. Reselect a compatible frame.",
  });
  const mount = String(s.configuration.mount_type ?? "");
  const mountLabel = /inside|^im$|^i$/i.test(mount) ? "Inside Mount" : /outside|^om$|^o$/i.test(mount) ? "Outside Mount" : null;
  if (mountLabel && !normanShutterMounts(p.id, s.configuration.frame_type).includes(mountLabel)) add("frame_mount", "The selected Norman frame does not offer this mount type. Reselect the frame or mount.", p.id === "woodlore" ? [16,17,18,19,20] : p.id.startsWith("woodlore_") ? [20,21,22,23,24] : p.id === "brightwood" ? [17,18,19,20,21] : [18,19,20,21,22]);
  // Premium finishes remain selectable, with an explicit unresolved price exception.
  if (color?.premium) add("premium_price", "This Normandy premium finish is documented, but its current account surcharge has not been verified.");
  return issues;
}
