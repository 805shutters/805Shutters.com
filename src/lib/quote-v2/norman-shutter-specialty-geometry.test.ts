import {selectionContextFromExactInterface} from './exact-interface-adapter';
import type {SalesQuoteLineItem} from '@mts/types/quote';
import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanShutterSpecialtyGeometryOptions} from '@/components/crm/NormanShutterSpecialtyGeometryOptions';
import {emptyNormanSpecialtyGeometry,parseNormanSpecialtyGeometry} from '../quote/norman-shutter-specialty-geometry';
import {emptyNormanSpecialtyRecord,parseNormanSpecialtyRecord,type NormanSpecialtyRecord} from '../quote/norman-shutter-specialty';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {normanSpecialtyGeometryProblems} from './norman-shutter-specialty-geometry';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import type {SelectionContext} from './core';
const rec=(shapeCode='YS57'):NormanSpecialtyRecord=>({...emptyNormanSpecialtyRecord(),shapeCode,geometry:{...emptyNormanSpecialtyGeometry(),widthInches:48,heightInches:60,outline:'perfect',existingMolding:false,legHeightInches:36,middleHeightInches:48.0625,leftLegHeightInches:36,rightLegHeightInches:36}});
const ids=(r:NormanSpecialtyRecord,mount='Outside Mount')=>normanSpecialtyGeometryProblems(r,mount).map(p=>p.id.replace('order_geometry.',''));
describe('Norman specialty order outline, T-posts and template requirements',()=>{
 it('preserves old typed records but requires missing current order-outline declarations',()=>{
  const old=emptyNormanSpecialtyRecord();expect(parseNormanSpecialtyRecord(old)).toEqual(old);expect(ids(old)).toEqual(['required']);
  expect(parseNormanSpecialtyGeometry({...emptyNormanSpecialtyGeometry(),leftLegHeightInches:'36'})).toBeNull();expect(parseNormanSpecialtyGeometry({...emptyNormanSpecialtyGeometry(),verticalTPostLocationsInches:[NaN]})).toBeNull();
 });
 it('enforces strict perfect-quarter middle boundary independently for all four identities',()=>{
  for(const code of ['YS57','YS58','YS68','YS69']){const r=rec(code);expect(ids(r)).toEqual([]);r.geometry!.middleHeightInches=48;expect(ids(r)).toContain('perfect_middle');r.geometry!.middleHeightInches=47.9375;expect(ids(r)).toContain('perfect_middle');r.geometry!.outline='imperfect';r.geometry!.templateReference='TEST TEMPLATE';expect(ids(r)).toEqual([]);}
 });
 it('includes both leg endpoints for three perfect-arch identities without fabricating legs',()=>{
  for(const code of ['YS05','YS10','YS51']){const r=rec(code);expect(ids(r)).toEqual([]);r.geometry!.rightLegHeightInches=35.9375;expect(ids(r)).toContain('perfect_legs');r.geometry!.rightLegHeightInches=60;expect(ids(r)).toEqual([]);r.geometry!.leftLegHeightInches=null;expect(ids(r)).toContain('two_legs');}
 });
 it('requires imperfect equal-width quarter middle height and caps Solid Rail Arch curve at six',()=>{
  for(const code of ['YS02','YS06']){const r=rec(code);r.geometry!.widthInches=60;r.geometry!.middleHeightInches=null;expect(ids(r)).toEqual([]);r.geometry!.outline='imperfect';r.geometry!.templateReference='TEST TEMPLATE';expect(ids(r)).toContain('quarter_middle');r.geometry!.middleHeightInches=42;expect(ids(r)).toEqual([]);}
  const r=rec('YS56');r.geometry!.legHeightInches=54;expect(ids(r)).toEqual([]);r.geometry!.legHeightInches=53.9375;expect(ids(r)).toContain('solid_curve');
 });
 it('captures exact two, three and four T-post schedules with no invented outer positions',()=>{
  for(const code of ['YS65','YS66','YS67']){const r=rec(code),g=r.geometry!;g.verticalTPostCount=1;expect(ids(r)).toContain('t_post_count');g.verticalTPostCount=2;expect(ids(r)).toEqual([]);g.verticalTPostCount=3;expect(ids(r)).toContain('t_post_locations');g.verticalTPostLocationsInches=[24];expect(ids(r)).toEqual([]);g.verticalTPostCount=4;expect(ids(r)).toContain('t_post_locations');g.verticalTPostLocationsInches=[10,20,30,40];expect(ids(r)).toEqual([]);g.verticalTPostLocationsInches=[10,20,20,48];expect(ids(r)).toContain('t_post_positions');}
 });
 it('distinguishes declared centered peaks from measured noncentered WA',()=>{
  const r=rec('YS62'),g=r.geometry!;g.outline='not_arch';expect(ids(r)).toContain('peak_mode');g.centeredPeak=true;expect(ids(r)).toEqual([]);g.peakWidthAInches=20;expect(ids(r)).toContain('peak_center');g.centeredPeak=false;expect(ids(r)).toEqual([]);g.peakWidthAInches=48;expect(ids(r)).toContain('peak_width');
 });
 it('requires a template for each independent source condition and never treats the reference as factory approval',()=>{
  for(const cause of ['inside','imperfect','molding','oval']){const r=rec('YS01'),g=r.geometry!;if(cause==='imperfect')g.outline='imperfect';if(cause==='molding')g.existingMolding=true;if(cause==='oval')r.shapeCode='YS20';const mount=cause==='inside'?'Inside Mount':'Outside Mount';expect(ids(r,mount)).toContain('template');g.templateReference='INTERNAL TEST ONLY';expect(ids(r,mount)).not.toContain('template');}
  const detail={...rec('YS57'),frameType:'3" Crown Z Frame',frameSides:'4' as const,frameIncludeInRail:false,hinges:false,magnets:false,hangStripBehind:false};
  const panel:NormanShutterPanelRecord={version:1,application:'specialty',motor:'none',existingDoorGlassOrSidelight:false,specialty:detail,panels:[{widthInches:48,heightInches:60,divider:'none'}]};
  expect(parseNormanPanelRecord(JSON.parse(JSON.stringify(panel)))).toEqual(panel);
  const s:SelectionContext={manufacturerId:'Norman',productId:'norman_shutters',programId:'woodlore_plus',catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:48,heightInches:60,quantity:1,options:{},configuration:{mount_type:'Outside Mount',frame_type:detail.frameType,[NORMAN_SHUTTER_PANEL_RECORD]:panel}};
  expect(validateNormanShutterPanels(s).some(i=>i.ruleId==='norman.shutter.specialty.geometry')).toBe(true);detail.geometry!.middleHeightInches=48;expect(validateNormanShutterPanels(s).some(i=>i.ruleId==='norman.shutter.specialty.order_geometry.perfect_middle')).toBe(true);expect(validateNormanShutterPanels({...s,catalogAsOf:'2026-09-19'}).some(i=>i.ruleId.includes('order_geometry'))).toBe(false);
 });
 it('requires inside-mount templates after the actual saved CRM adapter canonicalizes the mount',()=>{
  const r=rec('YS15');r.geometry!.outline='not_arch';
  const panel:NormanShutterPanelRecord={version:1,application:'specialty',motor:'none',existingDoorGlassOrSidelight:false,specialty:r,panels:[{widthInches:24,heightInches:24,divider:'none'}]};
  const line={id:'internal',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:24,width_fraction:'0',height_whole:24,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
  const s=selectionContextFromExactInterface(line,{supplier:'Norman',material:'Woodlore Plus',mount_type:'Inside Mount',options_json:{[NORMAN_SHUTTER_PANEL_RECORD]:panel}},{productId:'norman_shutters',programId:'woodlore_plus',catalogAsOf:'2026-09-20'});
  expect(s.configuration.mount_type).toBe('inside');expect(validateNormanShutterPanels(s).some(i=>i.ruleId==='norman.shutter.specialty.order_geometry.template')).toBe(true);
  for(const mount of ['Inside Mount','inside','IM','i'])expect(ids(r,mount)).toContain('template');
  expect(ids(r,'Outside Mount')).not.toContain('template');
 });
 it('shows only source-required T-post input positions and the distinct outline measurement basis',()=>{
  const g=rec('YS65').geometry!;g.verticalTPostCount=3;
  const html=renderToStaticMarkup(createElement(NormanShutterSpecialtyGeometryOptions,{value:g,shapeCode:'YS65',onChange:()=>{}}));expect(html).toContain('Middle (second)');expect(html).not.toContain('requested location 2');expect(html).toContain('separate from the opening');expect(html).toContain('older than one year');
 });
});
