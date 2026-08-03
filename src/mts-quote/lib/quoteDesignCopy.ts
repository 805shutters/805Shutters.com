import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { resolveSelectedQuoteDesign } from "@/lib/quote-v2/selected-design";

export const COPY_EXCLUDED_LINE_ITEM_FIELDS = [
  "room_name",
  "width_whole",
  "width_fraction",
  "height_whole",
  "height_fraction",
] as const;

function normalizeProductType(productType: string | null | undefined) {
  return (productType ?? "").trim().toLowerCase();
}

export function lineItemsHaveMatchingProductType(
  sourceItem: Pick<SalesQuoteLineItem, "product_type">,
  targetItem: Pick<SalesQuoteLineItem, "product_type">
) {
  const sourceProductType = normalizeProductType(sourceItem.product_type);
  return (
    sourceProductType.length > 0 &&
    sourceProductType === normalizeProductType(targetItem.product_type)
  );
}

export function getMatchingCopyTargetIds(
  sourceItem: Pick<SalesQuoteLineItem, "id" | "product_type">,
  lineItems: Pick<SalesQuoteLineItem, "id" | "product_type">[],
  targetIds?: string[]
) {
  const allowedTargets = targetIds ? new Set(targetIds) : null;

  return lineItems
    .filter((item) => {
      if (item.id === sourceItem.id) return false;
      if (allowedTargets && !allowedTargets.has(item.id)) return false;
      return lineItemsHaveMatchingProductType(sourceItem, item);
    })
    .map((item) => item.id);
}

export type QuoteCatalogIdentity = {
  manufacturer: string;
  productId: string;
};

export function catalogIdentityForDesign(
  design: SalesQuoteDesign | null | undefined,
): QuoteCatalogIdentity | null {
  if (!design) return null;
  const options =
    (design.options_json as Record<string, unknown> | null | undefined) ?? {};
  const manufacturer = normalizeProductType(
    design.supplier ??
      (typeof options.catalog_manufacturer === "string"
        ? options.catalog_manufacturer
        : null),
  );
  const rawProductId =
    typeof options.catalog_product_id === "string"
      ? options.catalog_product_id
      : typeof options.quote_lab_product_id === "string"
        ? options.quote_lab_product_id
        : "";
  const productId = normalizeProductType(rawProductId);
  if (!manufacturer || !productId) return null;
  return { manufacturer, productId };
}

export function lineItemsHaveMatchingCatalogIdentity(
  sourceItem: Pick<SalesQuoteLineItem, "id" | "product_type">,
  targetItem: Pick<SalesQuoteLineItem, "id" | "product_type">,
  designs: SalesQuoteDesign[],
) {
  if (!lineItemsHaveMatchingProductType(sourceItem, targetItem)) return false;
  const sourceIdentity = catalogIdentityForDesign(
    resolveSelectedQuoteDesign(
      designs.filter((design) => design.line_item_id === sourceItem.id),
    ),
  );
  const targetIdentity = catalogIdentityForDesign(
    resolveSelectedQuoteDesign(
      designs.filter((design) => design.line_item_id === targetItem.id),
    ),
  );
  return (
    sourceIdentity !== null &&
    targetIdentity !== null &&
    sourceIdentity.manufacturer === targetIdentity.manufacturer &&
    sourceIdentity.productId === targetIdentity.productId
  );
}

export function getMatchingCatalogCopyTargetIds(
  sourceItem: Pick<SalesQuoteLineItem, "id" | "product_type">,
  lineItems: Pick<SalesQuoteLineItem, "id" | "product_type">[],
  designs: SalesQuoteDesign[],
  targetIds?: string[],
) {
  const allowedTargets = targetIds ? new Set(targetIds) : null;
  return lineItems
    .filter((item) => {
      if (item.id === sourceItem.id) return false;
      if (allowedTargets && !allowedTargets.has(item.id)) return false;
      return lineItemsHaveMatchingCatalogIdentity(sourceItem, item, designs);
    })
    .map((item) => item.id);
}

export function buildCopiedLineItemPatch(sourceItem: SalesQuoteLineItem) {
  return {
    product_type: sourceItem.product_type,
  };
}

export function buildCopiedDesignRows(sourceDesigns: SalesQuoteDesign[], targetLineItemId: string) {
  return sourceDesigns.map((sd) => ({
    line_item_id: targetLineItemId,
    variant: sd.variant,
    product_type: sd.product_type,
    supplier: sd.supplier,
    material: sd.material,
    louver_size: sd.louver_size,
    tilt_type: sd.tilt_type,
    hinge_color: sd.hinge_color,
    panel_config: sd.panel_config,
    mount_type: sd.mount_type,
    shade_type: sd.shade_type,
    lift_system: sd.lift_system,
    valance: sd.valance,
    fabric: sd.fabric,
    motor_type: sd.motor_type,
    remote_type: sd.remote_type,
    hard_surface_install: sd.hard_surface_install,
    ladder_over_15ft: sd.ladder_over_15ft,
    requires_takedown: sd.requires_takedown,
    unit_price: sd.unit_price,
    notes: sd.notes,
    options_json: sd.options_json,
  }));
}

type CopiedDesignBuildOptions = {
  invalidateAuthoritativePrice?: boolean;
};

// Compatibility-only entry point for the isolated Quote Lab. The production
// July 10 builder continues to call buildCopiedDesignRows above unchanged.
export function buildCopiedDesignSet(
  sourceDesigns: SalesQuoteDesign[],
  targetLineItemId: string,
  options: CopiedDesignBuildOptions = {}
) {
  const rows = buildCopiedDesignRows(sourceDesigns, targetLineItemId).map((row) => ({
    ...row,
    unit_price: options.invalidateAuthoritativePrice ? 0 : row.unit_price,
  }));
  return {
    rows,
    selectedVariant: resolveSelectedQuoteDesign(sourceDesigns)?.variant ?? null,
  };
}
