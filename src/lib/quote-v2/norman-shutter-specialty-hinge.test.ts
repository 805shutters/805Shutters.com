import {describe,it,expect} from 'vitest';
import {normanSpecialtyHingeProblems,parseNormanSpecialtyHinge,type NormanSpecialtyHingeRecord} from '../quote/norman-shutter-specialty-hinge';
import {emptyNormanSpecialtyRecord,parseNormanSpecialtyRecord} from '../quote/norman-shutter-specialty';
import {validateNormanShutterSpecialty} from './norman-shutter-specialty';
import type {SelectionContext} from './core';
const r=(n:number|null=9.8125):NormanSpecialtyHingeRecord=>({version:1,series:'direct_mount_3',smallestNetLegInches:n,measurementReference:'INTERNAL net leg sketch'});
const ids=(x=r(),hinges:boolean|null=true,frame='Direct Mount (No Frame)')=>normanSpecialtyHingeProblems(x,hinges,frame).map(p=>p.id);
describe('specialty measured hinge geometry',()=>{
 it('enforces strict Direct Mount boundary without rounding or substituting order leg',()=>{
  for(const n of [0,9,9.6875,9.75])expect(ids(r(n))).toContain('hinge_direct_min');
  expect(ids(r(9.8125))).toEqual([]);expect(ids(r(null))).toContain('hinge_measurement');
  expect(ids({...r(),measurementReference:' '})).toContain('hinge_measurement');
  expect(ids(r(),false)).toContain('hinge_record');expect(ids(r(),true,'Plain L Frame')).toContain('hinge_frame');
 });
 it('does not resolve standard hinge contradictions or alter old untyped records',()=>{
  expect(ids({...r(8.125),series:'standard_2_375'})).toContain('hinge_boundary_source');
  expect(normanSpecialtyHingeProblems(undefined,true,'Direct Mount (No Frame)')).toEqual([]);
  expect(parseNormanSpecialtyRecord(emptyNormanSpecialtyRecord())).not.toBeNull();
  expect(parseNormanSpecialtyHinge({...r(),smallestNetLegInches:'10'})).toBeNull();expect(parseNormanSpecialtyHinge({...r(),smallestNetLegInches:Infinity})).toBeNull();
  expect(parseNormanSpecialtyRecord({...emptyNormanSpecialtyRecord(),hingeGeometry:r()})).toMatchObject({hingeGeometry:r()});
 });
 it.each(['woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'])('routes the exact page and keeps manufacturing/account hold for %s',programId=>{
  const specialty={...emptyNormanSpecialtyRecord(),shapeCode:'YS05',frameType:'Direct Mount (No Frame)',hinges:true,hingeGeometry:r(9.75)};
  const context={manufacturerId:'Norman',productId:'norman_shutters',programId,configuration:{frame_type:'Direct Mount (No Frame)'},options:{},catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:30,heightInches:60,quantity:1} satisfies SelectionContext;
  const record={version:1 as const,application:'specialty' as const,motor:'none' as const,existingDoorGlassOrSidelight:false,specialty,panels:[{widthInches:30,heightInches:60,divider:'none' as const}]};
  const issues=validateNormanShutterSpecialty(context,record);
  expect(issues.some(x=>x.ruleId.endsWith('.hinge_direct_min'))).toBe(true);expect(issues.some(x=>x.ruleId==='norman.shutter.specialty.geometry')).toBe(true);
  record.specialty.hingeGeometry=r(9.8125);expect(validateNormanShutterSpecialty(context,record).some(x=>x.ruleId.endsWith('.hinge_direct_min'))).toBe(false);
 });
});
