import source from "./sheerview-assortment.source.json";
import type { ProductColorOption } from "../product-color-options";

export const sundanceSheerviewSource = source;
export const sundanceSheerviewColors: ProductColorOption[] = source.rows.map(row => ({
  id: row.id, productId: "sundance_sheerview", collection: `${row.vaneSize}-inch ${row.collection}`,
  publicCollection: `${row.vaneSize}-inch sheer shade`, fabricType: row.privacy,
  colorCode: row.code, colorName: row.name, publicColorName: row.name, frStatus: "", imageUrl: "",
  sourcePage: `${row.sourceFile}#page=${row.sourcePage}`, sourcePageModified: null,
  sourceNote: `${source.edition}; ${row.portalStatus}. ${source.effectiveDateEvidence}`,
  programId: row.programId, selectionMode: "program", requiresProgram: false, available: true,
  automaticDetails: { vane_size: row.vaneSize, light_control: row.privacy,
    catalog_sundance_portal_status: row.portalStatus },
  searchText: `${row.code} ${row.name} ${row.vaneSize} ${row.privacy} ${row.collection}`.toLowerCase(),
}));

export function sundanceSheerviewColorMatchesContext(row: ProductColorOption, options: Record<string, unknown>): boolean {
  return row.productId === "sundance_sheerview" &&
    (!options.vane_size || row.automaticDetails.vane_size === options.vane_size) &&
    (!options.light_control || row.automaticDetails.light_control === options.light_control);
}

export function sundanceSheerviewColorPatch(options: Record<string, unknown>, id: string): Record<string, unknown> | null {
  const row = sundanceSheerviewColors.find(row => row.id === id);
  if (!row) return null;
  return {...options,...row.automaticDetails,
    fabric_product_id: row.productId, catalog_product_id: row.productId, quote_lab_product_id: row.productId,
    fabric_color_id: row.id, fabric_color_code: row.colorCode, fabric_color_name: row.colorName,
    fabric_color_collection: row.collection, fabric_color_type: row.fabricType,
    fabric_program_id: row.programId, catalog_program_id: row.programId, quote_lab_program_id: row.programId,
  };
}

export function sundanceSheerviewFilterPatch(options: Record<string, unknown>, field: "vane_size" | "light_control", value: string): Record<string, unknown> {
  return {...options,[field]:value || null, fabric_color_id:null,fabric_color_code:null,fabric_color_name:null,
    fabric_color_collection:null,fabric_color_type:null,fabric_program_id:null,catalog_program_id:null,
    quote_lab_program_id:null,catalog_sundance_portal_status:null};
}
