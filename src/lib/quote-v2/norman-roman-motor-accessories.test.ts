import {describe,it,expect} from 'vitest';
import type {SelectionContext} from './core';
import {romanMotorAccessories,ROMAN_WAND_LENGTHS} from './norman-roman-motor-accessories';
import {deriveNormanOrderRecords} from './norman-assemblies';
import {resolveNormanShadeMotorization} from './norman-shade-motorization';
const selection=(configuration:SelectionContext['configuration']={},quantity=1):SelectionContext=>({manufacturerId:'norman',productId:'roman',programId:'roman-test',catalogVersion:'test',catalogAsOf:'2026-09-19',widthInches:36,heightInches:60,quantity,options:{},configuration:{lift_system:'Motorized',shade_type:'Single',motor_type:'Norman Smart Rechargeable Battery (AC Charger)',remote_type:'Basic Remote',motor_position:'Right',hub_required:false,fold_style:'Flat Fold without Seams',...configuration}});
const record=(s:SelectionContext)=>romanMotorAccessories(s)!;
describe('September Roman motor accessories',()=>{
 it('charges explicit line counts once and retains channel and extension specifications',()=>{
  const s=selection({roman_extra_charging_kits:2,roman_extension_cables:3,roman_repeaters:1,roman_remote_quantity:1,roman_remote_channel:5},4);
  const r=record(s);expect(r.issues).toEqual([]);
  expect(r.selections).toContainEqual({groupId:'smart_motorization',optionId:'charging_kit',role:'accessory',units:2,billingScope:'once_per_line'});
  expect(r.record.extension).toMatchObject({quantity:3,length:78.74,color:'Black',adapterWatts:36});
  const price=resolveNormanShadeMotorization(s)!;
  expect(price.canonicalSelections).toContainEqual({groupId:'smart_motorization',optionId:'basic_remote_black',role:'controller',units:1,billingScope:'once_per_line'});
  expect(r.record.controller).toMatchObject({channel:5,quantity:1});
 });
 it.each([-1,1.5,3])('rejects invalid extra kit count %s for a two-shade line',count=>{
  expect(record(selection({roman_extra_charging_kits:count},2)).issues.map(i=>i.ruleId)).toContain('roman.accessory.roman_extra_charging_kits');
 });
 it('checks power, controller, cable, solar and channel compatibility',()=>{
  const incompatible:SelectionContext["configuration"][]=[{motor_type:'Norman Smart DC Low Voltage',roman_extra_charging_kits:1},{motor_type:'Automate 12V DC Low Voltage',roman_extension_cables:1},{roman_extra_harnesses:1},{roman_solar_panel:'Yes'},{roman_remote_channel:6},{roman_remote_channel:0},{roman_color_ring_sets:1}];
  for(const config of incompatible) expect(record(selection(config)).issues.length,JSON.stringify(config)).toBeGreaterThan(0);
  expect(record(selection({remote_type:'SmartDial G2 Remote',roman_color_ring_sets:1})).issues).toEqual([]);
  expect(record(selection({motor_type:'Automate ARC Rechargeable Battery',remote_type:'15-Channel Remote',roman_remote_channel:15,roman_solar_panel:'Yes'})).issues).toEqual([]);
 });
 it('supports every AutoWand length and restricts its cables to one per motor',()=>{
  for(const length of ROMAN_WAND_LENGTHS) expect(record(selection({motor_type:'AutoWand',remote_type:null,roman_wand_length:length,roman_wand_color:'Cottage White',roman_extension_cables:1,roman_extension_color:'White'})).issues).toEqual([]);
  expect(record(selection({motor_type:'AutoWand',roman_extension_cables:2,roman_extension_color:'White'})).issues.length).toBeGreaterThan(0);
  expect(record(selection({motor_type:'AutoWand',shade_type:'Common Valance',roman_extension_cables:2,roman_extension_color:'Black'})).issues).toEqual([]);
 });
 it('allocates one included kit per three motors across common and single lines',()=>{
  const a=selection({shade_type:'Common Valance',common_valance_panel_widths:[30,40],common_valance_gap:1});a.widthInches=71;
  const b=selection();
  expect(deriveNormanOrderRecords([{lineId:'a',selection:a},{lineId:'b',selection:b}])).toEqual([]);
  const assembly=a.configuration.norman_assembly_v1 as Record<string,unknown>;
  expect(assembly.includedChargingKits).toMatchObject({motorQuantity:3,orderQuantity:1,fulfillmentQuantity:1,connectedLineIds:['a','b'],sourcePage:22});
  expect((b.configuration.norman_assembly_v1 as Record<string,unknown>).includedChargingKits).toMatchObject({fulfillmentQuantity:0});
 });
 it('counts two external packs and two solar panels on a two-motor common assembly',()=>{
  const s=selection({shade_type:'Common Valance',common_valance_panel_widths:[30,40],common_valance_gap:1,motor_type:'Automate 12V DC Low Voltage',dc_power_supply:'External Battery Pack',remote_type:'15-Channel Remote'});s.widthInches=71;
  deriveNormanOrderRecords([{lineId:'a',selection:s}]);
  expect(resolveNormanShadeMotorization(s)!.canonicalSelections).toContainEqual({groupId:'automate_home',optionId:'external_battery_pack',role:'power_supply',units:2});
  expect(record(selection({...s.configuration,motor_type:'Automate ARC Rechargeable Battery',roman_solar_panel:'Yes'})).selections).toContainEqual({groupId:'automate_home',optionId:'solar_panel',role:'accessory',units:2,billingScope:'once_per_line'});
 });
 it('enforces network repeater and remote requirements across lines',()=>{
  const a=selection({roman_repeaters:3,roman_remote_quantity:0});const b=selection({roman_repeaters:3,roman_remote_quantity:0});
  const rows=[{lineId:'a',selection:a},{lineId:'b',selection:b}];
  const ids=deriveNormanOrderRecords(rows).map(i=>i.ruleId);
  expect(ids).toContain('norman.roman.network_repeater_capacity');expect(ids).toContain('roman.motorization.order_remote_required');
  b.configuration={...b.configuration,roman_repeaters:2,roman_remote_quantity:1};
  expect(deriveNormanOrderRecords(rows)).toEqual([]);
 });
 it('keeps historical snapshots under their original rules',()=>{
  const s=selection({roman_extra_charging_kits:999});s.catalogAsOf='2026-09-18';expect(romanMotorAccessories(s)).toBeNull();
 });
});
