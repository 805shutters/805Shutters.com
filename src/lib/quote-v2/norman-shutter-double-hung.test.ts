import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanShutterPanelOptions} from '@/components/crm/NormanShutterPanelOptions';
import {normanDoubleHungLayouts,parseNormanDoubleHungRecord} from '../quote/norman-shutter-double-hung';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanShutterBottomSupport} from './norman-shutter-bottom-support';
import {validateNormanDoubleHung} from './norman-shutter-double-hung';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {selectionContextFromExactInterface} from './exact-interface-adapter';
import type {SalesQuoteLineItem,SalesQuoteDesign} from '@mts/types/quote';
function fixture(programId='woodlore',layout='LR',width=24){
 const record:NormanShutterPanelRecord={version:1,application:'double_hung',motor:'none',existingDoorGlassOrSidelight:false,panels:Array.from({length:layout.length*2},()=>({heightInches:30,widthInches:width,divider:'none',wholePanelLouverCount:6})),doubleHung:{version:1,rowLayout:layout,divisionMode:'center',customDivisionPointInches:null,customReference:'',horizontalTPost:true,tPostSectionLengthsInches:[48]}};
 const line={id:'internal',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:60,width_fraction:'0',height_whole:80,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
 const design={id:'internal',supplier:'Norman',material:'Woodlore',panel_config:layout,louver_size:'3 1/2"',options_json:{catalog_program_id:programId,widest_panel_width_inches:width,[NORMAN_SHUTTER_PANEL_RECORD]:record}} as unknown as SalesQuoteDesign;
 const s=selectionContextFromExactInterface(line,design,{productId:'norman_shutters',programId,catalogAsOf:'2026-09-20'});
 return {record,s,design};
}
const ids=(f:ReturnType<typeof fixture>)=>validateNormanDoubleHung(f.s,f.record).map(i=>i.ruleId.split('.').at(-1));
describe('Double Hung actual two-row construction',()=>{
 it.each(['woodlore','woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'])('accounts for both rows in %s',program=>{
  for(const layout of normanDoubleHungLayouts(program)){const f=fixture(program,layout);expect(ids(f)).toEqual([]);f.record.panels.pop();expect(ids(f)).toContain('panel_count');}
  const triple=fixture(program,'LLL');expect(ids(triple)).toContain('row_layout');
 });
 it('enforces program-specific bifold eligibility without transferring the Woodlore ban',()=>{
  for(const p of ['woodlore','woodlore_plus','woodlore_aquashield'])for(const layout of ['LL','RR','LLR','LRR','LLRR'])expect(ids(fixture(p,layout))).toContain('row_layout');
  for(const p of ['brightwood','normandy_painted','normandy_stained'])for(const layout of ['LL','RR','LLR','LRR','LLRR'])expect(ids(fixture(p,layout))).not.toContain('row_layout');
 });
 it('checks upper and lower panel widths independently',()=>{
  const f=fixture('brightwood','LRR',26);f.record.panels[0].widthInches=42;f.record.panels[3].widthInches=42;f.s={...f.s,configuration:{...f.s.configuration,widest_panel_width_inches:42}};expect(ids(f)).toEqual([]);
  f.record.panels[4].widthInches=26.0625;expect(ids(f)).toContain('panel_width');f.record.panels[4].widthInches=26;f.record.panels[0].widthInches=42.0625;expect(ids(f)).toContain('panel_width');
  f.record.panels[0].widthInches=42;delete f.record.panels[5].widthInches;expect(ids(f)).toContain('panel_width');
 });
 it('requires explicit horizontal T-post choice and every section within48 inches',()=>{
  const f=fixture();for(const lengths of [[],[null],[0],[-1],[48,48.0625]]){f.record.doubleHung!.tPostSectionLengthsInches=lengths;expect(ids(f)).toContain('tpost_length');}
  f.record.doubleHung!.tPostSectionLengthsInches=[48,47.9375];expect(ids(f)).toEqual([]);f.record.doubleHung!.horizontalTPost=null;expect(ids(f)).toContain('tpost_choice');f.record.doubleHung!.horizontalTPost=false;expect(ids(f)).toContain('tpost_inactive');f.record.doubleHung!.tPostSectionLengthsInches=[];expect(ids(f)).toEqual([]);
 });
 it('requires a Woodlore horizontal post only beyond the documented30-inch boundary',()=>{
  const f=fixture('woodlore','L',30);f.record.doubleHung!.horizontalTPost=false;f.record.doubleHung!.tPostSectionLengthsInches=[];expect(ids(f)).toEqual([]);f.record.panels[1].widthInches=30.0625;expect(ids(f)).toContain('wide_woodlore_tpost');
  for(const program of ['woodlore_plus','brightwood','normandy_painted','normandy_stained']){const other=fixture(program,'L',36);other.record.doubleHung!.horizontalTPost=false;other.record.doubleHung!.tPostSectionLengthsInches=[];expect(ids(other)).not.toContain('wide_woodlore_tpost');}
 });
 it('retains explicit custom division reference without fabricating final geometry',()=>{
  const f=fixture();f.record.doubleHung!.divisionMode='custom';expect(ids(f)).toContain('custom_division');f.record.doubleHung!.customDivisionPointInches=31.5;f.record.doubleHung!.customReference='Measured from bottom of supplied frame, drawing DH-1';expect(ids(f)).not.toContain('custom_division');
  f.s={...f.s,configuration:{...f.s.configuration,[NORMAN_SHUTTER_PANEL_RECORD]:f.record}};expect(validateNormanShutterPanels(f.s).some(i=>i.ruleId==='norman.shutter.panels.application_geometry')).toBe(true);
 });
 it('records over78-inch extra-hinge manufacturing treatment as a warning, not an ordering ban',()=>{
  const f=fixture();f.record.panels[0].heightInches=78;expect(ids(f)).not.toContain('extra_hinge');f.record.panels[0].heightInches=78.0625;expect(validateNormanDoubleHung(f.s,f.record).find(i=>i.ruleId.endsWith('extra_hinge'))).toMatchObject({severity:'warning'});
 });
 it('persists both row identities and T-post sections with strict parsing and historical behavior',()=>{
  const f=fixture();expect(f.s.configuration[NORMAN_SHUTTER_PANEL_RECORD]).toEqual(f.record);expect(parseNormanPanelRecord(JSON.parse(JSON.stringify(f.record)))).toEqual(f.record);const r=f.record.doubleHung!;
  for(const bad of [{...r,version:2},{...r,horizontalTPost:'yes'},{...r,tPostSectionLengthsInches:['48']},{...r,customDivisionPointInches:Infinity}])expect(parseNormanDoubleHungRecord(bad)).toBeNull();
  delete f.record.doubleHung;expect(parseNormanPanelRecord(f.record)).not.toBeNull();expect(ids(f)).toContain('record_required');expect(validateNormanShutterPanels({...f.s,catalogAsOf:'2026-09-19'})).toEqual([]);
 });
 it('requires actual lower-row sill support while leaving upper division geometry held',()=>{
  const f=fixture();expect(validateNormanShutterBottomSupport(f.s,f.record).map(i=>i.selectedValues.panelNumber)).toEqual([3,4]);
  for(const panel of f.record.panels.slice(2))panel.bottomSupport={version:1,support:'existing_sill',gapInches:0.0625,frequentlyOpen:false};
  expect(validateNormanShutterBottomSupport(f.s,f.record)).toEqual([]);f.record.panels[3].bottomSupport!.gapInches=0.1001;expect(validateNormanShutterBottomSupport(f.s,f.record).map(i=>i.ruleId)).toContain('norman.shutter.support.gap');
  expect(validateNormanShutterPanels(f.s).some(i=>i.ruleId==='norman.shutter.panels.application_geometry')).toBe(true);
 });
 it('renders actual upper/lower measurements and does not offer a single-row reset',()=>{
  const f=fixture();const html=renderToStaticMarkup(createElement(NormanShutterPanelOptions,{design:f.design,onUpdateFields:()=>{}}));for(const i of [1,2,3,4])expect(html).toContain(`Norman panel ${i} finished width`);expect(html).toContain('Upper');expect(html).toContain('Lower');expect(html).not.toContain('Reset panel measurements for this 2-panel layout');expect(html).toContain('Norman Double Hung T-post section 1 length');
 });
});
