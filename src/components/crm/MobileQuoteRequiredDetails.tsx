import {QuoteChoiceButtons} from './QuoteChoiceButtons';
import {mobileControlSidePolicy} from '@/lib/quote/mobile-control-side';
import type {MobileQuoteWindow} from '@/lib/crm/mobile-quote-draft';
import type {SalesQuoteDesign} from '@mts/types/quote';
import {lineInputs,type SupplierLineInputs} from '@/lib/crm/mobile-supplier-spec';
import {sourceShutterFoldingChoices,sourceNormanFoldingLayout} from '@/lib/crm/mobile-quote-requirements';
export function MobileQuoteRequiredDetails({line,onDesign,onInputs}:{line:MobileQuoteWindow;onDesign:(patch:Partial<SalesQuoteDesign>)=>void;onInputs:(patch:Partial<SupplierLineInputs>)=>void}){
 const input=lineInputs(line),design=line.activeProductId?line.families[line.activeProductId]?.design:undefined;if(!design)return null;const o=design.options_json??{},folding=sourceShutterFoldingChoices(design),layout=sourceNormanFoldingLayout(design),sidePolicy=mobileControlSidePolicy(design,input.control);
 if(input.family!=='Shutters'&&input.family!=='Vertical Blinds'&&(!sidePolicy.required||o.sundance_blind_wand||o.chain_location||o.control_side))return null;
 return <section className="mobile-required-details" aria-label="Required quote selections" data-field-purpose="contract">
 {input.family==='Vertical Blinds'&&<label>Vane/louver size · Required<input aria-label="Required vertical vane size" value={String(o.slat_size??design.louver_size??'')} onChange={e=>onDesign({options_json:{...o,slat_size:e.target.value}})}/><small>Record the known supplier-defined size. No stock size is supplied automatically; supplier entry must validate it.</small></label>}
 {input.family==='Shutters'?layout?<p>Folding layout · Required: <strong>{layout}</strong><small>Selected in the manufacturer panel schedule. Edit that schedule to change the configuration.</small></p>:folding?<fieldset><legend>Folding direction · Required</legend>{folding.map(direction=><button type="button" key={direction} aria-pressed={o.folding_direction===direction} onClick={()=>onDesign({options_json:{...o,folding_direction:direction}})}>{direction}</button>)}</fieldset>:<label>Folding direction · Required<input aria-label="Required shutter folding direction" value={String(o.folding_direction??'')} onChange={e=>onDesign({options_json:{...o,folding_direction:e.target.value}})}/><small role="status">Folding-direction applicability is unverified for this configuration. Record the known instruction; supplier entry must verify it. Norman bi-fold layouts use their separate source panel schedule. No None or hardware choice is supplied automatically.</small></label>:<fieldset><legend>Operating/control side · Contract</legend>{sidePolicy.required&&(o.sundance_blind_wand||o.chain_location||o.control_side)?<p>Selected above: {input.controlSide}</p>:sidePolicy.required?<QuoteChoiceButtons aria-label="Contract control side" value={input.controlSide} onChange={side=>onInputs({controlSide:side})}><option value="">Choose control side</option>{sidePolicy.choices.map(side=><option key={side} value={side}>{side}</option>)}</QuoteChoiceButtons>:<p>{sidePolicy.reason}</p>}<small>{sidePolicy.required&&sidePolicy.reason}</small></fieldset>}


 </section>;
}
