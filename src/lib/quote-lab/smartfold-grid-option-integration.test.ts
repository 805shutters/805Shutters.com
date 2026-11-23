import {describe,it,expect} from 'vitest';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {repriceExactQuoteBuilderForServerDate} from './exact-backend';
import type {SelectionRecord} from '../quote-v2/core';

function quote(patch:SelectionRecord={},width=36,date='2026-09-21') {
 const line={id:'smartfold-line',quote_id:'quote',room_name:'Office',product_type:'SmartFold Shades',width_whole:width,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-21T12:00:00Z'} as SalesQuoteLineItem;
 const design={id:'smartfold-design',line_item_id:line.id,variant:'A',product_type:line.product_type,supplier:'Norman',mount_type:'Inside Mount',shade_type:'Single',lift_system:'PrecisionLift Cordless',valance:String(patch.valance??'No Valance'),fabric:'F1709',unit_price:0,options_json:{quote_v2_backend:true,catalog_product_id:'smartfold',fabric_program_id:'smartfold_smartfold_shades',catalog_program_id:'smartfold_smartfold_shades',fabric_color_code:'F1709',fold_size:6,smartfold_installation:'Back / Wall Mount with Raceway',smartfold_shim_layers:0,...patch}} as unknown as SalesQuoteDesign;
 const result=repriceExactQuoteBuilderForServerDate({lines:[line],designs:[design],selectedVariantByLine:{[line.id]:'A'},applyCustomerCharges:true},date);
 if(!('backend' in result)||result.backend!=='v2')throw new Error('Expected V2');
 return result;
}
describe('SmartFold quote-only backend price protection',()=>{
 it('prices an inside mount with missing depth, includes fees once, and retains order warning',()=>{
  const q=quote(),r=q.designs[0].result;
  expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)return;
  expect(r).toMatchObject({productStatus:'documented_limited',validationStatus:'valid',base:606,total:645,customerCharges:{installationTotal:25,shippingTotal:14,total:39}});
  expect(r.validationIssues).toContainEqual(expect.objectContaining({ruleId:'norman.smartfold.branch_verification',severity:'warning',explanation:expect.stringContaining('Before ordering:')}));
  expect(q.designs[0].snapshot?.retail.total).toBe(645);
 });
 it('retains the exact $16 premium hem charge once alongside fixed installation/shipping',()=>{
  const r=quote({premium_hem_bar:'Yes',smartfold_hem_color:'Brass'}).designs[0].result;
  expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)return;
  expect(r.total).toBe(661);
  expect(r.surchargeLines.filter(s=>s.id==='premium_hem_bar')).toMatchObject([{amount:16}]);
  expect(r.customerCharges?.total).toBe(39);
 });
 it.each(['Traditional','unpriced'])("does not turn %s hold-down into a price after mapping mounts",smartfold_hold_down=>{
  const q=quote({smartfold_hold_down}),r=q.designs[0].result;
  expect(r.ok).toBe(false);expect(r.productStatus).toBe('manual_quote_required');
  expect(r.validationIssues).toContainEqual(expect.objectContaining({ruleId:'norman.smartfold.quote_pricing_branch',severity:'hard_block'}));
  expect(q.designs[0].snapshot).toBeNull();
 });
 it('keeps an unverified spliced valance branch blocked despite inside mount warning conversion',()=>{
  // The fixture writes the selected valance to the authoritative design column.
  const r=quote({valance:'6-inch Fabric'},96).designs[0].result;
  expect(r.ok).toBe(false);
  expect(r.validationIssues).toContainEqual(expect.objectContaining({ruleId:'norman.smartfold.quote_pricing_branch',severity:'hard_block',explanation:expect.stringContaining('spliced valances')}));
 });
 it('keeps unchanged manual grid pricing available on the October motor revision date',()=>{
  const before=quote({},36,'2026-09-30').designs[0].result;
  const after=quote({},36,'2026-10-01').designs[0].result;
  expect(before.ok).toBe(true);expect(after.ok,JSON.stringify(after)).toBe(true);
  if(before.ok&&after.ok){expect(after.base).toBe(before.base);expect(after.total).toBe(before.total);}
 });
});
