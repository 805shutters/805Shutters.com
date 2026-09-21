import {describe,it,expect} from 'vitest';
import {normanSpecialtyFrameConstruction,parseNormanSpecialtyFrameConstruction} from '../quote/norman-shutter-specialty-frame';
import {emptyNormanSpecialtyRecord,parseNormanSpecialtyRecord} from '../quote/norman-shutter-specialty';
import {NORMAN_SHUTTER_PANEL_RECORD,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import type {SelectionContext} from './core';
const detail=(shapeCode:string,frameType:string,eyebrowCurve:boolean|null=null)=>({...emptyNormanSpecialtyRecord(),shapeCode,frameType,frameConstruction:{version:1 as const,eyebrowCurve,style:'' as const}});
describe('Norman specialty source frame manufacturing',()=>{
 it('keeps solid, insert and curved/straight manufacturing distinct across four hardwood programs',()=>{
  for(const p of ['woodlore_plus','brightwood','normandy_painted','normandy_stained']){
   for(const shape of ['YS01','YS02','YS03','YS04','YS06','YS63','YS64','YS65','YS66','YS67']){expect(normanSpecialtyFrameConstruction(p,detail(shape,'2" Camber Deco Frame'))).toBe('solid');expect(normanSpecialtyFrameConstruction(p,detail(shape,'Vintage L Frame'))).toBe('curved_solid_straight_inserts');}
   for(const shape of ['YS11','YS12','YS14','YS17','YS18','YS19','YS21','YS23','YS25','YS26','YS27','YS28','YS59','YS60','YS62'])expect(normanSpecialtyFrameConstruction(p,detail(shape,'3" Crown Z Frame'))).toBe('inserts');
   for(const shape of ['YS13','YS15','YS16','YS20'])expect(normanSpecialtyFrameConstruction(p,detail(shape,'3" Crown Z Frame'))).toBe('solid');
   expect(normanSpecialtyFrameConstruction(p,detail('YS09','3" Crown Z Frame'))).toBe('curved_solid_straight_inserts');
  }
 });
 it('uses the exact Louvered Arch Mission eyebrow exception, requiring its explicit curve declaration',()=>{
  const r=detail('YS05','2 1/2" Mission Deco Frame');expect(normanSpecialtyFrameConstruction('brightwood',r)).toBeNull();r.frameConstruction.eyebrowCurve=true;expect(normanSpecialtyFrameConstruction('brightwood',r)).toBe('curved_solid_straight_inserts');r.frameConstruction.eyebrowCurve=false;expect(normanSpecialtyFrameConstruction('brightwood',r)).toBe('solid');
 });
 it('preserves Aqua Camber always-solid and limits its insert routes to explicitly listed frames',()=>{
  for(const shape of ['YS01','YS11','YS13','YS09','YS05'])expect(normanSpecialtyFrameConstruction('woodlore_aquashield',detail(shape,'2" Camber Deco Frame'))).toBe('solid');
  expect(normanSpecialtyFrameConstruction('woodlore_aquashield',detail('YS11','Vintage L Frame'))).toBe('inserts');expect(normanSpecialtyFrameConstruction('woodlore_aquashield',detail('YS13','Vintage L Frame'))).toBe('solid');expect(normanSpecialtyFrameConstruction('woodlore_aquashield',detail('YS01','Vintage L Frame'))).toBe('curved_solid_straight_inserts');expect(normanSpecialtyFrameConstruction('woodlore_aquashield',detail('YS11','3" Crown Z Frame'))).toBeNull();
 });
 it('does not assign an unsupported shape/frame by analogy and preserves historical records',()=>{
  expect(normanSpecialtyFrameConstruction('brightwood',detail('YS70','Vintage L Frame'))).toBeNull();expect(normanSpecialtyFrameConstruction('brightwood',detail('YS01','3" Crown Z Frame'))).toBeNull();const old=emptyNormanSpecialtyRecord();expect(parseNormanSpecialtyRecord(old)).toEqual(old);expect(parseNormanSpecialtyFrameConstruction({version:1,eyebrowCurve:'false',style:'solid'})).toBeNull();
 });
 it('enforces saved source construction server-side while keeping the final factory/pricing hold',()=>{
  const r=detail('YS15','3" Crown Z Frame'),panel:NormanShutterPanelRecord={version:1,application:'specialty',motor:'none',existingDoorGlassOrSidelight:false,specialty:r,panels:[{widthInches:24,heightInches:24,divider:'none'}]};
  const s:SelectionContext={manufacturerId:'Norman',productId:'norman_shutters',programId:'brightwood',catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:24,heightInches:24,quantity:1,options:{},configuration:{[NORMAN_SHUTTER_PANEL_RECORD]:panel}};
  expect(validateNormanShutterPanels(s).some(i=>i.ruleId==='norman.shutter.specialty.frame_construction')).toBe(true);panel.specialty!.frameConstruction!.style='solid';expect(validateNormanShutterPanels(s).some(i=>i.ruleId==='norman.shutter.specialty.frame_construction')).toBe(false);expect(validateNormanShutterPanels(s).some(i=>i.ruleId==='norman.shutter.specialty.geometry')).toBe(true);expect(parseNormanSpecialtyRecord(JSON.parse(JSON.stringify(panel.specialty)))).toEqual(panel.specialty);expect(validateNormanShutterPanels({...s,catalogAsOf:'2026-09-19'}).some(i=>i.ruleId.includes('frame_construction'))).toBe(false);
 });
});
