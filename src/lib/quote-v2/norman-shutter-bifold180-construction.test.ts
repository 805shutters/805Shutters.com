import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getStandardShutterGridOptions} from '@/mts-quote/components/crm/quote-builder/DesignCard';
import {NormanBifold180ConstructionOptions} from '@/components/crm/NormanBifold180ConstructionOptions';
import {emptyNormanBifold180Construction,parseNormanBifold180Construction,normanBifold180Geometry,normanBifold180BaseboardAdvice,normanBifold180FramingReference} from '../quote/norman-shutter-bifold180-construction';
import {NORMAN_SHUTTER_PANEL_RECORD,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {validateNormanShutterAssortment} from './norman-shutter-assortment';
import type {SelectionContext} from './core';
import type {SalesQuoteDesign} from '@mts/types/quote';
const construction=()=>({...emptyNormanBifold180Construction(),casing:'none' as const,referenceWidthInches:48,referenceHeightInches:60,headerInches:3 as const,fascia:'plain' as const,headerExtensionInches:0,baseboardThicknessInches:0,headerBuildoutInches:0,bottomPivotLBracket:false});
const record=():NormanShutterPanelRecord=>({version:1,application:'bifold_180',motor:'none',existingDoorGlassOrSidelight:false,panels:[{widthInches:24,heightInches:60,divider:'none'},{widthInches:24,heightInches:60,divider:'none'}],bifold180:{version:1,layout:'LL',flatMountingSurface:true,construction:construction()}});
const context=(r=record(),programId='woodlore'):SelectionContext=>({manufacturerId:'Norman',productId:'norman_shutters',programId,catalogVersion:'current',catalogAsOf:'2026-09-20',widthInches:48,heightInches:60,quantity:1,options:{},configuration:{panel_config:'LL',mount_type:'Outside Mount',stile_width:'2"',stile_join:'Butt',louver_size:'3 1/2"',color:'001',frame_type:'old-regular-frame',[NORMAN_SHUTTER_PANEL_RECORD]:r}});
const ids=(s:SelectionContext)=>validateNormanShutterPanels(s).map(i=>i.ruleId.replace('norman.shutter.bifold180.',''));
describe('Bi-fold180 source construction',()=>{
 it('distinguishes framing sections from unknown hardware quantities and pricing dimensions',()=>{
  expect(normanBifold180FramingReference(3)).toMatchObject({standardTrackCount:1,topFasciaSectionInches:3.375,lightBlockSectionInches:1.5625,hardwareQuantities:null,pricingMeasurementBasis:null});
  expect(normanBifold180FramingReference(3.5)?.lightBlockSectionInches).toBe(2.0625);
  expect(normanBifold180FramingReference(null)).toBeNull();
 });
 it('uses explicit window versus casing measurement bases without inventing casing height deductions',()=>{
  expect(normanBifold180Geometry(construction())).toEqual({widthInches:51.5,heightInches:64.5});
  expect(normanBifold180Geometry({...construction(),casing:'existing'})).toEqual({widthInches:49.25,heightInches:60});
  expect(normanBifold180Geometry({...construction(),referenceHeightInches:null})).toBeNull();
  expect(normanBifold180Geometry({...construction(),casing:''})).toBeNull();
 });
 it('enforces extension endpoints, pivot extension and Aqua fascia server-side',()=>{
  for(const extension of [0,2]){const r=record();r.bifold180!.construction!.headerExtensionInches=extension;expect(ids(context(r))).not.toContain('header_extension');}
  for(const extension of [-0.0625,2.0625,null]){const r=record();r.bifold180!.construction!.headerExtensionInches=extension;expect(ids(context(r))).toContain('header_extension');}
  const r=record(),c=r.bifold180!.construction!;c.bottomPivotLBracket=true;
  for(const width of [null,1.6875,1.8125]){c.lightBlockExtensionInches=width;expect(ids(context(r))).toContain('light_block');}
  c.lightBlockExtensionInches=1.75;expect(ids(context(r))).not.toContain('light_block');
  c.fascia='deco';expect(ids(context(r,'woodlore_aquashield'))).toContain('fascia');expect(ids(context(r))).not.toContain('fascia');
 });
 it('preserves recommendations as advice, not an invented manufacturer prohibition',()=>{
  expect(normanBifold180BaseboardAdvice(construction())).toContain('allows a 3-inch');
  expect(normanBifold180BaseboardAdvice({...construction(),baseboardThicknessInches:0.625})).toContain('allows a 3½-inch');
  expect(normanBifold180BaseboardAdvice({...construction(),baseboardThicknessInches:0.75})).toContain('0.625-inch buildout');
  const r=record();r.bifold180!.construction!.baseboardThicknessInches=0.75;
  expect(ids(context(r))).not.toContain('baseboard');
  expect(ids(context(r))).toContain('norman.shutter.panels.application_geometry');
 });
 it('uses track stile choices in UI and server instead of regular Astragal rules',()=>{
  for(const program of ['woodlore','woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained']){
   const s=context(record(),program),design=JSON.parse(JSON.stringify({supplier:'Norman',material:'Woodlore',panel_config:'LL',options_json:{...s.configuration,catalog_program_id:program}})) as SalesQuoteDesign;
   const options=getStandardShutterGridOptions(design,true);
   const choices=(key:string)=>{const option=options.find(o=>o.key===key);return option&&'options' in option?option.options:undefined;};
   expect(choices('stile_join')).toEqual(['Butt','Rabbet']);
   expect(choices('mount_type')).toEqual(['Outside Mount']);
   expect(choices('stile_width')).toEqual(program==='woodlore_aquashield'?['2"']:['2"','2 1/4"']);
   expect(options.some(o=>['widest_panel_width_inches','frame_type','frame_sides','size_type'].includes(o.key))).toBe(false);
   expect(validateNormanShutterAssortment(s).map(i=>i.ruleId)).not.toContain('norman.shutter.assortment.stile_join');
   expect(validateNormanShutterAssortment(s).map(i=>i.ruleId)).not.toContain('norman.shutter.assortment.frame');
   expect(ids({...s,configuration:{...s.configuration,stile_join:'Astragal'}})).toContain('stile');
  }
 });
 it('renders casing basis and program-specific fascia, and rejects malformed persisted construction',()=>{
  const html=renderToStaticMarkup(createElement(NormanBifold180ConstructionOptions,{value:{...construction(),casing:'existing'},aqua:true,onChange:()=>{}}));
  expect(html).toContain('Measured max-frame height');expect(html).toContain('49.25');expect(html).not.toContain('value="deco"');
  expect(parseNormanBifold180Construction(construction())).toEqual(construction());
  for(const patch of [{headerInches:4},{fascia:'forged'},{casing:'inside'},{bottomPivotLBracket:'yes'},{referenceWidthInches:Infinity},{headerBuildoutInches:'1'}])expect(parseNormanBifold180Construction({...construction(),...patch})).toBeNull();
 });
});
