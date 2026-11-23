import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {SelectionContext} from './core';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {quoteV2CatalogVersionFor} from './catalog';
import {deriveSharedAutomateHubs,sharedAutomateHub,sharedAutomateMotorCount} from './norman-shared-automate-hub';
import {rollerMotorizationForSelection} from './norman-roller-panel';
import {resolveNormanShadeMotorization} from './norman-shade-motorization';
import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import {getProductColorOptions} from '../quote/product-color-options';
import {NormanSharedAutomateHubOptions} from '@/components/crm/NormanSharedAutomateHubOptions';
const shade=(productId='perfectsheer',quantity=1):SelectionContext=>({manufacturerId:'Norman',productId,programId:'test',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor(productId,'2026-09-20'),widthInches:36,heightInches:60,quantity,options:{},configuration:{lift_system:'Motorized',motor_type:'Automate Home ARC Rechargeable Battery',roller_power_configuration:'Automate ARC Rechargeable Battery',hub_required:true,shared_automate_hub_id:'Hub 1',roller_application:'Single',shade_type:'Single'}});
describe('source p76 cross-product Automate hub allocation',()=>{
 it('joins the three supported products, counts dual/common motors and enforces30/31',()=>{
  const r=shade('roller',5);r.configuration={...r.configuration,roller_application:'Dual Roller'};
  const m=shade('roman',5);m.configuration={...m.configuration,shade_type:'Common Valance'};
  const p=shade('perfectsheer',10);p.configuration={...p.configuration,shared_automate_hub_id:' HUB 1 '};
  const rows=[{lineId:'z',selection:r},{lineId:'a',selection:m},{lineId:'b',selection:p}];
  expect(rows.map(x=>sharedAutomateMotorCount(x.selection))).toEqual([10,10,10]);
  expect(deriveSharedAutomateHubs(rows)).toEqual([]);
  expect(sharedAutomateHub(m)).toMatchObject({motorQuantity:30,chargeHub:true,networkScope:'explicit_hub_id',connectedLineIds:['a','b','z'],connectedProducts:['perfectsheer','roller','roman']});
  expect(sharedAutomateHub(r)?.chargeHub).toBe(false);
  p.quantity=11;expect(deriveSharedAutomateHubs(rows)).toHaveLength(3);expect(sharedAutomateHub(m)?.valid).toBe(false);
  p.configuration={...p.configuration,shared_automate_hub_id:'Hub 2'};expect(deriveSharedAutomateHubs(rows)).toEqual([]);expect(sharedAutomateHub(p)?.chargeHub).toBe(true);
 });
 it('counts coupled Roller drives instead of assuming one motor per component',()=>{
  const r=shade('roller',3);Object.assign(r.configuration,{roller_application:'Coupled Shades',coupling_arrangement:'Standard Coupled',roller_coupling_count:3});
  expect(sharedAutomateMotorCount(r)).toBe(6);
 });
 it('rejects incompatible motors and rebuilds ownership after removal and reopen',()=>{
  const a=shade('roller'),b=shade('roman');const rows=[{lineId:'a',selection:a},{lineId:'b',selection:b}];
  deriveSharedAutomateHubs(rows);a.configuration={...a.configuration,roller_power_configuration:'Norman Smart AC Adapter'};
  expect(deriveSharedAutomateHubs(rows).map(x=>x.ruleId)).toContain('roller.motorization.hub_compatibility');
  expect(sharedAutomateHub(a)).toBeNull();expect(sharedAutomateHub(b)?.chargeHub).toBe(true);
  b.configuration={...b.configuration,norman_assembly_v1:{sharedHub:{version:1,hubId:'hub 1',motorQuantity:999,chargeHub:false}}};
  deriveSharedAutomateHubs([rows[1]]);expect(sharedAutomateHub(b)).toMatchObject({motorQuantity:1,ownerLineId:'b',chargeHub:true});
  const reopened=JSON.parse(JSON.stringify(rows[1]));deriveSharedAutomateHubs([reopened]);expect(reopened).toEqual(rows[1]);
 });
 it('preserves historical unassociated per-line hub billing and exposes explicit opt-in',()=>{
  const r=shade('roller');r.configuration={...r.configuration,shared_automate_hub_id:null};
  const before=rollerMotorizationForSelection(r);expect(deriveSharedAutomateHubs([{lineId:'r',selection:r}])).toEqual([]);expect(rollerMotorizationForSelection(r)).toEqual(before);
  const m=shade('roman');Object.assign(m.configuration,{motor_type:'Automate ARC Rechargeable Battery',remote_type:'15 Channel Remote',motor_position:'Right'});m.configuration={...m.configuration,shared_automate_hub_id:null};
  expect(resolveNormanShadeMotorization(m)?.canonicalSelections?.filter(x=>x.role==='hub')).toEqual([{groupId:'automate_home',optionId:'hub',role:'hub',units:1}]);
  const html=renderToStaticMarkup(createElement(NormanSharedAutomateHubOptions,{productId:'roller',design:{lift_system:'Motorized',options_json:r.configuration} as SalesQuoteDesign,onUpdateFields:()=>{}}));
  expect(html).toContain('Shared Automate hub');expect(html).toContain('Use existing per-line hub selection');
 });
 it('prices one $483 hub across Roller/Roman/PerfectSheer through saved server records',()=>{
  const color=getProductColorOptions('roman').find(c=>c.colorCode==='F0031')!;
  const configs=[
   {product:'roller',type:'Roller Shades',program:'roller_cordless_fabric_price_group_1_pg1',c:{fabric_color_collection:'Amelia',fabric_color_code:'F1484',fabric_color_name:'Mist Gray',roller_application:'Single',roller_tube:'1 3/4" (43mm) Tube',roller_top_treatment:'No Top Treatment',roller_power_configuration:'Automate Low Voltage DC Motor',roller_region_scope:'ca_ma',dc_power_supply:'DC Distribution Panel',shared_power_panel_id:'Panel 1',motorization_selections:[{groupId:'automate_home',optionId:'low_voltage_dc_motor',role:'base_motor',units:1}],remote_type:'15 Channel Remote',motor_type:'Low Voltage DC Motor',valance:'No Valance'}},
   {product:'roman',type:'Roman Shades',program:color.programId,c:{fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fold_style:'Flat Fold without Seams',fabric_orientation:'Standard',seaming:'No',lining:'Translucent',shade_type:'Single',motor_type:'Automate 12V DC Low Voltage',remote_type:'15 Channel Remote',dc_power_supply:'DC Distribution Panel',shared_power_panel_id:'Panel 1',valance:'None'}},
   {product:'perfectsheer',type:'Sheer Shades',program:'perfectsheer_perfectsheer_shades_light_filtering',c:{fabric_color_code:'F1179',light_control:'Light Filtering',valance:'Standard',motor_type:'Automate Home ARC Rechargeable Battery',remote_type:'15-Channel Remote',perfectsheer_tube_diameter:2}}
  ];
  const q={lines:[] as SalesQuoteLineItem[],designs:[] as SalesQuoteDesign[],selectedVariantByLine:{} as Record<string,string>};
  configs.forEach((x,i)=>{
   const id=String(i),c={...x.c,lift_system:'Motorized',mount_type:'Outside Mount',motor_position:'Right',hub_required:true,shared_automate_hub_id:'Hub 1',shipping_region:'continental_us'};
   q.lines.push({id,quote_id:'internal',room_name:'Office',product_type:x.type,width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:2,sort_order:i,created_at:'2026-09-20T00:00:00Z'} as SalesQuoteLineItem);
   q.designs.push({id:id+'-A',line_item_id:id,variant:'A',product_type:x.type,supplier:'Norman',unit_price:0,...c,options_json:{...c,quote_v2_backend:true,quote_lab_product_id:x.product,quote_lab_program_id:x.program}} as unknown as SalesQuoteDesign);q.selectedVariantByLine[id]='A';
  });
  const run=()=>{const r=repriceExactQuoteBuilderForServerDate(q,'2026-09-20');if(!('backend'in r)||r.backend!=='v2')throw Error('Expected V2');return r;};
  const first=run();for(const d of first.designs)expect(d.result.validationIssues.filter(i=>i.severity==='hard_block'),JSON.stringify(d.result)).toEqual([]);
  const hubs=first.designs.flatMap(d=>d.result.ok?d.result.components:[]).filter(c=>c.priceLineId==='motor:automate_home:hub');expect(hubs).toHaveLength(1);expect(hubs[0].catalogAmount).toBe(483);
  first.designs.forEach((d,i)=>{expect(sharedAutomateHub(d.selection)?.motorQuantity).toBe(6);q.designs[i].options_json=JSON.parse(JSON.stringify({...q.designs[i].options_json,...d.selection.configuration}));});
  expect(run()).toEqual(first);
  q.lines[2].quantity=27;
  const over=run();for(const d of over.designs){expect(d.result.validationIssues.map(i=>i.ruleId)).toContain(`${d.selection.productId}.motorization.hub_capacity`);expect(d.snapshot).toBeNull();}
  expect(over.sendability.sendable).toBe(false);q.lines[2].quantity=2;
  expect(run()).toEqual(first);
  // Ownership moves to Roman after removing the Roller; original stored source record is untouched.
  const original=JSON.stringify(first);q.lines.shift();q.designs.shift();const removed=run();expect(sharedAutomateHub(removed.designs[0].selection)).toMatchObject({chargeHub:true,motorQuantity:4});expect(JSON.stringify(first)).toBe(original);
  const remaining=removed.designs.flatMap(d=>d.result.ok?d.result.components:[]).filter(c=>c.priceLineId==='motor:automate_home:hub');expect(remaining).toHaveLength(1);expect(remaining[0].catalogAmount).toBe(483);
  expect(first.sendability.sendable).toBe(false); // PerfectSheer source restriction hold remains.
 });
});
