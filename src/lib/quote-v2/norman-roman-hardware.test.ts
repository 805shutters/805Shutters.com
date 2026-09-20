import {describe,expect,it} from 'vitest';
import type {SelectionContext} from './core';
import {romanHardware,ROMAN_HARDWARE_MAGNET_COLORS} from './norman-roman-hardware';
import {authoritativeAutomaticSurchargeSelections} from './engine';
const shade=(configuration:SelectionContext['configuration']={}):SelectionContext=>({manufacturerId:'Norman',productId:'roman',programId:'roman-test',catalogVersion:'test',catalogAsOf:'2026-09-19',widthInches:36,heightInches:60,quantity:1,options:{},configuration:{lift_system:'Continuous Cord Loop',mount_type:'Inside Mount',shade_type:'Single',...configuration}});
describe('September Roman chain and hardware rules',()=>{
 it('preserves historical catalogs and derives bracket quantities at exact boundaries',()=>{
  expect(romanHardware({...shade(),catalogAsOf:'2026-09-18'})).toBeNull();
  for(const [width,count] of [[44,2],[44.125,3],[70,3],[70.125,4],[96,4]]){
   const s={...shade({mount_type:'Outside Mount',roman_shim_layers:3,shim_quantity:999}),widthInches:width};
   expect(romanHardware(s)?.record.mounting).toMatchObject({brackets:[count],shimQuantity:count*3,shimExtension:1.125});
   expect(authoritativeAutomaticSurchargeSelections(s).filter(x=>x.id==='shim')).toEqual([{id:'shim',units:count*3}]);
  }
  for(const configuration of [{roman_shim_layers:1},{mount_type:'Outside Mount',shade_type:'Day & Night',roman_shim_layers:1},{mount_type:'Outside Mount',roman_shim_layers:4},{mount_type:'Outside Mount',roman_shim_layers:1.5}] as SelectionContext['configuration'][]) expect(romanHardware(shade(configuration))?.issues.length).toBeGreaterThan(0);
 });
 it('counts common-valance hardware per constituent shade',()=>{
  const s=shade({mount_type:'Outside Mount',lift_system:'Cordless',shade_type:'Common Valance',common_valance_panel_widths:[30,60],roman_shim_layers:2,hold_downs:'Magnetic',poles:'Pole with Attachment',pole_length:'60"',roman_pole_quantity:2});
  expect(romanHardware(s)?.issues).toEqual([]);
  expect(authoritativeAutomaticSurchargeSelections(s)).toEqual(expect.arrayContaining([{id:'shim',units:10},{id:'magnetic_hold_down',units:2},{id:'cordless_operating_pole',units:4,billingScope:'once_per_line'}]));
  expect(romanHardware(s)?.record.pole).toMatchObject({quantity:4,legacyPerShadeQuantity:2,quantityBasis:'per_line'});
 });
 it('allows custom inside CCL lengths from height minus three and retains exact geometry',()=>{
  expect(romanHardware(shade({roman_chain_length:57.5}))?.issues).toEqual([]);
  expect(romanHardware(shade({roman_chain_length:56.875}))?.issues.map(i=>i.ruleId)).toContain('roman.hardware.chain_length');
  expect(romanHardware(shade())?.record.chain).toMatchObject({length:57,custom:false,minimumAccessClearance:2});
 });
 it('requires unobstructed installation beyond the recommended limits and rejects above 280',()=>{
  for(const mount_type of ['Inside Mount','Outside Mount']){
   expect(romanHardware(shade({mount_type,roman_chain_length:140}))?.issues.map(i=>i.ruleId)).toContain('roman.hardware.chain_clearance');
   expect(romanHardware(shade({mount_type,roman_chain_length:280,roman_chain_unobstructed:'Yes'}))?.issues).toEqual([]);
   expect(romanHardware(shade({mount_type,roman_chain_length:280.125,roman_chain_unobstructed:'Yes'}))?.issues.map(i=>i.ruleId)).toContain('roman.hardware.chain_length');
  }
  expect(romanHardware(shade({lift_system:'SmartRelease',roman_chain_length:12}))?.issues).toEqual([]);
  expect(romanHardware(shade({lift_system:'SmartRelease',roman_chain_length:11.875}))?.issues.length).toBeGreaterThan(0);
 });
 it('assigns common outer chains and reversible Day and Night chains',()=>{
  expect(romanHardware(shade({shade_type:'Common Valance'}))?.record.chain?.positions).toEqual({left:'Left',right:'Right'});
  expect(romanHardware(shade({shade_type:'Day & Night',chain_location:'Left'}))?.record.chain?.positions).toEqual({front:'Left',rear:'Right'});
 });
 it('prices each pole and validates lengths, quantity and compatible control',()=>{
  for(const pole_length of ['36"','60"']){
   const s=shade({lift_system:'Cordless',poles:'Pole with Attachment',pole_length,roman_pole_quantity:2});
   expect(romanHardware(s)?.issues).toEqual([]);
   expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id:'cordless_operating_pole',units:2,billingScope:'once_per_line'});
  }
  for(const roman_pole_quantity of [0,1.5,3])expect(romanHardware(shade({lift_system:'Cordless',poles:'Attachment Only',roman_pole_quantity}))?.issues.length).toBeGreaterThan(0);
  expect(romanHardware(shade({poles:'Pole with Attachment',pole_length:'36"'}))?.issues.length).toBeGreaterThan(0);
 });
 it('accepts every magnet finish only outside and derives the correct charge and location',()=>{
  for(const magnet_color of ROMAN_HARDWARE_MAGNET_COLORS){
   const s=shade({mount_type:'Outside Mount',hold_downs:'Magnetic',magnet_color,shade_type:'Day & Night'});
   expect(romanHardware(s)?.issues).toEqual([]);
   expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id:'magnetic_hold_down',units:1});
   expect(romanHardware(s)?.record.holdDown).toMatchObject({factoryMagnetLocation:'back_of_rear_roller_hem_bar',minimumSideClearance:1.4375,minimumBottomClearance:.3125});
  }
  expect(romanHardware(shade({hold_downs:'Magnetic'}))?.issues.length).toBeGreaterThan(0);
 });
});

