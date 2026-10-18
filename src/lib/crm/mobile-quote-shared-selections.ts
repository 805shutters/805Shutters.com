import {retainMobileManualPrice} from './mobile-quote-draft';
import type {MobileQuoteDraft} from './mobile-quote-draft';
/** Explicit Apply to All copies selections, never opening details, measurements or prices. */
export function applyMobileSharedSelections(draft:MobileQuoteDraft,sourceId:string):MobileQuoteDraft{
 if(draft.draftJob?.selectionMode!=='all'||draft.draftJob.submittedSpec||draft.submission.snapshot||draft.submission.quoteId)return draft;
 const source=draft.windows.find(w=>w.id===sourceId),family=source?.activeProductId?source.families[source.activeProductId]:null;
 if(!source||!family)return draft;
 const clean=(value:Record<string,unknown>)=>{for(const [key,item] of Object.entries(value)){if(/width|height|length|measurement|dimension|(?:^|_)(?:price|cost)(?:_|$)|quote_v2|authoritative|fingerprint|side_by_side|common_group/i.test(key))delete value[key];else if(item&&typeof item==='object'){if(Array.isArray(item))item.forEach(child=>{if(child&&typeof child==='object')clean(child as Record<string,unknown>)});else clean(item as Record<string,unknown>);}}};
 const next=structuredClone(draft);
 for(const target of next.windows){if(target.id===sourceId)continue;
  const previous=target.activeProductId?target.families[target.activeProductId]?.design:null;
  retainMobileManualPrice(target);target.inheritedSelections=true;
  const configuration=structuredClone(family);configuration.design.id=crypto.randomUUID();configuration.design.line_item_id=target.id;configuration.design.unit_price=0;configuration.design.notes=previous?.notes??null;
  clean(configuration.design.options_json);configuration.overriddenPaths=[];
  if(previous&&(previous.mount_type!==configuration.design.mount_type||previous.options_json.size_type!==configuration.design.options_json.size_type)){target.widthWhole=0;target.widthFraction='0';target.heightWhole=0;target.heightFraction='0';}
  target.activeProductId=source.activeProductId;target.families={[family.productId]:configuration};
  target.supplierInputs=source.supplierInputs?{...structuredClone(source.supplierInputs),openingCount:target.supplierInputs?.openingCount??1,feeOverride:target.supplierInputs?.feeOverride}:undefined;
  target.price=null;target.saved=false;
 }
 next.quotePrice=null;return next;
}
