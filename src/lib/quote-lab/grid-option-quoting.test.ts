import { describe, expect, it } from 'vitest';
import type { SalesQuoteDesign, SalesQuoteLineItem } from '@mts/types/quote';
import { repriceExactQuoteBuilderForServerDate, type ExactQuoteBuilderRepriceInput } from './exact-backend';

function fixture(kind: 'roman' | 'onyx', width = kind === 'roman' ? 91 : 92, quantity = 1) {
 const line = {id:'line',quote_id:'quote',room_name:'Test room',product_type:kind === 'roman' ? 'Roman Shades':'Shutters',width_whole:width,width_fraction:'0',height_whole:kind === 'roman'?48:71,height_fraction:'0',quantity,sort_order:0,created_at:'2026-09-21T12:00:00Z'} as SalesQuoteLineItem;
 const roman = {supplier:'Norman',mount_type:'Inside Mount',shade_type:'Single',lift_system:'Cordless',valance:'No Valance',fabric:'F0183 - Milk | Lakeside',options_json:{quote_v2_backend:true,catalog_product_id:'roman',fabric_program_id:'roman_cordless_usa_price_group_2_pg2',fabric_color_collection:'Lakeside',fabric_color_code:'F0183',fabric_color_name:'Milk',fold_style:'Flat Fold with Batten Back',lining:'Translucent',seaming:'Vertical Seams',fabric_orientation:'Standard / Non-Railroaded',roman_mount_fit:'Flush Inside',poles:'None',side_by_side:'No',roman_shim_layers:'0'}};
 const onyx = {supplier:'Onyx',material:'Poly Composite',panel_config:width===92?'LLRR':'LR',louver_size:'3 1/2"',tilt_type:'H3 - Hidden Tiltrod In Stile',hinge_color:'Match',options_json:{quote_v2_backend:true,catalog_product_id:'onyx_shutters',catalog_program_id:'poly_composite',quote_lab_product_id:'onyx_shutters',quote_lab_program_id:'poly_composite',size_type:'W - Window Size',frame_type:'VZ Small',onyx_mount:'IM',frame_sides:'4',color:'101_White',astragal:'Yes',onyx_order_type:'Regular'}};
 const design = {id:'design',line_item_id:'line',variant:'A',product_type:line.product_type,unit_price:0,...(kind==='roman'?roman:onyx)} as unknown as SalesQuoteDesign;
 return {lines:[line],designs:[design],selectedVariantByLine:{line:'A'},applyCustomerCharges:true};
}
function run(input:ExactQuoteBuilderRepriceInput, date='2026-09-21') {
 const result = repriceExactQuoteBuilderForServerDate(input,date);
 if (!('backend' in result) || result.backend !== 'v2') throw new Error('Expected V2');
 return result;
}
describe('grid and priced-option quoting',()=>{
 it('prices the Roman grid without recess measurements and includes installation',()=>{
  const result=run(fixture('roman')).designs[0].result;
  expect(result.ok,JSON.stringify(result)).toBe(true);
  if(!result.ok)return;
  expect(result).toMatchObject({matchedWidth:96,matchedHeight:48,base:2008,unitPrice:2047,total:2047,customerCharges:{installationTotal:25,shippingTotal:14}});
 });
 it.each([[92,1,1590],[69,2,2458]])('prices Onyx %s with H3 exactly once and no fabrication measurements',(width,quantity,total)=>{
  const result=run(fixture('onyx',width,quantity)).designs[0].result;
  expect(result.ok,JSON.stringify(result)).toBe(true);
  if(!result.ok)return;
  expect(result.total).toBe(total);
  expect(result.surchargeLines.filter(line=>line.id==='poly_composite_h3_per_panel')).toHaveLength(1);
 });
 it('retains pre-policy restrictions for historical pricing',()=>{
  expect(run(fixture('roman'),'2026-09-20').designs[0].result.ok).toBe(false);
 });
 it('does not accept a fabric mapped to the wrong grid',()=>{
  const q=fixture('roman');q.designs[0].options_json={...q.designs[0].options_json,fabric_program_id:'roman_cordless_usa_price_group_1_pg1'};
  expect(run(q).designs[0].result.ok).toBe(false);
 });
 it('multiplies fixed Roman charges by quantity without discounting them',()=>{
  const q=fixture('roman',91,3);
  q.designs[0].options_json={...q.designs[0].options_json,discount_percent:10};
  const r=run(q).designs[0].result;
  expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)return;
  expect(r.customerCharges).toMatchObject({eligibleUnitCount:3,installationTotal:75,shippingTotal:42,total:117});
  expect(r.unitPrice).toBe(1846.2);expect(r.total).toBe(5538.6);
 });
 it('retains all four lines, physical quantities and customer snapshot totals',()=>{
  const cases=[fixture('roman'),fixture('onyx'),fixture('onyx',69,2),fixture('onyx',69,2)];
  const q={lines:[] as SalesQuoteLineItem[],designs:[] as SalesQuoteDesign[],selectedVariantByLine:{} as Record<string,string>,applyCustomerCharges:true};
  cases.forEach((f,i)=>{const id=`line${i}`;q.lines.push({...f.lines[0],id});q.designs.push({...f.designs[0],id:`design${i}`,line_item_id:id});q.selectedVariantByLine[id]='A';});
  const r=run(q);
  expect(r.total).toBe(8553);expect(r.customerQuote.total).toBe(8553);
  expect(r.customerQuote.lines).toHaveLength(4);
  expect(r.designs.map(d=>d.result.ok&&d.result.total)).toEqual([2047,1590,2458,2458]);
  expect(r.designs.map(d=>d.selection.quantity)).toEqual([1,1,2,2]);
  const persisted=JSON.parse(JSON.stringify(r.designs.map(d=>d.snapshot)));
  expect(persisted.map((d:{retail:{total:number}})=>d.retail.total)).toEqual([2047,1590,2458,2458]);
  expect(JSON.stringify(r.customerQuote)).not.toContain('wholesale');
 });
 it('names an actual unpriced H3 selection without inventing a zero',()=>{
  const q=fixture('onyx');q.designs[0].panel_config=null;
  const r=run(q).designs[0].result;
  expect(r.ok).toBe(false);if(r.ok)return;
  expect(JSON.stringify(r)).toContain('onyx.price.poly_h3_panel_count');
  expect(r).not.toHaveProperty('unitPrice');
 });

});
