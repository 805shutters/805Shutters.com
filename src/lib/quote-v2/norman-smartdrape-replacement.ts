import { SMARTDRAPE_REPLACEMENT as ID, SMARTDRAPE_REPLACEMENT_RECORD as KEY, SMARTDRAPE_REPLACEMENT_HOLD, parseReplacementRequest, replacementColors, replacementComposition } from '../quote/norman-smartdrape-replacement';
import type { SelectionContext,ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';
export function validateSmartdrapeReplacement(s:SelectionContext):ValidationIssue[]{
 if(s.productId!==ID)return [];
 const c={...s.configuration},r=parseReplacementRequest(c[KEY]),issues:ValidationIssue[]=[];
 const add=(rule:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.smartdrape.replacement.${rule}`,source:sourceProvenance('norman-perfectsheer-smartdrape-guide-2026-09',{page:24}),selectedValues:{productId:s.productId,request:c[KEY]??null},explanation});
 add('price_approval',SMARTDRAPE_REPLACEMENT_HOLD);
 if(s.catalogAsOf<'2026-09-20')add('effective_date','This standalone destination was introduced September 20, 2026.');
 if(s.manufacturerId.toLowerCase()!=='norman'||s.programId!==`${ID}_source`)add('program','Choose the exact Norman standalone vane-pack program.');
 if(s.widthInches!==0||s.heightInches!==0)add('natural_units','Record requested vane length inside the replacement request; opening width and height do not apply.');
 if(!r){add('request','Complete the typed standalone vane-pack request.');return issues;}
 if(!r.originalWorkOrder)add('original_work_order','The original Norman work-order number is required for a new vane-pack order without a shade.');
 if(!r.style||!r.stack)add('configuration','Choose pack style A or B and the original shade stacking configuration.');
 if(r.shadeType==='Side by Side'&&['Center Opening','Center Stack (Motorized)'].includes(r.stack))add('stack','The side-by-side table supports Left, Right and Traveling Center Stack.');
 if(r.vaneLengthInches===null||r.vaneLengthInches<=0)add('length','Record the requested finished vane length in inches; do not infer it from a shade-height deduction.');
 if(!Number.isSafeInteger(s.quantity)||s.quantity<1)add('quantity','Line quantity must be a positive whole number of six-vane packs.');
 const first=replacementColors.find(f=>f.customerColorCode===r.firstColor),second=replacementColors.find(f=>f.customerColorCode===r.secondColor);
 if(!first)add('first_color','Select a documented SmartDrape color; older colors require separate manufacturer confirmation.');
 if(r.colorMode==='Alternating'&&(!second||first?.category!==second.category))add('second_color','Alternating colors must both belong to the same LF, RD or LF Essentials category.');
 if(r.colorMode==='Single Color'&&r.secondColor)add('unexpected_second_color','A second color requires Alternating.');
 if(r.colorMode==='Alternating'&&r.style==='A'&&(!Number.isSafeInteger(r.originalVaneCount)||(r.originalVaneCount??0)<1))add('original_vane_count','Record the original whole vane count to identify the last-vane color for alternating Option A.');
 const composition=replacementComposition(r);
 c[KEY]=r;
 c.smartdrape_replacement_source_v1={version:1,sourceId:'norman-perfectsheer-smartdrape-guide-2026-09',sourcePage:24,orderedWithShade:false,packs:s.quantity,requestedVaneLengthInches:r.vaneLengthInches,composition,availability:'requires_original_work_order_confirmation'};
 c.replacement_pack_style=r.style;c.replacement_vane_length=r.vaneLengthInches;c.replacement_shade_type=r.shadeType;c.replacement_stack=r.stack;c.replacement_color_mode=r.colorMode;c.replacement_second_color=r.colorMode==='Alternating'?r.secondColor:null;c.replacement_pack_contents=[...(composition.first.quantity?[`${composition.first.quantity} first (${composition.first.color})`]:[]),...composition.middle.map(v=>`${v.quantity} middle (${v.color})`),...(composition.last.quantity?[`${composition.last.quantity} last (${composition.last.color??'original vane count required'})`]:[])].join('; ');
 c.fabric_color_code=first?.customerColorCode??r.firstColor;c.fabric_color_name=first?.colorName??null;c.fabric_color_collection=first?.category??null;
 s.configuration=c;return issues;
}
