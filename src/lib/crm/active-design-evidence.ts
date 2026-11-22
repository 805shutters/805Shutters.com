// Active cards need selected product identity, not fabric/pricing/geometry grids.
export const ACTIVE_DESIGN_COLUMNS = "id,created_at,line_item_id,product_id,sort_order,price_source:price_breakdown->source,legacy_product_type:price_breakdown->productType";
export function activeDesignEvidence(row: Record<string, unknown>) {
  const { price_source, legacy_product_type, ...identity } = row;
  return { ...identity, price_breakdown: { source: price_source, productType: legacy_product_type } };
}
