import source from "./horizontal-assortment.source.json";
import type { ProductColorOption } from "../product-color-options";

export const sundanceHorizontalSource = source;
export const sundanceHorizontalProductIds = [...new Set(source.rows.map(row => row.productId))];
export const sundanceHorizontalColors: ProductColorOption[] = source.rows.map(row => ({
  id: row.id, productId: row.productId, collection: `${row.slatSize}-inch ${row.variant || "horizontal blind"}`,
  publicCollection: `${row.slatSize}-inch blind`, fabricType: row.variant || "Horizontal blind",
  colorCode: row.code, colorName: row.name, publicColorName: row.name, frStatus: "", imageUrl: "",
  sourcePage: `${row.sourceFile}#page=${row.sourcePage}`, sourcePageModified: null,
  sourceNote: `Effective ${row.effectiveDate}; ${row.portalStatus}. Full configuration and account prices remain manual.`,
  programId: row.programId, selectionMode: "program", requiresProgram: false,
  available: row.portalStatus !== "source_only_exception",
  automaticDetails: {
    slat_size: row.slatSize, lift_system: "Cordless", sundance_slat_variant: row.variant,
    catalog_sundance_color_surcharge_percent: String(row.retailSurchargePercent),
  },
  searchText: `${row.code} ${row.name} ${row.slatSize} ${row.variant}`.toLowerCase(),
}));

export function sundanceHorizontalColorPatch(options: Record<string, unknown>, productId: string, id: string): Record<string, unknown> | null {
  const row = sundanceHorizontalColors.find(row => row.id === id && row.productId === productId && row.available);
  if (!row) return null;
  return {...options, ...row.automaticDetails,
    fabric_product_id: productId, catalog_product_id: productId, quote_lab_product_id: productId,
    fabric_color_id: row.id, fabric_color_code: row.colorCode, fabric_color_name: row.colorName,
    fabric_color_collection: row.collection, fabric_color_type: row.fabricType,
    fabric_program_id: row.programId, catalog_program_id: row.programId, quote_lab_program_id: row.programId,
    sundance_blind_valance: null,
  };
}

export function sundanceHorizontalValances(id: unknown): string[] {
  const row = source.rows.find(row => row.id === id);
  if (!row) return [];
  if (row.productId.includes("advantage_ii") || row.productId.includes("premium_ii")) {
    return row.flatValanceAvailable ? ["Crown", "Flat"] : ["Crown"];
  }
  if (row.productId === "sundance_aluminum_2") return ["2-Slat Standard Valance"];
  return [];
}
