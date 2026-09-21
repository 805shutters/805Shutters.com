import {normanBifoldMountKey,validNormanFloatingLayout,normanBifoldPanelCount,normanSpecialBifoldPages,normanSpecialBifoldLayouts,normanFrameHingedWidthReferences} from '../quote/norman-shutter-bifold-special';
import {normanShutterProgram} from '../quote/norman-shutter-assortment';
import type {NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import type {SelectionContext,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';
export function validateNormanSpecialBifold(s:SelectionContext,record:NormanShutterPanelRecord):ValidationIssue[]{
 const r=record.bifold90,p=normanShutterProgram(s.programId);if(!r||!p||!['floating_90','frame_hinged'].includes(r.kind))return [];
 const issues:ValidationIssue[]=[],c=s.configuration;
 const add=(id:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.shutter.bifold90.${id}`,source:sourceProvenance(p.sourceId,{pages:normanSpecialBifoldPages(p.id)}),selectedValues:{programId:p.id,record},explanation});
 if(!(r.kind==='floating_90'?validNormanFloatingLayout(p.id,r.layout):normanSpecialBifoldLayouts(p.id,r.kind).includes(r.layout)))add('special_layout','Choose a documented layout: floating groups have two panels (wood also permits four); frame-hinged AquaShield is unavailable.');
 if(c.panel_config!==r.layout)add('layout_mismatch','The saved track layout must match the selected panel layout.');
 if(!r.mount||normanBifoldMountKey(c.mount_type)!==normanBifoldMountKey(r.mount))add('mount','Record the exact mount and retain it with the line.');
 if(record.panels.length!==normanBifoldPanelCount(r.layout))add('panel_count','Record every actual panel; slash marks separate floating groups, not panels.');
 const max=['woodlore','woodlore_plus'].includes(p.id)?24:26; // Do not import the separate wood multi-fold 20-inch limit into floating/frame-hinged subtypes.
 record.panels.forEach((panel,i)=>{if(panel.widthInches==null||panel.widthInches<6||panel.widthInches>max)add('panel_width',`Panel ${i+1} finished width must be from 6 through ${max} inches for this program and folding group.`);});
 if(!(p.id==='woodlore_aquashield'?['2"']:['2"','2 1/4"']).includes(String(c.stile_width))||!(r.kind==='frame_hinged'?['Rabbet']:['Butt','Rabbet']).includes(String(c.stile_join)))add('stile','Frame-hinged requires Rabbet; floating permits Butt/Rabbet. Only 2 or 2¼-inch stiles are documented; AquaShield uses 2-inch.');
 if(r.kind==='floating_90'){
  if(!r.floating||r.floating.sideBoards===null)add('floating_side_boards','Record whether floating tracks have side boards; this determines the default end stoppers.');
  if(r.floating&&r.floating.optionalStopperPositionsInches.some(v=>v<0)||r.floating&&new Set(r.floating.optionalStopperPositionsInches).size!==r.floating.optionalStopperPositionsInches.length)add('stopper_positions','Record distinct nonnegative optional stopper positions measured from the left end of the top track. Final track fit requires factory confirmation.');
  if(r.headerInches===null||(r.mount!=='Outside Mount'&&r.headerInches!==3))add('header','Inside/semi-inside floating tracks use 3-inch headers; outside mount offers 3 or 3½ inches.');
  if(!r.fascia||p.id==='woodlore_aquashield'&&r.fascia!=='plain')add('fascia','Select the documented fascia; AquaShield permits plain only.');
  if(!r.flatMountingSurface)add('flat_surface','Confirm the flat mounting surface for the floating header and floor track.');
  if(r.headerExtensionInches===null||r.headerExtensionInches<0||r.headerExtensionInches>2)add('extension','Record the header extension from 0 through 2 inches.');
  return issues;
 }
 const f=r.frameHinged;
 if(!f){add('frame_hinged_details','Record the Vintage L frame, bottom construction, frame hinge and door/ring-pull choices.');return issues;}
 if(f.frame!=='Vintage L Frame')add('frame','Frame-hinged Bi-fold requires the source-listed Vintage L Frame.');
 if(f.buildoutInches===null)add('frame_buildout','Record the Vintage L frame buildout: none, ½ inch or 1 inch.');
 if(!f.bottom)add('bottom','Choose three sides plus bottom light block, or three sides plus 3-inch Deco Sill; four-sided construction is unavailable.');
 if(!f.hinge||p.id==='woodlore'&&f.hinge!=='self_mortise_2_3_8')add('frame_hinge','Choose 2⅜-inch Self Mortise; Invisible is documented only for Woodlore Plus, Brightwood and Normandy.');
 if(f.usedAsDoor===null)add('door','Specify whether the frame-hinged shutter is used as a door; door applications have a 19mm default bottom gap.');
 if(f.ringPull===null||f.ringPull&&(f.ringPullHeightInches===null||f.ringPullHeightInches<0))add('ring_pull','Record optional ring pull and its height from the floor to the pull center.');
 if(f.ringPull===false&&f.ringPullHeightInches!==null)add('stale_ring_pull','A ring-pull height applies only when the ring pull is requested.');
 if(r.layout.startsWith('L')&&r.layout.endsWith('R')&&record.panels[0]?.widthInches!==record.panels.at(-1)?.widthInches)add('unequal_stack_anchors','The source center-opening diagrams use equal A widths at the two frame-hinged ends. Unequal stack anchors require factory confirmation.');
 const refs=normanFrameHingedWidthReferences(r.layout,f.hinge,record.panels.map(v=>v.widthInches));
 if(refs&&refs.some((ref,i)=>ref!==null&&record.panels[i].widthInches!=null&&Math.abs(record.panels[i].widthInches!*25.4-ref.widthMm)>0.000001))add('uneven_panel_width','Frame-hinged non-anchor panels must be A +34.5mm (Self Mortise) or A +29.5mm (Invisible), using the hinged end panel of each stack as A. Record exact factory panel widths; do not round this difference to a sixteenth.');
 return issues;
}
