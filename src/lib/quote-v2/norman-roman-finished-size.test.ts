import { describe, expect, it } from 'vitest';
import { validateSelection } from './rules';
import { quoteV2CatalogVersionFor } from './catalog';
import type { SelectionContext, SelectionRecord } from './core';
const shade=(width:number,height:number,configuration:SelectionRecord={}):SelectionContext=>({
 manufacturerId:'Norman',productId:'roman',programId:'roman_roman_shades_group_2',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('roman','2026-09-20'),widthInches:width,heightInches:height,quantity:1,options:{},
 configuration:{mount_type:'Outside Mount',shade_type:'Single',lift_system:'Cordless',fold_style:'Flat Fold with Batten Back',fabric_collection:'Lorraine',fabric_color_code:'F0031',fabric_orientation:'Standard / Non-Railroaded',seaming:'No Seams',lining:'Translucent',...configuration}
});
const sizeIssues=(s:SelectionContext)=>validateSelection(s).filter(i=>i.ruleId.startsWith('roman.dimension.')||i.ruleId==='roman.day_night.max_ratio').map(i=>i.ruleId);
describe('September Roman finished size and actual headrail limits',()=>{
 it('uses the documented inside deduction at the minimum finished width',()=>{
  const c={mount_type:'Inside Mount'};
  expect(sizeIssues(shade(20,60,c))).toContain('roman.dimension.width');
  expect(sizeIssues(shade(20.375,60,c))).toEqual([]);
  const old=shade(20,60,c);old.catalogVersion=old.catalogVersion.replace(/-r\d+$/, '-r7');
  expect(sizeIssues(old)).toEqual([]);
 });
 it('uses each common shade finished width independently',()=>{
  const c={mount_type:'Inside Mount',shade_type:'Common Valance',common_valance_panel_widths:[20,30],common_valance_gap:1};
  expect(sizeIssues(shade(51,60,c))).toContain('roman.dimension.width');
  expect(sizeIssues(shade(51.1875,60,{...c,common_valance_panel_widths:[20.1875,30]}))).toEqual([]);
 });
 it('uses the selected two-inch headrail area limit even for a narrow shade',()=>{
  const c={lift_system:'Continuous Cord Loop',headrail_size:'2" Headrail'};
  expect(sizeIssues(shade(50,96,c))).toEqual([]);
  expect(sizeIssues(shade(50,96,{...c,headrail_size:'1 1/2" Headrail'}))).toContain('roman.dimension.area');
  expect(sizeIssues(shade(50,95,{...c,headrail_size:'1 1/2" Headrail'}))).toEqual([]);
 });
 it('applies the Day and Night ratio to finished width',()=>{
  const c={mount_type:'Inside Mount',shade_type:'Day & Night'};
  expect(sizeIssues(shade(20.375,60,c))).toEqual([]);
  expect(sizeIssues(shade(20.375,60.0625,c))).toContain('roman.day_night.max_ratio');
 });
});
