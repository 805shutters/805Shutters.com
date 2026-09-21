/** Regular hinged shutter construction, current full binders section c/d.
 * Panel dimensions are finished panel dimensions, never opening/grid dimensions. */
export const NORMAN_STILE_PROFILES = ["Beaded", "Chamfer"] as const;
export const NORMAN_PANEL_CLOSURES = ["Right Over Left", "Left Over Right"] as const;
export function normanRegularPanelMaxWidth(programId: string, louver: unknown, panelConfig: unknown) {
  const config = String(panelConfig ?? "").replace(/\s+/g, "").toUpperCase();
  const wood = ["brightwood", "normandy_painted", "normandy_stained"].includes(programId);
  if (["LL", "RR", "LLRR"].includes(config)) return wood ? 26 : 24;
  if (louver === '1 7/8"') return wood ? 30 : 24;
  if (louver === '2 1/2"') return programId === "woodlore" ? 30 : programId === "woodlore_aquashield" ? 31 : 36;
  if (louver === '3"') return programId === "woodlore_aquashield" ? 31 : 36;
  return wood ? 42 : 36;
}
export function normanRegularPanelCount(value: unknown): number | null {
  const config = String(value ?? "").replace(/\s+/g, "").toUpperCase();
  return ["L", "R", "LR", "LL", "RR", "LLR", "LRR", "LLRR"].includes(config) ? config.length : null;
}
export function normanStileWidths(programId: string, widestPanel: unknown, application?: string) {
  if (programId === "woodlore_aquashield") return ['2"'];
  if (application === "bifold_180") return ['2"', '2 1/4"'];
  const width = Number(widestPanel);
  return [...(width >= 6 && width <= 12 ? ['1 5/8"'] : []), '2"', '2 1/4"'];
}
export function normanStileJoins(panelConfig: unknown, widestPanel: unknown, application?: string) {
  if (application === "bifold_180") return ["Butt", "Rabbet"];
  const count = normanRegularPanelCount(panelConfig);
  if (count !== null && count >= 2) return ["Rabbet", "Astragal"];
  if (count === 1) {
    const width = Number(widestPanel);
    if (width >= 9) return ["Butt"];
    // Narrow single-panel join depends on hang-strip placement as well as width.
    return ["Butt", "Rabbet"];
  }
  return ["Butt", "Rabbet", "Astragal"];
}
export function normanConstructionPages(programId: string) {
  return programId === "woodlore" ? [11, 12, 13, 14, 15] : programId.startsWith("woodlore_") ? [14, 15, 16, 17, 18, 19] : programId === "brightwood" ? [12, 13, 14, 15, 16] : [13, 14, 15, 16, 17];
}
