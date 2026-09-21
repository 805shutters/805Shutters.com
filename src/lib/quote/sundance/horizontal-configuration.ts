import type { SelectionContext,ValidationIssue } from '@/lib/quote-v2/core';
import { sourceProvenance } from '@/lib/quote-v2/source-manifest';
import { lookupSundanceSourceGrid } from './catalog';
import { sundanceHorizontalSource,sundanceHorizontalValances } from './horizontal-assortment';
export const sundanceHorizontalSourceId='sundance-j-sundance-horizontal-blinds-12-25-75665a0d01a9';
export const sundanceSolidTapeCodes=['5469','5462','5463','5465','5467','5460','5475','5468','5473','5472'];
export const sundanceDecorativeTapeCodes=['5459','4201','4288','4289','4290','4291','4292','4293','4294'];
export function sundanceHorizontalLimits(productId:string,options:Record<string,unknown>){
 if(productId==='sundance_aluminum_1')return options.sundance_blind_grade==='Premium'?{minWidth:23,maxWidth:82,minHeight:18,maxHeight:72,page:12}:{minWidth:18,maxWidth:92,minHeight:18,maxHeight:96,page:12};
 if(productId==='sundance_aluminum_2')return{minWidth:24,maxWidth:82,minHeight:18,maxHeight:84,page:12};
 if(productId==='sundance_chateau_woods')return{minWidth:15,maxWidth:96,minHeight:12,maxHeight:96,page:19};
 if(productId==='sundance_basicvue')return{minWidth:18,maxWidth:72,minHeight:12,maxHeight:84,page:13};
 return{minWidth:18,maxWidth:96,minHeight:12,maxHeight:productId.endsWith('_2_5')?84:92,page:7};
}
export function validateSundanceHorizontalConfiguration(s:Pick<SelectionContext,'productId'|'programId'|'widthInches'|'heightInches'|'configuration'>):ValidationIssue[]{
 const c=s.configuration,p=s.productId,issues:ValidationIssue[]=[];
 const add=(key:string,page:number,explanation:string)=>issues.push({severity:'hard_block',ruleId:`sundance.horizontal.${key}`,source:sourceProvenance(sundanceHorizontalSourceId,{page}),selectedValues:{...c,widthInches:s.widthInches,heightInches:s.heightInches},explanation});
 const row=sundanceHorizontalSource.rows.find(row=>row.productId===p&&row.id===c.fabric_color_id);
 if(!row||row.programId!==s.programId||row.code!==c.fabric_color_code||row.name!==c.fabric_color_name)add('material',3,'Select the exact horizontal color, slat size and matching program.');
 else if(row.portalStatus==='source_only_exception')add('availability',row.sourcePage,'This source color lacks a confirmed current dealer ordering destination.');
 const bounds=sundanceHorizontalLimits(p,c);
 if(!Number.isFinite(s.widthInches)||!Number.isFinite(s.heightInches)||s.widthInches<bounds.minWidth||s.widthInches>bounds.maxWidth||s.heightInches<bounds.minHeight||s.heightInches>bounds.maxHeight)add('size',bounds.page,`This blind requires width ${bounds.minWidth}–${bounds.maxWidth} and height ${bounds.minHeight}–${bounds.maxHeight} inches, subject to unavailable grid cells.`);
 if(!lookupSundanceSourceGrid(p,s.programId??'',s.widthInches,s.heightInches))add('grid',bounds.page,'The exact width/height cell is unavailable in this source program.');
 if(c.lift_system!=='Cordless')add('lift',bounds.page,'Current horizontal blinds are cordless only.');
 if(!['Inside','Outside'].includes(String(c.mount_type)))add('mount',bounds.page,'Choose inside or outside mounting.');
 const aluminum=p.includes('aluminum'),chateau=p==='sundance_chateau_woods',basic=p==='sundance_basicvue';
 if(!['Left','Right'].includes(String(c.sundance_blind_wand))||(basic&&c.sundance_blind_wand!=='Left'))add('wand',bounds.page,basic?'BasicVue wand tilt is available only on the left.':'Choose left or right wand tilt.');
 if(aluminum&&c.sundance_blind_wand==='Right')add('aluminum_wand_side',12,'The guide specifies wand tilt but does not confirm alternate wand-side availability. Confirm right-side control with Sundance.');
 const valances=chateau?['3-inch Metro','3-inch Sutton','3-inch Harvard','4-inch Rope']:basic?['Crown Hollow']:sundanceHorizontalValances(c.fabric_color_id);
 if(valances.length&&!valances.includes(String(c.sundance_blind_valance)))add('valance',chateau?17:bounds.page,'Choose a valance documented for this exact color and product.');
 if(p==='sundance_aluminum_1'){
  if(!['Standard','Premium'].includes(String(c.sundance_blind_grade)))add('grade',12,'Choose standard or premium aluminum headrail/control.');
  if(c.sundance_blind_grade==='Premium'&&row&&!['6-Gauge','8-Gauge'].includes(row.variant))add('premium_finish',9,'Premium cordless is explicitly offered in 6-gauge or 8-gauge slats; confirm other finish variants.');
 }
 if(!['Single','Two on one','Three on one'].includes(String(c.sundance_blind_assembly)))add('assembly',bounds.page,'Choose a single blind or identify the common-headrail/valance assembly.');
 else if(c.sundance_blind_assembly!=='Single')add('components',aluminum?10:chateau?17:3,'Price and retain each component blind separately; a common headrail/valance selection does not establish component measurements or price.');
 if(chateau&&s.widthInches>84)add('split_required',19,'Chateau widths over 84 inches must be split into two or more blinds and use a valance connection.');
 for(const field of ['sundance_blind_hold_down','sundance_blind_spacer'])if(c[field]&&!['Yes','No'].includes(String(c[field])))add(field,bounds.page,'Use Yes or No for optional hardware.');
 const cut=Number(c.sundance_blind_cutout_sides??0);
 if(!Number.isSafeInteger(cut)||cut<0||cut>2)add('cutout_quantity',chateau?18:10,'Cut-outs must identify zero, one or two sides.');
 else if(cut>0)add('cutout_geometry',chateau?18:10,basic?'BasicVue cut-outs are not documented.':'Cut-out positions and dimensions require template/geometry approval before ordering.');
 if(chateau){
  if(!['Standard Ladder','Solid 1-inch tape','Decorative 1-inch tape'].includes(String(c.sundance_blind_ladder)))add('ladder',18,'Choose standard ladder, solid tape or decorative tape.');
  const codes=c.sundance_blind_ladder==='Solid 1-inch tape'?sundanceSolidTapeCodes:c.sundance_blind_ladder==='Decorative 1-inch tape'?sundanceDecorativeTapeCodes:[];
  if(codes.length&&!codes.includes(String(c.sundance_blind_tape_code)))add('tape',18,'Choose the exact published tape code for this ladder type.');
  if(!codes.length&&c.sundance_blind_tape_code)add('stale_tape',18,'Clear tape color when selecting standard ladders.');
  if(c.mount_type==='Inside'){
   const flush=c.sundance_blind_flush==='Yes';
   const min=(flush?(row?.slatSize==='2.5'?4.125:3.625):1.625)+(row?.slatSize==='2'&&c.sundance_blind_spacer==='Yes'?0.375:0);
   if(!['Yes','No'].includes(String(c.sundance_blind_flush))||Number(c.sundance_blind_depth)<min||!Number.isFinite(Number(c.sundance_blind_depth)))add('depth',19,`Chateau inside mounting requires ${min} inches for this flush/spacer configuration.`);
  }
  if(c.sundance_blind_assembly!=='Single'&&!['Keystone','Edge-joint'].includes(String(c.sundance_blind_connection)))add('connection',17,'Choose Keystone or Edge-joint for the joined valance.');
  const returns=c.sundance_blind_custom_return;
  if(returns!=null&&returns!==''&&(!Number.isFinite(Number(returns))||Number(returns)<0.5||Number(returns)>6))add('return',20,'Custom Chateau returns require 1/2–6 inches.');
 }
 for(const key of ['sundance_blind_pole_short_qty','sundance_blind_pole_long_qty']){
  const q=Number(c[key]??0);if(!Number.isSafeInteger(q)||q<0)add(key,10,'Extension pole quantities must be nonnegative whole numbers.');
  else if(q>0&&p!=='sundance_aluminum_1')add(key,10,'This extension-pole schedule is published for 1-inch aluminum; other product compatibility requires confirmation.');
 }
 if(c.sundance_blind_extra_valance&&c.sundance_blind_extra_valance!=='None'){
  if(!['Extra valance','Valance with dust cover'].includes(String(c.sundance_blind_extra_valance))||!(p.includes('advantage_ii')||p.includes('premium_ii')))add('extra_valance',3,'This per-foot extra valance schedule is for Advantage II and Premium II.');
  const length=Number(c.sundance_blind_extra_valance_inches);if(!Number.isFinite(length)||length<=0)add('extra_length',3,'Enter the actual extra-valance length.');
  else if(length%12!==0)add('extra_rounding',3,'The schedule does not specify fractional-foot rounding; confirm the final extra-valance charge.');
 }
 return issues;
}
const premiumWidths=[26,29,32,36,40,44,48,52,57,62,67,72,82],premiumPrices=[56,78,101,126,151,182,210,235,258,286,305,319,339];
const ropeWidths=[24,30,36,42,48,54,60,66,72,78,84,90,96,102],ropePrices=[105,131,157,183,209,235,262,288,314,340,366,392,418,445];
export function sundanceHorizontalOptionEvidence(p:string,c:Record<string,unknown>,width:number){
 const entries:{label:string;amount:number;basis:'net'|'retail';page:number}[]=[];
 const row=sundanceHorizontalSource.rows.find(row=>row.productId===p&&row.id===c.fabric_color_id);
 const percentages:{label:string;percent:number;page:number}[]=[];
 if(row?.retailSurchargePercent)percentages.push({label:'Color/slat addition to base retail',percent:row.retailSurchargePercent,page:row.sourcePage});
 const add=(label:string,amount:number,basis:'net'|'retail',page:number)=>entries.push({label,amount,basis,page});
 const band=(label:string,widths:number[],prices:number[],page:number)=>{const i=Number.isFinite(width)&&width>0?widths.findIndex(w=>width<=w):-1;if(i>=0)add(label,prices[i],'retail',page);};
 if(p==='sundance_aluminum_1'&&c.sundance_blind_grade==='Premium')band('Premium cordless upgrade',premiumWidths,premiumPrices,9);
 if(p.includes('aluminum')&&['Two on one','Three on one'].includes(String(c.sundance_blind_assembly)))add('Common headrail',c.sundance_blind_assembly==='Two on one'?20:37,'net',10);
 const cut=Number(c.sundance_blind_cutout_sides??0);
 if(Number.isSafeInteger(cut)&&cut>0&&cut<=2&&(p.includes('aluminum')||p==='sundance_chateau_woods'))add('Cut-out sides',cut*(p==='sundance_chateau_woods'?15:12),'net',p==='sundance_chateau_woods'?18:10);
 if(p==='sundance_chateau_woods'){
  if(c.sundance_blind_valance==='4-inch Rope')band('4-inch Rope valance',ropeWidths,ropePrices,18);
  if(c.sundance_blind_rounded_corners==='Yes')add('Rounded corners',15,'net',18);
  if(c.sundance_blind_ladder==='Solid 1-inch tape')percentages.push({label:'Solid cloth tape addition to base retail',percent:12,page:18});
  if(c.sundance_blind_ladder==='Decorative 1-inch tape')percentages.push({label:'Decorative cloth tape addition to base retail',percent:20,page:18});
 }
 if((p.includes('advantage_ii')||p.includes('premium_ii'))&&['Extra valance','Valance with dust cover'].includes(String(c.sundance_blind_extra_valance))){
  const length=Number(c.sundance_blind_extra_valance_inches);if(Number.isFinite(length)&&length>0)add(String(c.sundance_blind_extra_valance),length/12*(c.sundance_blind_extra_valance==='Extra valance'?5:10),'net',3);
 }
 if(p==='sundance_aluminum_1')for(const [key,price,label]of[['sundance_blind_pole_short_qty',64,'3–5-foot extension pole'],['sundance_blind_pole_long_qty',76,'5–9-foot extension pole']]as const){const q=Number(c[key]??0);if(Number.isSafeInteger(q)&&q>0)add(`${label} × ${q}`,q*price,'net',10);}
 return{entries,percentages,retailSubtotal:entries.filter(e=>e.basis==='retail').reduce((sum,e)=>sum+e.amount,0),netSubtotal:entries.filter(e=>e.basis==='net').reduce((sum,e)=>sum+e.amount,0),customerPriceEligible:false as const};
}

/** J PDF19: included Chateau wand references; no stack-height table is published. */
export function sundanceChateauWandReference(height:number){
 if(!Number.isFinite(height)||height<12||height>96)return null;
 const row=[[42,18],[54,24],[66,30],[72,36],[78,42],[84,48],[96,54]].find(([maxHeight])=>height<=maxHeight)!;
 return{heightThrough:row[0],wandLength:row[1],sourcePage:19};
}
