import {describe,it,expect} from 'vitest';
import type {SelectionContext,SelectionRecord} from '@/lib/quote-v2/core';
import {sundanceWaldenSource} from './walden-assortment';
import {sundanceWaldenChoices} from './supplemental-configuration';
import {validateSundanceWaldenConfiguration as validate,sundanceWaldenControlLimits as limits,sundanceWaldenControls} from './walden-configuration';
import {sundanceWaldenOptionEvidence as evidence,sundanceWaldenAccessoryKey as key,sundanceWaldenControlPatch} from './walden-option-schedules';
const premier='sundance_walden_premier',select='sundance_walden_select';
function selection(p=premier,w=36,h=60,extra:SelectionRecord={},code?:string):Pick<SelectionContext,'productId'|'programId'|'widthInches'|'heightInches'|'configuration'>{
 const row=sundanceWaldenSource.rows.find(r=>r.productId===p&&(code?r.code===code:!r.edgeBindingRequired&&!r.edgeBindingSourceConflict))!;
 return{productId:p,programId:row.programId,widthInches:w,heightInches:h,configuration:{fabric_color_id:row.id,fabric_color_code:row.code,fabric_color_name:row.name,sundance_walden_style:'Standard',sundance_walden_control:'Cordless',mount_type:'Inside',sundance_walden_flush:'No',sundance_walden_depth:1,sundance_walden_returns:'None',sundance_walden_assembly:'Single',...extra}};
}
const ids=(s:ReturnType<typeof selection>)=>validate(s).map(i=>i.ruleId);
describe('Walden family-specific source controls and options',()=>{
 it('keeps Premier and Select control limits distinct at both boundaries',()=>{
  expect(limits(premier,'Cordless TDBU')).toMatchObject({minWidth:18,maxWidth:60,maxHeight:72});
  expect(limits(select,'Cordless TDBU')).toMatchObject({minWidth:18,maxWidth:70,maxHeight:96});
  expect(ids(selection(premier,60,72,{sundance_walden_control:'Cordless TDBU'}))).toEqual([]);
  expect(ids(selection(premier,60.0625,72,{sundance_walden_control:'Cordless TDBU'}))).toContain('sundance.walden.size');
  expect(ids(selection(select,70,96,{sundance_walden_control:'Cordless TDBU'}))).toEqual([]);
  expect(ids(selection(select,70,96.0625,{sundance_walden_control:'Cordless TDBU'}))).toContain('sundance.walden.size');
  expect(ids(selection(premier,14.9375,18))).toContain('sundance.walden.size');
  expect(ids(selection(premier,15,18))).toEqual([]);
 });
 it('rejects unsupported material/control combinations and does not copy Premier Power Lift to Select',()=>{
  expect(sundanceWaldenControls(select)).not.toContain('Power Lift LI Motor');
  expect(ids(selection(select,36,60,{sundance_walden_control:'Power Lift LI Motor'}))).toContain('sundance.walden.control');
  expect(ids(selection(premier,36,60,{sundance_walden_control:'Cordless TDBU'},'E-87K'))).toContain('sundance.walden.tdbu_fabric');
  expect(ids(selection(premier,80,96,{sundance_walden_control:'Standard LI Motor'},'E-87K'))).toContain('sundance.walden.motor_area');
  expect(ids(selection(premier,80,96,{sundance_walden_control:'Power Lift LI Motor'},'E-87K'))).not.toContain('sundance.walden.motor_area');
 });
 it('enforces separate flush depths and control-specific chains',()=>{
  expect(ids(selection(premier,36,60,{sundance_walden_control:'Standard LI Motor',sundance_walden_flush:'Yes',sundance_walden_depth:3.5}))).toContain('sundance.walden.depth');
  expect(ids(selection(select,36,60,{sundance_walden_control:'Standard LI Motor',sundance_walden_flush:'Yes',sundance_walden_depth:3.5}))).toEqual([]);
  expect(ids(selection(premier,36,60,{sundance_walden_control:'Clutch and Loop',sundance_walden_chain:'Stainless Steel'}))).toContain('sundance.walden.chain');
 });
 it('rejects mismatched identities, cross-family liners and missing required binding',()=>{
  expect(ids(selection(premier,36,60,{fabric_color_code:'wrong'}))).toContain('sundance.walden.material');
  expect(ids(selection(premier,36,60,{catalog_sundance_liner_grid_id:sundanceWaldenChoices(select,'liner')[0].id}))).toContain('sundance.walden.liner');
  const row=sundanceWaldenSource.rows.find(r=>r.productId===premier&&r.edgeBindingRequired)!;
  expect(ids(selection(premier,36,60,{},row.code))).toContain('sundance.walden.required_binding');
 });
 it('retains explicit component, cutout and source conflict holds',()=>{
  expect(ids(selection(premier,36,60,{walden_movable_liner:'Yes',sundance_walden_assembly:'Two on one',sundance_walden_cutout_qty:1}))).toEqual(expect.arrayContaining(['sundance.walden.twin_liner','sundance.walden.twin_components','sundance.walden.components','sundance.walden.cutout']));
  expect(ids(selection(select,36,60,{},'WS-F132'))).toContain('sundance.walden.binding_conflict');
 });
 it('routes valance-only to its family/group table, never the full shade grid',()=>{
  const s=selection(premier,96,18,{sundance_walden_style:'Valance Only',sundance_walden_valance_headrail:'Loose'},'E-M01');
  expect(validate(s)).toEqual([]);
  expect(evidence(premier,s.configuration,96,18)).toMatchObject({entries:[{retail:893,page:19}],sourceRetailSubtotal:893,customerPriceEligible:false});
  expect(ids({...s,heightInches:18.0625})).toContain('sundance.walden.valance_size');
 });
 it('keeps known retail rates separate by family and from customer pricing',()=>{
  const c={sundance_walden_control:'Pro Wand'};
  expect(evidence(premier,c,36,60).sourceRetailSubtotal).toBe(235);
  expect(evidence(select,c,36,60).sourceRetailSubtotal).toBe(230);
  const motor={sundance_walden_control:'Standard LI Motor',[key('pro_hub')]:1,[key('charger16')]:1};
  expect(evidence(premier,motor,36,60).sourceRetailSubtotal).toBe(889);
  expect(evidence(select,motor,36,60).sourceRetailSubtotal).toBe(899);
  expect(evidence(select,{sundance_walden_control:'Somfy Sonesse Ultra 30',[key('somfy_wall5')]:1},36,60).sourceRetailSubtotal).toBe(961);
  expect(evidence(select,{sundance_walden_control:'Power Lift LI Motor'},36,60).sourceRetailSubtotal).toBe(0);
  expect(evidence(premier,{sundance_walden_returns:'None',sundance_walden_return_material:'Edge binding fabric'},36,60).sourceRetailSubtotal).toBe(0);
 });
 it('clears accessory allocations on control changes and rejects fractional or incompatible quantities',()=>{
  const patched=sundanceWaldenControlPatch({[key('pro_hub')]:1,fabric_color_id:'retained'},'Cordless');
  expect(patched).not.toHaveProperty(key('pro_hub'));expect(patched).toMatchObject({fabric_color_id:'retained'});
  expect(ids(selection(premier,36,60,{[key('pro_hub')]:1}))).toContain('sundance.walden.accessory_0');
  expect(evidence(premier,{sundance_walden_control:'Standard LI Motor',[key('pro_hub')]:0.5},36,60).unresolved).toHaveLength(1);
 });
});
