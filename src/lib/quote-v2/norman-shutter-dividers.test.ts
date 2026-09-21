import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanShutterDividerOptions} from '@/components/crm/NormanShutterDividerOptions';
import {emptyNormanShutterDividerRecord,parseNormanShutterDividerRecord,normanShutterDividerSizes,normanShutterDividerDeviation,type NormanShutterDividerRecord} from '../quote/norman-shutter-dividers';
import {NORMAN_SHUTTER_PANEL_RECORD,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {NORMAN_SHUTTER_PROGRAMS} from '../quote/norman-shutter-assortment';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {selectionContextFromExactInterface} from './exact-interface-adapter';
import type {SelectionContext} from './core';
import type {SalesQuoteLineItem} from '@mts/types/quote';
const detail=():NormanShutterDividerRecord=>({...emptyNormanShutterDividerRecord(),measurementBasis:'window',referenceHeightInches:100,rails:[{heightInches:3,location:'specified',centerInches:48.25,exactLocation:true}]});
const record=(dividerDetails=detail()):NormanShutterPanelRecord=>({version:1,application:'regular',motor:'none',existingDoorGlassOrSidelight:false,panels:[{heightInches:96,divider:'present',dividerDetails,bottomSupport:{version:1,support:'existing_sill',gapInches:0.0625,frequentlyOpen:false}}]});
const context=(dividerDetails=detail(),programId='woodlore'):SelectionContext=>({manufacturerId:'Norman',productId:'norman_shutters',programId,catalogVersion:'current',catalogAsOf:'2026-09-20',widthInches:30,heightInches:96,quantity:1,options:{},configuration:{panel_config:'L',split_tilt:dividerDetails.splitTiltCentersInches.length?'Yes':'No',[NORMAN_SHUTTER_PANEL_RECORD]:record(dividerDetails)}});
const ids=(s:SelectionContext)=>validateNormanShutterPanels(s).filter(i=>i.ruleId.startsWith('norman.shutter.dividers.')).map(i=>i.ruleId.replace('norman.shutter.dividers.',''));
describe('Norman exact divider schedules',()=>{
 it('checks every program standard size and retains final divider geometry holds',()=>{
  for(const program of NORMAN_SHUTTER_PROGRAMS){
   expect(ids(context(detail(),program.id))).toEqual([]);
   expect(validateNormanShutterPanels(context(detail(),program.id)).some(i=>i.ruleId==='norman.shutter.panels.divider_geometry')).toBe(true);
  }
 });
 it('allows only documented custom sizes and retains a distinct unverified surcharge',()=>{
  for(const program of ['brightwood','normandy_painted','normandy_stained']){
   expect(normanShutterDividerSizes(program)).toHaveLength(40);
   for(const size of normanShutterDividerSizes(program).slice(1)){const d=detail();d.rails[0].heightInches=size;expect(ids(context(d,program))).toEqual(['custom_charge']);}
   for(const size of [3.0625,7.9375,8,2.875]){const d=detail();d.rails[0].heightInches=size;expect(ids(context(d,program))).toContain('size');}
  }
  for(const program of ['woodlore','woodlore_plus','woodlore_aquashield']){const d=detail();d.rails[0].heightInches=3.125;expect(ids(context(d,program))).toContain('size');}
 });
 it('requires actual datum, exact-location choice and centers within the reference height',()=>{
  const d=detail();d.measurementBasis='';expect(ids(context(d))).toContain('measurement_basis');d.measurementBasis='max_frame';
  d.rails[0].exactLocation=null;expect(ids(context(d))).toContain('location');d.rails[0].exactLocation=false;
  for(const pos of [0,-1,100,100.0625,null]){d.rails[0].centerInches=pos;expect(ids(context(d))).toContain('position');}
  d.rails[0].centerInches=99.9375;expect(ids(context(d))).toEqual([]);
 });
 it('requires two actual louvers between every adjacent rail/split location and rejects default-center ambiguity',()=>{
  const d=detail();d.splitTiltMode='custom';d.splitTiltReference='top_closed_louver';d.splitTiltExactLocations=[true];d.splitTiltCentersInches=[75];d.clearLouverCounts=[2];expect(ids(context(d))).toEqual(['split_geometry']);
  for(const count of [0,1,1.5]){d.clearLouverCounts=[count];expect(ids(context(d))).toContain('louver_clearance');}
  d.clearLouverCounts=[];expect(ids(context(d))).toContain('louver_clearance');
  d.clearLouverCounts=[2];d.rails[0].location='center';expect(ids(context(d))).toContain('center_geometry');
  d.rails[0].location='specified';d.splitTiltCentersInches=[48.25];expect(ids(context(d))).toContain('duplicate_position');
  d.splitTiltCentersInches=[100];expect(ids(context(d))).toContain('split_position');
  d.splitTiltCentersInches=[75];const s=context(d);expect(ids({...s,configuration:{...s.configuration,split_tilt:'No'}})).toContain('split_identity');
 });
 it('keeps default panel center separate from a measured exact custom location',()=>{
  const d=detail();d.rails[0]={heightInches:3,location:'center',centerInches:null,exactLocation:false};expect(ids(context(d))).toEqual([]);
  const html=renderToStaticMarkup(createElement(NormanShutterDividerOptions,{value:d,panelNumber:1,programId:'brightwood',louver:'3 1/2"',onChange:()=>{}}));
  expect(html).toContain('Default panel center');expect(html).toContain('Exact location required');expect(html).toContain('surcharge unverified');
  expect(normanShutterDividerDeviation('1 7/8"')).toBe(.75);expect(normanShutterDividerDeviation('4 1/2"')).toBe(2);
 });
 it('persists measured datum and exact-location election through the real server adapter without overwriting historical records',()=>{
  const d=detail(),r=record(d),line={id:'internal',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:30,width_fraction:'0',height_whole:96,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
  const design=JSON.parse(JSON.stringify({supplier:'Norman',material:'Woodlore',panel_config:'L',options_json:{[NORMAN_SHUTTER_PANEL_RECORD]:r}}));
  const saved=selectionContextFromExactInterface(line,design,{productId:'norman_shutters',programId:'woodlore',catalogAsOf:'2026-09-20'});
  expect(saved.configuration[NORMAN_SHUTTER_PANEL_RECORD]).toEqual(r);expect(ids(saved)).toEqual([]);
  expect(ids({...context(),catalogAsOf:'2026-09-19'})).toEqual([]);
  expect(parseNormanShutterDividerRecord({...d,rails:[{...d.rails[0],centerInches:'48'}]})).toBeNull();
  expect(parseNormanShutterDividerRecord({...d,clearLouverCounts:[NaN]})).toBeNull();
 });
});


describe('Norman split tilt independent of divider rails',()=>{
 const splitContext=(mode:'equal'|'custom'='custom')=>{
  const d:NormanShutterDividerRecord={...emptyNormanShutterDividerRecord(),rails:[],measurementBasis:'max_frame',referenceHeightInches:60,splitTiltMode:mode,splitTiltReference:'top_closed_louver',splitTiltCentersInches:mode==='custom'?[30.25]:[],splitTiltExactLocations:mode==='custom'?[true]:[],clearLouverCounts:[]};
  const s=context(d);s.configuration={...s.configuration,split_tilt:'Yes',[NORMAN_SHUTTER_PANEL_RECORD]:{...record(d),panels:[{...record(d).panels[0],heightInches:60,divider:'none'}]}};
  return {d,s};
 };
 it('supports equal louver-count split without inventing a numeric center or divider rail',()=>{
  for(const program of NORMAN_SHUTTER_PROGRAMS){const {d,s}=splitContext('equal');d.measurementBasis='';d.referenceHeightInches=null;expect(ids({...s,programId:program.id})).toEqual(['split_geometry']);}
 });
 it('requires closed-louver top reference and exact-location choice for custom splits',()=>{
  const {d,s}=splitContext();expect(ids(s)).toEqual(['split_geometry']);delete d.splitTiltReference;expect(ids(s)).toContain('split_reference');d.splitTiltReference='top_closed_louver';d.splitTiltExactLocations=[null];expect(ids(s)).toContain('split_reference');d.splitTiltExactLocations=[false];expect(ids(s)).toEqual(['split_geometry']);
  d.splitTiltCentersInches=[60];expect(ids(s)).toContain('split_position');
 });
 it('does not reinterpret old center-labelled arrays or clear them from saved history',()=>{
  const {d,s}=splitContext();delete d.splitTiltReference;delete d.splitTiltExactLocations;delete d.splitTiltMode;expect(parseNormanShutterDividerRecord(d)).toEqual(d);expect(ids(s)).toContain('split_mode');expect(ids(s)).toContain('split_reference');expect(ids({...s,catalogAsOf:'2026-09-19'})).toEqual([]);
 });
 it('requires actual nonmotorized louver count between split locations and rejects residual divider rows',()=>{
  const {d,s}=splitContext();d.splitTiltCentersInches=[20,40];d.splitTiltExactLocations=[true,false];expect(ids(s)).toContain('louver_clearance');d.clearLouverCounts=[2];expect(ids(s)).toEqual(['split_geometry']);d.rails=[{heightInches:3,location:'specified',centerInches:10,exactLocation:false}];expect(ids(s)).toContain('rail_identity');
 });
 it('shows split-only fields without presenting a fabricated divider rail',()=>{
  const {d}=splitContext();const html=renderToStaticMarkup(createElement(NormanShutterDividerOptions,{value:d,panelNumber:1,programId:'woodlore',louver:'3 1/2"',splitOnly:true,onChange:()=>{}}));expect(html).toContain('top of closed louver');expect(html).toContain('Exact split location required');expect(html).toContain('Equal split by louver count');expect(html).not.toContain('Add divider for panel');expect(html).not.toContain('divider 1 size');
 });
});
