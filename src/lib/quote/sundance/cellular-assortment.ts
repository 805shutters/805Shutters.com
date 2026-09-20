import source from "./cellular-assortment.generated.json";
import type { ProductColorOption } from "../product-color-options";

export const sundanceCellularSource = source;
export const SUNDANCE_CELLULAR_PROGRAMS: Readonly<Record<string, string>> = {
  "1": "sundance_cellular_p7_t1", "2": "sundance_cellular_p8_t1",
  "3": "sundance_cellular_p9_t1", "4": "sundance_cellular_p10_t1",
  "5": "sundance_cellular_p11_t1",
};

/** Exact printed codes include the cell construction; old codes are not unique. */
export const sundanceCellularColors: ProductColorOption[] = source.rows.map(row => ({
  id: `sundance_cellular:${row.code}`, productId: "sundance_cellular",
  collection: `${row.collection} ${row.cellSize}`,
  publicCollection: `${row.collection} ${row.cellSize}`,
  fabricType: row.opacity, colorCode: row.code, colorName: row.colorName,
  publicColorName: row.colorName, frStatus: row.opacity.includes("Fire Retardant") ? "Fire Retardant" : "",
  imageUrl: "", sourcePage: `${source.sourceFile}#page=${row.sourcePage}`,
  sourcePageModified: null,
  sourceNote: `Color index effective ${source.effectiveDate}; price group ${row.priceGroup}. Exact identity appears in the September 20 dealer assortment. Configuration and account pricing require verification.`,
  programId: SUNDANCE_CELLULAR_PROGRAMS[row.priceGroup] ?? null,
  selectionMode: "program", requiresProgram: false, available: true,
  automaticDetails: { cell_size: row.cellSize, light_control: row.opacity.includes("Blackout") ? "Blackout" : "Light Filtering" },
  searchText: `${row.collection} ${row.cellSize} ${row.colorName} ${row.code} ${row.oldCode} ${row.opacity}`.toLowerCase(),
}));

export function sundanceCellularColorMatchesContext(row: ProductColorOption, details: Record<string, unknown>): boolean {
  const size = typeof details.cell_size === "string" ? details.cell_size.trim() : "";
  const opacity = typeof details.light_control === "string" ? details.light_control.trim().toLowerCase() : "";
  if (size && size !== row.automaticDetails.cell_size) return false;
  if (opacity && opacity !== row.automaticDetails.light_control.toLowerCase()) return false;
  return row.productId === "sundance_cellular";
}
