import {normanShutterDividerSizes} from '../quote/norman-shutter-dividers';
import {normanShutterProgram} from '../quote/norman-shutter-assortment';
import type {NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import type {SelectionContext,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';
export function validateNormanShutterDividers(s:SelectionContext,record:NormanShutterPanelRecord):ValidationIssue[]{
 const program=normanShutterProgram(s.programId);if(!program)return [];
 const pages=program.id.startsWith('woodlore_')?[41,42,43,44]:program.id.startsWith('normandy')?[35,36,37,38,39]:[35,36,37,38];
 const issues:ValidationIssue[]=[];
 const add=(id:string,index:number,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.shutter.dividers.${id}`,source:sourceProvenance(program.sourceId,{pages}),selectedValues:{panelNumber:index+1,dividerDetails:record.panels[index].dividerDetails??null},explanation:`Panel ${index+1}: ${explanation}`});
 record.panels.forEach((panel,index)=>{
  const splitSelected=/^(yes|true)$/i.test(String(s.configuration.split_tilt??''));
  if(panel.divider!=='present'&&!splitSelected&&!panel.dividerDetails?.splitTiltCentersInches.length)return;
  const r=panel.dividerDetails;
  if(!r){add('record_required',index,'save the divider sizes, location basis and exact-location choices.');return;}
  const splitOnly=panel.divider!=='present';
  if(splitSelected){
   if(!r.splitTiltMode)add('split_mode',index,'choose equal split or custom measured split locations explicitly.');
   if(r.splitTiltMode==='equal'&&r.splitTiltCentersInches.length>0)add('split_mode',index,'equal split cannot also contain custom locations.');
   if(r.splitTiltMode==='custom'&&r.splitTiltCentersInches.length===0)add('split_location_required',index,'custom split tilt requires at least one measured location.');
   add('split_geometry',index,'split tilt is recorded; actual louver counts and final top/bottom rail sizes still need manufacturer verification.');
  }
  if(splitOnly&&r.rails.length>0)add('rail_identity',index,'no-divider panels cannot contain a divider rail schedule.');
  if(r.splitTiltCentersInches.length>0&&(r.splitTiltReference!=='top_closed_louver'||r.splitTiltExactLocations?.length!==r.splitTiltCentersInches.length||r.splitTiltExactLocations.some(x=>x===null)))add('split_reference',index,'confirm each location measures to the top of the closed louver and record whether exact location is required. Older center-labelled entries are not reinterpreted automatically.');
  if(!splitOnly&&r.measurementBasis==='panel')add('measurement_basis',index,'divider centers must be measured from the window or frame datum.');
  if((!splitOnly||r.splitTiltMode!=='equal')&&(!r.measurementBasis||r.referenceHeightInches===null||r.referenceHeightInches<=0))add('measurement_basis',index,'record the window or max-frame datum and its actual reference height.');
  if(!splitOnly&&r.rails.length===0)add('rail_required',index,'divider presence requires at least one rail in the saved schedule.');
  const sizeChoices=normanShutterDividerSizes(program.id);
  r.rails.forEach((rail,n)=>{
   if(rail.heightInches===null||!sizeChoices.includes(rail.heightInches))add('size',index,`divider ${n+1} must be 3 inches${sizeChoices.length>1?' or a custom 3⅛–7⅞ inches in ⅛-inch increments':''}.`);
   if(rail.heightInches!==null&&rail.heightInches>3)add('custom_charge',index,`divider ${n+1} has a documented custom-size surcharge whose current account amount is not verified.`);
   if(!rail.location||rail.exactLocation===null)add('location',index,`choose divider ${n+1} default center or specified location and its exact-location election.`);
   if(rail.location==='center'&&(r.rails.length>1||r.splitTiltCentersInches.length>0))add('center_geometry',index,'multiple rail/split locations require explicit measured centers; a default-center choice cannot supply their order or spacing.');
   if(rail.location==='specified'&&(rail.centerInches===null||rail.centerInches<=0||r.referenceHeightInches===null||rail.centerInches>=r.referenceHeightInches))add('position',index,`divider ${n+1} center must lie within the stated window/frame reference height.`);
  });
  if(r.splitTiltCentersInches.length>0&&!/^(yes|true)$/i.test(String(s.configuration.split_tilt??'')))add('split_identity',index,'the saved split-tilt selection must agree with the recorded split locations.');
  if(r.splitTiltCentersInches.some(p=>p<=0||r.referenceHeightInches===null||p>=r.referenceHeightInches))add('split_position',index,'split-tilt top-of-closed-louver locations must lie within the same measured window/frame reference height.');
  const centers=[...r.rails.filter(x=>x.location==='specified'&&x.centerInches!==null).map(x=>x.centerInches as number),...r.splitTiltCentersInches].sort((a,b)=>a-b);
  if(new Set(centers).size!==centers.length)add('duplicate_position',index,'rail and split-tilt locations cannot occupy the same center.');
  const gaps=Math.max(0,r.rails.length+r.splitTiltCentersInches.length-1);
  if(record.motor==='none'&&(r.clearLouverCounts.length!==gaps||r.clearLouverCounts.some(n=>!Number.isInteger(n)||n<2)))add('louver_clearance',index,'record at least two actual clear louvers between each consecutive rail/split location, ordered bottom to top. Do not infer louver counts from opening height.');
 });
 return issues;
}
