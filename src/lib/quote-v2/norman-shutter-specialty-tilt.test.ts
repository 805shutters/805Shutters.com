import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanShutterSpecialtyOptions} from '@/components/crm/NormanShutterSpecialtyOptions';
import {emptyNormanSpecialtyRecord,parseNormanSpecialtyRecord} from '../quote/norman-shutter-specialty';
import {parseNormanSpecialtyCurvedTilt,normanSpecialtyNeedsCurvedTilt} from '../quote/norman-shutter-specialty-tilt';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {selectionContextFromExactInterface} from './exact-interface-adapter';
import type {SalesQuoteLineItem} from '@mts/types/quote';
function fixture(programId='woodlore_plus'){
 const specialty={...emptyNormanSpecialtyRecord(),shapeCode:'YS05'};
 const panel:NormanShutterPanelRecord={version:1,application:'specialty',motor:'none',existingDoorGlassOrSidelight:false,specialty,panels:[{widthInches:24,heightInches:60,divider:'none'}]};
 const line={id:'internal',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:24,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
 const s=selectionContextFromExactInterface(line,{supplier:'Norman',material:'Woodlore Plus',tilt_type:'Invisible Tilt',options_json:{[NORMAN_SHUTTER_PANEL_RECORD]:panel}},{productId:'norman_shutters',programId,catalogAsOf:'2026-09-20'});
 return {s,panel};
}
const ids=(s:ReturnType<typeof fixture>['s'])=>validateNormanShutterPanels(s).map(i=>i.ruleId);
describe('YS05 curved-section control with Invisible Tilt',()=>{
 it.each(['woodlore_plus','brightwood','normandy_painted','normandy_stained'])('requires independent rear rod and fixed top for %s through saved adapter',program=>{
  let {s,panel}=fixture(program);expect(s.configuration.tilt_type).toBe('Invisible Tilt');
  expect(ids(s)).toContain('norman.shutter.specialty.curved_tilt');expect(ids(s)).toContain('norman.shutter.specialty.curved_top_louver');
  panel.specialty!.curvedTilt={version:1,control:'invisible',topLouverFixed:false};s={...s,configuration:{...s.configuration,[NORMAN_SHUTTER_PANEL_RECORD]:JSON.parse(JSON.stringify(panel))}};expect(ids(s)).toContain('norman.shutter.specialty.curved_tilt');
  panel.specialty!.curvedTilt={version:1,control:'rear_standard',topLouverFixed:true};s={...s,configuration:{...s.configuration,[NORMAN_SHUTTER_PANEL_RECORD]:JSON.parse(JSON.stringify(panel))}};expect(ids(s)).not.toContain('norman.shutter.specialty.curved_tilt');expect(ids(s)).not.toContain('norman.shutter.specialty.curved_top_louver');expect(ids(s)).toContain('norman.shutter.specialty.geometry');
  expect(parseNormanPanelRecord(JSON.parse(JSON.stringify(panel)))).toEqual(panel);
 });
 it('keeps source exclusions and historical records distinct',()=>{
  for(const program of ['woodlore','woodlore_aquashield'])expect(normanSpecialtyNeedsCurvedTilt(program,'YS05','Invisible Tilt')).toBe(false);
  for(const tilt of ['Standard Tilt','Offset Tilt'])expect(normanSpecialtyNeedsCurvedTilt('woodlore_plus','YS05',tilt)).toBe(false);
  expect(normanSpecialtyNeedsCurvedTilt('woodlore_plus','YS65','Invisible Tilt')).toBe(false);
  const {s}=fixture();expect(ids({...s,catalogAsOf:'2026-09-19'}).some(id=>id.includes('curved_tilt'))).toBe(false);
  const old=emptyNormanSpecialtyRecord();expect(parseNormanSpecialtyRecord(old)).toEqual(old);expect(parseNormanSpecialtyCurvedTilt({version:1,control:'rear_standard',topLouverFixed:'true'})).toBeNull();expect(parseNormanSpecialtyCurvedTilt({version:2,control:'rear_standard',topLouverFixed:true})).toBeNull();
 });
 it('exposes only the documented independent control for its actual conditional branch',()=>{
  const {panel}=fixture();const props={value:panel.specialty,programId:'woodlore_plus',tiltType:'Invisible Tilt',panelCount:1,onChange:()=>{},onPanelCount:()=>{}};
  const html=renderToStaticMarkup(createElement(NormanShutterSpecialtyOptions,props));expect(html).toContain('Separate rear Standard Tilt rod');expect(html).toContain('Norman specialty fixed top louver');expect(html).not.toContain('value="invisible"');
  expect(renderToStaticMarkup(createElement(NormanShutterSpecialtyOptions,{...props,tiltType:'Standard Tilt'}))).not.toContain('Norman specialty fixed top louver');
 });
});
