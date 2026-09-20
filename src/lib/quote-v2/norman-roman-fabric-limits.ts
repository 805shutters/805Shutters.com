import rows from '@/lib/quote/norman-roman-front-2026-09.json';
import type { SelectionContext, ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';
export const romanSeptemberFrontRows=rows;
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function romanFabricConstructionChoices(code:unknown,style:unknown,orientation:unknown){
 const row=rows.find(r=>r.colorCode===String(code??'').toUpperCase());
 const railroadStyle=/batten back|soft fold/.test(norm(style)) || ['F1082','F1083'].includes(String(code??'').toUpperCase());
 const orientations=row && row.railroad!=='No' && railroadStyle?['Standard / Non-Railroaded','Railroaded']:['Standard / Non-Railroaded'];
 const seams=row?.seam==='Yes'?['No Seams',orientation==='Railroaded'?'Horizontal Seams':'Vertical Seams']:['No Seams'];
 return {orientations,seams};
}
export function romanFabricLimits(s:SelectionContext){
 if(s.productId!=='roman'||!s.catalogVersion.endsWith('norman-roman-mounting-2026-09-20-r7'))return null;
 const c=s.configuration,fabric=rows.find(r=>r.colorCode===String(c.fabric_color_code??'').toUpperCase());
 const issues:ValidationIssue[]=[];
 const add=(id:string,page:number,explanation:string)=>issues.push({severity:'hard_block',ruleId:`roman.fabric_limits.${id}`,source:sourceProvenance('norman-roman-guide-2026-09',{page}),selectedValues:{fabric_color_code:c.fabric_color_code??null,fold_style:c.fold_style??null,width:s.widthInches,height:s.heightInches},explanation});
 if(!fabric){add('source_missing',25,'The exact Roman fabric is not in the September front-fabric tables. Confirm its current availability and limits before automatic pricing.');return {issues,record:null};}
 const style=norm(c.fold_style),lift=norm(c.lift_system),common=norm(c.shade_type)==='common valance',dn=norm(c.shade_type)==='day night',inside=norm(c.mount_type)==='inside mount';
 const railroad=/railroad/.test(norm(c.fabric_orientation))&&!/non railroad/.test(norm(c.fabric_orientation));
 const seams=norm(c.seaming);
 if(railroad&&fabric.railroad==='No')add('railroad_unavailable',fabric.sourcePage,'This exact Roman fabric cannot be railroaded.');
 if(/vertical|horizontal/.test(seams)&&fabric.seam==='No')add('seam_unavailable',fabric.sourcePage,'This exact Roman fabric does not permit seams.');
 if(fabric.colorCode==='F0031'&&railroad){
  const maximum=style.includes('soft')?26:36;
  if(s.heightInches>maximum)add('f0031_height',13,`Railroaded Black Gingham F0031 is limited to ${maximum} inches high for this style.`);
 }
 const widths=common&&Array.isArray(c.common_valance_panel_widths)?c.common_valance_panel_widths.map(Number):[s.widthInches];
 const finishedWidths=widths.map(w=>w-(inside?(common ? .1875 : .375):0));
 const allowance=style==='flat fold without seams'?(lift==='cordless'?(dn?9.125:8.375):5.75):style.includes('batten back')?(['Sheer Elegance','Scarlett'].includes(fabric.collection)?3.5:1.9375):style==='soft fold'?2.4375:style==='ribbon banded'&&fabric.clothCode==='AB0203'?fabric.fabricWidth-55:null;
 const maxWidth=allowance===null?null:fabric.fabricWidth-allowance;
 if(!railroad&&maxWidth!==null&&finishedWidths.some(w=>w>maxWidth)&&!seams.includes('vertical'))add('no_vertical_seam_width',13,`The maximum finished width without vertical seams is ${maxWidth} inches for this fabric, style and control. Choose a permitted seam or railroad option, or reduce the width.`);
 if(lift==='continuous cord loop'&&['yes','true'].includes(norm(c.side_by_side))&&!/^2(?:\D|$)/.test(String(c.headrail_size??'')))add('matched_headrail',13,'All side-by-side Continuous Cord Loop Roman shades require the 2-inch headrail.');
 return {issues,record:{sourceId:'norman-roman-guide-2026-09',sourcePage:fabric.sourcePage,fabricCode:fabric.clothCode,fabricWidth:fabric.fabricWidth,railroadAvailability:fabric.railroad,seamAvailability:fabric.seam,finishedWidths,maximumWidthWithoutVerticalSeams:maxWidth}};
}
