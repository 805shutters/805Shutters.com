import type { SelectionContext, ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';
export const MAGNET_CLEARANCE_FIELDS=[['magnet_left_clearance_inches','Wall space beyond left shade edge',.5625],['magnet_right_clearance_inches','Wall space beyond right shade edge',.5625],['magnet_bottom_clearance_inches','Minimum wall space below both magnetic catches',.6875]] as const;
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const magneticHoldDownActive=(product:string,c:Record<string,unknown>)=>product==='smartfold'?norm(c.smartfold_hold_down)==='magnetic':product==='perfectsheer'&&(c.perfectsheer_magnetic_hold_down==null?norm(c.motor_type)==='autowand'&&['yes','true','on'].includes(norm(c.perfectsheer_installed_on_door)):['yes','true','on'].includes(norm(c.perfectsheer_magnetic_hold_down)));
const current=(s:SelectionContext)=>s.catalogAsOf>='2026-09-20'&&((s.productId==='smartfold'&&s.catalogVersion.endsWith('-norman-smartfold-mounting-2026-09-20-r10'))||(s.productId==='perfectsheer'&&s.catalogVersion.endsWith('-norman-perfectsheer-magnet-2026-09-20-r8')));
export function magneticClearanceRecord(s:SelectionContext){
 if(!current(s)||!magneticHoldDownActive(s.productId,s.configuration))return null;
 const value=(key:string)=>typeof s.configuration[key]==='number'&&Number.isFinite(s.configuration[key])?s.configuration[key] as number:null;
 return {version:1,sourceId:s.productId==='smartfold'?'norman-smartfold-guide-2026-09-10':'norman-perfectsheer-smartdrape-guide-2026-09',sourcePage:s.productId==='smartfold'?20:45,leftSideAvailable:value('magnet_left_clearance_inches'),rightSideAvailable:value('magnet_right_clearance_inches'),minimumBottomAvailable:value('magnet_bottom_clearance_inches'),requiredEachSide:.5625,requiredBottom:.6875,sideDatum:'finished_shade_side_edge',bottomDatum:s.productId==='smartfold'?'shade_bottom_or_window_sill':'shade_bottom',bottomMeasurementScope:'minimum_at_both_catches'};
}
export function validateMagneticClearance(s:SelectionContext):ValidationIssue[]{
 const record=magneticClearanceRecord(s);if(!record)return [];
 return MAGNET_CLEARANCE_FIELDS.flatMap(([key,label,min])=>{
  const v=s.configuration[key];if(typeof v==='number'&&Number.isFinite(v)&&v>=min)return [];
  return [{severity:'hard_block' as const,ruleId:`norman.${s.productId}.${key}`,source:sourceProvenance(record.sourceId,{page:record.sourcePage}),selectedValues:{[key]:v??null},explanation:`${label} must be measured and at least ${min} inches. Measure available wall space from the finished shade side edge; measure below the shade bottom${s.productId==='smartfold'?' or window sill':''}. Use the smaller bottom measurement at the two catches.`}];
 });
}
