import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanShutterSpecialtyOptions} from '@/components/crm/NormanShutterSpecialtyOptions';
import {NORMAN_SPECIALTY_SHAPES,NORMAN_FRAME_IN_RAIL_SHAPES,emptyNormanSpecialtyRecord,normanSpecialtyFrames,normanSpecialtyShapes,parseNormanSpecialtyRecord,type NormanSpecialtyRecord} from '../quote/norman-shutter-specialty';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {selectionContextFromExactInterface} from './exact-interface-adapter';
import type {SelectionContext} from './core';
import type {SalesQuoteLineItem} from '@mts/types/quote';
const detail=():NormanSpecialtyRecord=>({...emptyNormanSpecialtyRecord(),shapeCode:'YS01',frameIncludeInRail:true,frameType:'3" Crown Z Frame',frameSides:'4',hinges:false,magnets:false,hangStripBehind:false,sunburstHubInches:12});
const record=(specialty=detail()):NormanShutterPanelRecord=>({version:1,application:'specialty',motor:'none',existingDoorGlassOrSidelight:false,specialty,panels:[{widthInches:36,heightInches:18,divider:'none'}]});
const ctx=(r=record(),programId='woodlore_plus'):SelectionContext=>({manufacturerId:'Norman',productId:'norman_shutters',programId,catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:36,heightInches:18,quantity:1,configuration:{frame_type:r.specialty?.frameType??null,[NORMAN_SHUTTER_PANEL_RECORD]:r},options:{}});
const ids=(s=ctx())=>validateNormanShutterPanels(s).filter(i=>i.ruleId.startsWith('norman.shutter.specialty.')&&!i.ruleId.includes('.order_geometry.')&&!i.ruleId.includes('.frame_construction')).map(i=>i.ruleId.replace('norman.shutter.specialty.',''));
describe('Norman exact specialty identity and frame constraints',()=>{
 it('retains 46 exact shape identities and distinct Aqua exclusions without guessing Woodlore assortment',()=>{
  expect(NORMAN_SPECIALTY_SHAPES).toHaveLength(46);expect(new Set(NORMAN_SPECIALTY_SHAPES.map(s=>s[0])).size).toBe(46);
  expect(normanSpecialtyShapes('woodlore')).toEqual([]);expect(ids(ctx(record(),'woodlore'))).toEqual(['program_source']);
  expect(normanSpecialtyShapes('woodlore_aquashield').some(s=>s[0]==='YS56')).toBe(false);
  for(const program of ['woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'])expect(ids(ctx(record(),program))).toEqual(['geometry']);
 });
 it('verifies all Frame Include In Rail source shapes and five exact eligible frames per program',()=>{
  for(const program of ['woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained']){
   expect(normanSpecialtyFrames(program,true)).toHaveLength(5);
   for(const code of NORMAN_FRAME_IN_RAIL_SHAPES)for(const f of normanSpecialtyFrames(program,true)){const r=record();r.specialty!.shapeCode=code;r.specialty!.frameType=f.label;expect(ids(ctx(r,program))).toEqual(['geometry']);}
  }
  const r=record();r.specialty!.frameType='Tilt Out Z Frame';expect(ids(ctx(r))).toContain('frame');r.specialty!.frameType='3" Crown Z Frame';r.specialty!.hinges=true;expect(ids(ctx(r))).toContain('fixed_frame');r.specialty!.hinges=false;r.specialty!.magnets=true;expect(ids(ctx(r))).toContain('fixed_frame');
  r.specialty!.shapeCode='YS53';expect(ids(ctx(r))).toContain('frame_in_rail_shape');
 });
 it('rejects source hub, panel-count, frame-side and hang-strip violations at exact endpoints',()=>{
  const r=record();expect(ids(ctx(r))).toEqual(['geometry']);r.specialty!.sunburstHubInches=12.0625;expect(ids(ctx(r))).toContain('hub');r.specialty!.sunburstHubInches=12;r.panels.push({...r.panels[0]});expect(ids(ctx(r))).toContain('panel_count');r.panels.pop();r.specialty!.frameSides='3';expect(ids(ctx(r))).toContain('frame_sides');r.specialty!.frameSides='all';expect(ids(ctx(r))).toEqual(['geometry']);
  for(const shape of ['YS11','YS12','YS14']){r.specialty!.shapeCode=shape;r.specialty!.frameIncludeInRail=false;r.specialty!.hangStripBehind=true;expect(ids(ctx(r))).toContain('hang_strip');}
 });
 it('enforces continuous arch identities, stile and Aqua limitation',()=>{
  const r=record();r.specialty={...detail(),shapeCode:'YS05',frameIncludeInRail:false,archStyle:'continuous',stileWidthInches:2.25};expect(ids(ctx(r))).toEqual(['geometry']);r.specialty.stileWidthInches=2;expect(ids(ctx(r))).toContain('continuous_stile');r.specialty.stileWidthInches=2.25;expect(ids(ctx(r,'woodlore_aquashield'))).toContain('continuous_arch');r.specialty.shapeCode='YS01';expect(ids(ctx(r))).toContain('continuous_arch');
 });
 it('uses specialty net dimensions instead of regular maximum-height and divider thresholds',()=>{
  for(const code of ['YS15','YS20'])for(const size of [15.5,84]){const r=record();r.specialty!.shapeCode=code;r.panels[0]={widthInches:size,heightInches:size,divider:'none'};expect(ids(ctx(r))).toEqual(['geometry']);expect(validateNormanShutterPanels(ctx(r)).some(i=>i.ruleId==='norman.shutter.panels.divider_required')).toBe(false);for(const bad of [15.4375,84.0625]){r.panels[0].widthInches=bad;expect(ids(ctx(r))).toContain('round_net_range');}}
  const r=record();r.panels[0].divider='present';expect(ids(ctx(r))).toContain('sunburst_divider');
 });
 it('preserves additive history and exact saved server identity',()=>{
  const r=record();const old={...r};delete old.specialty;expect(parseNormanPanelRecord(old)).toEqual(old);expect(ids(ctx(old))).toContain('record_required');expect(ids({...ctx(old),catalogAsOf:'2026-09-19'})).toEqual([]);
  expect(parseNormanSpecialtyRecord({...detail(),hinges:'false'})).toBeNull();expect(parseNormanSpecialtyRecord({...detail(),sunburstHubInches:NaN})).toBeNull();
  const line={id:'audit-line',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:36,width_fraction:'0',height_whole:18,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
  const design=JSON.parse(JSON.stringify({supplier:'Norman',material:'Woodlore Plus',options_json:{frame_type:r.specialty!.frameType,[NORMAN_SHUTTER_PANEL_RECORD]:r}}));const s=selectionContextFromExactInterface(line,design,{productId:'norman_shutters',programId:'woodlore_plus',catalogAsOf:'2026-09-20'});expect(s.configuration[NORMAN_SHUTTER_PANEL_RECORD]).toEqual(r);expect(ids(s)).toEqual(['geometry']);expect(validateNormanShutterPanels(s).some(i=>i.ruleId==='norman.shutter.panels.application_geometry')).toBe(true);
 });
 it('offers source labels and omits unavailable Aqua continuous arch and solid rail identities',()=>{
  const html=renderToStaticMarkup(createElement(NormanShutterSpecialtyOptions,{value:{...detail(),shapeCode:'YS05',frameIncludeInRail:false},programId:'woodlore_aquashield',panelCount:1,onChange:()=>{},onPanelCount:()=>{}}));expect(html).toContain('YS75');expect(html).not.toContain('YS56');expect(html).not.toContain('value="continuous"');expect(html).toContain('Frame Include In Rail');
 });
});
