import { describe, expect, it } from 'vitest';
import { romanFabricPatternOptions, romanHardware, ROMAN_REVERSE_PATTERN_CODES } from './norman-roman-hardware';
import { priceQuoteV2Selection } from './engine';
import { quoteV2CatalogVersionFor } from './catalog';
import type { SelectionContext } from './core';

function shade(code: string, pattern?: string): SelectionContext {
 return {manufacturerId:'Norman',productId:'roman',programId:'roman_cordless_usa_price_group_2_pg2',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('roman','2026-09-20'),widthInches:36,heightInches:60,quantity:1,options:{},configuration:{mount_type:'Outside Mount',shade_type:'Single',lift_system:'Cordless',fold_style:'Flat Fold with Batten Back',fabric_color_code:code,lining:'Translucent',fabric_orientation:'Standard',seaming:'No Seams',...(pattern ? {roman_fabric_pattern:pattern} : {})}};
}

describe('Roman guide page49 fabric face',()=>{
 it('offers exactly the fourteen listed codes and retains the selected face in the saved manufacturing record',()=>{
  expect(ROMAN_REVERSE_PATTERN_CODES).toHaveLength(14);
  for(const code of ROMAN_REVERSE_PATTERN_CODES) {
   expect(romanFabricPatternOptions(code)).toEqual(['Standard','Reverse']);
   for(const pattern of ['Standard','Reverse']) {
    const saved=JSON.parse(JSON.stringify(shade(code,pattern))) as SelectionContext;
    expect(romanHardware(saved)?.issues).toEqual([]);
    expect(romanHardware(saved)?.record.fabricPattern).toBe(pattern);
   }
  }
 });
 it('rejects fabricated or incompatible face choices at server pricing without altering orientation',()=>{
  for(const [code,pattern] of [['F1090','Reverse'],['F1080','Reverse'],['F1794','Sideways']]) {
   const selection=shade(code,pattern);
   const result=priceQuoteV2Selection({selection,priceInput:{productId:'roman',programId:selection.programId!,widthInches:36,heightInches:60}});
   expect(result.ok).toBe(false);
   expect(romanHardware(selection)?.issues.some(i=>i.ruleId==='roman.hardware.fabric_pattern')).toBe(true);
   expect(selection.configuration.fabric_orientation).toBe('Standard');
  }
 });
 it('keeps the documented default for older selections with no explicit face',()=>{
  expect(romanHardware(shade('F1090'))?.record.fabricPattern).toBe('Standard');
  expect(romanFabricPatternOptions('F1090')).toEqual(['Standard']);
 });
});
