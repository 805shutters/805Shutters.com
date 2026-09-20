import source from "./exterior-zip.source.json";
import type { ProductColorOption } from "../product-color-options";
export const sundanceExteriorZipSource = source;
export const sundanceExteriorZipColors: ProductColorOption[] = source.rows.map(row => ({
  id:row.id,productId:"sundance_exterior_zip",collection:row.priceClass,publicCollection:row.priceClass,
  fabricType:row.openness,colorCode:"",colorName:row.portalLabel,publicColorName:row.portalLabel,
  frStatus:"",imageUrl:"",sourcePage:`${row.sourceFile}#page=1`,sourcePageModified:null,
  sourceNote:"August 2025 source net square-foot rate excludes motor; current account applicability unverified.",
  programId:null,selectionMode:"fabric",requiresProgram:false,available:true,
  automaticDetails:{sundance_exterior_price_class:row.priceClass,sundance_exterior_openness:row.openness,
    catalog_sundance_price_basis:"net_per_square_foot_excluding_motor"},
  searchText:row.portalLabel.toLowerCase(),
}));
export function sundanceExteriorZipColorPatch(options:Record<string,unknown>,id:string) {
  const row=sundanceExteriorZipColors.find(row=>row.id===id);
  if(!row)return null;
  return {...options,...row.automaticDetails,fabric_product_id:row.productId,catalog_product_id:row.productId,quote_lab_product_id:row.productId,
    fabric_color_id:row.id,fabric_color_code:null,fabric_color_name:row.colorName,fabric_color_collection:row.collection,fabric_color_type:row.fabricType,
    fabric_program_id:null,catalog_program_id:null,quote_lab_program_id:null};
}
/** Rate evidence only: rounding/minimums, motor and account applicability are unresolved. */
export function getSundanceExteriorZipSourceRate(id:string) {
 const row=source.rows.find(row=>row.id===id);
 return row ? {sourceNetPerSquareFoot:row.sourceNetPerSquareFoot,priceBasis:source.priceBasis,customerPriceEligible:false as const} : null;
}
