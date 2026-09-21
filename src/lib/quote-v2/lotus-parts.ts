import { LOTUS_PARTS_VERSION, lotusPartModelProfile } from "@/lib/quote/lotus-parts";
import { LOTUS_OBSERVED_SOURCE_ID, lotusObservedOffering } from "@/lib/quote/lotus-observed-offerings";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

export function validateLotusPartModel(context: SelectionContext): ValidationIssue[] {
  if (context.catalogAsOf < "2026-09-20" || context.configuration.lotus_part_configuration_version !== LOTUS_PARTS_VERSION) return [];
  const offeringId=String(context.configuration.lotus_observed_offering_id ?? "");
  const profile=lotusPartModelProfile(offeringId);
  const row=lotusObservedOffering(offeringId);
  const model=String(context.configuration.lotus_part_target_model ?? "");
  const source=sourceProvenance(LOTUS_OBSERVED_SOURCE_ID);
  const selectedValues={offeringId,model};
  const base={source,selectedValues};
  if(context.productId!=="lotus_dealer_listed_parts" || !profile || !row || row.discontinued) return [{...base,severity:"hard_block",ruleId:"lotus.parts.source_model_unknown",explanation:"This part has no current exact model compatibility record. Select a source-backed item or obtain manufacturer confirmation; historical records remain readable."}];
  if(!profile.models.includes(model)) return [{...base,severity:"hard_block",ruleId:"lotus.parts.target_model",explanation:`Select the intended model expressly named by this dealer listing: ${profile.models.join(", ")}. A similar SKU does not establish compatibility.`}];
  return [{...base,severity:"auto_derive",ruleId:"lotus.parts.documented_model",derivedValues:{source_url:profile.sourceUrl,source_description:profile.sourceDescription,intended_model:model},explanation:"The intended model matches the exact dealer description. Installed mechanism revision, physical fit, availability and price still require confirmation; this does not authorize an order."}];
}
