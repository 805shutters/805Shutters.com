import {describe,it,expect} from 'vitest';
import {quoteV2CatalogVersionFor,QUOTE_V2_CATALOG_VERSION} from './catalog';
import type {SelectionContext,SelectionRecord} from './core';
import {smartfoldHasDocumentedQuotePricingBranch as quoteBranch,smartfoldHasDocumentedPricingBranch as orderBranch,validateSmartfoldEligibility,smartfoldBranchExceptions} from './norman-smartfold-eligibility';
const shade=(configuration:SelectionRecord={}):SelectionContext=>({manufacturerId:'Norman',productId:'smartfold',programId:'smartfold_smartfold_shades',catalogAsOf:'2026-09-21',catalogVersion:quoteV2CatalogVersionFor('smartfold','2026-09-21'),widthInches:36,heightInches:60,quantity:1,options:{},configuration:{mount_type:'Inside Mount',valance:'No Valance',lift_system:'PrecisionLift Cordless',motor_type:null,fabric_color_code:'F1709',fold_size:6,smartfold_installation:'Back / Wall Mount with Raceway',smartfold_shim_layers:0,...configuration}});
describe('SmartFold separate quote-only price branch',()=>{
 it.each(['Inside Mount','Semi-Inside Mount','inside','Outside Mount'])('allows documented grid/options without clearance for %s',mount_type=>{
  const s=shade({mount_type});expect(quoteBranch(s)).toBe(true);
  if(mount_type!=='Outside Mount'){expect(orderBranch(s)).toBe(false);expect(smartfoldBranchExceptions(s)).toContain('inside/semi-inside mounting needs its exact roll-diameter/depth verification');}
 });
 it.each([null,'Partial Projection','Fully Recessed'])('prices inside/no-valance guard without requiring recess approval: %s',smartfold_light_guard_recess=>{
  const s=shade({basic_light_guard:'Yes',smartfold_light_guard_recess});expect(quoteBranch(s)).toBe(true);
  expect(orderBranch(s)).toBe(smartfold_light_guard_recess==='Fully Recessed');
 });
 it('does not mutate configuration or send inside shades through outside validators',()=>{
  const s=shade({smartfold_clearance_v1:{version:1,mountingAreaHeight:1,mountingSpaceHeight:2}}),before=structuredClone(s);
  const originalIssues=validateSmartfoldEligibility(s);expect(quoteBranch(s)).toBe(true);
  expect(validateSmartfoldEligibility(s)).toEqual(originalIssues);expect(originalIssues[0].ruleId).toBe('norman.smartfold.branch_verification');expect(s).toEqual(before);
 });
 it.each([{smartfold_side_by_side_id:'G1'},{side_by_side:true},{side_by_side_match_line_id:'other'},{installed_on_door:true},{door_application:true},{application:'Door'}] as SelectionRecord[])('quotes unchanged individual shade pricing despite ordering placement %j',c=>{
  const s=shade({mount_type:'Outside Mount',...c});expect(quoteBranch(s)).toBe(true);expect(orderBranch(s)).toBe(false);
 });
 const blocked:SelectionRecord[]=[
  {mount_type:'Outside Mount',basic_light_guard:'Yes'},
  {mount_type:'Semi-Inside Mount',basic_light_guard:'Yes'},
  {basic_light_guard:'Yes',valance:'Square Fascia'},
  {fabric_color_code:'unknown'}, {valance:'3.5-inch Fabric'},
  {lift_system:'Motorized',motor_type:'AC Plug-In'},
  {motor_type:'unexpected motor'}, {smartfold_common_valance_id:'V1'},
  {smartfold_hold_down:'Traditional'},
  {smartfold_valance_width:40}, {application:'Day Night'}, {shade_type:'Dual'},
  {premium_hem_bar:'Premium'}, {mount_type:'unknown'},
 ];
 it.each(blocked)('retains price/identity/assembly hold %j',c=>expect(quoteBranch(shade(c))).toBe(false));
 it('retains unspliced valance size boundary',()=>{
  const s=shade({mount_type:'Outside Mount',valance:'6-inch Fabric'});s.widthInches=95;expect(quoteBranch(s)).toBe(true);s.widthInches=95.0625;expect(quoteBranch(s)).toBe(false);
 });
 it('does not reopen historical catalogs, October revisions or other program identities',()=>{
  const patches:Partial<SelectionContext>[]=[{catalogAsOf:'2026-09-20'},{catalogAsOf:'2026-10-01'},{catalogVersion:`${QUOTE_V2_CATALOG_VERSION}-norman-smartfold-autowand-2026-09-20-r14`},{manufacturerId:'Onyx'},{programId:'other'},{productId:'roman'}];
  for(const patch of patches)expect(quoteBranch({...shade(),...patch})).toBe(false);
 });
});
