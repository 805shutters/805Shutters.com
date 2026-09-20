import { isLotusObservedProduct, lotusObservedOffering, LOTUS_OBSERVED_VERSION, LOTUS_OBSERVED_SOURCE_ID } from "@/lib/quote/lotus-observed-offerings";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";
export function validateLotusObservedOffering(context: SelectionContext): ValidationIssue[] {
  const selectedId = context.configuration.lotus_observed_offering_id;
  if (!isLotusObservedProduct(context.productId) && !selectedId) return [];
  const row = lotusObservedOffering(String(selectedId ?? ""));
  const valid = row && row.productId === context.productId && context.programId === `${row.productId}_item`
    && context.configuration.lotus_observed_version === LOTUS_OBSERVED_VERSION;
  const explanation = !valid ? "Select an exact dealer-listed Lotus item for this product family."
    : row.discontinued ? "Lotus marks this item discontinued. Its saved history remains readable; select a current offering."
    : "Confirm current availability, compatible configuration and the exact dealer price for this listed Lotus item. Automatic grid pricing is unavailable.";
  return [{ severity: "hard_block", ruleId: !valid ? "lotus.observed.selection_invalid" : row.discontinued ? "lotus.observed.discontinued" : "lotus.observed.manual_price_required",
    source: sourceProvenance(LOTUS_OBSERVED_SOURCE_ID), selectedValues: { offeringId: String(selectedId ?? ""), productId: context.productId }, explanation }];
}
