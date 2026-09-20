import {describe,it,expect} from 'vitest';
import {romanFabricLimits,romanSeptemberFrontRows,romanFabricConstructionChoices} from './norman-roman-fabric-limits';
import type {SelectionContext,SelectionRecord} from './core';
const s=(c:SelectionRecord={},width=36,height=60):SelectionContext=>({manufacturerId:'Norman',productId:'roman',programId:'test',catalogAsOf:'2026-09-20',catalogVersion:'test-norman-roman-mounting-2026-09-20-r7',widthInches:width,heightInches:height,quantity:1,options:{},configuration:{fabric_color_code:'F0255',fold_style:'Flat Fold without Seams',lift_system:'Cordless',shade_type:'Single',mount_type:'Outside Mount',fabric_orientation:'Standard / Non-Railroaded',seaming:'No Seams',...c}});
describe('Roman September source fabric construction',()=>{
 it('accounts for every source row and enforces the fabric-specific batten width boundary',()=>{
  expect(romanSeptemberFrontRows).toHaveLength(201);expect(new Set(romanSeptemberFrontRows.map(r=>r.colorCode)).size).toBe(201);
  for(const r of romanSeptemberFrontRows){
   const allowance=['Sheer Elegance','Scarlett'].includes(r.collection)?3.5:1.9375;
   const limit=r.fabricWidth-allowance,c={fabric_color_code:r.colorCode,fold_style:'Flat Fold with Batten Back'};
   expect(romanFabricLimits(s(c,limit))?.issues).toEqual([]);
   expect(romanFabricLimits(s(c,limit+.0625))?.issues.map(i=>i.ruleId)).toContain('roman.fabric_limits.no_vertical_seam_width');
   expect(romanFabricConstructionChoices(r.colorCode,'Soft Fold','Railroaded').seams.includes('Horizontal Seams')).toBe(r.seam==='Yes');
  }
 });
 it.each([['Cordless','Single',48.625],['Cordless','Day & Night',47.875],['Continuous Cord Loop','Single',51.25]])('checks %s %s no-seam width allowance',(lift_system,shade_type,max)=>{
  expect(romanFabricLimits(s({lift_system,shade_type},max))?.issues).toEqual([]);
  expect(romanFabricLimits(s({lift_system,shade_type},max+.0625))?.issues).toHaveLength(1);
  expect(romanFabricLimits(s({lift_system,shade_type,mount_type:'Inside Mount'},max+.375))?.issues).toEqual([]);
 });
 it('rejects unsupported railroading and seams at every width, including narrow F0031',()=>{
  expect(romanFabricLimits(s({fabric_color_code:'F1090',fold_style:'Soft Fold',fabric_orientation:'Railroaded'}))?.issues.map(i=>i.ruleId)).toContain('roman.fabric_limits.railroad_unavailable');
  expect(romanFabricLimits(s({fabric_color_code:'F0031',fold_style:'Soft Fold',fabric_orientation:'Railroaded'},30,26))?.issues).toEqual([]);
  expect(romanFabricLimits(s({fabric_color_code:'F0031',fold_style:'Soft Fold',fabric_orientation:'Railroaded'},30,26.0625))?.issues.map(i=>i.ruleId)).toContain('roman.fabric_limits.f0031_height');
  expect(romanFabricLimits(s({fabric_color_code:'F0031',fold_style:'Soft Fold',fabric_orientation:'Railroaded',seaming:'Horizontal Seams'},30,24))?.issues.map(i=>i.ruleId)).toContain('roman.fabric_limits.seam_unavailable');
 });
 it('holds the source-absent Taylor color without changing historical pricing rules',()=>{
  expect(romanFabricLimits(s({fabric_color_code:'F0210'}))?.issues.map(i=>i.ruleId)).toContain('roman.fabric_limits.source_missing');
  expect(romanFabricLimits({...s({fabric_color_code:'F0210'}),catalogVersion:'test-norman-roman-mounting-2026-09-20-r6'})).toBeNull();
 });
});
