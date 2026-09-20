import shadeSource from "./shade-fabrics.source.json";
import zebraSource from "./zebra-fabrics.source.json";
const source = {...shadeSource, collections:[...shadeSource.collections,...zebraSource.collections], colors:[...shadeSource.colors,...zebraSource.colors]};
import type { ProductColorOption } from "../product-color-options";

export const sundanceShadeFabricSource = source;
export const sundanceShadeProductIds = [...new Set(source.collections.map(row => row.productId))];
export const sundanceShadeColors: ProductColorOption[] = source.colors.map(row => {
  const collection = source.collections.find(collection => collection.id === row.collectionId)!;
  return {
    id: row.id, productId: row.productId, collection: collection.name,
    publicCollection: collection.name, fabricType: collection.privacyType,
    // These books index collections, not color codes. Retain the exact dealer label.
    colorCode: "", colorName: row.portalLabel, publicColorName: row.portalLabel, frStatus: "", imageUrl: "",
    sourcePage: `${collection.sourceFile}#page=${collection.sourcePage}`, sourcePageModified: null,
    sourceNote: `Exact dealer label mapped to ${collection.name}, source group ${collection.priceGroup}; effective ${collection.effectiveDate}. Complete configuration and account pricing remain manual.`,
    programId: row.programId, selectionMode: "program", requiresProgram: false, available: true,
    automaticDetails: {
      catalog_sundance_shade_collection_id: collection.id, sundance_shade_collection: collection.name,
      light_control: collection.privacyType, catalog_sundance_fabric_width: collection.fabricWidth,
      catalog_sundance_railroad_available: collection.railroaded === null ? "unverified" : String(collection.railroaded),
    },
    searchText: `${row.portalLabel} ${collection.name} ${collection.privacyType}`.toLowerCase(),
  };
});

export function sundanceShadeCollectionPatch(options: Record<string, unknown>, productId: string, id: string): Record<string, unknown> | null {
  const collection = source.collections.find(row => row.id === id && row.productId === productId);
  if (!collection) return null;
  return {...options,
    fabric_product_id: productId, catalog_product_id: productId, quote_lab_product_id: productId,
    catalog_sundance_shade_collection_id: id, sundance_shade_collection: collection.name,
    fabric_color_id: null, fabric_color_code: null, fabric_color_name: null,
    fabric_color_collection: null, fabric_color_type: null,
    fabric_program_id: collection.programId, catalog_program_id: collection.programId, quote_lab_program_id: collection.programId,
    light_control: collection.privacyType, catalog_sundance_fabric_width: collection.fabricWidth,
    catalog_sundance_railroad_available: collection.railroaded === null ? "unverified" : String(collection.railroaded),
  };
}

export function sundanceShadeColorPatch(options: Record<string, unknown>, productId: string, id: string): Record<string, unknown> | null {
  const row = sundanceShadeColors.find(row => row.id === id && row.productId === productId);
  if (!row) return null;
  return {...options,...row.automaticDetails,
    fabric_product_id: productId, catalog_product_id: productId, quote_lab_product_id: productId,
    fabric_color_id: row.id, fabric_color_code: null, fabric_color_name: row.colorName,
    fabric_color_collection: row.collection, fabric_color_type: row.fabricType,
    fabric_program_id: row.programId, catalog_program_id: row.programId, quote_lab_program_id: row.programId,
  };
}
