import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanShutterBottomSupportOptions} from '@/components/crm/NormanShutterBottomSupportOptions';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {parseNormanShutterBottomSupport} from '../quote/norman-shutter-bottom-support';
import {NORMAN_SHUTTER_PROGRAMS} from '../quote/norman-shutter-assortment';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {selectionContextFromExactInterface} from './exact-interface-adapter';
import type {SelectionContext} from './core';
import type {SalesQuoteLineItem} from '@mts/types/quote';
const support=()=>({version:1 as const,support:'existing_sill' as const,gapInches:0.1,frequentlyOpen:false});
const record=():NormanShutterPanelRecord=>({version:1,application:'regular',motor:'none',existingDoorGlassOrSidelight:false,panels:[{heightInches:60,divider:'none',bottomSupport:support()}]});
const context=(r=record(),programId='woodlore'):SelectionContext=>({manufacturerId:'Norman',productId:'norman_shutters',programId,catalogVersion:'current',catalogAsOf:'2026-09-20',widthInches:30,heightInches:60,quantity:1,options:{},configuration:{panel_config:'L',[NORMAN_SHUTTER_PANEL_RECORD]:r}});
const issues=(s:SelectionContext)=>validateNormanShutterPanels(s).filter(i=>i.ruleId.startsWith('norman.shutter.support.'));
describe('actual Norman shutter panel bottom support',()=>{
 it('checks every program at the exact 0.1-inch maximum without manufacturing a sixteenth-inch cutoff',()=>{
  for(const program of NORMAN_SHUTTER_PROGRAMS){
   for(const gap of [0,0.0625,0.1]){const r=record();r.panels[0].bottomSupport!.gapInches=gap;expect(issues(context(r,program.id))).toEqual([]);}
   for(const gap of [-0.001,0.101,0.125]){const r=record();r.panels[0].bottomSupport!.gapInches=gap;expect(issues(context(r,program.id)).map(i=>i.ruleId)).toContain('norman.shutter.support.gap');}
  }
 });
 it('requires independent facts for each panel and rejects missing support or explicit frequent-open use',()=>{
  const r=record();r.panels.push({heightInches:60,divider:'none'});
  expect(issues(context(r))[0].explanation).toContain('Panel 2');
  r.panels[1].bottomSupport={...support(),support:'none'};expect(issues(context(r))[0].ruleId).toBe('norman.shutter.support.missing_support');
  r.panels[1].bottomSupport={...support(),frequentlyOpen:true};expect(issues(context(r))[0]).toMatchObject({ruleId:'norman.shutter.support.frequent_open',severity:'warning'});
  r.panels[1].bottomSupport={...support(),support:'bottom_frame'};expect(issues(context(r))).toEqual([]);
  r.panels[1].bottomSupport.frequentlyOpen=null;expect(issues(context(r))[0].ruleId).toBe('norman.shutter.support.record_required');
 });
 it('does not substitute a sill rule for specialized track support and preserves earlier-date records',()=>{
  const r=record();delete r.panels[0].bottomSupport;
  expect(parseNormanPanelRecord(r)).toEqual(r);
  expect(issues({...context(r),catalogAsOf:'2026-09-19'})).toEqual([]);
  for(const application of ['bifold_180','bifold_other','bypass_closed','bypass_open','specialty'] as const)expect(issues(context({...r,application}))).toEqual([]);
  for(const application of ['regular','french_door','double_hung'] as const)expect(issues(context({...r,application}))).toHaveLength(1);
 });
 it('round trips exact site facts through the server adapter and renders unambiguous controls',()=>{
  const r=record();const line={id:'internal',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:30,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
  const design=JSON.parse(JSON.stringify({supplier:'Norman',material:'Woodlore',panel_config:'L',options_json:{[NORMAN_SHUTTER_PANEL_RECORD]:r}}));
  const saved=selectionContextFromExactInterface(line,design,{productId:'norman_shutters',programId:'woodlore',catalogAsOf:'2026-09-20'});
  expect(saved.configuration[NORMAN_SHUTTER_PANEL_RECORD]).toEqual(r);expect(issues(saved)).toEqual([]);
  const html=renderToStaticMarkup(createElement(NormanShutterBottomSupportOptions,{value:support(),panelNumber:2,onChange:()=>{}}));
  expect(html).toContain('Norman panel 2 bottom gap');expect(html).toContain('value="0.1"');expect(html).toContain('Frequently left open');
 });
 it('rejects forged typed values before validation',()=>{
  for(const patch of [{support:'floor'},{gapInches:'0.1'},{gapInches:NaN},{frequentlyOpen:'no'},{version:2}])expect(parseNormanShutterBottomSupport({...support(),...patch})).toBeNull();
 });
});
