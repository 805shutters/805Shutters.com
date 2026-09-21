import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanShutterPanelOptions} from '@/components/crm/NormanShutterPanelOptions';
import {normanRegularActualWidest,normanRegularPanelRoles,normanRegularPanelWidthLimit,normanNarrowSingleJoin} from '../quote/norman-shutter-regular-widths';
import {NORMAN_SHUTTER_PROGRAMS,normanShutterFrames} from '../quote/norman-shutter-assortment';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanRegularWidths} from './norman-shutter-regular-widths';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {validateNormanShutterAssortment} from './norman-shutter-assortment';
import type {SelectionContext} from './core';
import {selectionContextFromExactInterface} from './exact-interface-adapter';
import type {SalesQuoteLineItem,SalesQuoteDesign} from '@mts/types/quote';
function fixture(programId='woodlore',layout='L',widths=[24]){
 const record:NormanShutterPanelRecord={version:1,application:'regular',motor:'none',existingDoorGlassOrSidelight:false,panels:widths.map(widthInches=>({heightInches:60,widthInches,divider:'none',wholePanelLouverCount:12}))};
 const line={id:'internal',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:120,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
 const s=selectionContextFromExactInterface(line,{supplier:'Norman',material:'Woodlore',panel_config:layout,louver_size:'3 1/2"',options_json:{frame_type:'FN01',stile_join:widths.length===1?(widths[0]<9?'Rabbet':'Butt'):'Rabbet',widest_panel_width_inches:Math.max(...widths),[NORMAN_SHUTTER_PANEL_RECORD]:record}},{productId:'norman_shutters',programId,catalogAsOf:'2026-09-20'});
 return {s,record};
}
const configure=(f:ReturnType<typeof fixture>,patch:SelectionContext['configuration'])=>{f.s={...f.s,configuration:{...f.s.configuration,...patch}};};
const ids=(f:ReturnType<typeof fixture>)=>validateNormanRegularWidths(f.s,f.record).map(i=>i.ruleId.split('.').at(-1));
describe('individual regular shutter widths and narrow join placement',()=>{
 it.each([['L',['single']],['R',['single']],['LR',['single','single']],['LL',['bifold','bifold']],['RR',['bifold','bifold']],['LLRR',['bifold','bifold','bifold','bifold']],['LLR',['bifold','bifold','single']],['LRR',['single','bifold','bifold']]])('retains the left-to-right roles in %s',(layout,roles)=>{
  expect(normanRegularPanelRoles(layout)).toEqual(roles);
 });
 it.each(NORMAN_SHUTTER_PROGRAMS.map(p=>p.id))('verifies every %s panel against its own role limit',program=>{
  const single=normanRegularPanelWidthLimit(program,'3 1/2"','single'),bifold=normanRegularPanelWidthLimit(program,'3 1/2"','bifold');
  const f=fixture(program,'LLR',[bifold,bifold,single]);expect(ids(f)).toEqual([]);expect(validateNormanShutterAssortment(f.s).some(i=>i.ruleId.endsWith('mixed_panel_width'))).toBe(false);
  f.record.panels[0].widthInches=bifold+0.0625;expect(ids(f)).toContain('panel_width');f.record.panels[0].widthInches=bifold;
  f.record.panels[2].widthInches=single+0.0625;expect(ids(f)).toContain('panel_width');
  expect(ids(fixture(program,'LRR',[single,bifold,bifold]))).toEqual([]);
  expect(ids(fixture(program,'L',[6]))).toEqual([]);expect(ids(fixture(program,'L',[5.9375]))).toContain('panel_width');
 });
 it.each([['woodlore','1 7/8"',24],['woodlore','2 1/2"',30],['woodlore_plus','2 1/2"',36],['woodlore_aquashield','3"',31],['brightwood','1 7/8"',30],['normandy_painted','3"',36],['normandy_stained','4 1/2"',42]] as const)('uses %s %s exact single maximum %s',(program,louver,max)=>{
  const f=fixture(program,'L',[max]);configure(f,{louver_size:louver});expect(ids(f)).toEqual([]);f.record.panels[0].widthInches=max+0.0625;expect(ids(f)).toContain('panel_width');
 });
 it('checks the complete six-program/louver/regular-layout width matrix at both boundaries',()=>{
  const maxima:Record<string,number[]>={woodlore:[24,30,36,36,36],woodlore_plus:[24,36,36,36,36],woodlore_aquashield:[0,31,31,36,36],brightwood:[30,36,36,42,42],normandy_painted:[30,36,36,42,42],normandy_stained:[30,36,36,42,42]};
  const louvers=['1 7/8"','2 1/2"','3"','3 1/2"','4 1/2"'];
  for(const [program,limits] of Object.entries(maxima))for(const [j,max] of limits.entries()){
   if(!max)continue;
   for(const layout of ['L','R','LR','LL','RR','LLRR','LLR','LRR']){
    const roles=normanRegularPanelRoles(layout)!;
    const widths=roles.map(role=>role==='single'?max:program==='brightwood'||program.startsWith('normandy_')?26:24);
    const f=fixture(program,layout,widths);configure(f,{louver_size:louvers[j]});expect(ids(f),`${program}/${louvers[j]}/${layout}`).toEqual([]);
    for(let i=0;i<widths.length;i++){
     f.record.panels[i].widthInches=widths[i]+0.0625;expect(ids(f)).toContain('panel_width');
     f.record.panels[i].widthInches=5.9375;expect(ids(f)).toContain('panel_width');f.record.panels[i].widthInches=widths[i];
    }
   }
  }
 });
 it('requires measured widths and does not infer them from opening width or an old summary',()=>{
  const f=fixture();delete f.record.panels[0].widthInches;expect(ids(f)).toContain('panel_width');expect(normanRegularActualWidest(f.record,'L')).toBeNull();
  expect(ids(fixture('woodlore','LLR',[24,24]))).toContain('panel_schedule');expect(normanRegularPanelRoles('LTLR')).toBeNull();
  const stale=fixture();configure(stale,{widest_panel_width_inches:23.9375});expect(ids(stale)).toContain('width_summary');expect(normanRegularActualWidest(stale.record,'L')).toBe(24);
 });
 it.each(NORMAN_SHUTTER_PROGRAMS.map(p=>p.id))('uses exact %s frame and hang-strip placement below nine inches',program=>{
  const hang=normanShutterFrames(program).find(f=>/hang strip/i.test(f.label))!;
  expect(hang).toBeDefined();const f=fixture(program,'L',[8.9375]);configure(f,{frame_type:hang.code});
  expect(ids(f)).toEqual(expect.arrayContaining(['hang_strip','narrow_join']));
  for(const [placement,join] of [['behind','Butt'],['beside','Rabbet']] as const){f.record.regularHangStripPlacement=placement;configure(f,{stile_join:join});expect(ids(f)).toEqual([]);configure(f,{stile_join:join==='Butt'?'Rabbet':'Butt'});expect(ids(f)).toContain('narrow_join');}
  configure(f,{frame_type:'FN01',stile_join:'Rabbet'});expect(ids(f)).toEqual([]);expect(normanNarrowSingleJoin(program,'FN01',undefined)).toBe('Rabbet');
  const nine=fixture(program,'L',[9]);expect(ids(nine)).toEqual([]);expect(validateNormanShutterAssortment(nine.s).some(i=>i.ruleId.endsWith('single_panel_join'))).toBe(false);configure(nine,{stile_join:'Rabbet'});expect(validateNormanShutterAssortment(nine.s).some(i=>i.ruleId.endsWith('stile_join'))).toBe(true);
 });
 it('round-trips explicit placement and widths while keeping historical records readable',()=>{
  const f=fixture('woodlore','L',[8]);f.record.regularHangStripPlacement='behind';const saved=JSON.parse(JSON.stringify(f.record));expect(parseNormanPanelRecord(saved)).toEqual(f.record);for(const bad of ['assumed',['behind'],null,1])expect(parseNormanPanelRecord({...saved,regularHangStripPlacement:bad})).toBeNull();
  expect(parseNormanPanelRecord({...saved,regularHangStripPlacement:undefined})).not.toBeNull();
  delete f.record.panels[0].widthInches;configure(f,{[NORMAN_SHUTTER_PANEL_RECORD]:f.record});expect(validateNormanShutterPanels(f.s).some(i=>i.ruleId==='norman.shutter.regular.panel_width')).toBe(true);expect(validateNormanShutterPanels({...f.s,catalogAsOf:'2026-09-19'})).toEqual([]);
  expect(validateNormanRegularWidths(f.s,{...f.record,application:'french_door'})).toEqual([]);
 });
 it('shows independent width and placement controls for the current exact regular frame',()=>{
  const f=fixture('woodlore','LLR',[24,24,36]);const design={id:'internal',supplier:'Norman',material:'Woodlore',panel_config:'LLR',options_json:{catalog_program_id:'woodlore',frame_type:'FH04',[NORMAN_SHUTTER_PANEL_RECORD]:f.record}} as unknown as SalesQuoteDesign;
  const html=renderToStaticMarkup(createElement(NormanShutterPanelOptions,{design,onUpdateFields:()=>{}}));for(const n of [1,2,3])expect(html).toContain(`Norman panel ${n} finished width`);expect(html).toContain('Norman regular hang strip placement');expect(html).toContain('Behind the panel');
 });
});
