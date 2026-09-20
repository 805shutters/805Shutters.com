import { describe,expect,it } from 'vitest';
import type { SelectionContext,SelectionRecord } from '@/lib/quote-v2/core';
import { sundanceVerticalSource } from './vertical-assortment';
import { validateSundanceVerticalConfiguration as validate,sundanceVerticalOptionEvidence as evidence } from './vertical-configuration';
const row=sundanceVerticalSource.rows[0];
const config:SelectionRecord={fabric_color_id:row.id,fabric_color_name:row.color,sundance_vertical_draw:'Split stack, right wand',sundance_vertical_bracket:'4-inch extension',mount_type:'Inside',sundance_vertical_mount_depth:4,sundance_vertical_flush:'Yes',sundance_vertical_fulfillment:'Complete blind',sundance_vertical_valance:'None'};
function selection(width=36,height=60,c:SelectionRecord=config):Pick<SelectionContext,'programId'|'widthInches'|'heightInches'|'configuration'>{return{programId:row.programId,widthInches:width,heightInches:height,configuration:c};}
describe('Vertical Essence configuration',()=>{
 it('accepts source boundaries and blocks immediately beyond them',()=>{
  expect(validate(selection(7,10))).toEqual([]);expect(validate(selection(192,144))).toEqual([]);
  for(const [w,h] of [[6.9375,10],[192.0625,60],[36,9.9375],[36,144.0625]])expect(validate(selection(w,h)).map(i=>i.ruleId)).toContain('sundance.vertical.size');
 });
 it('enforces flush, partial inside and outside mounting requirements',()=>{
  expect(validate(selection(36,60,{...config,sundance_vertical_mount_depth:3.9375})).map(i=>i.ruleId)).toContain('sundance.vertical.depth');
  expect(validate(selection(36,60,{...config,sundance_vertical_flush:'No',sundance_vertical_mount_depth:2.25}))).toEqual([]);
  expect(validate(selection(36,60,{...config,mount_type:'Outside',sundance_vertical_mount_depth:2}))).toEqual([]);
 });
 it('requires an exact material, draw, bracket and component scope',()=>{
  expect(validate(selection(36,60,{...config,fabric_color_id:'invented',sundance_vertical_draw:'Motor',sundance_vertical_bracket:'custom',sundance_vertical_fulfillment:'Vanes only'})).map(i=>i.ruleId)).toEqual(expect.arrayContaining(['sundance.vertical.material','sundance.vertical.draw','sundance.vertical.bracket','sundance.vertical.components']));
  expect(validate(selection(36,60,{...config,sundance_vertical_type:'Stock'}))).toEqual([]);
 });
 it('preserves independent retail and net schedules and flags unspecified foot rounding',()=>{
  const valance=sundanceVerticalSource.valances.find(v=>v.programId===row.programId&&v.name==='Rounded')!;
  const rounded=evidence({...config,sundance_vertical_valance:'Rounded',catalog_sundance_vertical_valance_id:valance.id},36);
  expect(rounded.retailSubtotal).toBe(valance.sourceRetailPrices[0]);expect(rounded.netSubtotal).toBe(0);
  expect(evidence({...config,sundance_vertical_valance:'Crown only'},36).netSubtotal).toBe(21);
  expect(evidence({...config,sundance_vertical_valance:'Crown with dust cover'},36).netSubtotal).toBe(30);
  expect(evidence({...config,sundance_vertical_fulfillment:'Track only'},20).netSubtotal).toBeCloseTo(34.2);
  expect(evidence({...config,sundance_vertical_fulfillment:'Track only'},96).netSubtotal).toBeCloseTo(91.2);
  expect(evidence(config,36).customerPriceEligible).toBe(false);
  expect(validate(selection(37,60,{...config,sundance_vertical_valance:'Crown only'})).map(i=>i.ruleId)).toContain('sundance.vertical.crown_rounding');
 });
});
