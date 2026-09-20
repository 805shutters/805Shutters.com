import { getProduct, getProgram } from "./catalog";
export const LOTUS_VERTICAL_VERSION = "lotus-vertical-v1";
type VerticalProfile = { kind: "Complete blind" | "Headrail only" | "Vanes only"; rail: "Steel" | "Aluminum" | null; draw: "One-way" | "Center draw" | null; valance: string | null };
const profiles: Record<string, VerticalProfile> = {
  lotus_cv_steel_complete_custom: { kind: "Complete blind", rail: "Steel", draw: "One-way", valance: "Matching valance" },
  lotus_cvh_steel_headrail_custom: { kind: "Headrail only", rail: "Steel", draw: "One-way", valance: "None" },
  lotus_cvn_aluminum_one_way_custom: { kind: "Complete blind", rail: "Aluminum", draw: "One-way", valance: "Matching valance" },
  lotus_cvno_aluminum_one_way_headrail_custom: { kind: "Headrail only", rail: "Aluminum", draw: "One-way", valance: "None" },
  // The complete custom center-draw grid exists, but its valance inclusion is not documented.
  lotus_cvnc_aluminum_center_draw_custom: { kind: "Complete blind", rail: "Aluminum", draw: "Center draw", valance: null },
  lotus_cvnc_aluminum_center_draw_headrail_custom: { kind: "Headrail only", rail: "Aluminum", draw: "Center draw", valance: "None" },
  lotus_cvv_vertical_vanes_custom: { kind: "Vanes only", rail: null, draw: null, valance: "None" },
};
export function lotusVerticalProfile(programId: string): VerticalProfile | undefined { return profiles[programId]; }
export function lotusVerticalColors(programId: string, width?: number, height?: number): string[] {
  const product = getProduct("lotus_vertical_blinds");
  const program = product && getProgram(product, programId);
  if (!program || !profiles[programId]) return [];
  const grid = program.grid;
  const col = program.priceAxis === "height" ? 0 : typeof width === "number" && width > 0 ? grid.widths.findIndex(x => x >= width) : -1;
  const row = program.priceAxis === "width" ? 0 : typeof height === "number" && height > 0 ? grid.heights.findIndex(x => x >= height) : -1;
  if (col < 0 || row < 0 || grid.costs?.[row]?.[col] == null) return [];
  const codes = grid.skuCodes?.[row]?.[col] ?? [];
  return [...(codes.some(code => code.endsWith("W")) ? ["White"] : []), ...(codes.some(code => code.endsWith("A")) ? ["Alabaster"] : [])];
}
export function lotusVerticalDefaults(programId: string): Record<string, unknown> {
  const profile = profiles[programId];
  return profile ? {
    lotus_vertical_configuration_version: LOTUS_VERTICAL_VERSION,
    lotus_measurement_basis: "exact_finished_size",
    lotus_vertical_kind: profile.kind,
    lotus_vertical_rail: profile.rail,
    lotus_vertical_draw: profile.draw,
    lotus_vertical_stack: profile.draw === "Center draw" ? "Center" : null,
    lotus_vertical_wand_inches: profile.rail ? 30 : null,
    lotus_vertical_wand_color: null,
    lotus_vertical_headrail_color: profile.rail ? "White" : null,
    color: null,
  } : {};
}
