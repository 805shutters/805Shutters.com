import { describe,it,expect } from 'vitest';
import { validateNormanShutterPanels } from './norman-shutter-panels';
import { NORMAN_SHUTTER_PANEL_RECORD,normanPanelMaxHeight,parseNormanPanelRecord,type NormanShutterPanelRecord } from '../quote/norman-shutter-panels';
import { NORMAN_SHUTTER_PROGRAMS } from '../quote/norman-shutter-assortment';
import { selectionContextFromExactInterface } from './exact-interface-adapter';
import type { SelectionContext } from './core';
import type { SalesQuoteLineItem } from '@mts/types/quote';
const record=(height=60):NormanShutterPanelRecord=>({version:1,application:'regular',motor:'none',existingDoorGlassOrSidelight:false,panels:[{heightInches:height,divider:'none',wholePanelLouverCount:6,bottomSupport:{version:1,support:'existing_sill',gapInches:0.0625,frequentlyOpen:false}}]});
const context=(programId='woodlore',r:unknown=record()):SelectionContext=>({manufacturerId:'Norman',productId:'norman_shutters',programId,catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:36,heightInches:60,quantity:1,configuration:{panel_config:'L',[NORMAN_SHUTTER_PANEL_RECORD]:r as SelectionContext['configuration'][string]},options:{}});
const ids=(s:SelectionContext)=>validateNormanShutterPanels(s).map(i=>i.ruleId.replace('norman.shutter.panels.',''));
describe('Norman exact finished-panel heights and divider requirements',()=>{
 it('preserves prior-date snapshots while requiring a current complete panel record',()=>{
  expect(ids({...context(),catalogAsOf:'2026-09-19',configuration:{}})).toEqual([]);
  expect(ids({...context(),configuration:{}})).toEqual(['record_required']);
  for(const malformed of [{...record(),version:2},{...record(),application:'forged'},{...record(),panels:[{heightInches:'60',divider:'none'}]}])expect(ids(context('woodlore',malformed))).toEqual(['record_required']);
 });
 it('checks every program height boundary from finished panels, independent of opening size',()=>{
  for(const program of NORMAN_SHUTTER_PROGRAMS){
   const max=normanPanelMaxHeight(program.id);
   for(const height of [10,max])expect(ids(context(program.id,record(height)))).not.toContain('height');
   for(const height of [9.9375,max+0.0625,0,-1])expect(ids(context(program.id,record(height)))).toContain('height');
   expect(ids({...context(program.id,record(9)),heightInches:60})).toContain('height');
   expect(ids({...context(program.id,record(60)),heightInches:9})).not.toContain('height');
  }
 });
 it.each([['woodlore',74],['woodlore_plus',78],['woodlore_aquashield',72],['brightwood',78],['normandy_painted',78],['normandy_stained',78]] as const)('enforces %s divider threshold %s exactly',(program,height)=>{
  expect(ids(context(program,record(height)))).toEqual([]);
  expect(ids(context(program,record(height+0.0625)))).toContain('divider_required');
  const r=record(height+0.0625);r.panels[0].divider='present';
  expect(ids(context(program,r))).toEqual(['divider_geometry','norman.shutter.dividers.record_required']);
  expect(validateNormanShutterPanels(context(program,record(height+0.0625)))[0].source.pages).toEqual(program.startsWith('woodlore_')?[38,44]:[32,38]);
 });
 it('requires every panel and validates short and tall panels independently',()=>{
  expect(ids({...context(),configuration:{...context().configuration,panel_config:'L R'}})).toContain('panel_count');
  const r=record();r.panels.push({heightInches:9,divider:'none'});
  expect(ids({...context('woodlore',r),configuration:{panel_config:'L R',[NORMAN_SHUTTER_PANEL_RECORD]:r}})).toContain('height');
  r.panels[1]={heightInches:80,divider:'none'};
  expect(ids({...context('woodlore',r),configuration:{panel_config:'L R',[NORMAN_SHUTTER_PANEL_RECORD]:r}})).toContain('divider_required');
 });
 it('limits the Normandy 84-inch exception to documented application and confirmed nonmotorized use',()=>{
  for(const application of ['french_door','bifold_180','bifold_other','bypass_closed','bypass_open'] as const){
   const r={...record(84),application,existingDoorGlassOrSidelight:true};
   expect(ids(context('normandy_painted',r))).not.toContain('divider_required');
   r.panels[0].heightInches=84.0625;expect(ids(context('normandy_painted',r))).toContain('divider_required');
   for(const motor of ['perfect_tilt_g4','other',''] as const){const m={...record(80),application,existingDoorGlassOrSidelight:true,motor};expect(ids(context('normandy_stained',m))).toContain('divider_required');}
  }
  expect(ids(context('normandy_painted',{...record(80),application:'french_door'}))).toContain('divider_required');
  expect(ids(context('brightwood',{...record(80),application:'bypass_closed'}))).toContain('divider_required');
 });
 it('prohibits AquaShield Open Bypass and retains specialized geometry holds',()=>{
  const r={...record(),application:'bypass_open'} as const;
  expect(ids(context('woodlore_aquashield',r))).toContain('aquashield_open_bypass');
  expect(ids(context('woodlore_plus',r))).toEqual(['application_geometry','norman.shutter.bypass.record_required']);
  const issue=validateNormanShutterPanels(context('woodlore_aquashield',r)).find(i=>i.ruleId.endsWith('aquashield_open_bypass'))!;
  expect(issue.source.pages).toEqual([93]);expect(issue.source.sourceId).toBe('norman-woodlore-plus-binder-2026-09');
 });
 it('round-trips the versioned panel record through the actual server adapter',()=>{
  const line={id:'internal',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
  const r=record(74.0625),design=JSON.parse(JSON.stringify({supplier:'Norman',material:'Woodlore',panel_config:'L',options_json:{[NORMAN_SHUTTER_PANEL_RECORD]:r}}));
  const saved=selectionContextFromExactInterface(line,design,{productId:'norman_shutters',programId:'woodlore',catalogAsOf:'2026-09-20'});
  expect(saved.configuration[NORMAN_SHUTTER_PANEL_RECORD]).toEqual(r);
  expect(ids(saved)).toContain('divider_required');
  expect(parseNormanPanelRecord(saved.configuration[NORMAN_SHUTTER_PANEL_RECORD])).toEqual(r);
 });
});
