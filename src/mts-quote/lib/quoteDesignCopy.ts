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

const COPIED_DESIGN_TRANSIENT_OPTION_KEYS = new Set([
  "authoritative_price_status",
  "authoritative_price_error",
  "authoritative_price_breakdown",
  "authoritative_cost_breakdown",
  "authoritative_once_total",
  "authoritative_v2_snapshot",
  "priced_selection_fingerprint",
  "priced_catalog_version",
  "manual_price_override",
  "sent_price_snapshot",
  "base_price",
  "surcharge_total",
  "pricing_method",
  "pricing_grid_key",
  "pricing_grid_price",
  "pricing_grid_width",
  "pricing_grid_height",
  "pricing_built_in_adjustment",
  "discount_source_price",
  "discount_amount",
  "quote_v2_catalog_version",
  "quote_v2_catalog_as_of",
  "dealer_portal_snapshot",
  "source_revision",
  "source_page",
  "source_sheet",
]);

const COPIED_DESIGN_RELATIONSHIP_KEYS = new Set([
  "side_by_side_match_line_id",
  "side_by_side_reference_line_id",
  "side_by_side_matches",
  "side_by_side_position",
  "side_by_side_wand_orientation",
]);

function isCopiedDesignTransientOption(key: string): boolean {
  return (
    COPIED_DESIGN_TRANSIENT_OPTION_KEYS.has(key) ||
    COPIED_DESIGN_RELATIONSHIP_KEYS.has(key) ||
    key.startsWith("authoritative_") ||
    key.startsWith("priced_") ||
    key.endsWith("_snapshot") ||
    key.endsWith("_fingerprint")
  );
}

export function sanitizeCopiedDesignOptions(
  source: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!source) return {};

  const sanitized = Object.fromEntries(
    Object.entries(structuredClone(source)).filter(
      ([key]) => !isCopiedDesignTransientOption(key)
    )
  );

  if ("side_by_side" in source) sanitized.side_by_side = "No";
  if (source.honeycomb_application === "Side-by-Side") {
    sanitized.honeycomb_application = "Standard";
  }

  return sanitized;
}

export type CopiedDesignBuildOptions = {
  invalidateAuthoritativePrice?: boolean;
};

export function buildCopiedDesignRows(
  sourceDesigns: SalesQuoteDesign[],
  targetLineItemId: string,
  options: CopiedDesignBuildOptions = {}
) {
  const invalidateAuthoritativePrice =
    options.invalidateAuthoritativePrice === true;

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
    unit_price: invalidateAuthoritativePrice ? 0 : sd.unit_price,
    notes: sd.notes,
    options_json: invalidateAuthoritativePrice
      ? sanitizeCopiedDesignOptions(sd.options_json)
      : structuredClone(sd.options_json ?? {}),
  }));
}

export function buildCopiedDesignSet(
  sourceDesigns: SalesQuoteDesign[],
  targetLineItemId: string,
  options: CopiedDesignBuildOptions = {}
) {
  return {
    rows: buildCopiedDesignRows(sourceDesigns, targetLineItemId, options),
    selectedVariant: resolveSelectedQuoteDesign(sourceDesigns)?.variant ?? null,
  };
}

function relationshipLineId(options: Record<string, unknown>): string | null {
  const value =
    options.side_by_side_match_line_id ??
    options.side_by_side_reference_line_id;
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Overwriting one side of a saved relationship must also clear the reciprocal
 * pointer on a line that is not itself being overwritten. Otherwise copying a
 * target leaves a hidden dangling relationship that blocks the whole quote.
 */
export function buildExternalRelationshipCleanupRows(
  designs: SalesQuoteDesign[],
  overwrittenLineItemIds: readonly string[]
) {
  const overwritten = new Set(overwrittenLineItemIds);
  const cleanupRows = new Map<string, ReturnType<typeof buildCopiedDesignRows>[number]>();

  for (const targetDesign of designs) {
    if (!overwritten.has(targetDesign.line_item_id)) continue;
    const targetOptions = targetDesign.options_json ?? {};
    const partnerLineItemId = relationshipLineId(targetOptions);
    if (!partnerLineItemId || overwritten.has(partnerLineItemId)) continue;

    for (const partnerDesign of designs) {
      if (partnerDesign.line_item_id !== partnerLineItemId) continue;
      const partnerOptions = partnerDesign.options_json ?? {};
      if (relationshipLineId(partnerOptions) !== targetDesign.line_item_id) continue;

      const [cleanupRow] = buildCopiedDesignRows(
        [partnerDesign],
        partnerDesign.line_item_id,
        { invalidateAuthoritativePrice: true }
      );
      cleanupRows.set(
        `${partnerDesign.line_item_id}\u0000${partnerDesign.variant}`,
        cleanupRow
      );
    }
  }

  return Array.from(cleanupRows.values());
}
