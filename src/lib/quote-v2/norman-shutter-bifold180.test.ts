import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NormanShutterPanelOptions } from '@/components/crm/NormanShutterPanelOptions';
import { NORMAN_SHUTTER_PANEL_RECORD, parseNormanPanelRecord, type NormanShutterPanelRecord } from '../quote/norman-shutter-panels';
import { normanBifold180Layouts, normanBifold180PanelMaxWidth } from '../quote/norman-shutter-bifold180';
import { NORMAN_SHUTTER_PROGRAMS } from '../quote/norman-shutter-assortment';
import { validateNormanShutterPanels } from './norman-shutter-panels';
import { selectionContextFromExactInterface } from './exact-interface-adapter';
import type { SelectionContext } from './core';
import type { SalesQuoteDesign, SalesQuoteLineItem } from '@mts/types/quote';
const construction={version:1 as const,casing:'none' as const,referenceWidthInches:60,referenceHeightInches:60,headerInches:3 as const,fascia:'plain' as const,headerExtensionInches:0,baseboardThicknessInches:0,headerBuildoutInches:0,bottomPivotLBracket:false,lightBlockExtensionInches:null};
const schedule=(layout='LL'):NormanShutterPanelRecord=>({version:1,application:'bifold_180',motor:'none',existingDoorGlassOrSidelight:false,bifold180:{version:1,layout,flatMountingSurface:true,construction:{...construction}},panels:[...layout].map(()=>({heightInches:60,widthInches:18,divider:'none'}))});
const context=(programId='woodlore',record=schedule()):SelectionContext=>({manufacturerId:'Norman',productId:'norman_shutters',programId,catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:120,heightInches:100,quantity:1,configuration:{panel_config:record.bifold180?.layout??'LL',mount_type:'Outside Mount',stile_width:'2"',stile_join:'Butt',louver_size:'3 1/2"',[NORMAN_SHUTTER_PANEL_RECORD]:record},options:{}});
const ids=(s:SelectionContext)=>validateNormanShutterPanels(s).map(i=>i.ruleId);
const trackIds=(s:SelectionContext)=>ids(s).filter(id=>id.startsWith('norman.shutter.bifold180.'));
describe('Bi-fold 180 documented panel schedules',()=>{
 it('validates every documented program/layout at its panel-width boundaries, retaining specialized geometry hold',()=>{
  for(const program of NORMAN_SHUTTER_PROGRAMS)for(const layout of normanBifold180Layouts(program.id)){
   for(const boundary of ['minimum','maximum'] as const){
    const r=schedule(layout);r.panels.forEach((panel,i)=>panel.widthInches=boundary==='minimum'?6:normanBifold180PanelMaxWidth(program.id,layout,i));
    expect(trackIds(context(program.id,r))).toEqual([]);
    expect(ids(context(program.id,r))).toContain('norman.shutter.panels.application_geometry');
    r.panels[0].widthInches!+=boundary==='minimum'?-0.0625:0.0625;
    expect(trackIds(context(program.id,r))).toContain('norman.shutter.bifold180.panel_width');
   }
  }
 });
 it('applies the 20-inch limit only to the triple stack in mixed wood layouts',()=>{
  const r=schedule('LLLRR');r.panels.forEach((p,i)=>p.widthInches=i<3?20:26);
  expect(trackIds(context('brightwood',r))).toEqual([]);
  r.panels[2].widthInches=20.0625;expect(trackIds(context('brightwood',r))).toContain('norman.shutter.bifold180.panel_width');
  expect(normanBifold180PanelMaxWidth('normandy_stained','LLRRR',0)).toBe(26);
  expect(normanBifold180PanelMaxWidth('normandy_stained','LLRRR',2)).toBe(20);
 });
 it('rejects unknown/composite triple layouts, mismatches, missing panel widths and nonoutside mounting',()=>{
  for(const p of ['woodlore','woodlore_plus','woodlore_aquashield'])expect(trackIds(context(p,schedule('LLL')))).toContain('norman.shutter.bifold180.layout');
  expect(trackIds(context('brightwood',schedule('LLLL')))).toContain('norman.shutter.bifold180.layout');
  const s={...context(),configuration:{...context().configuration,panel_config:'RR'}};expect(trackIds(s)).toContain('norman.shutter.bifold180.layout_mismatch');
  for(const mount of ['Inside Mount','Semi-Inside Mount','',null])expect(trackIds({...context(),configuration:{...context().configuration,mount_type:mount}})).toContain('norman.shutter.bifold180.outside_mount');
  const r=schedule();r.panels[0].widthInches=null;expect(trackIds(context('woodlore',r))).toContain('norman.shutter.bifold180.panel_width');
  r.panels.pop();expect(trackIds(context('woodlore',r))).toContain('norman.shutter.bifold180.panel_count');
  r.bifold180!.flatMountingSurface=false;expect(trackIds(context('woodlore',r))).toContain('norman.shutter.bifold180.flat_surface');
 });
 it('does not infer AquaShield 1⅞ availability from an ambiguous table cell',()=>{
  const s={...context('woodlore_aquashield'),configuration:{...context('woodlore_aquashield').configuration,louver_size:'1 7/8"'}};
  expect(trackIds(s)).toContain('norman.shutter.bifold180.louver');
 });
 it('preserves historical records and rejects malformed new records',()=>{
  const r=schedule();delete r.bifold180;r.panels.forEach(p=>delete p.widthInches);
  expect(parseNormanPanelRecord(r)).toEqual(r);
  expect(ids({...context('woodlore',r),catalogAsOf:'2026-09-19'})).toEqual([]);
  expect(trackIds(context('woodlore',r))).toContain('norman.shutter.bifold180.schedule_required');
  expect(parseNormanPanelRecord({...schedule(),bifold180:{version:2,layout:'LL',flatMountingSurface:true}})).toBeNull();
  expect(parseNormanPanelRecord({...schedule(),panels:[{heightInches:60,widthInches:'24',divider:'none'}]})).toBeNull();
  expect(parseNormanPanelRecord({...schedule(),panels:[{heightInches:60,widthInches:Infinity,divider:'none'}]})).toBeNull();
 });
 it('persists the exact source schedule through the server adapter and renders every measured panel',()=>{
  const r=schedule('LLLRR');r.panels[4].widthInches=25.9375;
  const line={id:'internal',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:120,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
  const design=JSON.parse(JSON.stringify({id:'internal-design',supplier:'Norman',material:'Brightwood',panel_config:'LLLRR',mount_type:'Outside Mount',stile_width:'2"',stile_join:'Butt',louver_size:'3 1/2"',options_json:{stile_width:'2"',stile_join:'Butt',catalog_program_id:'brightwood',[NORMAN_SHUTTER_PANEL_RECORD]:r}})) as SalesQuoteDesign;
  const s=selectionContextFromExactInterface(line,design,{productId:'norman_shutters',programId:'brightwood',catalogAsOf:'2026-09-20'});
  expect(s.configuration[NORMAN_SHUTTER_PANEL_RECORD]).toEqual(r);expect(trackIds(s)).toEqual([]);
  const html=renderToStaticMarkup(createElement(NormanShutterPanelOptions,{design,onUpdateFields:()=>{}}));
  expect(html).toContain('Norman panel 5 finished width');expect(html).toContain('25.9375');expect(html).toContain('Outside Mount only');expect(html).not.toContain('manufacturer-reviewed panel schedule');
 });
});
