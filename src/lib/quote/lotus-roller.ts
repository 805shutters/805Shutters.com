export const LOTUS_ROLLER_VERSION = "lotus-roller-v1";
export const LOTUS_ROLLER_PROGRAMS = ["lotus_rs_1pct_custom", "lotus_rs_blackout_unpriced"] as const;
export function lotusRollerOpacity(programId: string): string | null {
  return programId === LOTUS_ROLLER_PROGRAMS[0] ? "1%" : programId === LOTUS_ROLLER_PROGRAMS[1] ? "Blackout" : null;
}
export function lotusRollerMinimumDepth(valance: string, fit: string): number | null {
  if (!["Smooth valance", "None"].includes(valance) || !["Semi-inside", "Flush"].includes(fit)) return null;
  return valance === "Smooth valance" ? (fit === "Flush" ? 3.9375 : 2) : (fit === "Flush" ? 2.75 : 0.75);
}
