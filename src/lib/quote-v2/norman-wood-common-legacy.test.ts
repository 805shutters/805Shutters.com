import {describe,it,expect} from 'vitest';
import {repriceExactQuoteBuilderForServerDate} from '../quote-lab/exact-backend';
import {getProductColorOptions} from '@/lib/quote/product-color-options';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
const color=getProductColorOptions('wood_blinds').find(c=>c.colorCode==='ND001')!;
function fixture(){
 const lines=['left','right'].map((id,i)=>({id,quote_id:'internal',room_name:'Office',product_type:'Wood Blinds',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:i,created_at:'2026-09-20T00:00:00Z'} as SalesQuoteLineItem));
 const designs=lines.map((line,i)=>({id:line.id+'A',line_item_id:line.id,variant:'A',product_type:'Wood Blinds',supplier:'Norman',mount_type:'Outside Mount',valance:'Linear',slat_size:'2"',unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:'wood_blinds',quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_code:color.colorCode,application:'Common Valance',wood_common_group:'1',wood_common_position:i+1,wood_common_gap_after:i===0?1:0,[`wood_cutout_${i===0?'left':'right'}_type`]:'Corner (Bottom)',[`wood_cutout_${i===0?'left':'right'}_width`]:1,[`wood_cutout_${i===0?'left':'right'}_top`]:20}} as unknown as SalesQuoteDesign));
 return {lines,designs,selectedVariantByLine:{left:'A',right:'A'}};
}
const price=(q:ReturnType<typeof fixture>)=>{const r=repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(q)),'2026-09-20');if(!('backend'in r)||r.backend!=='v2')throw Error('Expected V2');return r;};
describe('saved legacy common-valance labels with wood cut-outs',()=>{
 it('rebuilds exact outer member positions without applying the pre-September19 blanket guard',()=>{
  const q=fixture(),r=price(q);
  for(const d of r.designs){expect(d.result.validationIssues.filter(i=>/cutout_common|assembly|cutout_location/.test(i.ruleId))).toEqual([]);expect(d.selection.configuration.wood_common_valance_v1).toMatchObject({lineIds:['left','right'],orderedWidths:[36,36]});}
  expect(price(q)).toEqual(r);
 });
 it('rejects interior cut-outs and a legacy label without a real group',()=>{
  const q=fixture();q.designs[0].options_json={...q.designs[0].options_json,wood_cutout_right_type:'Corner (Bottom)',wood_cutout_right_width:1,wood_cutout_right_top:20};
  expect(price(q).designs.flatMap(d=>d.result.validationIssues).some(i=>i.ruleId.endsWith('common_cutout_location'))).toBe(true);
  q.designs=q.designs.map(d=>({...d,options_json:{...d.options_json,wood_common_group:null,wood_common_valance_v1:{lineIds:['left','right'],orderedWidths:[36,36]}}}));
  expect(price(q).designs.every(d=>d.result.validationIssues.some(i=>i.ruleId==='norman.wood_blinds.assembly'))).toBe(true);
 });
});
