import { lookupSundanceValanceSource } from './valance-schedules';
export const sundanceSheerviewAccessories=[
 {key:'pole',label:'Cordless telescoping pole 14–25 inches',sourceRetail:40,control:'Cordless',page:26},
 {key:'single_remote',label:'Single-channel remote',sourceRetail:133,control:'Rechargeable Motor with Wand',page:27},
 {key:'multi_remote',label:'Multi-channel remote',sourceRetail:167,control:'Rechargeable Motor with Wand',page:27},
 {key:'usb6',label:'USB 6-foot cable with charger',sourceRetail:68,control:'Rechargeable Motor with Wand',page:27},
 {key:'usb10',label:'USB 10-foot cable with charger',sourceRetail:78,control:'Rechargeable Motor with Wand',page:27},
 {key:'replacement_wand',label:'Replacement wand',sourceRetail:176,control:'Rechargeable Motor with Wand',page:27},
 {key:'wifi_hub',label:'WiFi hub',sourceRetail:452,control:'Rechargeable Motor with Wand',page:27},
] as const;
export const sundancePortfolioAccessories=[
 {key:'li_remote',label:'15-channel handheld remote',sourceRetail:90,controls:['Standard LI Motor','Power Lift'],page:25},
 {key:'li_wall',label:'15-channel wall switch',sourceRetail:161,controls:['Standard LI Motor','Power Lift'],page:25},
 {key:'li_hub',label:'Pro Hub',sourceRetail:468,controls:['Standard LI Motor','Power Lift'],page:25},
 {key:'li_charger',label:'16½-foot charger',sourceRetail:81,controls:['Standard LI Motor','Power Lift'],page:25},
 {key:'somfy_situo1',label:'Situo 1-channel remote',sourceRetail:147,controls:['Somfy Sonesse Ultra 30'],page:26},
 {key:'somfy_situo5',label:'Situo 5-channel remote',sourceRetail:185,controls:['Somfy Sonesse Ultra 30'],page:26},
 {key:'somfy_telis16',label:'Telis 16-channel remote',sourceRetail:645,controls:['Somfy Sonesse Ultra 30'],page:26},
 {key:'somfy_wall1',label:'Somfy 1-channel wall switch',sourceRetail:380,controls:['Somfy Sonesse Ultra 30'],page:26},
 {key:'somfy_wall5',label:'Somfy 5-channel wall switch',sourceRetail:40,controls:['Somfy Sonesse Ultra 30'],page:26},
 {key:'somfy_tahoma',label:'TaHoma interface',sourceRetail:623,controls:['Somfy Sonesse Ultra 30'],page:26},
 {key:'somfy_charger',label:'Somfy charger with 6-foot cable',sourceRetail:80,controls:['Somfy Sonesse Ultra 30'],page:26},
] as const;
export function sundanceAccessoryIssues(product:'sheerview'|'portfolio',c:Record<string,unknown>) {
 const control=String(c[`sundance_${product}_control`]??'');
 const rows=product==='sheerview'?sundanceSheerviewAccessories:sundancePortfolioAccessories;
 return rows.flatMap(row=>{
  const raw=c[`sundance_${product}_${row.key}_qty`];if(raw==null||raw==='')return [];
  const quantity=Number(raw),validControl='control' in row?row.control===control:row.controls.some(v=>v===control);
  return !Number.isSafeInteger(quantity)||quantity<0?[`${row.label}: use a nonnegative whole quantity`]:quantity&&!validControl?[`${row.label}: incompatible control`]:[];
 });
}
export function clearSundanceAccessoryQuantities(product:'sheerview'|'portfolio',c:Record<string,unknown>) {
 const next={...c};for(const row of product==='sheerview'?sundanceSheerviewAccessories:sundancePortfolioAccessories)next[`sundance_${product}_${row.key}_qty`]=null;return next;
}
export type SundanceOptionEvidence={key:string;label:string;sourceRetail:number;page:number;quantity:number};
/** Independent published retail evidence. Shared accessories must be allocated once per order. */
export function sundanceOptionEvidence(product:'sheerview'|'portfolio',c:Record<string,unknown>,width:number){
 const entries:SundanceOptionEvidence[]=[],unresolved:string[]=[];
 const add=(key:string,label:string,sourceRetail:number,page:number,quantity=1)=>entries.push({key,label,sourceRetail,page,quantity});
 const control=String(c[`sundance_${product}_control`]??'');
 if(product==='sheerview'){
  if(control==='Cordless')add('cordless','Cordless control',111,26);
  if(control==='Rechargeable Motor with Wand')add('motor','Rechargeable motor with wand',365,27);
  if(c.sundance_sheerview_headrail==='No Drill')add('no_drill','No Drill',40,26);
  if(c.sundance_sheerview_cord_option==='Safe Wand')add('safe_wand','Safe Wand',63,25);
  if(width>93)add('oversize','Width over 93-inch freight charge',110,27);
  if(c.sundance_sheerview_headrail==='Flat Square'){
   const v=lookupSundanceValanceSource('sundance_sheerview_valance_p24_t3',width);
   if(v)add('flat_valance','Flat square valance',v.sourceRetail,24);else unresolved.push('Flat valance width outside source schedule');
  }
  if(c.sundance_sheerview_assembly==='Two on one')unresolved.push('Two-on-one component controls and charges require assembly verification');
 }else if(c.roman_style!=='Valance Only'){
  const motors:Record<string,number>={'Standard LI Motor':350,'Power Lift':406,'Somfy Sonesse Ultra 30':556};
  if(motors[control])add('motor',control,motors[control],control==='Somfy Sonesse Ultra 30'?26:25);
  if(control==='Cordless TDBU')add('tdbu','Cordless TDBU',145,25);
  if(c.sundance_portfolio_drop==='Waterfall'&&c.sundance_portfolio_front_valance==='Added')add('front_valance','Waterfall front valance',51,25);
  if(c.sundance_portfolio_assembly==='Two on one')unresolved.push('Two-on-one component pricing requires assembly verification; published headrail surcharge is $56 retail');
  if(c.sundance_portfolio_liner==='BO01 Black-Out White')unresolved.push('Add 10% of the selected source shade grid for blackout liner before account pricing');
 }
 const accessories=product==='sheerview'?sundanceSheerviewAccessories:sundancePortfolioAccessories;
 for(const row of accessories){
  const raw=c[`sundance_${product}_${row.key}_qty`];if(raw==null||raw==='')continue;
  const quantity=Number(raw),validControl='control' in row?row.control===control:row.controls.some(v=>v===control);
  if(!Number.isSafeInteger(quantity)||quantity<0){unresolved.push(`${row.label}: use a nonnegative whole quantity`);continue;}
  if(quantity&&!validControl){unresolved.push(`${row.label}: incompatible control`);continue;}
  if(quantity)add(row.key,row.label,row.sourceRetail,row.page,quantity);
 }
 return {sourceId:product==='sheerview'?'sundance-h-sheerview-pricing_aug2026-4a981c88776d':'sundance-sundance-portfolio-roman-shade-product-price-guide-2026-421a4cba9a72',entries,unresolved,sourceRetailSubtotal:Math.round(entries.reduce((sum,e)=>sum+e.sourceRetail*e.quantity,0)*100)/100,priceBasis:'suggested_retail' as const,customerPriceEligible:false as const};
}
