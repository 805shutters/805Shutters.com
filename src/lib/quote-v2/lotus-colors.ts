import { LOTUS_COLOR_CONFIGURATION_VERSION, lotusColorsForSelection } from "@/lib/quote/lotus-colors";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

export function validateLotusColor(context: SelectionContext): ValidationIssue[] {
  // Historical selections keep their recorded configuration and prices.
  if (context.configuration.lotus_color_configuration_version !== LOTUS_COLOR_CONFIGURATION_VERSION) return [];
  const allowed = lotusColorsForSelection(context.productId, context.programId ?? "", context.widthInches, context.heightInches);
  if (allowed.includes(String(context.configuration.color ?? ""))) return [];
  return [{
    severity: "hard_block",
    ruleId: "lotus.color.exact_source_cell",
    source: sourceProvenance("lotus-west-a26-v1"),
    selectedValues: { color: context.configuration.color ?? null, programId: context.programId, width: context.widthInches, height: context.heightInches },
    explanation: allowed.length ? `Select a source-backed color for this size: ${allowed.join(", ")}.` : "This Lotus size has no published color-specific ordering SKU. Select a supported size or obtain manufacturer confirmation.",
  }];
}
