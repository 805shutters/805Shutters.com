import {describe,it,expect} from 'vitest';
import type {SelectionContext} from './core';
import {deriveNormanOrderRecords} from './norman-assemblies';
import {quoteV2CatalogVersionFor,QUOTE_V2_CATALOG_VERSION,isRecognizedQuoteV2Catalog} from './catalog';
import {resolveNormanShadeMotorization} from './norman-shade-motorization';
import {perfectsheerHub} from './norman-perfectsheer-hub';
import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import {prepareSalesQuoteV2PricingBatch} from '../crm/sales-quote-v2-price-save';
import {customerConfigurationFromSelection,v2CustomerConfigurationOptions} from '../crm/sales-quote-v2-customer-configuration';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
const shade=(quantity=1,hub='Hub 1'):SelectionContext=>({manufacturerId:'Norman',productId:'perfectsheer',programId:'perfectsheer_perfectsheer_shades_light_filtering',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('perfectsheer','2026-09-20'),widthInches:36,heightInches:60,quantity,options:{},configuration:{fabric_color_code:'F1179',light_control:'Light Filtering',mount_type:'Outside Mount',valance:'Standard',lift_system:'Motorized',motor_type:'Automate Home ARC Rechargeable Battery',remote_type:'15-Channel Remote',motor_position:'Right',hub_required:true,perfectsheer_tube_diameter:2,perfectsheer_shared_hub_id:hub}});
const hubs=(s:SelectionContext)=>resolveNormanShadeMotorization(s)?.canonicalSelections?.filter(c=>c.role==='hub');
describe('PerfectSheer explicit Automate hub membership',()=>{
 it('counts physical motors through30, charges one owner once and rejects31',()=>{
  const rows=[{lineId:'z',selection:shade(20)},{lineId:'a',selection:shade(10,' HUB 1 ')}];
  expect(deriveNormanOrderRecords(rows)).toEqual([]);
  expect(perfectsheerHub(rows[0].selection)).toMatchObject({motorQuantity:30,capacity:30,connectedLineIds:['a','z'],chargeHub:false});
  expect(hubs(rows[0].selection)).toEqual([]);
  expect(hubs(rows[1].selection)).toEqual([{groupId:'automate_home',optionId:'hub',role:'hub',units:1,billingScope:'once_per_line'}]);
  rows[1].selection.quantity=11;
  expect(deriveNormanOrderRecords(rows).filter(i=>i.ruleId==='perfectsheer.motorization.hub_capacity')).toHaveLength(2);
  expect(resolveNormanShadeMotorization(rows[1].selection)?.issues.map(i=>i.ruleId)).toContain('perfectsheer.motorization.hub_allocation');
  rows[1].selection.configuration={...rows[1].selection.configuration,perfectsheer_shared_hub_id:'Hub 2'};
  expect(deriveNormanOrderRecords(rows)).toEqual([]);expect(hubs(rows[0].selection)).toHaveLength(1);expect(hubs(rows[1].selection)).toHaveLength(1);
 });
 it('rebuilds after member removal and ignores forged assembly ownership',()=>{
  const rows=[{lineId:'b',selection:shade(2)},{lineId:'a',selection:shade(1)}];deriveNormanOrderRecords(rows);
  rows[0].selection.configuration={...rows[0].selection.configuration,norman_assembly_v1:{sharedHub:{version:1,chargeHub:false,motorQuantity:999}}};
  expect(deriveNormanOrderRecords([rows[0]])).toEqual([]);
  expect(perfectsheerHub(rows[0].selection)).toMatchObject({ownerLineId:'b',motorQuantity:2,chargeHub:true,connectedLineIds:['b']});
  const reopened=JSON.parse(JSON.stringify(rows[0]));deriveNormanOrderRecords([reopened]);expect(reopened).toEqual(rows[0]);
  rows[0].selection.configuration={...rows[0].selection.configuration,hub_required:false};deriveNormanOrderRecords([rows[0]]);expect(perfectsheerHub(rows[0].selection)).toBeNull();expect(hubs(rows[0].selection)).toEqual([]);
 });
 it('requires explicit identity, rejects incompatible power, and preserves previous catalogs',()=>{
  for(const id of ['', ' ', 'x'.repeat(81)])expect(deriveNormanOrderRecords([{lineId:'a',selection:shade(1,id)}]).map(i=>i.ruleId)).toContain('perfectsheer.motorization.hub_id');
  const s=shade();s.configuration={...s.configuration,motor_type:'Norman Smart AC Adapter',remote_type:'Basic Remote'};
  expect(deriveNormanOrderRecords([{lineId:'a',selection:s}]).map(i=>i.ruleId)).toContain('perfectsheer.motorization.hub_compatibility');
  const old=shade(3,'');old.catalogVersion=QUOTE_V2_CATALOG_VERSION+'-norman-perfectsheer-networks-2026-09-20-r9';
  expect(isRecognizedQuoteV2Catalog(old.productId,old.catalogAsOf,old.catalogVersion)).toBe(true);
  expect(deriveNormanOrderRecords([{lineId:'old',selection:old}])).toEqual([]);
  expect(hubs(old)).toEqual([{groupId:'automate_home',optionId:'hub',role:'hub',units:1}]);
 });
 it('persists source membership and one $483 retail component through actual backend while retaining customer hold',()=>{
  const q={lines:[] as SalesQuoteLineItem[],designs:[] as SalesQuoteDesign[],selectedVariantByLine:{a:'A',b:'A'}};
  for(const id of ['a','b']){
   const s=shade(2),c=s.configuration;
   q.lines.push({id,quote_id:'internal',room_name:'Office',product_type:'Sheer Shades',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:2,sort_order:0,created_at:'2026-09-20T00:00:00Z'} as SalesQuoteLineItem);
   q.designs.push({id:id+'-A',line_item_id:id,variant:'A',product_type:'Sheer Shades',supplier:'Norman',unit_price:0,lift_system:c.lift_system,motor_type:c.motor_type,remote_type:c.remote_type,mount_type:c.mount_type,valance:'Standard',options_json:{...c,quote_v2_backend:true,quote_lab_product_id:s.productId,quote_lab_program_id:s.programId}} as unknown as SalesQuoteDesign);
  }
  const price=()=>{const r=repriceExactQuoteBuilderForServerDate(q,'2026-09-20');if(!('backend'in r)||r.backend!=='v2')throw Error('Expected V2');return r;};
  const saved=price();for(const d of saved.designs)expect(d.result.validationIssues.filter(i=>i.severity==='hard_block')).toEqual([]);
  const components=saved.designs.flatMap(d=>d.result.ok?d.result.components:[]).filter(c=>c.priceLineId==='motor:automate_home:hub');
  expect(components).toHaveLength(1);expect(components[0].catalogAmount).toBe(483);
  expect(perfectsheerHub(saved.designs[0].selection)).toMatchObject({motorQuantity:4,chargeHub:true});
  saved.designs.forEach((d,i)=>q.designs[i].options_json=JSON.parse(JSON.stringify({...q.designs[i].options_json,...d.selection.configuration})));
  expect(price()).toEqual(saved);
  const batch=prepareSalesQuoteV2PricingBatch({lines:q.lines,selectedDesigns:q.designs,serverDate:'2026-09-20'});expect(batch.prepared.every(d=>d.priceStatus==='blocked')).toBe(true);
  expect(v2CustomerConfigurationOptions(customerConfigurationFromSelection(saved.designs[0].selection))).toContain('Shared Automate Hub: Hub 1');
 });
});
