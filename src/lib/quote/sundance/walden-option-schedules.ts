import { sundanceWaldenSource } from './walden-assortment';
import { sundanceValanceSchedules, lookupSundanceValanceSource } from './valance-schedules';
export const sundanceWaldenAccessories=[
 {key:'remote15',label:'15-channel remote',price:90,controls:['Standard LI Motor','Power Lift LI Motor']},
 {key:'wall15',label:'15-channel wall switch',price:161,controls:['Standard LI Motor','Power Lift LI Motor']},
 {key:'pro_hub',label:'Pro Hub',price:468,controls:['Standard LI Motor','Power Lift LI Motor']},
 {key:'charger16',label:'16½-foot USB-C charger',price:81,controls:['Pro Wand','Standard LI Motor','Power Lift LI Motor']},
 {key:'situo1',label:'Somfy Situo 1-channel remote',price:147,controls:['Somfy Sonesse Ultra 30']},
 {key:'situo5',label:'Somfy Situo 5-channel remote',price:185,controls:['Somfy Sonesse Ultra 30']},
 {key:'telis16',label:'Somfy Telis 16-channel remote',price:645,controls:['Somfy Sonesse Ultra 30']},
 {key:'somfy_wall1',label:'Somfy 1-channel wall switch',price:380,controls:['Somfy Sonesse Ultra 30']},
 {key:'somfy_wall5',label:'Somfy 5-channel wall switch',price:405,controls:['Somfy Sonesse Ultra 30']},
 {key:'tahoma',label:'TaHoma interface',price:623,controls:['Somfy Sonesse Ultra 30']},
 {key:'somfy_charger',label:'Somfy charger with 6-foot cable',price:80,controls:['Somfy Sonesse Ultra 30']},
];
export function sundanceWaldenAccessoryKey(key:string){return `sundance_walden_accessory_${key}_qty`;}
export function sundanceWaldenControlPatch(options:Record<string,unknown>,control:string){return{...Object.fromEntries(Object.entries(options).filter(([key])=>!key.startsWith('sundance_walden_accessory_'))),sundance_walden_control:control||null,sundance_walden_wand_length:null,sundance_walden_chain:null};}
export function sundanceWaldenStylePatch(options:Record<string,unknown>,style:string){
 const next=style==='Valance Only'?sundanceWaldenControlPatch(options,''):{...options};
 return {...next,sundance_walden_style:style||null,sundance_walden_back_valance:null,sundance_walden_interior_valance:null,...(style==='Valance Only'?{walden_movable_liner:null,sundance_walden_assembly:'Single',sundance_walden_cutout_qty:null}: {})};
}
export function sundanceWaldenAccessoryIssues(c:Record<string,unknown>){return sundanceWaldenAccessories.flatMap(a=>{
 const raw=c[sundanceWaldenAccessoryKey(a.key)];if(raw==null||raw==='')return[];const q=Number(raw);
 if(!Number.isSafeInteger(q)||q<0)return[`${a.label}: quantity must be a nonnegative whole number.`];
 if(q>0&&(c.sundance_walden_style==='Valance Only'||!a.controls.includes(String(c.sundance_walden_control))))return[`${a.label}: incompatible control or valance-only style.`];return[];
});}
export function sundanceWaldenOptionEvidence(p:string,c:Record<string,unknown>,width:number,height:number){
 const premier=p==='sundance_walden_premier',page=premier?22:20,control=String(c.sundance_walden_control??''),valanceOnly=c.sundance_walden_style==='Valance Only';
 const entries:{label:string;retail:number;page:number}[]=[],unresolved=sundanceWaldenAccessoryIssues(c);
 const add=(label:string,retail:number,sourcePage=page)=>entries.push({label,retail,page:sourcePage});
 if(c.sundance_walden_style==='Waterfall'&&(c.sundance_walden_back_valance!=='None'||c.sundance_walden_interior_valance==='Requested interior valance'))unresolved.push('Requested back/interior valance charges require confirmation; an available option is not evidence of a zero surcharge.');
 if(valanceOnly){
  const row=sundanceWaldenSource.rows.find(row=>row.productId===p&&row.id===c.fabric_color_id);
  const price=lookupSundanceValanceSource(`${p}_valance_${row?.priceGroup.toLowerCase()}`,width,height);
  if(price)add('Valance-only base',price.sourceRetail,sundanceValanceSchedules.find(v=>v.id===`${p}_valance_${row?.priceGroup.toLowerCase()}`)!.sourcePage);
  else unresolved.push('No matching valance-only group/size source cell.');
  if(c.catalog_sundance_liner_grid_id){if(premier)add('Valance-only liner',38);else unresolved.push('Select valance-only liner surcharge is not explicitly specified; do not substitute full-shade liner pricing.');}
  if(c.catalog_sundance_edge_binding_grid_id){if(premier)add('Valance-only edge binding',23);else unresolved.push('Select valance-only binding surcharge requires source/account confirmation.');}
 }else{
  const motors:Record<string,number>={'Pro Wand':premier?235:230,'Standard LI Motor':350,'Power Lift LI Motor':406,'Somfy Sonesse Ultra 30':556};
  if(control==='Cordless TDBU')add('Cordless TDBU',140);
  if(motors[control]&&(premier||control!=='Power Lift LI Motor'))add(control,motors[control],control==='Somfy Sonesse Ultra 30'?premier?23:21:page);
  if(c.walden_movable_liner==='Yes')add('Twin movable-liner surcharge',309,premier?20:20);
  if(c.sundance_walden_assembly==='Two on one')add('Two-on-one surcharge',52);
  if(c.sundance_walden_assembly==='Three on one')add('Three-on-one surcharge',65);
  if(!premier&&control==='Clutch and Loop'&&c.sundance_walden_chain==='Stainless Steel')add('Stainless Steel chain',37);
 }
 if(['Standard','Extended'].includes(String(c.sundance_walden_returns))&&c.sundance_walden_return_material==='Edge binding fabric')add('Fabric valance returns',39);
 const cut=Number(c.sundance_walden_cutout_qty??0);if(Number.isSafeInteger(cut)&&cut>0)add(`Cut-outs × ${cut}`,39*cut);
 for(const a of sundanceWaldenAccessories){const q=Number(c[sundanceWaldenAccessoryKey(a.key)]??0);if(!valanceOnly&&Number.isSafeInteger(q)&&q>0&&a.controls.includes(control))add(`${a.label} × ${q}`,q*(a.key==='pro_hub'&&premier?458:a.price),control==='Somfy Sonesse Ultra 30'?premier?23:21:page);}
 return{entries,unresolved,sourceRetailSubtotal:entries.reduce((sum,e)=>sum+e.retail,0),customerPriceEligible:false as const};
}
