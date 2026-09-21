import {describe,it,expect} from 'vitest';
import type {SelectionContext,SelectionRecord} from '@/lib/quote-v2/core';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SundanceRollerFamilyConfiguration} from '@/components/crm/SundanceRollerFamilyConfiguration';
import {sundanceShadeColors,sundanceShadeFabricSource} from './shade-fabrics';
import {sundanceCatalog} from './catalog';
import data from './shade-option-schedules.source.json';
import {sundanceRollerFamilyIds,sundanceShadeControls,sundanceShadeTopPrice as price,validateSundanceShadeConfiguration as validate,sundanceShadeOptionEvidence as evidence,sundanceShadeAccessoryKey as key,sundanceShadeConfigurationPatch} from './shade-configuration';
function selection(p='sundance_roller',w=36,h=60,extra:SelectionRecord={},match?:string):Pick<SelectionContext,'productId'|'programId'|'widthInches'|'heightInches'|'configuration'>{
 const color=sundanceShadeColors.find(r=>r.productId===p&&(!match||r.colorName.includes(match)));
 const coll=color?sundanceShadeFabricSource.collections.find(r=>r.id===color.automaticDetails.catalog_sundance_shade_collection_id)!:sundanceShadeFabricSource.collections.find(r=>r.productId===p)!;
 return{productId:p,programId:coll.programId,widthInches:w,heightInches:h,configuration:{fabric_color_id:color?.id??null,fabric_color_name:color?.colorName??null,catalog_sundance_shade_collection_id:coll.id,sundance_shade_control:'Cordless',mount_type:'Inside',sundance_shade_assembly:'Single',sundance_shade_roll:'Standard',sundance_shade_top:'Open roll',sundance_shade_bottomrail:'Standard Hem Pocket',sundance_shade_railroad:'No',...extra}};
}
const ids=(s:ReturnType<typeof selection>)=>validate(s).map(i=>i.ruleId);
describe('all six roller fabric-family source paths',()=>{
 it('accounts for every published treatment table without filling unavailable cells',()=>{
  expect(sundanceRollerFamilyIds).toHaveLength(6);
  expect(sundanceCatalog.products.filter(p=>sundanceRollerFamilyIds.includes(p.id)).flatMap(p=>p.programs)).toHaveLength(44);
  expect(data.rows).toHaveLength(139);
  expect(data.rows.flatMap(r=>r.retail).filter(v=>v!==null)).toHaveLength(2339);
  expect(data.rows.flatMap(r=>r.retail).filter(v=>v===null)).toHaveLength(112);
  for(const row of data.rows){expect(row.widths).toHaveLength(row.retail.length);for(const program of row.programIds)expect(sundanceCatalog.products.find(p=>p.id===row.productId)?.programs.some(p=>p.id===program)).toBe(true);}
 });
 it('matches independent first/last source cells and shared Louvolite schedules',()=>{
  expect(price('sundance_roller','sundance_roller_p6_t1','Small Round Cassette',24)?.retail).toBe(169);
  expect(price('sundance_roller','sundance_roller_p6_t1','Small Round Cassette',118)?.retail).toBe(590);
  expect(price('sundance_roller','sundance_roller_p6_t1','Contractor’s Box 5"',118)?.retail).toBe(2566);
  expect(price('sundance_roller','sundance_roller_p6_t1','3" Square Cassette',96)?.retail).toBe(446);
  expect(price('sundance_roller','sundance_roller_p6_t1','3" Square Cassette',96.0625)).toBeNull();
  expect(price('sundance_europanels','sundance_europanels_p10_t1','Rounded Corner Valance',180)?.retail).toBe(285);
  expect(price('sundance_louvolite_europanels','sundance_louvolite_europanels_p5_t2','Rounded Corner Valance',36)?.retail).toBe(93);
  expect(price('sundance_louvolite_europanels','sundance_louvolite_europanels_p7_t1','Rounded Corner Valance',180)?.retail).toBe(245);
 });
 it('enforces roller cordless boundaries without inventing manual-control minimums',()=>{
  expect(ids(selection('sundance_roller',12,13))).not.toContain('sundance.shade.control_size');
  expect(ids(selection('sundance_roller',11.9375,13))).toContain('sundance.shade.control_size');
  expect(ids(selection('sundance_roller',96,96))).not.toContain('sundance.shade.control_size');
  expect(ids(selection('sundance_roller',96.0625,96))).toContain('sundance.shade.control_size');
  expect(sundanceShadeControls('sundance_roller').find(c=>c.name==='Somfy Sonesse Ultra 30 Li-ion')?.minWidth).toBe(28);
  expect(sundanceShadeControls('sundance_flat_roman').find(c=>c.name==='Somfy Sonesse Ultra 30 Li-ion')?.minWidth).toBe(22);
 });
 it('keeps flat Roman orderability held and enforces blackout cordless limit',()=>{
  const s=selection('sundance_flat_roman',84.0625,84);
  const collection=sundanceShadeFabricSource.collections.find(r=>r.productId===s.productId&&r.privacyType==='Blackout')!;
  s.configuration={...s.configuration,catalog_sundance_shade_collection_id:collection.id};s.programId=collection.programId;
  expect(ids(s)).toEqual(expect.arrayContaining(['sundance.shade.roman_availability','sundance.shade.cordless_blackout']));
  expect(ids({...s,widthInches:84})).not.toContain('sundance.shade.cordless_blackout');
  expect(ids(selection('sundance_flat_roman',36,60,{sundance_shade_liner:'Blackout'}))).toContain('sundance.shade.roman_liner');
 });
 it('rejects Europanel inside mounting and retains the printed162/168 valance conflict',()=>{
  const c={sundance_shade_control:'Wand',sundance_shade_top:'Rounded Corner Valance',sundance_shade_wand:'Left',sundance_shade_stack:'Right',sundance_shade_panel_count:3,sundance_shade_channels:4};
  expect(ids(selection('sundance_europanels',36,60,c))).toContain('sundance.shade.mount');
  expect(ids(selection('sundance_europanels',36,60,{...c,mount_type:'Outside'}))).not.toContain('sundance.shade.mount');
  expect(ids(selection('sundance_louvolite_europanels',160,60,{...c,mount_type:'Outside'}))).toContain('sundance.shade.valance_axis');
 });
 it('enforces reverse-roll, N/A top cells, railroading and hembar compatibility',()=>{
  expect(ids(selection('sundance_roller',36,60,{sundance_shade_roll:'Reverse',sundance_shade_top:'Small Round Cassette',sundance_shade_finish:'White'}))).toContain('sundance.shade.reverse');
  expect(ids(selection('sundance_roller',97,60,{sundance_shade_top:'3" Square Cassette',sundance_shade_finish:'White'}))).toContain('sundance.shade.top_cell');
  expect(ids(selection('sundance_roller',36,60,{sundance_shade_privacy:'Aluminum side channels',sundance_shade_bottomrail:'Exposed'}))).toContain('sundance.shade.side_channel_hem');
  const collection=sundanceShadeFabricSource.collections.find(c=>c.productId==='sundance_roller'&&c.railroaded===false)!;
  const s=selection();s.configuration={...s.configuration,catalog_sundance_shade_collection_id:collection.id,sundance_shade_railroad:'Yes'};
  expect(ids(s)).toContain('sundance.shade.railroad_unavailable');
 });
 it('keeps retail tops separate from net motor/power charges and shared-box capacity hold',()=>{
  const c={sundance_shade_control:'Simphony 24V DC',sundance_shade_top:'Small Round Cassette',[key('simphony24')]:1,[key('simphony_remote')]:1};
  const e=evidence('sundance_roller','sundance_roller_p6_t1',c,36);
  expect(e.netSubtotal).toBe(315);expect(e.retailSubtotal).toBe(187);expect(e.customerPriceEligible).toBe(false);
  expect(ids(selection('sundance_roller',36,60,{...c,[key('simphony_distribution')]:1}))).toContain('sundance.shade.accessory_0');
  expect(ids(selection('sundance_roller',36,60,{sundance_shade_control:'Somfy Sonesse 30 RTS 24V DC',[key('somfy_charger')]:1}))).toContain('sundance.shade.accessory_0');
  expect(sundanceShadeConfigurationPatch({[key('alpha_hub')]:1,fabric_color_name:'keep'},'Cordless')).toMatchObject({fabric_color_name:'keep'});
  expect(sundanceShadeConfigurationPatch({[key('alpha_hub')]:1},'Cordless')).not.toHaveProperty(key('alpha_hub'));
 });
 it('renders documented controls for all six destinations',()=>{
  for(const productId of sundanceRollerFamilyIds){const s=selection(productId);const html=renderToStaticMarkup(createElement(SundanceRollerFamilyConfiguration,{productId,options:s.configuration,widthInches:36,heightInches:60,onUpdateFields:()=>{}}));expect(html).toContain('Sundance shade operating system');expect(html).toContain('Published shade option evidence');}
 });
});
