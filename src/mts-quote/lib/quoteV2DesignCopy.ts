import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { buildCopiedDesignSet, buildExternalRelationshipCleanupRows, getMatchingCatalogCopyTargetIds } from "./quoteDesignCopy";
import { quoteV2DesignPatch, type QuoteV2StructureOperation } from "./quoteV2ServerClient";

/** Copy editable configuration without replacing IDs referenced by immutable price history. */
export function buildNativeDesignCopyOperations(
  sourceItem: SalesQuoteLineItem,
  lineItems: SalesQuoteLineItem[],
  designs: SalesQuoteDesign[],
  targetIds: readonly string[],
): QuoteV2StructureOperation[] {
  const sourceDesigns = designs.filter(row => row.line_item_id === sourceItem.id);
  const variants = new Set(sourceDesigns.map(row => row.variant));
  if (!sourceDesigns.length || variants.size !== sourceDesigns.length) throw new Error("The source design variants are missing or ambiguous.");
  const targets = [...new Set(targetIds)];
  const matching = new Set(getMatchingCatalogCopyTargetIds(sourceItem, lineItems, designs, targets));
  if (!targets.length || targets.some(id => !matching.has(id))) throw new Error("Copy requires matching manufacturer and product on every target line.");

  // Validate the entire batch before returning any mutation. Extra variants cannot
  // be removed safely until the historical design archive contract is installed.
  for (const id of targets) {
    const target = designs.filter(row => row.line_item_id === id);
    if (target.length !== variants.size || new Set(target.map(row => row.variant)).size !== variants.size || target.some(row => !variants.has(row.variant))) {
      throw new Error("Copy requires the same saved design variants on every target. Different variant sets cannot be replaced until historical design archiving is available.");
    }
  }

  const operations: QuoteV2StructureOperation[] = buildExternalRelationshipCleanupRows(designs, targets).map(row => {
    const existing = designs.find(design => design.line_item_id === row.line_item_id && design.variant === row.variant)!;
    return { type: "design.upsert", lineItemId: row.line_item_id, designId: existing.id, variant: row.variant, selectDesign: false, patch: quoteV2DesignPatch(row) };
  });
  for (const lineItemId of targets) {
    const copied = buildCopiedDesignSet(sourceDesigns, lineItemId, { invalidateAuthoritativePrice: true });
    for (const row of copied.rows) {
      const existing = designs.find(design => design.line_item_id === lineItemId && design.variant === row.variant)!;
      operations.push({ type: "design.upsert", lineItemId, designId: existing.id, variant: row.variant, selectDesign: row.variant === copied.selectedVariant, patch: quoteV2DesignPatch(row) });
    }
  }
  return operations;
}
