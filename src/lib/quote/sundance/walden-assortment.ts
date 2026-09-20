import source from "./walden-assortment.source.json";
import type { ProductColorOption } from "../product-color-options";
export const sundanceWaldenSource = source;
export const sundanceWaldenColors: ProductColorOption[] = source.rows.map(row => ({
  id: row.id, productId: row.productId,
  collection: row.productId.endsWith('premier') ? 'Walden Premier' : 'Walden Select',
  publicCollection: 'Woven wood', fabricType: 'Woven wood', colorCode: row.code,
  colorName: row.name, publicColorName: row.name, frStatus: '', imageUrl: '',
  sourcePage: `${row.sourceFile}#page=${row.sourcePage}`, sourcePageModified: null,
  sourceNote: `Printed group ${row.priceGroup}; dealer roster ${row.portalStatus}. Complete configuration and account pricing remain manual.`,
  programId: row.programId, selectionMode: 'program', requiresProgram: false,
  available: row.portalStatus !== 'source_only_exception',
  automaticDetails: {
    catalog_walden_edge_binding_required: String(row.edgeBindingRequired),
    catalog_walden_cordless_tdbu_available: String(row.cordlessTdBu),
    catalog_walden_motor_max_sqft_without_liner: String(row.motorMaxSqftWithoutLiner ?? ''),
    catalog_walden_motor_max_sqft_with_liner: String(row.motorMaxSqftWithLiner ?? ''),
  },
  searchText: `${row.code} ${row.name} ${row.priceGroup}`.toLowerCase(),
}));

export function sundanceWaldenFabricPatch(options: Record<string, unknown>, productId: string, id: string): Record<string, unknown> | null {
  const row = sundanceWaldenColors.find(row => row.id === id && row.productId === productId && row.available);
  if (!row) return null;
  return {...options,...row.automaticDetails,
    fabric_product_id: row.productId, catalog_product_id: row.productId, quote_lab_product_id: row.productId,
    fabric_color_id: row.id, fabric_color_code: row.colorCode, fabric_color_name: row.colorName,
    fabric_color_collection: row.collection, fabric_color_type: row.fabricType,
    fabric_program_id: row.programId, catalog_program_id: row.programId, quote_lab_program_id: row.programId,
    catalog_sundance_liner_grid_id: null, catalog_sundance_edge_binding_grid_id: null,
    walden_liner: null, walden_liner_color: null, walden_movable_liner: null, walden_edge_binding: null,
  };
}
