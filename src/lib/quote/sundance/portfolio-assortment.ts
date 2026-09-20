import source from "./portfolio-assortment.source.json";
import type { ProductColorOption } from "../product-color-options";

export const sundancePortfolioSource = source;
export const sundancePortfolioStyles = ["Flat", "Knife Pleat", "Hobbled", "Front Slat"] as const;
export const sundancePortfolioColors: ProductColorOption[] = source.rows.flatMap(row => row.styles.map(style => ({
  id: `sundance_portfolio_roman:${row.code}:${style}`, productId: "sundance_portfolio_roman",
  collection: row.pattern, publicCollection: row.pattern, fabricType: style,
  colorCode: row.code, colorName: row.color, publicColorName: row.color, frStatus: "", imageUrl: "",
  sourcePage: `${row.sourceFile}#page=${row.sourcePage}`, sourcePageModified: null,
  sourceNote: `${source.edition}; ${row.portalStatus}; exact style-specific group ${row.priceGroup}. Account pricing remains manual.`,
  programId: ["Flat", "Knife Pleat"].includes(style) ? row.programFlatKnife : row.programHobbledFront,
  selectionMode: "program", requiresProgram: false, available: true,
  automaticDetails: { roman_style: style, catalog_sundance_portal_status: row.portalStatus,
    catalog_sundance_td_available: String(row.tdbuAvailable), catalog_sundance_cord_color: row.cordLoopColor },
  searchText: `${row.code} ${row.pattern} ${row.color} ${style}`.toLowerCase(),
})));

export function sundancePortfolioColorMatchesContext(row: ProductColorOption, options: Record<string, unknown>): boolean {
  return row.productId === "sundance_portfolio_roman" && (!options.roman_style || row.automaticDetails.roman_style === options.roman_style);
}

export function sundancePortfolioColorPatch(options: Record<string, unknown>, id: string): Record<string, unknown> | null {
  const row = sundancePortfolioColors.find(row => row.id === id && sundancePortfolioColorMatchesContext(row, options));
  if (!row) return null;
  return {...options, ...row.automaticDetails,
    fabric_product_id: row.productId, catalog_product_id: row.productId, quote_lab_product_id: row.productId,
    fabric_color_id: row.id, fabric_color_code: row.colorCode, fabric_color_name: row.colorName,
    fabric_color_collection: row.collection, fabric_color_type: row.fabricType,
    fabric_program_id: row.programId, catalog_program_id: row.programId, quote_lab_program_id: row.programId,
  };
}

export function sundancePortfolioStylePatch(options: Record<string, unknown>, style: string): Record<string, unknown> {
  return {...options, roman_style: style || null, fabric_color_id:null, fabric_color_code:null,
    fabric_color_name:null, fabric_color_collection:null, fabric_color_type:null,
    fabric_program_id:null, catalog_program_id:null, quote_lab_program_id:null,
    catalog_sundance_portal_status:null, catalog_sundance_td_available:null, catalog_sundance_cord_color:null};
}
