import { sundanceOptionGrids } from "./option-grids";

export const SUNDANCE_STOCK_VERTICAL_PROGRAM = "sundance_vertical_essence_p12_t1";
export const sundanceWaldenProducts = ["sundance_walden_premier", "sundance_walden_select"];
export type SundanceWaldenOptionKind = "liner" | "edge_binding";

export function sundanceWaldenChoices(productId: string, kind: SundanceWaldenOptionKind) {
  return sundanceOptionGrids.filter(row => row.productId === productId && row.kind === kind);
}

export function sundanceWaldenSelectionPatch(options: Record<string, unknown>, productId: string, kind: SundanceWaldenOptionKind, id: string): Record<string, unknown> | null {
  const option = sundanceWaldenChoices(productId, kind).find(row => row.id === id);
  if (!sundanceWaldenProducts.includes(productId) || (id && !option)) return null;
  return {...options,
    [`catalog_sundance_${kind}_grid_id`]: option?.id ?? null,
    [`walden_${kind}`]: option?.name ?? "None",
    ...(kind === "liner" ? {walden_liner_color: null, walden_movable_liner: null} : {}),
  };
}

export function sundanceWaldenLinerColors(productId: string, optionId: unknown): string[] {
  const option = sundanceWaldenChoices(productId, "liner").find(row => row.id === optionId);
  if (!option) return [];
  if (productId === "sundance_walden_premier") return option.sourceTable === 1
    ? ["Beige", "Black", "Chocolate", "Gray", "White"] : ["Beige", "Chocolate", "White"];
  return option.sourceTable === 1 ? ["Beige", "Black", "Bright White", "Ivory", "Gray", "Soft White"] : ["Beige", "White", "Espresso"];
}

export function sundanceStockVerticalPatch(options: Record<string, unknown>, enabled: boolean) {
  return {...options, sundance_vertical_type: enabled ? "Stock" : null,
    catalog_program_id: enabled ? SUNDANCE_STOCK_VERTICAL_PROGRAM : null,
    quote_lab_program_id: enabled ? SUNDANCE_STOCK_VERTICAL_PROGRAM : null,
    fabric_program_id: enabled ? SUNDANCE_STOCK_VERTICAL_PROGRAM : null,
    fabric_color_id: null, fabric_color_code: null, fabric_color_name: null, fabric_color_collection: null, fabric_color_type: null,
    catalog_sundance_portal_status: null, sundance_vertical_valance: null, catalog_sundance_vertical_valance_id: null,
    stock_vertical_color: null, stock_vertical_valance: null,
    stock_vertical_width_cut_down: null, stock_vertical_height_cut_down: null,
    stock_vertical_before_width: null, stock_vertical_before_height: null,
    stock_vertical_wand_side: null, stock_vertical_draw_side: null, stock_vertical_fulfillment: null,
    stock_vertical_control: enabled ? "Wand" : null,
    stock_vertical_draw: enabled ? "One-way" : null,
    stock_vertical_headrail: enabled ? "Soft White extruded aluminum reversible headrail" : null,
  };
}
