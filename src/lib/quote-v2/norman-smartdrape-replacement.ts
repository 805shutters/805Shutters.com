import { SMARTDRAPE_REPLACEMENT as ID, SMARTDRAPE_REPLACEMENT_RECORD as KEY, SMARTDRAPE_REPLACEMENT_HOLD, SMARTDRAPE_REPLACEMENT_PRICING_FROM, SMARTDRAPE_REPLACEMENT_LENGTHS, SMARTDRAPE_REPLACEMENT_PRICES, parseReplacementRequest, replacementColors, replacementComposition } from '../quote/norman-smartdrape-replacement';
import type { SelectionContext,ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';
export function validateSmartdrapeReplacement(s:SelectionContext):ValidationIssue[]{
 if(s.productId!==ID)return [];
 const c={...s.configuration},r=parseReplacementRequest(c[KEY]),issues:ValidationIssue[]=[];
 const add=(rule:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.smartdrape.replacement.${rule}`,source:sourceProvenance('norman-perfectsheer-smartdrape-guide-2026-09',{page:24}),selectedValues:{productId:s.productId,request:c[KEY]??null},explanation});
 if(s.catalogAsOf<SMARTDRAPE_REPLACEMENT_PRICING_FROM)add('price_approval',SMARTDRAPE_REPLACEMENT_HOLD);
 if(s.catalogAsOf<'2026-09-20')add('effective_date','This standalone destination was introduced September 20, 2026.');
 if(s.manufacturerId.toLowerCase()!=='norman'||s.programId!==`${ID}_source`)add('program','Choose the exact Norman standalone vane-pack program.');
 if(s.widthInches!==0||s.heightInches!==0)add('natural_units','Record requested vane length inside the replacement request; opening width and height do not apply.');
 if(!r){add('request','Complete the typed standalone vane-pack request.');return issues;}
 if(s.catalogAsOf>=SMARTDRAPE_REPLACEMENT_PRICING_FROM&&(r.shadeLengthInches==null||r.shadeLengthInches<=0||r.shadeLengthInches>144))add('price_shade_length','Select the original shade length greater than zero and up to 144 inches for the September six-vane pack price table. Finished vane length is not a substitute for this pricing dimension.');
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
 const compositionKnown=r.style==='B'||r.style==='A'&&!!r.stack&&(r.colorMode==='Single Color'||Number.isSafeInteger(r.originalVaneCount)&&(r.originalVaneCount??0)>0);
 const composition=replacementComposition(r);
 c[KEY]=r;
 c.smartdrape_replacement_source_v1={version:1,sourceId:'norman-perfectsheer-smartdrape-guide-2026-09',sourcePage:24,orderedWithShade:false,packs:s.quantity,requestedVaneLengthInches:r.vaneLengthInches,composition:compositionKnown?composition:null,availability:'requires_original_work_order_confirmation'};
 c.replacement_price_shade_length=r.shadeLengthInches??null;
 c.replacement_pack_style=r.style;c.replacement_vane_length=r.vaneLengthInches;c.replacement_shade_type=r.shadeType;c.replacement_stack=r.stack;c.replacement_color_mode=r.colorMode;c.replacement_second_color=r.colorMode==='Alternating'?r.secondColor:null;c.replacement_pack_contents=compositionKnown?[...(composition.first.quantity?[`${composition.first.quantity} first (${composition.first.color})`]:[]),...composition.middle.map(v=>`${v.quantity} middle (${v.color})`),...(composition.last.quantity?[`${composition.last.quantity} last (${composition.last.color??'original vane count required'})`]:[])].join('; '):null;
 c.fabric_color_code=first?.customerColorCode??r.firstColor;c.fabric_color_name=first?.colorName??null;c.fabric_color_collection=first?.category??null;
 s.configuration=c;return issues;
}

/** September retail printed p23 explicitly applies this schedule with or without a shade. */
export function priceSmartdrapeReplacement(s:SelectionContext,input:import('../quote/pricing').PriceInput):import('../quote/pricing').PriceResult {
 const fail=(error:string):import('../quote/pricing').PriceFailure=>({ok:false,code:'CONFIGURATION_INCOMPLETE',error,warnings:[]});
 const r=parseReplacementRequest(s.configuration[KEY]);
 if(s.catalogAsOf<SMARTDRAPE_REPLACEMENT_PRICING_FROM||!r||s.programId!==`${ID}_source`)return fail('Choose the current documented standalone SmartDrape vane-pack program.');
 if(!Number.isSafeInteger(s.quantity)||s.quantity<1)return fail('Quantity must be a positive whole number of six-vane packs.');
 if(input.surcharges?.length||input.motorization?.length)return fail('Standalone vane packs support only their documented length and room-darkening price selections.');
 const first=replacementColors.find(color=>color.customerColorCode===r.firstColor);
 const index=SMARTDRAPE_REPLACEMENT_LENGTHS.findIndex(height=>r.shadeLengthInches!=null&&r.shadeLengthInches>0&&height>=r.shadeLengthInches);
 if(!first||index<0)return fail('The selected color or original shade length has no documented September vane-pack price.');
 const base=SMARTDRAPE_REPLACEMENT_PRICES[index],rd=first.category==='Room Darkening',surchargeCents=rd?Math.round(base*20):0;
 const unitCents=base*100+surchargeCents,discountPercent=Math.min(100,Math.max(0,Number(input.discountPercent)||0)),discountCents=Math.round(unitCents*discountPercent/100);
 return {ok:true,productId:ID,programId:s.programId,programName:'Standalone pack of six vanes',matchedWidth:null,matchedHeight:SMARTDRAPE_REPLACEMENT_LENGTHS[index],base,configurationUnits:1,
   wholesaleBase:null,wholesaleUnitPrice:null,wholesaleTotal:null,costStatus:'unavailable',
   surchargeLines:rd?[{id:'replacement_room_darkening',label:'Room-darkening vane pack (+20%)',amount:surchargeCents/100,kind:'percent'}]:[],
   unitPrice:(unitCents-discountCents)/100,quantity:s.quantity,onceTotal:0,total:(unitCents-discountCents)*s.quantity/100,discountPercent,discountAmount:discountCents/100,
   warnings:['September retail pricing expressly covers standalone vane packs. Dealer cost, manufacturer freight, original order details and color-lot availability remain unverified.']};
}
