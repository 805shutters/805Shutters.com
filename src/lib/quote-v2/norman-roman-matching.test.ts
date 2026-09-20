import {describe,it,expect} from 'vitest';
import {deriveNormanOrderRecords} from './norman-assemblies';
import type {SmartfoldOrderLine} from './norman-smartfold-side-by-side';
const rows=():SmartfoldOrderLine[]=>['a','b','c'].map((lineId,i)=>({lineId,roomName:'Office',selection:{manufacturerId:'Norman',productId:'roman',programId:'roman-test',catalogAsOf:'2026-09-20',catalogVersion:'test-norman-roman-mounting-2026-09-20-r6',widthInches:36,heightInches:60+i*12,quantity:1,options:{},configuration:{side_by_side:'Yes',side_by_side_match_line_id:i===0?'b':'a',mount_type:'Outside Mount',shade_type:'Single',lift_system:'Cordless',fold_style:'Soft Fold',fabric_color_code:'F1090',fabric_collection:'Caroline',lining:'Translucent',fabric_orientation:'Standard',valance:'Fabric Valance',valance_returns:'Wrapped Returns'}}}));
describe('Roman complete September side-by-side rules',()=>{
 it('persists connected matching through the shortest height with exact tolerance',()=>{
  const l=rows();expect(deriveNormanOrderRecords(l)).toEqual([]);
  for(const row of l)expect(row.selection.configuration.norman_assembly_v1).toMatchObject({sideBySide:{lineIds:['a','b','c'],room:'Office',alignmentTolerance:.125,alignmentFrom:'top',alignmentThroughHeight:60}});
 });
 it('rejects different rooms, valances, returns and fabric faces across a connected group',()=>{
  const l=rows();l[2].roomName='Bedroom';expect(deriveNormanOrderRecords(l).map(i=>i.ruleId)).toContain('roman.side_by_side.september.room');
  for(const [key,value,rule] of [['valance','No Valance','valance'],['valance_returns','Pleated Returns','returns'],['roman_fabric_pattern','Reverse','pattern']] as const){
   const l=rows();l[2].selection.configuration={...l[2].selection.configuration,[key]:value};expect(deriveNormanOrderRecords(l).map(i=>i.ruleId)).toContain(`roman.side_by_side.september.${rule}`);
  }
 });
 it('requires equal motor power sources and preserves older snapshots',()=>{
  const l=rows();for(const r of l){r.selection.configuration={...r.selection.configuration,lift_system:'Motorized',motor_type:'AC Adapter Plug-In'};}
  l[2].selection.configuration={...l[2].selection.configuration,motor_type:'Rechargeable Battery (AC Charger)'};expect(deriveNormanOrderRecords(l).map(i=>i.ruleId)).toContain('roman.side_by_side.september.motor');
  for(const r of l)r.selection.catalogVersion=r.selection.catalogVersion.replace('-r6','-r5');
  expect(deriveNormanOrderRecords(l).some(i=>i.ruleId.startsWith('roman.side_by_side.september.'))).toBe(false);
 });
});
