import { sundanceAccessoryIssues,clearSundanceAccessoryQuantities } from './option-schedules';
import type {SelectionContext,ValidationIssue} from '@/lib/quote-v2/core';
import {sourceProvenance} from '@/lib/quote-v2/source-manifest';
import {sundanceSheerviewSource} from './sheerview-assortment';
export const sundanceSheerviewControls=['Continuous Cord Loop','Cordless','Rechargeable Motor with Wand'] as const;
export const sundanceSheerviewHeadrails=['Curved','Flat Square','No Drill'] as const;
export const sundanceSheerviewCordOptions=['Cord','Metal Chain','Plastic Chain','Safe Wand'] as const;
export function sundanceSheerviewControlPatch(options:Record<string,unknown>,control:string) {
 return {...clearSundanceAccessoryQuantities('sheerview',options),sundance_sheerview_control:control||null,sundance_sheerview_cord_option:null,
  ...(control!=='Cordless'&&options.sundance_sheerview_headrail==='No Drill'?{sundance_sheerview_headrail:null,catalog_sundance_sheerview_valance_id:null}:{})};
}
export function sundanceSheerviewHeadrailPatch(options:Record<string,unknown>,headrail:string) {
 if(!sundanceSheerviewHeadrails.includes(headrail as never)||headrail==='No Drill'&&options.sundance_sheerview_control!=='Cordless')return null;
 return {...options,sundance_sheerview_headrail:headrail,catalog_sundance_sheerview_valance_id:headrail==='Flat Square'?'sundance_sheerview_valance_p24_t3':null};
}
export function validateSundanceSheerviewConfiguration(s:Pick<SelectionContext,'widthInches'|'heightInches'|'programId'|'configuration'>):ValidationIssue[] {
 const c=s.configuration;const issues:ValidationIssue[]=[];
 const add=(key:string,page:number,message:string)=>issues.push({severity:'hard_block',ruleId:'sundance.sheerview.'+key,source:sourceProvenance('sundance-h-sheerview-pricing_aug2026-4a981c88776d',{page}),selectedValues:{widthInches:s.widthInches,heightInches:s.heightInches,...c},explanation:message});
 const control=String(c.sundance_sheerview_control??'');const headrail=String(c.sundance_sheerview_headrail??'');
 const row=sundanceSheerviewSource.rows.find(row=>row.id===c.fabric_color_id);
 if(!row||row.programId!==s.programId||row.code!==c.fabric_color_code||row.vaneSize!==c.vane_size||row.privacy!==c.light_control) add('material',19,'Select an exact SheerView color and its matching source grid.');
 if(!sundanceSheerviewControls.includes(control as never))add('control',25,'Choose the documented continuous cord loop, cordless, or rechargeable motor with wand system. Other motors need separate compatibility evidence.');
 if(!sundanceSheerviewHeadrails.includes(headrail as never))add('headrail',11,'Choose a documented curved, flat square, or cordless No Drill headrail.');
 const cordless=control==='Cordless';const motor=control==='Rechargeable Motor with Wand';const noDrill=headrail==='No Drill';
 const minWidth=noDrill?29:cordless?20:motor?22:8,maxWidth=noDrill?79:cordless?96:116;
 let maxHeight=cordless?96:144;
 if(headrail==='Flat Square')maxHeight=Math.min(maxHeight,row?.privacy==='Room Darkening'?84:96);
 if(!Number.isFinite(s.widthInches)||!Number.isFinite(s.heightInches)||s.widthInches<minWidth||s.widthInches>maxWidth||s.heightInches<11||s.heightInches>maxHeight)add('size',cordless?26:motor?27:25,`This documented control/headrail requires width ${minWidth}–${maxWidth} inches and height 11–${maxHeight} inches.`);
 if(noDrill&&!cordless)add('no_drill_control',26,'No Drill is documented only for cordless shades.');
 if(control==='Continuous Cord Loop'&&!sundanceSheerviewCordOptions.includes(String(c.sundance_sheerview_cord_option) as never))add('cord_option',25,'Choose cord, metal chain, plastic chain, or Safe Wand for continuous cord loop.');
 if(control!=='Continuous Cord Loop'&&c.sundance_sheerview_cord_option)add('stale_cord',25,'Clear the cord-loop choice when changing to cordless or motorized control.');
 if(c.sundance_sheerview_assembly==='Two on one')add('assembly_components',25,'Two-on-one requires both shade measurements and the complete control/charge assembly; total width alone is not sufficient.');
 else if(c.sundance_sheerview_assembly!=='Single')add('assembly',25,'Choose single shade or identify a two-on-one assembly requiring manual component verification.');
 const expected=headrail==='Flat Square'?'sundance_sheerview_valance_p24_t3':null;
 if((c.catalog_sundance_sheerview_valance_id??null)!==expected)add('valance_route',24,'The selected headrail must retain its exact flat square valance schedule or no flat-valance schedule.');
 for(const message of sundanceAccessoryIssues('sheerview',c))add('accessory_'+issues.length,27,message);
 return issues;
}
