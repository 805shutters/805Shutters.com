import source from "./vertical-assortment.source.json";
import type { ProductColorOption } from "../product-color-options";

export const sundanceVerticalSource = source;
export const sundanceVerticalColors: ProductColorOption[] = source.rows.map(row => ({
  id: row.id, productId: "sundance_vertical_essence", collection: row.pattern,
  publicCollection: row.pattern, fabricType: "Custom vertical", colorCode: "", colorName: row.color,
  publicColorName: row.color, frStatus: "", imageUrl: "", sourcePage: `${row.sourceFile}#page=${row.sourcePage}`,
  sourcePageModified: null, sourceNote: `Effective ${row.effectiveDate}; ${row.portalStatus}; group ${row.priceGroup}.`,
  programId: row.programId, selectionMode: "program", requiresProgram: false, available: true,
  automaticDetails: {sundance_vertical_type:"Custom",catalog_sundance_portal_status:row.portalStatus},
  searchText: `${row.pattern} ${row.color}`.toLowerCase(),
}));

export function sundanceVerticalColorPatch(options: Record<string, unknown>, id: string): Record<string, unknown> | null {
  const row = sundanceVerticalColors.find(row => row.id === id);
  if (!row || options.sundance_vertical_type === "Stock") return null;
  return {...options,...row.automaticDetails,
    fabric_product_id:row.productId,catalog_product_id:row.productId,quote_lab_product_id:row.productId,
    fabric_color_id:row.id,fabric_color_code:null,fabric_color_name:row.colorName,
    fabric_color_collection:row.collection,fabric_color_type:row.fabricType,
    fabric_program_id:row.programId,catalog_program_id:row.programId,quote_lab_program_id:row.programId,
    sundance_vertical_valance:null,catalog_sundance_vertical_valance_id:null,
  };
}

export function lookupSundanceVerticalValanceSource(optionId: string, width: number) {
  if (!Number.isFinite(width) || width <= 0) return null;
  const option = source.valances.find(row => row.id === optionId);
  if (!option) return null;
  const index = option.widths.findIndex(value => value >= width);
  if (index < 0) return null;
  return {sourceRetail:option.sourceRetailPrices[index],gridWidth:option.widths[index],sourcePage:option.sourcePage,customerPriceEligible:false as const};
}

export function sundanceVerticalValancePatch(options: Record<string, unknown>, id: string): Record<string, unknown> | null {
  const option = source.valances.find(row => row.id === id && row.programId === options.catalog_program_id);
  if (id && !option) return null;
  return {...options, sundance_vertical_valance:option?.name ?? "None", catalog_sundance_vertical_valance_id:option?.id ?? null};
}