describe('Roman September mounting-depth revision',()=>{
 const current=(configuration:SelectionContext['configuration']):SelectionContext=>({...shade(configuration),catalogAsOf:'2026-09-20',catalogVersion:'test-norman-roman-mounting-2026-09-20-r2'});
 const mountingIssues=(s:SelectionContext)=>romanHardware(s)?.issues.filter(i=>i.ruleId.includes('mount_'))??[];
 it.each([
  ['Cordless','', '',1.75,2.125],
  ['Continuous Cord Loop','1 1/2" Headrail','',1.75,2.125],
  ['Continuous Cord Loop','2" Headrail','',2.125,2.625],
  ['SmartRelease','','',2.125,2.625],
  ['Motorized','','Rechargeable Battery (AC Charger)',2,2.5],
  ['Motorized','','AutoWand',1.625,2.125],
 ])('enforces %s %s %s exact depths',(lift_system,headrail_size,motor_type,semi,flush)=>{
  for(const [roman_mount_fit,minimum] of [['Semi Inside',semi],['Flush Inside',flush]] as const){
   const s=current({lift_system,headrail_size,motor_type,roman_mount_fit,mount_depth_inches:minimum});
   expect(mountingIssues(s)).toEqual([]);
   expect(romanHardware(s)?.record.mounting).toMatchObject({minimumDepth:minimum,measuredDepth:minimum,fit:roman_mount_fit});
   expect(mountingIssues({...s,configuration:{...s.configuration,mount_depth_inches:minimum-.0625}}).map(i=>i.ruleId)).toContain('roman.hardware.mount_depth');
  }
 });
 it('uses Day and Night depths for all controls and rejects missing or invalid measurements',()=>{
  for(const lift_system of ['Cordless','Continuous Cord Loop','Motorized','SmartRelease']){
   for(const [roman_mount_fit,minimum] of [['Semi Inside',3.625],['Flush Inside',4.125]] as const){
    const s=current({lift_system,shade_type:'Day & Night',roman_mount_fit,mount_depth_inches:minimum});
    expect(mountingIssues(s)).toEqual([]);
    expect(mountingIssues({...s,configuration:{...s.configuration,mount_depth_inches:minimum-.0625}})).toHaveLength(1);
   }
  }
  for(const mount_depth_inches of [null,'',0,'abc',1.5])expect(mountingIssues(current({roman_mount_fit:'Semi Inside',mount_depth_inches}))).toHaveLength(1);
  expect(romanHardware(current({}))?.record.mounting).toMatchObject({measuredDepth:null});
  expect(mountingIssues(current({mount_depth_inches:4})).map(i=>i.ruleId)).toContain('roman.hardware.mount_fit');
  expect(mountingIssues(current({mount_type:'Outside Mount'}))).toEqual([]);
  expect(mountingIssues({...current({}),catalogVersion:'test-norman-roman-caroline-2026-09-20-r1'})).toEqual([]);
 });
});

describe('Roman exact banding layout',()=>{
 it('requires and records both documented layouts without changing earlier snapshots',()=>{
  for(const fold_style of ['Ribbon Banded','Edge Banded']) {
   const s={...shade({mount_type:'Outside Mount',fold_style}),catalogVersion:'test-norman-roman-mounting-2026-09-20-r3'};
   expect(romanHardware(s)?.issues.map(i=>i.ruleId)).toContain('roman.hardware.banding_layout');
   for(const roman_banding_layout of ['Side Border','Wrapped Border']) {
    const result=romanHardware({...s,configuration:{...s.configuration,roman_banding_layout}});
    expect(result?.issues).toEqual([]);
    expect(result?.record.banding).toMatchObject({layout:roman_banding_layout,borderWidth:fold_style==='Ribbon Banded'?1.0625:2.5});
   }
   expect(romanHardware({...s,catalogVersion:'test-norman-roman-mounting-2026-09-20-r2'})?.issues).toEqual([]);
  }
 });
});
