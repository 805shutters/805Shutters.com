import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanBifold90Options} from '@/components/crm/NormanBifold90Options';
import {emptyNormanBifold90,parseNormanBifold90,normanBifold90Geometry} from '../quote/norman-shutter-bifold90';
import {emptyNormanFloating90,emptyNormanFrameHinged,normanBifoldPanelCount,normanFrameHingedWidthReferences,validNormanFloatingLayout} from '../quote/norman-shutter-bifold-special';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import type {SelectionContext} from './core';
const programs=['woodlore','woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'];
const record=(kind:'floating_90'|'frame_hinged',layout=kind==='floating_90'?'FF/FF':'LL'):NormanShutterPanelRecord=>({version:1,application:'bifold_other',motor:'none',existingDoorGlassOrSidelight:false,bifold90:{...emptyNormanBifold90(),kind,layout,mount:'Inside Mount',headerInches:3,fascia:'plain',headerExtensionInches:0,flatMountingSurface:true,...(kind==='floating_90'?{floating:{...emptyNormanFloating90(),sideBoards:false}}:{frameHinged:{...emptyNormanFrameHinged(),frame:'Vintage L Frame',buildoutInches:0,bottom:'light_block',hinge:'self_mortise_2_3_8',usedAsDoor:false,ringPull:false}})},panels:Array.from({length:normanBifoldPanelCount(layout)},(_,i)=>({heightInches:60,widthInches:kind==='frame_hinged'&&i>0?(457.2+34.5)/25.4:18,divider:'none'}))});
const selection=(p:string,r:NormanShutterPanelRecord):SelectionContext=>({manufacturerId:'Norman',productId:'norman_shutters',programId:p,catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:72,heightInches:60,quantity:1,configuration:{color:'001',louver_size:'3 1/2"',stile_width:'2"',stile_join:r.bifold90!.kind==='frame_hinged'?'Rabbet':'Butt',panel_config:r.bifold90!.layout,mount_type:'inside',[NORMAN_SHUTTER_PANEL_RECORD]:r},options:{}});
const issues=(s:SelectionContext)=>validateNormanShutterPanels(s);
const ids=(s:SelectionContext)=>issues(s).map(v=>v.ruleId).filter(v=>v.startsWith('norman.shutter.bifold90.')).map(v=>v.split('.').at(-1));
describe('source-specific floating and frame-hinged construction',()=>{
 for(const p of programs)for(const kind of ['floating_90','frame_hinged'] as const){if(p==='woodlore_aquashield'&&kind==='frame_hinged')continue;
 it(`${p} ${kind} persists actual panels, exact choices and factory hold`,()=>{const r=record(kind),s=selection(p,r);expect(ids(s)).toEqual([]);expect(issues(s).some(v=>v.ruleId==='norman.shutter.panels.application_geometry')).toBe(true);expect(parseNormanPanelRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);expect(normanBifold90Geometry(r.bifold90!)).toBeNull();});}
 it('counts floating separators correctly and permits exact mixed wood folding groups',()=>{
  expect(normanBifoldPanelCount('FF/FFFF/FF')).toBe(8);expect(validNormanFloatingLayout('brightwood','FF/FFFF/FF')).toBe(true);expect(validNormanFloatingLayout('woodlore','FF/FFFF')).toBe(false);
  for(const bad of ['F','FFF','FF/','/FF','FF//FF','LL','F'.repeat(66)])expect(validNormanFloatingLayout('normandy_stained',bad)).toBe(false);
  const r=record('floating_90','FF/FFFF/FF'),s=selection('brightwood',r);expect(ids(s)).toEqual([]);r.panels.pop();expect(ids(s)).toContain('panel_count');
 });
 it('rejects unavailable frame-hinged AquaShield and undocumented hinges/layouts',()=>{
  const r=record('frame_hinged');expect(ids(selection('woodlore_aquashield',r))).toContain('special_layout');r.bifold90!.frameHinged!.hinge='invisible';expect(ids(selection('woodlore',r))).toContain('frame_hinge');
  r.bifold90!.layout='LLLL';expect(ids(selection('woodlore_plus',r))).toContain('special_layout');
 });
 it('keeps each stack anchored to its actual frame-hinged panel with source millimetre offsets',()=>{
  expect(normanFrameHingedWidthReferences('LL','self_mortise_2_3_8',[18,19])).toEqual([{anchorPanel:1,widthMm:457.2,offsetMm:0},{anchorPanel:1,widthMm:491.7,offsetMm:34.5}]);
  const refs=normanFrameHingedWidthReferences('LLLLRRRR','invisible',[18,0,0,0,0,0,0,18])!;expect(refs.map(v=>v?.widthMm)).toEqual([457.2,486.7,486.7,486.7,486.7,486.7,486.7,457.2]);
  const r=record('frame_hinged'),s=selection('woodlore',r);r.panels[1].widthInches=19.375;expect(ids(s)).toContain('uneven_panel_width');r.panels[1].widthInches=491.7/25.4;expect(ids(s)).not.toContain('uneven_panel_width');
 });
 it('holds unequal center-stack anchors instead of extrapolating the equal-A diagram',()=>{const r=record('frame_hinged','LLRR');r.panels[3].widthInches=17;expect(ids(selection('brightwood',r))).toContain('unequal_stack_anchors');});
 it('preserves documented panel limits without assigning multi-fold cap to floating',()=>{
  for(const p of programs){const r=record('floating_90'),s=selection(p,r),max=['woodlore','woodlore_plus'].includes(p)?24:26;r.panels[0].widthInches=max;expect(ids(s)).not.toContain('panel_width');r.panels[0].widthInches=max+.0625;expect(ids(s)).toContain('panel_width');r.panels[0].widthInches=5.9375;expect(ids(s)).toContain('panel_width');}
  const r=record('floating_90','FFFF');r.panels.forEach(v=>v.widthInches=24);expect(ids(selection('brightwood',r))).not.toContain('panel_width');
 });
 it('enforces floating boards, fascia, mounting and stopper data',()=>{
  const r=record('floating_90'),s=selection('woodlore_aquashield',r),b=r.bifold90!;b.floating!.sideBoards=null;expect(ids(s)).toContain('floating_side_boards');b.floating!.sideBoards=false;
  b.floating!.optionalStopperPositionsInches=[4,4];expect(ids(s)).toContain('stopper_positions');b.floating!.optionalStopperPositionsInches=[-1];expect(ids(s)).toContain('stopper_positions');b.floating!.optionalStopperPositionsInches=[0,36];expect(ids(s)).toEqual([]);
  b.fascia='deco';expect(ids(s)).toContain('fascia');b.fascia='plain';b.headerInches=3.5;expect(ids(s)).toContain('header');b.headerInches=3;b.headerExtensionInches=2.0625;expect(ids(s)).toContain('extension');b.headerExtensionInches=0;b.flatMountingSurface=false;expect(ids(s)).toContain('flat_surface');
 });
 it('requires exact frame construction and ring-pull height without stale inactive values',()=>{
  const r=record('frame_hinged'),s=selection('woodlore',r),f=r.bifold90!.frameHinged!;
  f.buildoutInches=null;expect(ids(s)).toContain('frame_buildout');f.buildoutInches=.5;f.bottom='';expect(ids(s)).toContain('bottom');f.bottom='deco_sill_3';f.usedAsDoor=null;expect(ids(s)).toContain('door');f.usedAsDoor=true;
  f.ringPull=true;expect(ids(s)).toContain('ring_pull');f.ringPullHeightInches=48;expect(ids(s)).toEqual([]);f.ringPull=false;expect(ids(s)).toContain('stale_ring_pull');
  expect(ids({...s,configuration:{...s.configuration,stile_join:'Butt'}})).toContain('stile');
 });
 it('rejects malformed subtype records while older standard records still parse',()=>{
  expect(parseNormanBifold90(emptyNormanBifold90())).not.toBeNull();const r=record('floating_90').bifold90!;expect(parseNormanBifold90({...r,floating:{...r.floating,optionalStopperPositionsInches:[NaN]}})).toBeNull();
  const f=record('frame_hinged').bifold90!;expect(parseNormanBifold90({...f,frameHinged:{...f.frameHinged,buildoutInches:2}})).toBeNull();
 });
 it('offers source-specific controls without manufacturing-geometry substitution',()=>{
  const render=(kind:'floating_90'|'frame_hinged',p='woodlore')=>renderToStaticMarkup(createElement(NormanBifold90Options,{value:record(kind).bifold90!,programId:p,onChange:()=>{},onLayout:()=>{}}));
  const floating=render('floating_90');expect(floating).toContain('Norman Floating exact layout');expect(floating).toContain('Floating side boards');expect(floating).not.toContain('Window width (inches)');
  const frame=render('frame_hinged');expect(frame).toContain('Frame-hinged buildout');expect(frame).toContain('Three sides + 3-inch Deco Sill');expect(frame).not.toContain('value="invisible"');expect(frame).not.toContain('Norman Bi-fold 90 header');expect(render('frame_hinged','normandy_stained')).toContain('value="invisible"');
 });
});
