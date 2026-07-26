import type { SalesQuoteDesign } from "@mts/types/quote";

export const QUOTE_V2_SELECTED_DESIGN_MARKER = "__quote_v2_selected_design";

export type SelectionMarkedQuoteDesign = SalesQuoteDesign & {
  [QUOTE_V2_SELECTED_DESIGN_MARKER]?: boolean;
};

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
