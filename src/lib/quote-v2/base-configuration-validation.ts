import { woodloreBaseTilt } from './base-shutter-tilt';
import { sourceProvenance, type SourceManifestId } from './source-manifest';
import type { SelectionContext, ValidationIssue } from './core';
import { BASE_CONFIGURATION_VERSION, BASE_CONFIGURATIONS } from './base-configuration';
const blank=(v:unknown)=>v==null||v==='';
/** Missing finishes do not supply a grid or a charge. Explicit unknown selections still block. */
export function baseConfigurationIssues(selection:SelectionContext,issues:readonly ValidationIssue[]):ValidationIssue[] {
 const c=selection.configuration;
 if(c.base_configuration_version!==BASE_CONFIGURATION_VERSION||!BASE_CONFIGURATIONS[selection.productId])return [...issues];
 const noFabric=['fabric','fabric_collection','fabric_color_collection','fabric_color_code','fabric_color_name','fabric_color_id','color','color_name','vertical_color'].every(k=>blank(c[k])) ||
   selection.productId==='synchrony_vertical' && ['fabric','fabric_color_code','fabric_color_name','fabric_color_id','color','color_name','vertical_color'].every(k=>blank(c[k])) && c.fabric_collection==='Classic collection';
 const absentFabric=new Set([
 'roller.required.fabric_collection','roller.required.fabric_color_code','roller.matrix.offering_not_found',
 'roman.fabric_limits.source_missing','roman.required.fabric_collection','roman.required.fabric_color_code',
 'honeycomb.required.fabric_collection','honeycomb.required.fabric_color_code','honeycomb.matrix.fabric_class_required',
 'norman.citylights.color_slat','norman.smartprivacy.color','norman.ultimate_faux.color','norman.wood_blinds.color',
 'vertical.required.fabric_color_name','norman.shutter.assortment.color',
 ]);
 const absentMount=new Set(['roman.required.mount_type','honeycomb.required.mount_type','norman.citylights.mount','norman.smartprivacy.mount','norman.ultimate_faux.mount','norman.wood_blinds.mount','vertical.required.mount_type','vertical.mount.invalid','onyx.required.mount_type']);
 const result=issues.filter(issue=>{
  if(noFabric&&absentFabric.has(issue.ruleId))return false;
  if(blank(c.mount_type)&&absentMount.has(issue.ruleId) && (selection.productId !== 'onyx_shutters' || blank(c.frame_type) && blank(c.measurement_basis)))return false;
  if(blank(c.installation_method)&&issue.ruleId==='norman.smartdrape.installation')return false;
  if(blank(c.louver_size)&&issue.ruleId==='norman.shutter.assortment.louver')return false;
  if(selection.productId==='onyx_shutters'&&blank(c.frame_type)&&blank(c.measurement_basis)&&['onyx.required.frame_type','onyx.required.measurement_basis'].includes(issue.ruleId))return false;
  return true;
 });
 result.push(...(woodloreBaseTilt(selection)?.issues ?? []));
 if(noFabric) {
  const bounds=baseSizeBounds(selection);
  const w=selection.widthInches,h=selection.heightInches;
  if(bounds&&(w<bounds[0]||w>bounds[1]||h<bounds[2]||h>bounds[3]||(bounds[4]&&w*h>bounds[4]*144)))result.push({severity:'hard_block',ruleId:'base.configuration.dimensions',source:baseSizeSource(selection.productId),selectedValues:{width:w,height:h},explanation:`This base requires width ${bounds[0]}–${bounds[1]} inches and height ${bounds[2]}–${bounds[3]} inches${bounds[4]?`, up to ${bounds[4]} square feet`:''}.`});
 }
 if(!blank(c.fabric)&&blank(c.fabric_color_code))result.push({severity:'hard_block',ruleId:'base.configuration.unknown_fabric',source:sourceProvenance('norman-retail-guide-2026-09'),selectedValues:{fabric:c.fabric},explanation:'Select a current catalog fabric or clear the fabric to restore base pricing.'});
 return result;
}

/** Product guide limits for unspecified standard fabrics; exact fabric/motor rules can narrow these. */
function baseSizeBounds(s:SelectionContext):[number,number,number,number,number?]|undefined {
 const c=s.configuration,lift=c.lift_system,w=s.widthInches,h=s.heightInches;
 if(s.productId==='roller'&&lift!=='Motorized')return [lift==='Cordless'?10.5:lift==='Smart Release'?13:9,119,12,lift==='Cordless'&&w-1<=20?72:lift==='Cordless'&&w-1<=24?96:144];
 if(s.productId==='roman'&&lift!=='Motorized')return [lift==='Cordless'?20:12,96,24,96,lift==='Cordless'?40:lift==='Smart Release'?52:64];
 if(s.productId==='honeycomb'&&lift==='Cordless'&&!String(c.cell_size).includes('SmartFit'))return [h>86?25:11.5,/3\/8|9\/16/.test(String(c.cell_size))?96:108,10,120];
 if(s.productId==='perfectsheer'&&lift!=='Motorized')return [12,98,12,98];
 if(s.productId==='synchrony_vertical')return [18,100,36,108];
}

/** This version promises valid sizes as well as available grid cells. Historical policy is unchanged. */
export function restoreBaseSizeIssues(s:SelectionContext,priced:ValidationIssue[],original:readonly ValidationIssue[]):ValidationIssue[] {
 if(s.configuration.base_configuration_version!==BASE_CONFIGURATION_VERSION)return priced;
 const sizeRule=/(?:\.dimensions$|\.dimension\.|\.ratio$|\.max_ratio$|\.(?:min_width|max_width|min_height|max_height|max_area|min_area)$)/;
 const hard=new Map(original.filter(i=>i.severity==='hard_block'&&sizeRule.test(i.ruleId)).map(i=>[i.ruleId,i]));
 return priced.map(i=>hard.get(i.ruleId)??i);
}

function baseSizeSource(productId:string) {
 const references:Record<string,[SourceManifestId,number[]]>={
  roller:['norman-roller-guide-2026-09',[46]],
  roman:['norman-roman-guide-2026-09',[13]],
  honeycomb:['norman-honeycomb-guide-2026-07',[5,6]],
  perfectsheer:['norman-perfectsheer-smartdrape-guide-2026-09',[32]],
  synchrony_vertical:['norman-retail-guide-2026-09',[34]],
 };
 const [sourceId,pages]=references[productId]??['norman-retail-guide-2026-09',[]];
 return sourceProvenance(sourceId,{pages});
}
