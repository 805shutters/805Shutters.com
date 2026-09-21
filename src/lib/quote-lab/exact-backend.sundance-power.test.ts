import {expect,it} from 'vitest';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {getProductColorOptions} from '@/lib/quote/product-color-options';
import {repriceExactQuoteBuilderForServerDate} from './exact-backend';

function quote(){
 const color=getProductColorOptions('sundance_roller')[0];
 const lines=[8,10].map((quantity,i)=>({id:`power-${i}`,quote_id:'verification',room_name:`Room ${i}`,product_type:'Roller Shades',width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0',quantity,sort_order:i,created_at:'2026-09-20T00:00:00Z'} as SalesQuoteLineItem));
 const designs=lines.map(l=>({id:`${l.id}-A`,line_item_id:l.id,variant:'A',product_type:'Roller Shades',supplier:'Sundance',mount_type:'Inside',unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:'sundance_roller',quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,sundance_shade_control:'Simphony 24V DC',sundance_shade_assembly:'Single',sundance_simphony_panel_id:'Panel 1',sundance_order_power_v1:{version:1,panels:[{totalMotors:1,sourceNetCharge:0}]}}} as unknown as SalesQuoteDesign));
 return {lines,designs,selectedVariantByLine:Object.fromEntries(lines.map(l=>[l.id,'A']))};
}
function price(q:ReturnType<typeof quote>){const result=repriceExactQuoteBuilderForServerDate(q,'2026-09-20');if(!('backend' in result)||result.backend!=='v2')throw new Error('Expected V2 backend');return result;}
it('rebuilds saved selected panel connections on the server while preserving the existing account-price hold',()=>{
 const q=quote();q.designs.push({...q.designs[0],id:'alternative',variant:'B'});
 const result=price(q);const selected=result.designs.filter(d=>d.designId!=='alternative');
 expect(selected[0].selection.configuration.sundance_order_power_v1).toMatchObject({version:1,panels:[{totalMotors:18,sourceNetCharge:800}]});
 expect(selected[1].selection.configuration.sundance_order_power_v1).toMatchObject({panels:[{totalMotors:18,sourceNetCharge:0}]});
 expect(selected.every(d=>!d.result.ok)).toBe(true);
 expect(result.designs.find(d=>d.designId==='alternative')!.selection.configuration.sundance_order_power_v1).toBeUndefined();
 const reopened=price(JSON.parse(JSON.stringify(q)));
 expect(reopened.designs.filter(d=>d.designId!=='alternative').map(d=>d.selection.configuration.sundance_order_power_v1)).toEqual(selected.map(d=>d.selection.configuration.sundance_order_power_v1));
});
it('assigns order capacity errors to every connected selected line rather than trusting saved client totals',()=>{
 const q=quote();q.lines[1].quantity=11;
 const result=price(q);
 for(const design of result.designs){expect(design.selection.configuration.sundance_order_power_v1).toBeUndefined();expect(design.result.validationIssues.map(i=>i.ruleId)).toContain('sundance.order_power.capacity');}
});
