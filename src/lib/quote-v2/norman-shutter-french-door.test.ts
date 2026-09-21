import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanShutterPanelOptions} from '@/components/crm/NormanShutterPanelOptions';
import {normanFrenchDoorTypes,normanFrenchDoorFrames,normanFrenchDoorBatten,parseNormanFrenchDoorRecord} from '../quote/norman-shutter-french-door';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanFrenchDoor} from './norman-shutter-french-door';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {selectionContextFromExactInterface} from './exact-interface-adapter';
import type {SalesQuoteLineItem,SalesQuoteDesign} from '@mts/types/quote';
function fixture(programId='woodlore_plus',type:'A'|'B'|'C'|'D'|'E'|'F'='A'){
 const frame=normanFrenchDoorFrames(programId)[0]?.code??'';
 const r:NormanShutterPanelRecord={version:1,application:'french_door',motor:'none',existingDoorGlassOrSidelight:true,panels:[{heightInches:60,widthInches:20,divider:'none'}],frenchDoor:{version:1,panelDirection:'L',cutoutType:type,topShape:'rectangular',lFrameCode:['E','F'].includes(type)?'':frame,measurementFormReference:'INTERNAL synthetic form FD-1 — no factory acceptance'}};
 const line={id:'internal',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:24,width_fraction:'0',height_whole:64,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
 const design={id:'internal',supplier:'Norman',material:programId,panel_config:'L',mount_type:'Outside Mount',louver_size:'3 1/2"',options_json:{catalog_program_id:programId,frame_type:frame,stile_join:'Butt',[NORMAN_SHUTTER_PANEL_RECORD]:r}} as unknown as SalesQuoteDesign;
 const s=selectionContextFromExactInterface(line,design,{productId:'norman_shutters',programId,catalogAsOf:'2026-09-20'});return {r,s,design};
}
const hard=(f:ReturnType<typeof fixture>)=>validateNormanFrenchDoor(f.s,f.r).filter(i=>i.severity==='hard_block').map(i=>i.ruleId.split('.').at(-1));
describe('source-identified French-door cutouts',()=>{
 it.each(['woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'])('validates every documented type for %s without removing geometry holds',p=>{
  for(const t of normanFrenchDoorTypes(p)){const f=fixture(p,t as 'A');expect(hard(f)).toEqual([]);expect(validateNormanShutterPanels(f.s).map(i=>i.ruleId)).toContain('norman.shutter.panels.application_geometry');}
 });
 it('excludes E/F from AquaShield and does not borrow a Woodlore assortment',()=>{
  expect(normanFrenchDoorTypes('woodlore_aquashield')).toEqual(['A','B','C','D']);expect(hard(fixture('woodlore_aquashield','E'))).toContain('type');expect(hard(fixture('woodlore','A'))).toContain('source_missing');
 });
 it.each(['A','B','C','D'] as const)('requires Outside Mount and an exact non-quarter-lightblock L frame for %s',t=>{
  const f=fixture('normandy_painted',t);f.s={...f.s,configuration:{...f.s.configuration,mount_type:'Inside Mount'}};expect(hard(f)).toContain('mount');
  f.r.frenchDoor!.lFrameCode='unlisted';expect(hard(f)).toContain('frame');f.r.frenchDoor!.lFrameCode=normanFrenchDoorFrames('normandy_painted')[1].code;expect(hard(f)).toContain('frame_identity');
  for(const p of ['woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'])expect(normanFrenchDoorFrames(p).every(f=>/L Frame/.test(f.label)&&!f.label.includes('1/4" Light Block'))).toBe(true);
 });
 it('requires one actual panel/direction and form reference without inferring acceptance',()=>{
  const f=fixture();f.r.panels.push({...f.r.panels[0]});expect(hard(f)).toContain('one_panel');f.r.panels.pop();f.r.frenchDoor!.panelDirection='R';expect(hard(f)).toContain('one_panel');f.r.panels[0].widthInches=null;expect(hard(f)).toContain('panel_width');f.r.frenchDoor!.measurementFormReference=' ';expect(hard(f)).toContain('measurement_form');f.r.frenchDoor!.topShape='';expect(hard(f)).toContain('top_shape');
 });
 it.each(['E','F'] as const)('enforces %s rectangular batten identity and narrow Butt stiles',t=>{
  const f=fixture('brightwood',t);f.r.frenchDoor!.topShape='arch';expect(hard(f)).toContain('batten_top');f.r.frenchDoor!.topShape='rectangular';f.r.frenchDoor!.lFrameCode='FL05';expect(hard(f)).toContain('batten_frame');f.r.frenchDoor!.lFrameCode='';f.r.panels[0].widthInches=8.9375;f.s={...f.s,configuration:{...f.s.configuration,stile_join:'Rabbet'}};expect(hard(f)).toContain('narrow_stile');f.r.panels[0].widthInches=9;expect(hard(f)).not.toContain('narrow_stile');
 });
 it.each([['1 7/8"',1],['2 1/2"',1],['3"',1.375],['3 1/2"',1.375],['4 1/2"',1.875]])('retains exact batten dimensions for %s', (louver,thickness)=>{
  expect(normanFrenchDoorBatten(louver)).toEqual({widthInches:0.75,thicknessInches:thickness});const f=fixture('normandy_stained','F');f.s={...f.s,configuration:{...f.s.configuration,louver_size:louver}};expect(validateNormanFrenchDoor(f.s,f.r).find(i=>i.ruleId.endsWith('batten_dimensions'))).toMatchObject({severity:'auto_derive',selectedValues:{widthInches:0.75,thicknessInches:thickness}});
 });
 it('rejects explicit E/F panel-lock surcharges without inventing prices',()=>{const f=fixture('brightwood','E');f.s={...f.s,options:{...f.s.options,surcharges:[{id:'panel_locks',units:1}]}};expect(hard(f)).toContain('panel_lock');});
 it('parses and preserves records while historical untyped snapshots remain readable',()=>{
  const f=fixture();expect(parseNormanPanelRecord(JSON.parse(JSON.stringify(f.r)))).toEqual(f.r);expect(f.s.configuration[NORMAN_SHUTTER_PANEL_RECORD]).toEqual(f.r);for(const patch of [{version:2},{cutoutType:'G'},{panelDirection:'LR'},{topShape:'unknown'},{lFrameCode:null},{measurementFormReference:12}])expect(parseNormanFrenchDoorRecord({...f.r.frenchDoor,...patch})).toBeNull();delete f.r.frenchDoor;expect(parseNormanPanelRecord(f.r)).not.toBeNull();expect(hard(f)).toContain('record_required');expect(validateNormanShutterPanels({...f.s,catalogAsOf:'2026-09-19'})).toEqual([]);
 });
 it('renders source-specific types, actual width, form and single direction without multi-panel reset',()=>{
  const f=fixture('woodlore_aquashield');const html=renderToStaticMarkup(createElement(NormanShutterPanelOptions,{design:f.design,onUpdateFields:()=>{}}));expect(html).toContain('Norman French-door cutout type');expect(html).toContain('Type D');expect(html).not.toContain('value="E"');expect(html).toContain('Norman panel 1 finished width');expect(html).toContain('Norman French-door panel direction');expect(html).not.toContain('Reset panel measurements');
 });
});
