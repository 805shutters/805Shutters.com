import { describe, expect, it } from 'vitest';
import { sundanceZebraAccessories, sundanceZebraAccessoryIssues, sundanceZebraAccessoryKey as key } from './zebra-accessories';
import { sundanceZebraControlPatch, sundanceZebraOptionEvidence } from './zebra-configuration';
const somfy='Somfy Sonesse Ultra 30 WireFree RTS Li-ion';
describe('Zebra motor accessory source schedules',()=>{
 it('accounts for every published accessory row on pages 10–14',()=>{
  expect(sundanceZebraAccessories).toHaveLength(28);
  expect([10,11,12,13,14].map(page=>sundanceZebraAccessories.filter(a=>a.page===page).length)).toEqual([3,10,7,5,3]);
  expect(new Set(sundanceZebraAccessories.map(a=>a.key)).size).toBe(28);
 });
 it('keeps source net charges separate from selling prices',()=>{
  const evidence=sundanceZebraOptionEvidence({sundance_zebra_control:somfy,[key('somfy_charger')]:1,[key('situo_5')]:1});
  expect(evidence.netSubtotal).toBe(339);expect(evidence.customerPriceEligible).toBe(false);
  expect(sundanceZebraOptionEvidence({sundance_zebra_control:'Alpha Motor 40 5Nm Li-ion',[key('alpha_charger')]:1,[key('alpha_remote_5')]:2}).netSubtotal).toBe(388);
  expect(sundanceZebraOptionEvidence({sundance_zebra_control:'Quiet Touch Wand',[key('quiet_charger')]:1}).netSubtotal).toBe(135);
 });
 it('enforces voltage and motor family rather than retaining incompatible hidden accessories',()=>{
  expect(sundanceZebraAccessoryIssues({sundance_zebra_control:somfy,[key('somfy_power')]:1})).toHaveLength(1);
  expect(sundanceZebraAccessoryIssues({sundance_zebra_control:'Somfy Sonesse 30 RTS 24V DC',[key('somfy_charger')]:1,[key('somfy_solar')]:1})).toHaveLength(2);
  expect(sundanceZebraAccessoryIssues({sundance_zebra_control:somfy,[key('alpha_hub')]:1})).toHaveLength(1);
  expect(sundanceZebraControlPatch({fabric_color_id:'saved',[key('somfy_charger')]:1},'Cordless')).toEqual({fabric_color_id:'saved',sundance_zebra_control:'Cordless',sundance_zebra_chain:null});
 });
 it.each([-1,0.5,'invalid',Infinity])('rejects invalid quantity %s',quantity=>{
  expect(sundanceZebraAccessoryIssues({sundance_zebra_control:somfy,[key('situo_5')]:quantity})[0].explanation).toContain('whole number');
 });
 it('keeps contradictory Smoove and unverified Bond compatibility explicitly held',()=>{
  expect(sundanceZebraAccessoryIssues({sundance_zebra_control:somfy,[key('smoove_multi')]:1,[key('bond_bridge')]:1,[key('bond_sidekick')]:1})).toHaveLength(3);
  expect(sundanceZebraAccessoryIssues({sundance_zebra_control:somfy,[key('situo_5')]:1,[key('somfy_charger')]:1})).toEqual([]);
 });
});
