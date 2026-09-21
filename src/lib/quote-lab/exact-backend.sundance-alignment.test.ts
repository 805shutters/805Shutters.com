import {expect,it} from 'vitest';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {getProductColorOptions} from '@/lib/quote/product-color-options';
import {repriceExactQuoteBuilderForServerDate} from './exact-backend';

function quote(){
 const color=getProductColorOptions('sundance_zebra')[0];
 const lines=[1,1].map((quantity,i)=>({id:`power-${i}`,quote_id:'verification',room_name:`Room ${i}`,product_type:'Roller Shades',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity,sort_order:i,created_at:'2026-09-20T00:00:00Z'} as SalesQuoteLineItem));
 const designs=lines.map(l=>({id:`${l.id}-A`,line_item_id:l.id,variant:'A',product_type:'Roller Shades',supplier:'Sundance',mount_type:'Inside',unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:'sundance_zebra',quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,sundance_zebra_assembly:'Single',sundance_zebra_alignment_group:'Living',sundance_order_alignment_v1:{version:1,groups:[{orderedTogetherConfirmed:true}]}}} as unknown as SalesQuoteDesign));
 return {lines,designs,selectedVariantByLine:Object.fromEntries(lines.map(l=>[l.id,'A']))};
}
function price(q:ReturnType<typeof quote>){const result=repriceExactQuoteBuilderForServerDate(q,'2026-09-20');if(!('backend' in result)||result.backend!=='v2')throw new Error('Expected V2 backend');return result;}
it('derives only selected matching shades and never accepts client factory-order confirmation',()=>{
 const q=quote();q.designs.push({...q.designs[0],id:'alternative',variant:'B'});
 const result=price(q);
 expect(result.designs.find(d=>d.designId==='alternative')!.selection.configuration.sundance_order_alignment_v1).toBeUndefined();
 for(const d of result.designs.filter(d=>d.designId!=='alternative'))expect(d.selection.configuration.sundance_order_alignment_v1).toMatchObject({groups:[{shadeQuantity:2,orderedTogetherConfirmed:false}]});
 q.lines[1].width_whole=37;const invalid=price(q);
 for(const d of invalid.designs.filter(d=>d.designId!=='alternative')){expect(d.selection.configuration.sundance_order_alignment_v1).toBeUndefined();expect(d.result.validationIssues.some(i=>i.ruleId==='sundance.order_alignment.group')).toBe(true);}
});
