import {expect,it} from 'vitest';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {getProductColorOptions} from '@/lib/quote/product-color-options';
import {repriceExactQuoteBuilderForServerDate} from './exact-backend';
function quote(){
 const color=getProductColorOptions('sundance_roller')[0];
 const lines=[2,3].map((quantity,i)=>({id:`accessory-${i}`,quote_id:'verification',room_name:`Room ${i}`,product_type:'Roller Shades',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity,sort_order:i,created_at:'2026-09-20T00:00:00Z'} as SalesQuoteLineItem));
 const designs=lines.map(l=>({id:`${l.id}-A`,line_item_id:l.id,variant:'A',product_type:'Roller Shades',supplier:'Sundance',mount_type:'Inside',unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:'sundance_roller',quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,sundance_shade_control:'Simphony 24V DC',sundance_shade_assembly:'Single',sundance_shared_accessories_v1:{version:1,assignments:[{deviceId:'Office remote',targetId:'line',accessoryKey:'simphony_remote'}]},sundance_order_accessories_v1:{version:1,devices:[{totalMotors:1,sourceCharge:0}]}}} as unknown as SalesQuoteDesign));
 return {lines,designs,selectedVariantByLine:Object.fromEntries(lines.map(l=>[l.id,'A']))};
}
function price(q:ReturnType<typeof quote>){const result=repriceExactQuoteBuilderForServerDate(q,'2026-09-20');if(!('backend' in result)||result.backend!=='v2')throw new Error('Expected V2 backend');return result;}
it('rebuilds selected shared accessories once and clears forged records on unselected variants without bypassing account pricing',()=>{
 const q=quote();q.designs.push({...q.designs[0],id:'alternative',variant:'B'});
 const result=price(q),selected=result.designs.filter(d=>d.designId!=='alternative');
 expect(selected[0].selection.configuration.sundance_order_accessories_v1).toMatchObject({version:1,devices:[{totalMotors:5,sourceCharge:90,sourceBasis:'net',customerPriceEligible:false}]});
 expect(selected[1].selection.configuration.sundance_order_accessories_v1).toMatchObject({devices:[{totalMotors:5,sourceCharge:0}]});
 expect(selected.every(d=>!d.result.ok)).toBe(true);expect(result.designs.find(d=>d.designId==='alternative')!.selection.configuration.sundance_order_accessories_v1).toBeUndefined();
 expect(price(JSON.parse(JSON.stringify(q))).designs.map(d=>d.selection.configuration.sundance_order_accessories_v1)).toEqual(result.designs.map(d=>d.selection.configuration.sundance_order_accessories_v1));
});
it('assigns a duplicate connection error to all affected selected designs and does not undercount remaining motors',()=>{
 const q=quote();q.designs[1].options_json={...q.designs[1].options_json,sundance_shade_accessory_simphony_remote_qty:1};
 const result=price(q);for(const d of result.designs){expect(d.selection.configuration.sundance_order_accessories_v1).toBeUndefined();expect(d.result.validationIssues.some(i=>i.ruleId.startsWith('sundance.order_accessory.'))).toBe(true);}
});
