import {describe,it,expect} from 'vitest';
import type {SelectionContext} from './core';
import {deriveNormanOrderRecords} from './norman-assemblies';
import {quoteV2CatalogVersionFor,QUOTE_V2_CATALOG_VERSION,isRecognizedQuoteV2Catalog} from './catalog';
import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import {prepareSalesQuoteV2PricingBatch} from '../crm/sales-quote-v2-price-save';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
const rule='perfectsheer.motorization.order_remote_required';
const selection=(network:number,remotes:number,automate=false):SelectionContext=>({manufacturerId:'Norman',productId:'perfectsheer',programId:'perfectsheer_perfectsheer_shades_light_filtering',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('perfectsheer','2026-09-20'),widthInches:36,heightInches:60,quantity:1,options:{},configuration:{fabric_color_code:'F1179',light_control:'Light Filtering',mount_type:'Outside Mount',valance:'Standard',lift_system:'Motorized',motor_type:automate?'Automate Home ARC Rechargeable Battery':'Norman Smart AC Adapter',remote_type:automate?'15-Channel Remote':'Basic Remote',motor_position:'Right',hub_required:false,perfectsheer_tube_diameter:2,perfectsheer_motor_network:network,perfectsheer_remote_quantity:remotes}});
const failures=(rows:{lineId:string;selection:SelectionContext}[])=>deriveNormanOrderRecords(rows).filter(i=>i.ruleId===rule);
describe('PerfectSheer physical motor-network controls',()=>{
 it.each([false,true])('does not borrow a control or prior order from another network (Automate=%s)',automate=>{
  const rows=[{lineId:'a',selection:selection(1,0,automate)},{lineId:'b',selection:selection(2,1,automate)}];
  expect(failures(rows)).toMatchObject([{selectedValues:{lineId:'a',network:1},source:{page:automate?76:43}}]);
  rows[1].selection.configuration={...rows[1].selection.configuration,existing_remote_work_order_number:'Different-network-WO'};
  expect(failures(rows)).toHaveLength(1);
  rows[1].selection.configuration={...rows[1].selection.configuration,perfectsheer_motor_network:1};
  expect(failures(rows)).toEqual([]);
  rows[1].selection.configuration={...rows[1].selection.configuration,perfectsheer_remote_quantity:0};
  expect(failures(rows)).toEqual([]);
  rows[1].selection.configuration={...rows[1].selection.configuration,existing_remote_work_order_number:null};
  expect(failures(rows)).toHaveLength(2);
  rows[0].selection.configuration={...rows[0].selection.configuration,existing_remote_work_order_number:'Network-1-WO'};
  expect(failures(rows)).toEqual([]);
  const reopened=JSON.parse(JSON.stringify(rows));expect(failures(reopened)).toEqual([]);expect(reopened).toEqual(rows);
 });
 it('does not borrow a different motor family and preserves old catalog snapshots',()=>{
  const rows=[{lineId:'a',selection:selection(1,0)},{lineId:'b',selection:selection(1,1,true)}];
  expect(failures(rows)).toHaveLength(1);
  rows[0].selection.catalogVersion=QUOTE_V2_CATALOG_VERSION+'-norman-perfectsheer-magnet-2026-09-20-r8';
  expect(isRecognizedQuoteV2Catalog('perfectsheer','2026-09-20',rows[0].selection.catalogVersion)).toBe(true);
  expect(failures(rows)).toEqual([]);
 });
 it('rebuilds network memberships on server save/reopen, rejects cross-network controls and retains pricing hold',()=>{
  const q={lines:[] as SalesQuoteLineItem[],designs:[] as SalesQuoteDesign[],selectedVariantByLine:{a:'A',b:'A'}};
  for(const [id,network,remotes] of [['a',1,0],['b',2,1]] as const){
   const s=selection(network,remotes),c=s.configuration;
   q.lines.push({id,quote_id:'internal',room_name:'Office',product_type:'Sheer Shades',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} as SalesQuoteLineItem);
   q.designs.push({id:id+'-A',line_item_id:id,variant:'A',product_type:'Sheer Shades',supplier:'Norman',unit_price:0,lift_system:c.lift_system,motor_type:c.motor_type,remote_type:c.remote_type,mount_type:c.mount_type,valance:'Standard',options_json:{...c,quote_v2_backend:true,quote_lab_product_id:s.productId,quote_lab_program_id:s.programId,norman_assembly_v1:{motorNetwork:{connectedLineIds:['forged']}}}} as unknown as SalesQuoteDesign);
  }
  const price=()=>{const r=repriceExactQuoteBuilderForServerDate(q,'2026-09-20');if(!('backend'in r)||r.backend!=='v2')throw Error('Expected V2');return r;};
  expect(price().designs[0].result.validationIssues.map(i=>i.ruleId)).toContain(rule);
  q.designs[1].options_json={...q.designs[1].options_json,perfectsheer_motor_network:1};
  const valid=price();expect(valid.designs.every(d=>!d.result.validationIssues.some(i=>i.ruleId===rule))).toBe(true);
  expect(valid.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({motorNetwork:{connectedLineIds:['a','b'],network:1}});
  valid.designs.forEach((d,i)=>q.designs[i].options_json=JSON.parse(JSON.stringify({...q.designs[i].options_json,...d.selection.configuration})));
  expect(price()).toEqual(valid);
  const saved=prepareSalesQuoteV2PricingBatch({lines:q.lines,selectedDesigns:q.designs,serverDate:'2026-09-20'});
  expect(saved.prepared.every(d=>d.priceStatus==='blocked')).toBe(true);
 });
});
