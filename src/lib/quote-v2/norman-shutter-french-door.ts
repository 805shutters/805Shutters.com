import {normanFrenchDoorTypes,normanFrenchDoorBattenType,normanFrenchDoorBatten,normanFrenchDoorFrames,normanFrenchDoorPages} from '../quote/norman-shutter-french-door';
import {normanShutterFrame,normanShutterProgram} from '../quote/norman-shutter-assortment';
import type {NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import type {SelectionContext,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';
export function validateNormanFrenchDoor(s:SelectionContext,p:NormanShutterPanelRecord):ValidationIssue[]{
 if(p.application!=='french_door')return [];
 const program=normanShutterProgram(s.programId);if(!program)return [];
 const r=p.frenchDoor,issues:ValidationIssue[]=[];
 const add=(id:string,explanation:string,pages=normanFrenchDoorPages(program.id),severity:ValidationIssue['severity']='hard_block',extra:Record<string,unknown>={})=>issues.push({severity,ruleId:`norman.shutter.french_door.${id}`,source:sourceProvenance(program.sourceId,{pages}),selectedValues:{record:r??null,...extra},explanation});
 if(!normanFrenchDoorTypes(program.id).length){add('source_missing','The pinned Woodlore guide does not establish a French-door cutout assortment. Obtain a program-specific factory schedule.',[32]);return issues;}
 if(!r){add('record_required','Record the exact manufacturer French-door cutout type, top shape and measurement-form reference. A general French Door selection is not a cutout schedule.');return issues;}
 if(!normanFrenchDoorTypes(program.id).includes(r.cutoutType))add('type','Select an exact source-supported French-door type; AquaShield does not offer E or F.');
 if(!['L','R'].includes(r.panelDirection)||s.configuration.panel_config!==r.panelDirection||p.panels.length!==1)add('one_panel','All documented French-door types A–F require exactly one panel with an explicit L or R configuration.');
 if(p.panels.length===1&&(p.panels[0].widthInches==null||p.panels[0].widthInches<=0))add('panel_width','Record the actual finished single-panel width separately from opening and cutout dimensions.');
 if(!r.topShape)add('top_shape','Record the exact rectangular, arch or quarter-arch top.');
 if(!r.measurementFormReference.trim())add('measurement_form','Record the actual manufacturer measurement-form or drawing reference. This reference does not establish factory acceptance or pricing.');
 const batten=normanFrenchDoorBattenType(r.cutoutType);
 if(batten){
  if(Array.isArray(s.options.surcharges)&&s.options.surcharges.some(e=>e!==null&&typeof e==='object'&&!Array.isArray(e)&&e.id==='panel_locks'))add('panel_lock','Panel locks are unavailable for French-door types E and F.',[program.id.startsWith('woodlore_')?54:program.id==='brightwood'?47:41]);
  if(r.topShape!=='rectangular')add('batten_top','Types E and F do not offer arch or quarter-arch tops.');
  if(r.lFrameCode)add('batten_frame','Types E and F use a batten behind the panel; an A–D L-frame selection must not remain active in this cutout record.');
  const dimensions=normanFrenchDoorBatten(s.configuration.louver_size);
  if(!dimensions)add('batten_louver','Select the exact source-supported louver size before the E/F batten dimensions can be established.');
  else add('batten_dimensions','The E/F batten is behind the panel. These source dimensions do not determine batten quantities, cutout geometry, mounting acceptance or price.',undefined,'auto_derive',dimensions);
  if(p.panels[0]?.widthInches!=null&&p.panels[0].widthInches<9&&s.configuration.stile_join!=='Butt')add('narrow_stile','French-door E/F panels narrower than9 inches require Butt stiles.',[program.id.startsWith('woodlore_')?16:program.id==='brightwood'?13:14]);
 }else if(['A','B','C','D'].includes(r.cutoutType)){
  const frame=normanFrenchDoorFrames(program.id).find(f=>f.code===r.lFrameCode);
  if(!frame)add('frame','Types A–D require a documented L frame; L frames with a quarter-inch-thick light block are unavailable.');
  if(frame&&normanShutterFrame(program.id,s.configuration.frame_type)?.code!==frame.code)add('frame_identity','The main saved frame must match the French-door L-frame identity. Save panel construction after selecting the frame.');
  if(!/^(outside(?: mount)?|om|o)$/i.test(String(s.configuration.mount_type??'').trim()))add('mount','French-door types A–D are only available Outside Mount.');
 }
 // Application geometry and provisional shutter-price holds remain in the parent
 // validator. No fixed-louver, cutout-height, hinge or template approval is inferred.
 return issues;
}
