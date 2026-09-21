import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NormanShutterPanelOptions} from '@/components/crm/NormanShutterPanelOptions';
import {NORMAN_FIXED_SINGLE_LOUVER_TILT,normanSingleLouverFixedEligible} from '../quote/norman-shutter-single-louver';
import {NORMAN_SHUTTER_PANEL_RECORD,parseNormanPanelRecord,type NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import {validateNormanSingleLouver} from './norman-shutter-single-louver';
import {validateNormanShutterPanels} from './norman-shutter-panels';
import {validateNormanShutterAssortment} from './norman-shutter-assortment';
import {selectionContextFromExactInterface} from './exact-interface-adapter';
import type {SalesQuoteLineItem,SalesQuoteDesign} from '@mts/types/quote';
function fixture(count:number|null=1,programId='woodlore'){
 const panel:NormanShutterPanelRecord={version:1,application:'regular',motor:'none',existingDoorGlassOrSidelight:false,panels:[{heightInches:10,divider:'none',wholePanelLouverCount:count,singleLouverNoMouseHole:true}]};
 const line={id:'internal',quote_id:'internal',room_name:'Audit',product_type:'Shutters',width_whole:24,width_fraction:'0',height_whole:10,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
 const s=selectionContextFromExactInterface(line,{supplier:'Norman',material:'Woodlore',tilt_type:NORMAN_FIXED_SINGLE_LOUVER_TILT,options_json:{[NORMAN_SHUTTER_PANEL_RECORD]:panel}},{productId:'norman_shutters',programId,catalogAsOf:'2026-09-20'});
 return {s,panel};
}
const ids=(f:ReturnType<typeof fixture>)=>validateNormanSingleLouver(f.s,f.panel).map(i=>i.ruleId.split('.').at(-1));
describe('Norman whole one-louver panel restrictions',()=>{
 it.each(['woodlore','woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'])('retains the fixed no-tilt route for %s without granting pricing',program=>{
  const f=fixture(1,program);expect(ids(f)).toEqual([]);expect(normanSingleLouverFixedEligible(f.panel,'No')).toBe(true);expect(validateNormanShutterAssortment(f.s).some(i=>i.ruleId==='norman.shutter.assortment.tilt')).toBe(false);expect(f.s.configuration[NORMAN_SHUTTER_PANEL_RECORD]).toEqual(f.panel);
 });
 it('requires an actual positive whole count and preserves old readable records',()=>{
  for(const count of [null,0,-1,1.5])expect(ids(fixture(count))).toContain('count');
  const f=fixture(2);f.s={...f.s,configuration:{...f.s.configuration,tilt_type:'Standard Tilt'}};expect(ids(f)).toEqual([]);
  delete f.panel.panels[0].wholePanelLouverCount;expect(parseNormanPanelRecord(f.panel)).toEqual(f.panel);expect(parseNormanPanelRecord({...f.panel,panels:[{...f.panel.panels[0],wholePanelLouverCount:'1'}]})).toBeNull();
 });
 it('rejects each prohibited feature and retains mixed panel ambiguity',()=>{
  const f=fixture();f.panel.motor='perfect_tilt_g4';expect(ids(f)).toContain('motor');f.panel.motor='none';f.panel.application='double_hung';expect(ids(f)).toContain('double_hung');f.panel.application='regular';f.panel.panels[0].divider='present';expect(ids(f)).toContain('division');f.panel.panels[0].divider='none';f.panel.panels[0].singleLouverNoMouseHole=false;expect(ids(f)).toContain('mouse_hole');f.panel.panels[0].singleLouverNoMouseHole=true;f.s={...f.s,configuration:{...f.s.configuration,split_tilt:'Yes'}};expect(ids(f)).toContain('division');f.s={...f.s,configuration:{...f.s.configuration,split_tilt:'No',tilt_type:'Standard Tilt'}};expect(ids(f)).toContain('tilt');
  f.panel.panels.push({heightInches:60,divider:'none',wholePanelLouverCount:12});expect(normanSingleLouverFixedEligible(f.panel,'No')).toBe(false);f.s={...f.s,configuration:{...f.s.configuration,tilt_type:NORMAN_FIXED_SINGLE_LOUVER_TILT}};expect(ids(f)).toContain('fixed_scope');
 });
 it('enforces whole counts through the current server while leaving historical snapshots unchanged',()=>{
  const f=fixture(null);expect(validateNormanShutterPanels(f.s).some(i=>i.ruleId==='norman.shutter.single_louver.count')).toBe(true);expect(validateNormanShutterPanels({...f.s,catalogAsOf:'2026-09-19'})).toEqual([]);
  const invalid=fixture();invalid.s={...invalid.s,configuration:{...invalid.s.configuration,tilt_type:'Invisible Tilt'}};expect(validateNormanShutterPanels(invalid.s).some(i=>i.ruleId==='norman.shutter.single_louver.tilt')).toBe(true);
 });
 it('offers actual counts and no-mouse-hole confirmation independently from divider controls',()=>{
  const f=fixture();const design={id:'internal',supplier:'Norman',material:'Woodlore',panel_config:'L',options_json:{catalog_program_id:'woodlore',[NORMAN_SHUTTER_PANEL_RECORD]:f.panel}} as unknown as SalesQuoteDesign;
  const html=renderToStaticMarkup(createElement(NormanShutterPanelOptions,{design,onUpdateFields:()=>{}}));expect(html).toContain('Norman panel 1 whole louver count');expect(html).toContain('Norman panel 1 single louver no mouse hole');expect(html).not.toContain('Add divider');
 });
});
