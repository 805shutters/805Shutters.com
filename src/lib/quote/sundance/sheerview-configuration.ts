import { sundanceAccessoryIssues,clearSundanceAccessoryQuantities } from './option-schedules';
import type {SelectionContext,ValidationIssue} from '@/lib/quote-v2/core';
import {sourceProvenance} from '@/lib/quote-v2/source-manifest';
import {sundanceSheerviewSource} from './sheerview-assortment';
export const sundanceSheerviewControls=['Continuous Cord Loop','Cordless','Rechargeable Motor with Wand'] as const;
export const sundanceSheerviewHeadrails=['Curved','Flat Square','No Drill'] as const;
export const sundanceSheerviewCordOptions=['Cord','Metal Chain','Plastic Chain','Safe Wand'] as const;
export const sundanceSheerviewFlatFinishes=[['LD-322','Beige'],['LD-L334','Pecan'],['LD-S113','White'],['LD-S302','Sesame'],['LD-S378','Cocoa'],['LD-S414','Cornsilk'],['LD-S503','Dolphin Gray'],['LD-S823','Rattan'],['LD-V110','Night Sky'],['LD-V113','Blueberry'],['LD-ZY090','Sage']] as const;
export const sundanceSheerviewHeadrailDepths:Record<string,number>={'Flat Square':3.7,Curved:4.2,'No Drill':2.7};
export function sundanceSheerviewControlPatch(options:Record<string,unknown>,control:string) {
 return {...clearSundanceAccessoryQuantities('sheerview',options),sundance_sheerview_control:control||null,sundance_sheerview_cord_option:null,
  ...(control!=='Cordless'&&options.sundance_sheerview_headrail==='No Drill'?{sundance_sheerview_headrail:null,catalog_sundance_sheerview_valance_id:null}:{})};
}
export function sundanceSheerviewHeadrailPatch(options:Record<string,unknown>,headrail:string) {
 if(!sundanceSheerviewHeadrails.includes(headrail as never)||headrail==='No Drill'&&options.sundance_sheerview_control!=='Cordless')return null;
 return {...options,sundance_sheerview_headrail:headrail,sundance_sheerview_headrail_finish:headrail==='Flat Square'?options.sundance_sheerview_headrail_finish:null,catalog_sundance_sheerview_valance_id:headrail==='Flat Square'?'sundance_sheerview_valance_p24_t3':null};
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
 if(headrail==='Flat Square'&&!sundanceSheerviewFlatFinishes.some(([code])=>code===c.sundance_sheerview_headrail_finish))add('flat_finish',10,'Select the exact painted flat-headrail finish.');
 if(headrail!=='Flat Square'&&c.sundance_sheerview_headrail_finish)add('stale_flat_finish',10,'Flat square painted finishes cannot be assigned to another headrail.');
 if(!['Inside','Outside'].includes(String(c.mount_type)))add('mount',28,'Choose inside or outside mount; factory inside width deductions must not be subtracted twice.');
 if(c.mount_type==='Inside'){
  const depth=Number(c.sundance_sheerview_mount_depth),required=sundanceSheerviewHeadrailDepths[headrail];
  if(!Number.isFinite(depth)||depth<=0)add('mount_depth',11,'Enter available inside mounting depth.');
  if(c.sundance_sheerview_recess==='Flush'){
   if(required!=null&&depth<required)add('flush_depth',11,`The published ${headrail} headrail and bracket depth is ${required} inches.`);
  }else add('recess_review',11,'Select flush recess or retain partial-recess mounting for manufacturer bracket/support confirmation. The guide shows the headrail envelope, not a verified minimum partial-mount depth.');
 }
 const expected=headrail==='Flat Square'?'sundance_sheerview_valance_p24_t3':null;
 if((c.catalog_sundance_sheerview_valance_id??null)!==expected)add('valance_route',24,'The selected headrail must retain its exact flat square valance schedule or no flat-valance schedule.');
 for(const message of sundanceAccessoryIssues('sheerview',c))add('accessory_'+issues.length,27,message);
 return issues;
}
