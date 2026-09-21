// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NormanShutterPanelOptions} from './NormanShutterPanelOptions';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord} from '@/lib/quote/norman-shutter-panels';
import {emptyNormanBifold90} from '@/lib/quote/norman-shutter-bifold90';
import {emptyNormanBypassRecord} from '@/lib/quote/norman-shutter-bypass';
import {emptyNormanSpecialtyRecord} from '@/lib/quote/norman-shutter-specialty';
import {emptyNormanShutterDividerRecord} from '@/lib/quote/norman-shutter-dividers';
import type {SalesQuoteDesign} from '@mts/types/quote';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(()=>root.unmount());host.remove();});
const record=(application:string)=>({version:1,application,motor:'none',existingDoorGlassOrSidelight:true,
 panels:[{widthInches:18,heightInches:60,divider:'present',wholePanelLouverCount:14,dividerDetails:{...emptyNormanShutterDividerRecord(),referenceHeightInches:60,rails:[{heightInches:3,location:'specified',centerInches:30,exactLocation:false}]}}],
 bifold180:{version:1,layout:'LLRR',flatMountingSurface:true},bifold90:{...emptyNormanBifold90(),kind:'standard_90',layout:'LLRR',mount:'Outside Mount'},
 bypass:{...emptyNormanBypassRecord(),layout:'two_single_side_open',mount:'Outside Mount',windowWidthInches:72,windowHeightInches:60},
 doubleHung:{version:1,rowLayout:'LR',divisionMode:'custom',customDivisionPointInches:30,customReference:'opening',horizontalTPost:false,tPostSectionLengthsInches:[]},
 frenchDoor:{version:1,panelDirection:'L',cutoutType:'A',topShape:'rectangular',lFrameCode:'',measurementFormReference:'preserve drawing'},
 specialty:{...emptyNormanSpecialtyRecord(),shapeCode:'YS05',frameType:'L Frame',frameSides:'4'}});
const design=(r:unknown)=>({id:'test',panel_config:'LR',louver_size:'3 1/2"',options_json:{catalog_program_id:'normandy_painted',widest_panel_width_inches:18,[NORMAN_SHUTTER_PANEL_RECORD]:r}} as unknown as SalesQuoteDesign);
describe('Shutter quote shows priced choices without fabrication capture',()=>{
 it.each(['regular','double_hung','bifold_180','bifold_other','bypass_open','french_door','specialty'])('%s hides measurements and preserves existing fabrication record on motor edit',async application=>{
  const r=record(application),parsed=parseNormanPanelRecord(r),update=vi.fn();
  await act(()=>root.render(React.createElement(NormanShutterPanelOptions,{design:design(r),pricingOnly:true,onUpdateFields:update})));
  expect(host.querySelectorAll('input[type="number"]')).toHaveLength(0);
  expect(host.querySelector('[aria-label="Norman panel 1 finished width"]')).toBeNull();
  expect(host.querySelector('[aria-label="Norman Bi-fold 90 header"]')).toBeNull();
  expect(host.querySelector('[aria-label="Norman French-door measurement form reference"]')).toBeNull();
  expect(host.querySelector('[aria-label="Norman specialty frame construction"]')).toBeNull();
  expect(host.querySelector('[aria-label="Norman panel 1 divider 1 size"]')).not.toBeNull();
  await act(()=>{const select=host.querySelector<HTMLSelectElement>('[aria-label="Norman shutter motor generation"]')!;select.value='perfect_tilt_g4';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(()=>{[...host.querySelectorAll('button')].find(x=>x.textContent==='Save panel construction')!.click();});
  expect(update.mock.calls[0][0].options_json[NORMAN_SHUTTER_PANEL_RECORD]).toEqual({...parsed,motor:'perfect_tilt_g4'});
  expect(update.mock.calls[0][0].options_json.widest_panel_width_inches).toBe(18);
 });
 it('keeps fabrication inputs in ordering mode',async()=>{
  await act(()=>root.render(React.createElement(NormanShutterPanelOptions,{design:design(record('regular')),onUpdateFields:vi.fn()})));
  expect(host.querySelector('[aria-label="Norman panel 1 finished width"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Norman panel 1 divider reference height"]')).not.toBeNull();
 });
});
