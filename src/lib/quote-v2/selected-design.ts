import type { SalesQuoteDesign } from "@mts/types/quote";

export const QUOTE_V2_SELECTED_DESIGN_MARKER = "__quote_v2_selected_design";

export type SelectionMarkedQuoteDesign = SalesQuoteDesign & {
  [QUOTE_V2_SELECTED_DESIGN_MARKER]?: boolean;
};

export type PersistedDesignSelectionLine = {
  id: string;
  selected_design_id?: string | null;
};

/** Project each line's persisted design choice onto the rows consumed by V4. */
export function projectPersistedDesignSelections<T extends SalesQuoteDesign>(
  designs: readonly T[],
  lines: readonly PersistedDesignSelectionLine[],
): Array<T & SelectionMarkedQuoteDesign> {
  const selectedByLine = new Map(
    lines.map((line) => [line.id, line.selected_design_id ?? null]),
  );

  return designs.map((design) => ({
    ...design,
    [QUOTE_V2_SELECTED_DESIGN_MARKER]:
      selectedByLine.get(design.line_item_id) === design.id,
  }));
}

export function hasCompletePersistedDesignSelections(
  lines: readonly PersistedDesignSelectionLine[],
  designs: readonly Pick<SalesQuoteDesign, "id" | "line_item_id">[],
): boolean {
  if (lines.length === 0) return false;
  const designLineById = new Map(
    designs.map((design) => [design.id, design.line_item_id]),
  );
  return lines.every(
    (line) =>
      !!line.selected_design_id &&
      designLineById.get(line.selected_design_id) === line.id,
  );
}

export function isMarkedSelectedQuoteDesign(
  design: SalesQuoteDesign,
): boolean {
  return (
    (design as SelectionMarkedQuoteDesign)[QUOTE_V2_SELECTED_DESIGN_MARKER] ===
    true
  );
}

export function resolveSelectedQuoteDesign(
  designs: SalesQuoteDesign[],
): SalesQuoteDesign | undefined {
  return (
    designs.find(isMarkedSelectedQuoteDesign) ??
    designs.find((design) => design.variant === "A") ??
    designs[0]
  );
}

export function preferredSavedQuoteVariant(
  designs: SalesQuoteDesign[],
  variants: string[],
): string {
  const selected = designs.find(isMarkedSelectedQuoteDesign);
  if (selected && variants.includes(selected.variant)) return selected.variant;
  return (
    variants.find((variant) =>
      designs.some((design) => design.variant === variant),
    ) ?? "A"
  );
}
