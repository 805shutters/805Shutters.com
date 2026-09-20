/** Saved finished-panel facts. Opening/grid dimensions are deliberately excluded. */
export const NORMAN_SHUTTER_PANEL_RECORD = 'norman_shutter_panels_v1';
export const NORMAN_SHUTTER_APPLICATIONS = [
  ['regular','Regular'],['french_door','French Door'],['bifold_180','Bi-fold 180'],
  ['bifold_other','Other Bi-fold Track'],['bypass_closed','Closed Bypass'],
  ['bypass_open','Open Bypass'],['double_hung','Double Hung'],['specialty','Specialty Shape'],
] as const;
export type NormanShutterApplication = typeof NORMAN_SHUTTER_APPLICATIONS[number][0];
export type NormanShutterPanelRecord = {
  version: 1;
  application: NormanShutterApplication | '';
  motor: 'none' | 'perfect_tilt_g4' | 'other' | '';
  existingDoorGlassOrSidelight: boolean;
  panels: Array<{heightInches:number|null;divider:'none'|'present'|''}>;
};
export function normanPanelMaxHeight(programId:string){return ['brightwood','normandy_painted','normandy_stained'].includes(programId)?132:120;}
export function normanDividerThreshold(programId:string,record:NormanShutterPanelRecord){
  if(programId==='woodlore')return 74;
  if(programId==='woodlore_aquashield')return 72;
  const normandy=programId==='normandy_painted'||programId==='normandy_stained';
  const qualifyingApplication=(record.application==='french_door'&&record.existingDoorGlassOrSidelight)||['bifold_180','bifold_other','bypass_closed','bypass_open'].includes(record.application);
  // Other/unspecified motor generations cannot claim the non-G4 exception.
  return normandy&&qualifyingApplication&&record.motor==='none'?84:78;
}
export function parseNormanPanelRecord(value:unknown):NormanShutterPanelRecord|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const r=value as Record<string,unknown>;
  if(r.version!==1||!Array.isArray(r.panels)||typeof r.application!=='string'||!['',...NORMAN_SHUTTER_APPLICATIONS.map(a=>a[0])].includes(r.application)||!['','none','perfect_tilt_g4','other'].includes(String(r.motor))||typeof r.existingDoorGlassOrSidelight!=='boolean')return null;
  if(r.panels.some(p=>!p||typeof p!=='object'||Array.isArray(p)||!['','none','present'].includes(p.divider)||(p.heightInches!==null&&(typeof p.heightInches!=='number'||!Number.isFinite(p.heightInches)))))return null;
  return r as NormanShutterPanelRecord;
}
