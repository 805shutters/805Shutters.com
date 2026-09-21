import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanBifold90Options} from '@/components/crm/NormanBifold90Options';
import {emptyNormanBifold90,normanBifold90Layouts,normanBifold90Geometry,parseNormanBifold90} from '../quote/norman-shutter-bifold90';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {validateNormanShutterAssortment} from './norman-shutter-assortment';
import {getStandardShutterGridOptions} from '@/mts-quote/components/crm/quote-builder/DesignCard';
import type {SelectionContext} from './core';
import type {SalesQuoteDesign} from '@mts/types/quote';
const programs=['woodlore','woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'];
const record=(kind:'standard_90'|'multifold_90'='standard_90',layout='LL',mount:'Inside Mount'|'Semi-Inside Mount'|'Outside Mount'='Inside Mount'):NormanShutterPanelRecord=>({version:1,application:'bifold_other',motor:'none',existingDoorGlassOrSidelight:false,bifold90:{...emptyNormanBifold90(),kind,layout,mount,casing:'none',referenceWidthInches:48,referenceHeightInches:60,headerInches:3,fascia:'plain',headerExtensionInches:0,flatMountingSurface:true},panels:[...layout].map(()=>({heightInches:60,widthInches:18,divider:'none'}))});
const context=(programId='woodlore',r=record()):SelectionContext=>({manufacturerId:'Norman',productId:'norman_shutters',programId,catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:48,heightInches:60,quantity:1,configuration:{color:'001',louver_size:'3 1/2"',stile_width:'2"',stile_join:'Butt',panel_config:r.bifold90!.layout,mount_type:r.bifold90!.mount,[NORMAN_SHUTTER_PANEL_RECORD]:r},options:{}});
const allIssues=(s:SelectionContext)=>validateNormanShutterPanels(s);
const ids=(s:SelectionContext)=>allIssues(s).map(v=>v.ruleId).filter(v=>v.startsWith('norman.shutter.bifold90.')).map(v=>v.split('.').at(-1));
describe('independent Bi-fold90 source records',()=>{
 for(const p of programs)for(const kind of ['standard_90','multifold_90'] as const)for(const layout of normanBifold90Layouts(p,kind))for(const mount of ['Inside Mount','Semi-Inside Mount','Outside Mount'] as const){
 it(`${p} ${kind} ${layout} ${mount} enforces actual panel endpoints and retains exact data`,()=>{
  const r=record(kind,layout,mount),s=context(p,r),max=kind==='multifold_90'?20:['woodlore','woodlore_plus'].includes(p)?24:26;
  r.panels.forEach(panel=>{panel.widthInches=max;});expect(ids(s)).toEqual([]);
  expect(allIssues(s).some(v=>v.ruleId==='norman.shutter.panels.application_geometry')).toBe(true);
  expect(validateNormanShutterAssortment(s).filter(v=>/stile|frame|panel_width/.test(v.ruleId))).toEqual([]);
  r.panels[0].widthInches=max+.0625;expect(ids(s)).toContain('panel_width');r.panels[0].widthInches=5.9375;expect(ids(s)).toContain('panel_width');r.panels[0].widthInches=6;expect(ids(s)).toEqual([]);
  const reopened=parseNormanPanelRecord(JSON.parse(JSON.stringify(r)));expect(reopened).toEqual(r);
 });}
 it('keeps casing and mount calculations distinct from quote dimensions',()=>{
  const r=record().bifold90!;
  expect(normanBifold90Geometry(r)).toMatchObject({widthInches:47.875,heightInches:59.875,standardTrackCount:1});
  expect(normanBifold90Geometry({...r,mount:'Semi-Inside Mount'})).toMatchObject({widthInches:47.875,heightInches:61.375});
  expect(normanBifold90Geometry({...r,mount:'Outside Mount'})).toMatchObject({widthInches:51.5,heightInches:64.5});
  expect(normanBifold90Geometry({...r,mount:'Outside Mount',casing:'existing'})).toMatchObject({widthInches:49.25,heightInches:60});
  expect(normanBifold90Geometry({...r,casing:'existing'})).toBeNull();
 });
 it('rejects subtype extrapolation and exact construction violations',()=>{
  const r=record(),s=context('woodlore_aquashield',r),b=r.bifold90!;
  b.kind='multifold_90';b.layout='LLLL';expect(ids(s)).toContain('layout');b.kind='frame_hinged';expect(ids(s)).toContain('special_layout');b.kind='floating_90';expect(ids(s)).toContain('floating_side_boards');b.kind='standard_90';b.layout='LL';
  b.headerInches=3.5;expect(ids(s)).toContain('header');b.headerInches=3;b.fascia='deco';expect(ids(s)).toContain('fascia');b.fascia='plain';
  b.headerExtensionInches=2;expect(ids(s)).not.toContain('extension');b.headerExtensionInches=2.0625;expect(ids(s)).toContain('extension');b.headerExtensionInches=0;
  b.casing='existing';expect(ids(s)).toContain('casing_basis');b.casing='none';b.flatMountingSurface=false;expect(ids(s)).toContain('flat_surface');
  expect(ids({...s,configuration:{...s.configuration,stile_join:'Astragal'}})).toContain('stile');
  expect(parseNormanBifold90({...b,referenceWidthInches:'48'})).toBeNull();expect(parseNormanBifold90({...b,version:2})).toBeNull();
 });
 it('renders only program-valid subtypes and header choices with server-compatible controls',()=>{
  const r=record(),b=r.bifold90!,html=renderToStaticMarkup(createElement(NormanBifold90Options,{value:b,programId:'woodlore_aquashield',onChange:()=>{},onLayout:()=>{}}));
  expect(html).toContain('47.875');expect(html).not.toContain('value="multifold_90"');expect(html).not.toContain('value="frame_hinged"');expect(html).not.toContain('value="deco"');expect(html).not.toContain('value="3.5"');
  const design={supplier:'Norman',material:'Woodlore',panel_config:'LL',options_json:{catalog_program_id:'woodlore',[NORMAN_SHUTTER_PANEL_RECORD]:r}} as unknown as SalesQuoteDesign;
  const options=getStandardShutterGridOptions(design,true);const mount=options.find(v=>v.key==='mount_type');expect(mount&&'options'in mount?mount.options:null).toEqual(['Inside Mount','Semi-Inside Mount','Outside Mount']);
  expect(options.some(v=>['frame_type','frame_sides','size_type','panel_closure','widest_panel_width_inches'].includes(v.key))).toBe(false);
 });
});

it('accepts normalized saved mount aliases without conflating semi-inside',()=>{
 for(const [mount,aliases] of [['Inside Mount',['inside','inside_mount','Inside Mount']],['Outside Mount',['outside','outside_mount','Outside Mount']],['Semi-Inside Mount',['semi-inside','semi_inside','Semi-Inside Mount']]] as const){
  const r=record('standard_90','LL',mount),s=context('woodlore',r);
  for(const alias of aliases)expect(ids({...s,configuration:{...s.configuration,mount_type:alias}})).not.toContain('mount');
  expect(ids({...s,configuration:{...s.configuration,mount_type:mount==='Inside Mount'?'semi-inside':'inside'}})).toContain('mount');
 }
});
