import type {SelectionContext,ValidationIssue} from '@/lib/quote-v2/core';
import {sourceProvenance} from '@/lib/quote-v2/source-manifest';
import {sundancePortfolioColors,sundancePortfolioSource} from './portfolio-assortment';
export const sundancePortfolioControls=['Cordless','Cordless TDBU','Clutch and Loop','Somfy Sonesse Ultra 30','Standard LI Motor','Power Lift'] as const;
export const sundancePortfolioLiners=['LF03 Light-Filtering Ivory','LF02 Light-Filtering Snow White','BO01 Black-Out White'] as const;
export function sundancePortfolioDesignPatch(options:Record<string,unknown>,key:string,value:string) {
 const next:Record<string,unknown>={...options,[key]:value||null};
 const control=next.sundance_portfolio_control;
 if(key==='sundance_portfolio_control'&&control==='Cordless TDBU')next.sundance_portfolio_drop='Standard';
 if(key==='sundance_portfolio_drop'||key==='sundance_portfolio_control'){
  next.sundance_portfolio_front_valance=next.sundance_portfolio_drop==='Standard'?'Included':null;
  next.sundance_portfolio_back_valance=control==='Cordless TDBU'?'Yes':next.sundance_portfolio_drop==='Waterfall'?null:'No';
  next.sundance_portfolio_interior_valance=next.sundance_portfolio_drop==='Waterfall'?null:'No';
  next.sundance_portfolio_valance_length='Standard';
  next.sundance_portfolio_custom_valance_length=null;
 }
 if(key==='mount_type'||key==='sundance_portfolio_control')next.sundance_portfolio_returns=null;
 if(key==='sundance_portfolio_front_valance'){
  next.sundance_portfolio_valance_length='Standard';next.sundance_portfolio_custom_valance_length=null;
 }
 return next;
}
export function validateSundancePortfolioConfiguration(s:Pick<SelectionContext,'widthInches'|'heightInches'|'programId'|'configuration'>):ValidationIssue[] {
 const c=s.configuration,issues:ValidationIssue[]=[];
 const add=(key:string,page:number,message:string)=>issues.push({severity:'hard_block',ruleId:'sundance.portfolio.'+key,source:sourceProvenance('sundance-sundance-portfolio-roman-shade-product-price-guide-2026-421a4cba9a72',{page}),selectedValues:{widthInches:s.widthInches,heightInches:s.heightInches,...c},explanation:message});
 const row=sundancePortfolioColors.find(row=>row.id===c.fabric_color_id);
 const fabric=sundancePortfolioSource.rows.find(row=>row.code===c.fabric_color_code);
 if(!row||row.colorCode!==c.fabric_color_code||row.fabricType!==c.roman_style||row.programId!==s.programId)add('material_style',3,'Select an exact Portfolio material and a valid style with its matching source route.');
 if(!sundancePortfolioLiners.includes(String(c.sundance_portfolio_liner) as never))add('liner',5,'Choose LF03 Ivory, LF02 Snow White, or BO01 White liner.');
 if(c.roman_style==='Valance Only'){
  if(!Number.isFinite(s.widthInches)||!Number.isFinite(s.heightInches)||s.widthInches<=0||s.widthInches>96||s.heightInches<=0||s.heightInches>18)add('valance_size',8,'Standalone valances have positive dimensions, maximum width 96 inches and length 18 inches.');
  if(![1.5,2.5].includes(Number(c.sundance_portfolio_valance_depth)))add('valance_depth',8,'Standalone valance headrails are 1½ or 2½ inches deep.');
  if(!['Inside','Outside'].includes(String(c.mount_type)))add('mount',8,'Choose inside or outside mount for the standalone valance.');
  if(!['Standard','Extended'].includes(String(c.sundance_portfolio_returns))||c.sundance_portfolio_returns==='Extended'&&c.mount_type!=='Outside')add('valance_returns',8,'Standard returns are available inside or outside; extended returns require outside mount.');
  if(!fabric||c.catalog_sundance_portfolio_valance_id!==`sundance_portfolio_roman_valance_p25_t1_${fabric.priceGroup.toLowerCase()}`)add('valance_schedule',25,'Retain the exact material-group standalone valance schedule.');
  if(c.sundance_portfolio_control||c.sundance_portfolio_drop||c.sundance_portfolio_assembly)add('valance_shade_options',8,'Standalone valance selections cannot carry shade control, drop, or assembly options.');
  return issues;
 }
 const control=String(c.sundance_portfolio_control??''),hobbled=c.roman_style==='Hobbled';
 if(!sundancePortfolioControls.includes(control as never))add('control',18,'Choose a documented Portfolio control.');
 const td=control==='Cordless TDBU';const minWidth=td?24:control==='Somfy Sonesse Ultra 30'?29.5:control==='Standard LI Motor'?23.375:control==='Power Lift'?30:16;
 const minHeight=td?24:control==='Cordless'?25:18,maxWidth=td?48:96,maxHeight=hobbled||td?72:control==='Standard LI Motor'?86:96;
 if(!Number.isFinite(s.widthInches)||!Number.isFinite(s.heightInches)||s.widthInches<minWidth||s.widthInches>maxWidth||s.heightInches<minHeight||s.heightInches>maxHeight)add('size',18,`This Portfolio style/control requires width ${minWidth}–${maxWidth} inches and height ${minHeight}–${maxHeight} inches.`);
 if(!['Standard','Waterfall'].includes(String(c.sundance_portfolio_drop))||hobbled&&c.sundance_portfolio_drop!=='Waterfall')add('drop_style',6,'Choose Standard or Waterfall; Hobbled shades are waterfall only.');
 if(td&&(c.roman_style!=='Knife Pleat'||c.sundance_portfolio_drop!=='Standard'||!fabric?.tdbuAvailable))add('tdbu',14,'Cordless TDBU requires Standard drop, Knife Pleat, and an eligible material.');
 if(c.sundance_portfolio_assembly==='Two on one')add('assembly_components',18,'Multiple shades on one headrail require individual component dimensions and charges; the 112-inch total headrail limit alone does not verify each shade.');
 else if(c.sundance_portfolio_assembly!=='Single')add('assembly',18,'Choose single shade or identify a multiple-shade assembly requiring component verification.');
 if(!['Inside','Outside'].includes(String(c.mount_type)))add('mount',12,'Choose inside or outside mount.');
 const returns=String(c.sundance_portfolio_returns??'');
 if(!['None','Standard','Extended'].includes(returns)||returns==='Extended'&&c.mount_type!=='Outside'||td&&c.mount_type==='Inside'&&returns!=='None')add('shade_returns',14,'Select no returns, standard returns, or outside-only extended returns. Inside-mount TDBU cannot have returns.');
 const waterfall=c.sundance_portfolio_drop==='Waterfall';
 if(waterfall?!['None','Added'].includes(String(c.sundance_portfolio_front_valance)):c.sundance_portfolio_front_valance!=='Included')add('front_valance',8,'Standard shades include a front valance; waterfall shades may omit it or add a front valance.');
 if(!['Yes','No'].includes(String(c.sundance_portfolio_back_valance))||td&&c.sundance_portfolio_back_valance!=='Yes'||!td&&!waterfall&&c.sundance_portfolio_back_valance!=='No')add('back_valance',14,'Choose a waterfall back valance; TDBU includes one. Other standard shades do not use this waterfall option.');
 if(!['Yes','No'].includes(String(c.sundance_portfolio_interior_valance))||!waterfall&&c.sundance_portfolio_interior_valance!=='No')add('interior_valance',8,'Interior blackout-fabric valances are documented for waterfall shades.');
 if(c.sundance_portfolio_front_valance!=='None'&&c.sundance_portfolio_valance_length!=='Standard')add('custom_valance_length',8,'Custom front valance length requires manufacturer confirmation of the requested length and any charge.');
 if(c.mount_type==='Inside'){
  const depth=Number(c.sundance_portfolio_mount_depth);
  if(!Number.isFinite(depth)||depth<0.75)add('mount_depth',18,'Top-mounted inside brackets require at least ¾ inch of mounting depth.');
 }
 if(c.catalog_sundance_portfolio_valance_id)add('stale_valance_schedule',25,'A shade cannot use the standalone valance price schedule.');
 return issues;
}
