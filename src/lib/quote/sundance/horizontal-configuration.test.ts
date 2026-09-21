import { describe,expect,it } from 'vitest';
import type { SelectionContext,SelectionRecord } from '@/lib/quote-v2/core';
import { sundanceHorizontalSource } from './horizontal-assortment';
import { validateSundanceHorizontalConfiguration as validate,sundanceHorizontalLimits as limits,sundanceHorizontalOptionEvidence as evidence,sundanceSolidTapeCodes,sundanceDecorativeTapeCodes } from './horizontal-configuration';
function selection(p='sundance_aluminum_1',w=36,h=60,extra:SelectionRecord={}):Pick<SelectionContext,'productId'|'programId'|'widthInches'|'heightInches'|'configuration'>{
 const row=sundanceHorizontalSource.rows.find(r=>r.productId===p)!;
 return{productId:p,programId:row.programId,widthInches:w,heightInches:h,configuration:{fabric_color_id:row.id,fabric_color_code:row.code,fabric_color_name:row.name,lift_system:'Cordless',mount_type:'Inside',sundance_blind_wand:'Left',sundance_blind_assembly:'Single',sundance_blind_grade:'Standard',sundance_blind_valance:'Crown',...extra}};
}
describe('horizontal source configuration coverage',()=>{
 it('specifies all eight source families without accepting the 92-inch Premium 2.5 grid as its size limit',()=>{
  expect(new Set(sundanceHorizontalSource.rows.map(r=>r.productId)).size).toBe(8);
  expect(limits('sundance_premium_ii_2_5',{}).maxHeight).toBe(84);
  expect(limits('sundance_advantage_ii_2',{}).maxHeight).toBe(92);
  expect(limits('sundance_aluminum_2',{})).toMatchObject({minWidth:24,maxWidth:82,minHeight:18,maxHeight:84});
  expect(limits('sundance_basicvue',{})).toMatchObject({minWidth:18,maxWidth:72,minHeight:12,maxHeight:84});
 });
 it('enforces premium aluminum edges and unavailable base grid cells',()=>{
  expect(validate(selection('sundance_aluminum_1',23,18,{sundance_blind_grade:'Premium'}))).toEqual([]);
  expect(validate(selection('sundance_aluminum_1',22.9375,18,{sundance_blind_grade:'Premium'})).map(i=>i.ruleId)).toContain('sundance.horizontal.size');
  expect(validate(selection('sundance_aluminum_1',82,72,{sundance_blind_grade:'Premium'})).map(i=>i.ruleId)).toContain('sundance.horizontal.grid');
  expect(validate(selection('sundance_aluminum_1',82.0625,72,{sundance_blind_grade:'Premium'})).map(i=>i.ruleId)).toContain('sundance.horizontal.size');
 });
 it('requires exact same-family identities and currently documented controls',()=>{
  expect(validate(selection('sundance_aluminum_1',36,60,{lift_system:'Corded',fabric_color_code:'fake',sundance_blind_wand:'Right'})).map(i=>i.ruleId)).toEqual(expect.arrayContaining(['sundance.horizontal.material','sundance.horizontal.lift','sundance.horizontal.aluminum_wand_side']));
  expect(validate(selection('sundance_basicvue',36,60,{sundance_blind_wand:'Right'})).map(i=>i.ruleId)).toContain('sundance.horizontal.wand');
 });
 it('holds components, cutout geometry and Chateau availability without inventing prices',()=>{
  expect(validate(selection('sundance_aluminum_1',36,60,{sundance_blind_assembly:'Two on one',sundance_blind_cutout_sides:1})).map(i=>i.ruleId)).toEqual(expect.arrayContaining(['sundance.horizontal.components','sundance.horizontal.cutout_geometry']));
  expect(validate(selection('sundance_chateau_woods',85,60,{sundance_blind_valance:'3-inch Metro',sundance_blind_ladder:'Standard Ladder',sundance_blind_flush:'Yes',sundance_blind_depth:4})).map(i=>i.ruleId)).toEqual(expect.arrayContaining(['sundance.horizontal.availability','sundance.horizontal.split_required']));
 });
 it('reconciles every published tape code and mounting spacer depth',()=>{
  expect(sundanceSolidTapeCodes).toHaveLength(10);expect(sundanceDecorativeTapeCodes).toHaveLength(9);
  const c={sundance_blind_ladder:'Solid 1-inch tape',sundance_blind_tape_code:'4294',sundance_blind_flush:'Yes',sundance_blind_depth:3.625,sundance_blind_spacer:'Yes'};
  expect(validate(selection('sundance_chateau_woods',36,60,c)).map(i=>i.ruleId)).toEqual(expect.arrayContaining(['sundance.horizontal.tape','sundance.horizontal.depth']));
 });
 it('independently checks premium and rope width-band edges plus fixed net options',()=>{
  expect(evidence('sundance_aluminum_1',{sundance_blind_grade:'Premium'},26).retailSubtotal).toBe(56);
  expect(evidence('sundance_aluminum_1',{sundance_blind_grade:'Premium'},26.0625).retailSubtotal).toBe(78);
  expect(evidence('sundance_aluminum_1',{sundance_blind_grade:'Premium'},82).retailSubtotal).toBe(339);
  expect(evidence('sundance_chateau_woods',{sundance_blind_valance:'4-inch Rope'},36).retailSubtotal).toBe(157);
  expect(evidence('sundance_chateau_woods',{sundance_blind_valance:'4-inch Rope'},96).retailSubtotal).toBe(418);
  const e=evidence('sundance_aluminum_1',{sundance_blind_assembly:'Three on one',sundance_blind_cutout_sides:2,sundance_blind_pole_short_qty:1,sundance_blind_pole_long_qty:1},36);
  expect(e.netSubtotal).toBe(201);expect(e.retailSubtotal).toBe(0);expect(e.customerPriceEligible).toBe(false);
 });
 it('retains percentage bases rather than combining them into a selling price',()=>{
  const r=sundanceHorizontalSource.rows.find(r=>r.productId==='sundance_aluminum_1'&&r.code==='8014')!;
  expect(evidence(r.productId,{fabric_color_id:r.id},36).percentages[0].percent).toBe(20);
  expect(evidence('sundance_chateau_woods',{sundance_blind_ladder:'Decorative 1-inch tape',sundance_blind_rounded_corners:'Yes'},36)).toMatchObject({percentages:[{percent:20}],netSubtotal:15});
  expect(evidence('sundance_advantage_ii_2',{sundance_blind_extra_valance:'Valance with dust cover',sundance_blind_extra_valance_inches:36},36).netSubtotal).toBe(30);
 });
});
