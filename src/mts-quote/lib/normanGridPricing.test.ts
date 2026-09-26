import { describe, it, expect } from 'vitest';
import type { SalesQuote, SalesQuoteDesign, SalesQuoteLineItem } from '@mts/types/quote';
import { isNormanGridDesign, legacyNormanPricingSignature } from './normanGridPricing';
const quote={id:'quote',status:'draft',quote_v2_backend:false,sent_at:null} as SalesQuote;
const line={id:'line',product_type:'Roller Shades',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,selected_design_id:'norman'} as SalesQuoteLineItem;
const design={id:'norman',line_item_id:'line',variant:'A',supplier:'Norman',fabric:'Amelia',lift_system:'Cordless',unit_price:0,options_json:{catalog_product_id:'roller',fabric_color_code:'F1484'}} as unknown as SalesQuoteDesign;
const signature=(q=quote,l=[line],d=[design])=>legacyNormanPricingSignature(q,l,d);
describe('Norman automatic grid request inputs',()=>{
 it('requests an initial unpriced or existing automatic draft without requiring mounting measurements',()=>{
  expect(signature()).not.toBeNull();expect(signature(quote,[line],[{...design,unit_price:500}])).toBe(signature());
  expect(isNormanGridDesign({...design,supplier:'Onyx'})).toBe(false);
  expect(isNormanGridDesign({...design,supplier:'Sundance'})).toBe(true);
  expect(signature(quote,[line],[{...design,supplier:'Sundance'}])).not.toBeNull();
  expect(isNormanGridDesign({...design,supplier:null})).toBe(false);
 });
 it('never prices protected quotes or owner-priced and historical selections',()=>{
  for(const q of [{...quote,quote_v2_backend:true},{...quote,status:'sent' as const},{...quote,sent_at:'2026-09-21T12:00:00Z'},{...quote,signed_at:'2026-09-21T12:00:00Z'}])expect(signature(q)).toBeNull();
  for(const patch of [{manual_price_override:true},{custom_mode:true},{custom_pricing_mode:true},{sent_price_snapshot:{unitPrice:500}}])expect(signature(quote,[line],[{...design,options_json:{...design.options_json,...patch}}])).toBeNull();
 });
 it('reruns on dimensions, quantities, fabric, operating system, priced options or selected design changes',()=>{
  for(const change of [{width_whole:37},{width_fraction:'1/8'},{height_whole:61},{height_fraction:'1/16'},{quantity:3}])expect(signature(quote,[{...line,...change}])).not.toBe(signature());
  for(const change of [{fabric:'Breeze'},{lift_system:'Motorized'},{options_json:{...design.options_json,discount_percent:10}},{options_json:{...design.options_json,magnetic_hold_down:true}}])expect(signature(quote,[line],[{...design,...change}])).not.toBe(signature());
  const alt={...design,id:'alternate',variant:'B',fabric:'Tuscany'};
  expect(signature(quote,[{...line,selected_design_id:alt.id}],[design,alt])).not.toBe(signature());
  expect(signature(quote,[{...line,selected_design_id:'missing'}])).toBeNull();
 });
 it('does not loop when saved server results refresh or unrelated manufacturer details change',()=>{
  const refreshed={...design,unit_price:591,quote_v2_price_status:'authoritative' as const,options_json:{...design.options_json,
   norman_grid_pricing:true,quote_v2_backend:false,quote_v2_catalog_as_of:'2026-09-22',quote_v2_catalog_version:'current',
   authoritative_price_status:'authoritative',authoritative_price_error:null,authoritative_price_breakdown:{total:591},authoritative_cost_breakdown:{total:171},
   authoritative_once_total:.01,authoritative_v2_snapshot:{version:1},priced_catalog_version:'current',priced_selection_fingerprint:'abc',
   pricing_method:'grid',pricing_source:'Norman',base_price:552,surcharge_total:0,customer_charges:{total:39},discount_amount:0,
  }};
  expect(signature(quote,[line],[refreshed])).toBe(signature());
  const otherLine={...line,id:'other',selected_design_id:'onyx'};
  const other={...design,id:'onyx',line_item_id:'other',supplier:'Onyx',unit_price:888};
  expect(signature(quote,[line,otherLine],[design,other])).toBe(signature());
  expect(signature(quote,[line,{...otherLine,width_whole:99}],[design,{...other,fabric:'changed'}])).toBe(signature());
 });
});
