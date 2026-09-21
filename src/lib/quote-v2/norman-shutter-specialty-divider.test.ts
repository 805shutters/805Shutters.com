import {describe,it,expect} from 'vitest';
import {NORMAN_SPECIALTY_HORIZONTAL_LEG_SHAPES,emptyNormanSpecialtyRecord} from '../quote/norman-shutter-specialty';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import type {SelectionContext} from './core';
const record=(shapeCode:string,height:number):NormanShutterPanelRecord=>({version:1,application:'specialty',motor:'none',existingDoorGlassOrSidelight:false,specialty:{...emptyNormanSpecialtyRecord(),shapeCode},panels:[{widthInches:30,heightInches:100,divider:'none',horizontalLouverSectionHeightInches:height}]});
const ctx=(r:NormanShutterPanelRecord,programId:string):SelectionContext=>({manufacturerId:'Norman',productId:'norman_shutters',programId,catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:36,heightInches:110,quantity:1,options:{},configuration:{[NORMAN_SHUTTER_PANEL_RECORD]:r}});
const ids=(s:SelectionContext)=>validateNormanShutterPanels(s).filter(i=>i.ruleId.includes('specialty.horizontal')).map(i=>i.ruleId);
describe('Norman specialty lower horizontal section divider requirement',()=>{
 it('checks all twenty program/shape routes at the exact leg threshold and 1/16 beyond',()=>{
  for(const program of ['woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'])for(const shape of NORMAN_SPECIALTY_HORIZONTAL_LEG_SHAPES){
   const threshold=program==='woodlore_aquashield'?72:78,r=record(shape,threshold),s=ctx(r,program);expect(ids(s)).toEqual([]);expect(validateNormanShutterPanels(s).some(i=>i.ruleId==='norman.shutter.panels.divider_required')).toBe(false);
   r.panels[0].horizontalLouverSectionHeightInches=threshold+0.0625;expect(ids(s)).toContain('norman.shutter.specialty.horizontal_divider');r.panels[0].divider='present';expect(ids(s)).toEqual([]);expect(validateNormanShutterPanels(s).some(i=>i.ruleId==='norman.shutter.specialty.geometry')).toBe(true);
  }
 });
 it('does not infer missing section height from full panel or overall order measurements and retains history',()=>{
  const r=record('YS10',72),s=ctx(r,'woodlore_plus');delete r.panels[0].horizontalLouverSectionHeightInches;expect(parseNormanPanelRecord(r)).toEqual(r);expect(ids(s)).toContain('norman.shutter.specialty.horizontal_section');expect(ids({...s,catalogAsOf:'2026-09-19'})).toEqual([]);
  r.panels[0].horizontalLouverSectionHeightInches=101;expect(ids(s)).toContain('norman.shutter.specialty.horizontal_section');r.panels[0].horizontalLouverSectionHeightInches=78;expect(parseNormanPanelRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
  expect(parseNormanPanelRecord({...r,panels:[{...r.panels[0],horizontalLouverSectionHeightInches:'78'}]})).toBeNull();
 });
 it('keeps the rule specific to the four documented mixed sunburst/horizontal shapes',()=>{
  const r=record('YS01',100);expect(ids(ctx(r,'woodlore_plus'))).toEqual([]);
 });
});
