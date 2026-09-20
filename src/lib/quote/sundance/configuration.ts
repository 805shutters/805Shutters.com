import { sundanceCellularColors, sundanceCellularColorMatchesContext } from "./cellular-assortment";
import { SUNDANCE_DRAPERY_TRACK_ID } from "./drapery-track";

export function hasSundanceConfiguration(productId: string | null | undefined): boolean {
  return productId === "sundance_cellular" || productId === SUNDANCE_DRAPERY_TRACK_ID
    || ["sundance_vertical_essence", "sundance_walden_premier", "sundance_walden_select"].includes(productId ?? "");
}

/** Changing a fabric constraint must remove the old exact route, never retain a hidden color. */
export function sundanceCellularFilterPatch(options: Record<string, unknown>, field: "cell_size" | "light_control", value: string) {
  return {
    ...options,
    [field]: value || null,
    fabric_color_id: null, fabric_color_code: null, fabric_color_name: null,
    fabric_color_collection: null, fabric_color_type: null,
    fabric_program_id: null, catalog_program_id: null, quote_lab_program_id: null,
  };
}

export function sundanceCellularSelectionPatch(options: Record<string, unknown>, colorId: string) {
  const row = sundanceCellularColors.find(candidate => candidate.id === colorId);
  if (!row || !sundanceCellularColorMatchesContext(row, options)) return null;
  return {
    ...options, ...row.automaticDetails,
    fabric_product_id: row.productId, catalog_product_id: row.productId, quote_lab_product_id: row.productId,
    fabric_color_id: row.id, fabric_color_code: row.colorCode, fabric_color_name: row.colorName,
    fabric_color_collection: row.collection, fabric_color_type: row.fabricType,
    fabric_program_id: row.programId, catalog_program_id: row.programId, quote_lab_program_id: row.programId,
  };
}
