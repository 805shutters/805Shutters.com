import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanShutterPanelOptions} from '@/components/crm/NormanShutterPanelOptions';
import {getStandardShutterGridOptions} from '@mts/components/crm/quote-builder/DesignCard';
import {NORMAN_SHUTTER_PROGRAMS} from '../quote/norman-shutter-assortment';
import {normanBypassPanelMaxWidth,normanBypassFrameReference,parseNormanBypassRecord,type NormanBypassRecord} from '../quote/norman-shutter-bypass';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanShutterAssortment} from './norman-shutter-assortment';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {selectionContextFromExactInterface} from './exact-interface-adapter';
import type {SelectionContext} from './core';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
const bypass=():NormanBypassRecord=>({version:1,layout:'two_single_side_open',frontPanel:'left',mount:'Inside Mount',leftSideFrame:true,rightSideFrame:true,windowWidthInches:60,windowHeightInches:60,interlockingBottomGuide:true});
const record=():NormanShutterPanelRecord=>({version:1,application:'bypass_closed',motor:'none',existingDoorGlassOrSidelight:false,bypass:bypass(),panels:[{widthInches:24,heightInches:60,divider:'none'},{widthInches:24,heightInches:60,divider:'none'}]});
const ctx=(programId='woodlore',r=record(),louver='3 1/2"'):SelectionContext=>({manufacturerId:'Norman',productId:'norman_shutters',programId,catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:60,heightInches:60,quantity:1,configuration:{mount_type:r.bypass?.mount??null,louver_size:louver,[NORMAN_SHUTTER_PANEL_RECORD]:r},options:{}});
const ids=(s:SelectionContext)=>validateNormanShutterPanels(s).map(i=>i.ruleId);
const byIds=(s:SelectionContext)=>ids(s).filter(id=>id.startsWith('norman.shutter.bypass.'));
describe('2020 Bypass source panel and mounting records',()=>{
 it('checks every program and louver against distinct source width endpoints',()=>{
  const limits:Record<string,(number|null)[]>={woodlore:[24,30,36,36,36],woodlore_plus:[24,36,36,36,36],woodlore_aquashield:[null,31,31,36,36],brightwood:[30,36,36,42,42],normandy_painted:[30,36,36,42,42],normandy_stained:[30,36,36,42,42]};
  const louvers=['1 7/8"','2 1/2"','3"','3 1/2"','4 1/2"'];
  for(const p of NORMAN_SHUTTER_PROGRAMS)louvers.forEach((l,i)=>{const max=limits[p.id][i];expect(normanBypassPanelMaxWidth(p.id,l)).toBe(max);if(max===null){expect(byIds(ctx(p.id,record(),l))).toContain('norman.shutter.bypass.louver');return;}
   for(const value of [6,max]){const r=record();r.panels.forEach(panel=>panel.widthInches=value);expect(byIds(ctx(p.id,r,l))).toEqual([]);expect(ids(ctx(p.id,r,l))).toContain('norman.shutter.panels.application_geometry');r.panels[1].widthInches=value===6?5.9375:max+0.0625;expect(byIds(ctx(p.id,r,l))).toContain('norman.shutter.bypass.panel_width');}
  });
 });
 it('uses side-frame presence for inside/semi dimensions and never guesses outside width',()=>{
  for(const mount of ['Inside Mount','Semi-Inside Mount','Outside Mount'] as const)for(const leftSideFrame of [true,false])for(const rightSideFrame of [true,false]){
   const r={...bypass(),mount,leftSideFrame,rightSideFrame};
   expect(normanBypassFrameReference(r)).toEqual({width:mount==='Outside Mount'?(leftSideFrame&&rightSideFrame?63:null):60-((leftSideFrame||rightSideFrame)?0.125:0),height:mount==='Outside Mount'?64.5:mount==='Semi-Inside Mount'?61.125:59.875});
  }
  expect(normanBypassFrameReference({...bypass(),windowWidthInches:null})).toBeNull();
 });
 it('requires exact two panel counts, recorded mounting and closed bottom guide while preserving unresolved layouts',()=>{
  const r=record();r.panels.pop();expect(byIds(ctx('woodlore',r))).toContain('norman.shutter.bypass.panel_count');r.bypass!.layout='other';expect(byIds(ctx('woodlore',r))).toContain('norman.shutter.bypass.layout_geometry');
  const s=ctx();expect(byIds({...s,configuration:{...s.configuration,mount_type:'Outside Mount'}})).toContain('norman.shutter.bypass.mount');
  const noGuide=record();noGuide.bypass!.interlockingBottomGuide=false;expect(byIds(ctx('woodlore',noGuide))).toContain('norman.shutter.bypass.bottom_guide');noGuide.application='bypass_open';expect(byIds(ctx('woodlore',noGuide))).toEqual([]);expect(ids(ctx('woodlore_aquashield',noGuide))).toContain('norman.shutter.panels.aquashield_open_bypass');noGuide.bypass!.frontPanel='';expect(byIds(ctx('woodlore',noGuide))).toContain('norman.shutter.bypass.front_panel');
 });
 it('does not apply stale regular-frame or stile constraints to a saved bypass schedule',()=>{
  const s=ctx();s.configuration={...s.configuration,color:'001',frame_type:'old regular frame',stile_width:'2 inch',stile_join:'Butt',panel_config:'LL',widest_panel_width_inches:99};
  const before=JSON.stringify(s.configuration);expect(validateNormanShutterAssortment(s)).toEqual([]);expect(JSON.stringify(s.configuration)).toBe(before);expect(ids(s)).toContain('norman.shutter.panels.application_geometry');
  expect(validateNormanShutterAssortment({...s,catalogAsOf:'2026-09-19'}).map(x=>x.ruleId)).toContain('norman.shutter.assortment.frame');
 });
 it('preserves old history and rejects malformed newly supplied records',()=>{
  const r=record();delete r.bypass;expect(parseNormanPanelRecord(r)).toEqual(r);expect(ids({...ctx('woodlore',r),catalogAsOf:'2026-09-19'})).toEqual([]);expect(byIds(ctx('woodlore',r))).toContain('norman.shutter.bypass.record_required');
  expect(parseNormanBypassRecord({...bypass(),leftSideFrame:'true'})).toBeNull();expect(parseNormanBypassRecord({...bypass(),windowWidthInches:Infinity})).toBeNull();expect(parseNormanPanelRecord({...record(),bypass:{...bypass(),version:2}})).toBeNull();
 });
 it('saves record identity through server adapter and exposes bypass-specific measurement controls',()=>{
  const r=record(),design=JSON.parse(JSON.stringify({id:'audit-design',supplier:'Norman',material:'Woodlore',mount_type:'Inside Mount',louver_size:'3 1/2"',options_json:{catalog_program_id:'woodlore',[NORMAN_SHUTTER_PANEL_RECORD]:r}})) as SalesQuoteDesign;
  const line={id:'audit-line',quote_id:'audit',room_name:'Audit',product_type:'Shutters',width_whole:60,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
  const s=selectionContextFromExactInterface(line,design,{productId:'norman_shutters',programId:'woodlore',catalogAsOf:'2026-09-20'});expect(s.configuration[NORMAN_SHUTTER_PANEL_RECORD]).toEqual(r);expect(byIds(s)).toEqual([]);
  for(const mount of ['Inside Mount','Semi-Inside Mount','Outside Mount'] as const){const chosen=record();chosen.bypass!.mount=mount;const state=selectionContextFromExactInterface(line,{...design,mount_type:mount,options_json:{...design.options_json,[NORMAN_SHUTTER_PANEL_RECORD]:chosen}},{productId:'norman_shutters',programId:'woodlore',catalogAsOf:'2026-09-20'});expect(byIds(state)).toEqual([]);}
  const html=renderToStaticMarkup(createElement(NormanShutterPanelOptions,{design,onUpdateFields:()=>{}}));expect(html).toContain('Norman panel 2 finished width');expect(html).toContain('Norman bypass Right side frame');expect(html).toContain('59.875');
  const fields=getStandardShutterGridOptions(design,true),mount=fields.find(f=>f.field==='mount_type');expect(mount&&'options' in mount?mount.options:[]).toEqual(['Inside Mount','Semi-Inside Mount','Outside Mount']);expect(fields.some(f=>f.field==='json:frame_type'||f.field==='json:widest_panel_width_inches'||f.field==='panel_config')).toBe(false);
 });
});
