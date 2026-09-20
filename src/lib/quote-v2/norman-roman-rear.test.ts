import { describe, expect, it } from 'vitest';
import { normanRomanSeptemberRearRows } from '@/lib/quote/norman-roman-rear-2026-09.generated';
import { findRomanRearColor, getRomanRearMaxWidth, romanCurrentRearColors, romanCurrentRearCollections, romanRearEligibleColors } from './catalog';
import { validateSelection } from './rules';
import type { SelectionContext } from './core';
const rear=(collection:string,colorCode:string,width=36):SelectionContext=>({manufacturerId:'Norman',productId:'roman',catalogVersion:'test',catalogAsOf:'2026-09-19',programId:'roman_cordless_usa_price_group_2_pg2',widthInches:width,heightInches:60,quantity:1,options:{},configuration:{mount_type:'Inside Mount',shade_type:'Day & Night',lift_system:'Cordless',fold_style:'Flat Fold without Seams',fabric_collection:'Alma',fabric_color_code:'F1621',lining:'Translucent',fabric_orientation:'Standard',seaming:'No Seams',rear_fabric_collection:collection,rear_fabric_color_code:colorCode,back_hem_bar:'Plain'}});
describe('September Roman Day & Night rear assortment',()=>{
 it('maps every source-listed identity to the existing current catalog',()=>{
  expect(normanRomanSeptemberRearRows).toHaveLength(396);
  expect(romanCurrentRearColors).toHaveLength(396);
  expect(romanCurrentRearCollections).toHaveLength(82);
  for(const row of normanRomanSeptemberRearRows){
   const found=findRomanRearColor(row.collection,row.colorCode);
   expect(found,`${row.collection} ${row.colorCode} p${row.sourcePage}`).toBeDefined();
   expect(found?.available).toBe(true);
   expect(getRomanRearMaxWidth(row.collection,row.colorCode)).toBe(row.maxWidth);
   expect(validateSelection(rear(row.collection,row.colorCode)).filter(i=>i.ruleId.startsWith('roman.day_night'))).toEqual([]);
  }
 });
 it('keeps old assortments date-controlled and excludes withdrawn and unlisted colors',()=>{
  expect(findRomanRearColor('Charlotte','F2170','2026-08-31')).toBeUndefined();
  expect(findRomanRearColor('Charlotte','F2170','2026-09-01')).toBeDefined();
  expect(findRomanRearColor('Emery','F1561')).toBeUndefined();
  expect(findRomanRearColor('Emery','F1561','2026-08-31')).toBeDefined();
  for(const row of romanRearEligibleColors.filter(row=>!romanCurrentRearColors.some(current=>current.colorCode===row.colorCode))) expect(findRomanRearColor(row.collection,row.colorCode)).toBeUndefined();
 });
 it('enforces the exact narrow rear-fabric width boundaries',()=>{
  for(const [collection,code,max] of [['Charlotte','F2170',94],['Java','F0856',78],['Riviera','F1290',94.5]] as const){
   const ids=(width:number)=>validateSelection(rear(collection,code,width)).map(i=>i.ruleId);
   expect(ids(max)).not.toContain('roman.day_night.rear_fabric.max_width');
   expect(ids(max+.125)).toContain('roman.day_night.rear_fabric.max_width');
  }
 });
});
