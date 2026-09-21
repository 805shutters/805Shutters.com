import type { SelectionContext, ValidationIssue } from '@/lib/quote-v2/core';
import { sourceProvenance } from '@/lib/quote-v2/source-manifest';
import { lookupSundanceSourceGrid } from './catalog';
import { SUNDANCE_STOCK_VERTICAL_PROGRAM } from './supplemental-configuration';

export const STOCK_VERTICAL_SOURCE = 'sundance-k-vertical-essence-v2-97db633ff299';
/** K-12: square-valance row, transcribed independently of the base blind grid. */
export const STOCK_VERTICAL_WIDTHS = [32,36,42,45,48,51,54,57,60,63,66,70,72,75,78,82,84,90,98,102,110,114,120,126];
export const STOCK_VERTICAL_SQUARE = [42,45,49,52,55,56,57,59,60,64,66,70,71,73,76,78,80,87,92,95,102,106,112,118];
type StockSelection = Pick<SelectionContext,'programId'|'widthInches'|'heightInches'|'configuration'>;
const finite = (value:unknown):number|null => typeof value==='number'&&Number.isFinite(value)?value:null;

export function sundanceStockVerticalEvidence(s:StockSelection) {
 const c=s.configuration, widthCut=c.stock_vertical_width_cut_down==='Yes', heightCut=c.stock_vertical_height_cut_down==='Yes';
 const beforeWidth=widthCut?finite(c.stock_vertical_before_width):s.widthInches;
 const beforeHeight=heightCut?finite(c.stock_vertical_before_height):s.heightInches;
 const largerBlindRecorded=beforeWidth!==null&&beforeHeight!==null&&(!widthCut||beforeWidth>s.widthInches)&&(!heightCut||beforeHeight>s.heightInches);
 const base=largerBlindRecorded?lookupSundanceSourceGrid('sundance_vertical_essence',SUNDANCE_STOCK_VERTICAL_PROGRAM,beforeWidth,beforeHeight):null;
 const wi=STOCK_VERTICAL_WIDTHS.findIndex(w=>w>=s.widthInches);
 const square=c.stock_vertical_valance==='Square corner valance'&&Number.isFinite(s.widthInches)&&s.widthInches>0&&wi>=0?STOCK_VERTICAL_SQUARE[wi]:null;
 return {version:1 as const,sourceId:STOCK_VERTICAL_SOURCE,sourcePage:12,effectiveDate:'2024-08-01',beforeWidth,beforeHeight,base,
  squareValanceAtRequestedWidth:square,squareValanceGridWidth:square===null?null:STOCK_VERTICAL_WIDTHS[wi],
  netWidthCut:widthCut?5:0,netHeightCut:heightCut?5:0,netCutSubtotal:(widthCut?5:0)+(heightCut?5:0),
  customerPriceEligible:false as const,stockAvailabilityVerified:false as const};
}

export function validateSundanceStockVerticalConfiguration(s:StockSelection):ValidationIssue[] {
 const c=s.configuration,issues:ValidationIssue[]=[];
 if(c.sundance_vertical_type!=='Stock'&&s.programId!==SUNDANCE_STOCK_VERTICAL_PROGRAM)return issues;
 const add=(key:string,explanation:string,page=12)=>issues.push({severity:'hard_block',ruleId:`sundance.stock_vertical.${key}`,source:sourceProvenance(STOCK_VERTICAL_SOURCE,{page}),selectedValues:{...c,widthInches:s.widthInches,heightInches:s.heightInches},explanation});
 if(c.sundance_vertical_type!=='Stock'||s.programId!==SUNDANCE_STOCK_VERTICAL_PROGRAM)add('identity','Use the exact Stock Vertical program and offering together.');
 if(!['White','Off-White'].includes(String(c.stock_vertical_color)))add('color','Stock Vertical is offered in White or Off-White.');
 if(c.stock_vertical_control!=='Wand'||c.stock_vertical_draw!=='One-way'||c.stock_vertical_headrail!=='Soft White extruded aluminum reversible headrail')add('construction','Stock Vertical requires wand control, one-way draw and the Soft White reversible aluminum headrail.');
 if(!['Left','Right'].includes(String(c.stock_vertical_wand_side))||!['Left','Right'].includes(String(c.stock_vertical_draw_side)))add('sides','Choose the wand side and one-way draw side.',13);
 if(!['None','Square corner valance'].includes(String(c.stock_vertical_valance)))add('valance','Choose no valance or the stock square-corner valance.');
 if(c.stock_vertical_fulfillment!=='Pickup in Arcadia')add('pickup','The stock schedule is FOB Arcadia, California only, with no delivery; record pickup fulfillment.');
 for(const axis of ['width','height'] as const){
  const cut=c[`stock_vertical_${axis}_cut_down`],result=axis==='width'?s.widthInches:s.heightInches;
  if(!['Yes','No'].includes(String(cut)))add(`${axis}_cut_choice`,`Specify whether ${axis} cut-down is required.`);
  if(!Number.isFinite(result)||result<=0||result>(axis==='width'?126:96))add(`${axis}_range`,`The ${axis} must be positive and within the published stock schedule (maximum ${axis==='width'?126:96} inches).`);
  else if(result<(axis==='width'?32:44))add(`${axis}_lower_cut_limit`,`The schedule does not establish the manufacturing cut-down limit below ${axis==='width'?32:44} inches. Obtain source confirmation for this size.`);
  if(cut==='Yes'){
   const before=finite(c[`stock_vertical_before_${axis}`]);
   if(before===null||before<=result)add(`${axis}_before_cut`,`Record the actual larger blind ${axis} before cutting; the pricing breakpoint alone does not establish the available stock blind.`);
  }
 }
 const e=sundanceStockVerticalEvidence(s);
 if(!e.base)add('base_grid','The recorded larger blind must reach an available stock price cell without extrapolation.');
 // K-12 supplies a square-valance schedule but does not specify cut-down charge scope.
 if(c.stock_vertical_width_cut_down==='Yes'&&c.stock_vertical_valance==='Square corner valance')add('valance_cut_scope','Confirm whether the square-valance charge follows its finished width or the larger stock blind when cutting the width.');
 return issues;
}
