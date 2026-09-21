import {normanSpecialtyGeometryProblems} from './norman-shutter-specialty-geometry';
import {NORMAN_CONTINUOUS_ARCH_SHAPES,NORMAN_FRAME_IN_RAIL_SHAPES,normanSpecialtyFrames,normanSpecialtyIsSunburst,normanSpecialtyShapes,normanSpecialtySourcePages,normanSpecialtySupportedProgram} from '../quote/norman-shutter-specialty';
import {normanShutterFrame,normanShutterProgram} from '../quote/norman-shutter-assortment';
import type {NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import type {SelectionContext,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';
export function validateNormanShutterSpecialty(s:SelectionContext,record:NormanShutterPanelRecord):ValidationIssue[]{
 if(record.application!=='specialty')return [];
 const program=normanShutterProgram(s.programId);if(!program)return [];
 const r=record.specialty,issues:ValidationIssue[]=[];
 const add=(id:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.shutter.specialty.${id}`,source:sourceProvenance(program.sourceId,{pages:normanSpecialtySupportedProgram(program.id)?normanSpecialtySourcePages(program.id):program.pages}),selectedValues:{specialty:r??null},explanation});
 if(!normanSpecialtySupportedProgram(program.id)){add('program_source','This program has no verified specialty assortment in its pinned binder; verify the exact specialty program before ordering.');return issues;}
 if(!r){add('record_required','Save the exact specialty shape and its frame/construction choices.');return issues;}
 if(!normanSpecialtyShapes(program.id).some(([code])=>code===r.shapeCode))add('shape','Choose an exact specialty identity documented for this program. AquaShield does not offer YS56 Solid Rail Arch.');
 if(!r.frameSides||r.frameIncludeInRail===null||r.hinges===null||r.magnets===null||r.hangStripBehind===null)add('construction_required','Record specialty frame sides, Frame Include In Rail, hinges, magnets and hang-strip placement explicitly.');
 const frame=normanShutterFrame(program.id,r.frameType);
 if(!frame||!normanSpecialtyFrames(program.id,r.frameIncludeInRail).some(f=>f.code===frame.code))add('frame','Choose a documented specialty frame. Frame Include In Rail permits only its listed Z frames and excludes Tilt Out Z.');
 if(frame&&normanShutterFrame(program.id,s.configuration.frame_type)?.code!==frame.code)add('frame_identity','The saved frame selection and specialty frame record must agree. Save the specialty construction again.');
 if(r.frameIncludeInRail){
  if(!NORMAN_FRAME_IN_RAIL_SHAPES.includes(r.shapeCode))add('frame_in_rail_shape','Frame Include In Rail is offered only for the documented sunburst specialty shapes.');
  if(r.hinges!==false||r.magnets!==false)add('fixed_frame','Frame Include In Rail is fixed, with neither hinges nor magnets.');
 }
 if(['YS11','YS12','YS14'].includes(r.shapeCode)&&r.hangStripBehind)add('hang_strip','Horizontal-louver hexagons and octagons do not offer a hang strip behind the panel.');
 if(normanSpecialtyIsSunburst(r.shapeCode)&&(r.sunburstHubInches===null||r.sunburstHubInches<=0||r.sunburstHubInches>12))add('hub','Record the actual sunburst hub size, greater than zero and no more than 12 inches.');
 if(NORMAN_CONTINUOUS_ARCH_SHAPES.includes(r.shapeCode)&&!r.archStyle)add('arch_style','Choose Standard Louvered Arch or Continuous Arch explicitly.');
 if(r.archStyle==='continuous'){
  if(program.id==='woodlore_aquashield'||!NORMAN_CONTINUOUS_ARCH_SHAPES.includes(r.shapeCode))add('continuous_arch','Continuous Arch is offered only for its documented shapes and is unavailable for AquaShield.');
  if(r.stileWidthInches!==2.25)add('continuous_stile','Continuous Arch requires a 2¼-inch stile.');
 }
 if(['YS01','YS02','YS03','YS04','YS06'].includes(r.shapeCode)&&record.panels.length!==1)add('panel_count','This sunburst specialty is one panel only.');
 if(['YS01','YS02','YS03','YS04','YS06','YS15','YS20','YS17','YS18','YS19','YS60','YS11','YS12','YS14','YS13','YS16'].includes(r.shapeCode)&&!['4','all'].includes(r.frameSides))add('frame_sides','This specialty requires four frame sides or an all-around frame.');
 if(NORMAN_FRAME_IN_RAIL_SHAPES.includes(r.shapeCode)&&r.shapeCode!=='YS09'&&record.panels.some(p=>p.divider==='present'))add('sunburst_divider','Panels containing only sunburst louvers cannot have a divider rail.');
 record.panels.forEach((panel,index)=>{
  if(panel.widthInches==null||panel.widthInches<=0||panel.heightInches===null||panel.heightInches<=0)add('net_dimensions',`Record specialty panel ${index+1} actual net width and height; opening dimensions do not establish these values.`);
  if(['YS15','YS20'].includes(r.shapeCode)&&[panel.widthInches,panel.heightInches].some(n=>n==null||n<15.5||n>84))add('round_net_range',`Circle/Oval Sunburst panel ${index+1} net width and height must each be 15½–84 inches.`);
 });
 for(const problem of normanSpecialtyGeometryProblems(r,s.configuration.mount_type))add(problem.id,problem.explanation);
 // This bounded assortment record deliberately does not certify templates, leg/curve geometry or rates.
 add('geometry','Specialty identity and frame choices are saved. Exact net/leg/curve dimensions, template acceptance, final hardware and account pricing still require verification.');
 return issues;
}
