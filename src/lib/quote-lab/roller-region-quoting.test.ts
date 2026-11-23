import { describe, expect, it } from 'vitest';
import type { SalesQuoteDesign, SalesQuoteLineItem } from '@mts/types/quote';
import { validateRollerMatrix } from '@/lib/quote-v2/roller-matrix';
import { prepareSalesQuoteV2PricingBatch } from '@/lib/crm/sales-quote-v2-price-save';

function fixture(width=101,height=88,quantity=1,options:Record<string,unknown>={}) {
  const line={id:'line',quote_id:'quote',room_name:'Synthetic roller room',product_type:'Roller Shades',width_whole:width,width_fraction:'0',height_whole:height,height_fraction:'0',quantity,sort_order:0,selected_design_id:'design',created_at:'2026-09-21T00:00:00Z'} as SalesQuoteLineItem;
  const design={id:'design',line_item_id:'line',variant:'A',product_type:'Roller Shades',supplier:'Norman',mount_type:'Outside Mount',shade_type:'Single Shade',lift_system:'Motorized',valance:'No Valance',fabric:'NA400 (3%)',motor_type:'Motor',remote_type:null,unit_price:0,
    options_json:{quote_v2_backend:true,catalog_product_id:'roller',fabric_program_id:'roller_cordless_solar_screen_price_group_1_pg1',fabric_color_collection:'NA400 (3%)',fabric_color_code:'F0384',fabric_color_name:'Charcoal',hem_bar:'Fabric Covered',surcharges:[],tube_class:'2" (52mm) Tube',roller_application:'Single Shade',power_configuration:'Norman Smart Rechargeable Battery with Charging Wand & AC Adapter Charger',top_treatment_class:'No Top Treatment',motorization_selections:[{role:'base_motor',units:1,groupId:'smart_motorization',optionId:'motor'}],...options}} as unknown as SalesQuoteDesign;
  return {lines:[line],selectedDesigns:[design],serverDate:'2026-09-21'};
}
function price(input=fixture()) { return prepareSalesQuoteV2PricingBatch(input); }

describe('regional Roller codes do not suppress the shared retail grid',()=>{
  it.each([[101,88,1],[72,88,2],[99,85,1]])('prices and prepares saved %sx%s qty%s without selecting a region',(w,h,q)=>{
    const input=fixture(w,h,q), before=JSON.stringify(input);
    const result=price(input);
    expect(result.prepared[0].priceStatus,JSON.stringify(result.prepared[0].rpcResult.validationSnapshot)).toBe('authoritative');
    const unscoped=result.repriced.designs[0].result;
    if(!unscoped.ok)throw Error('Expected retail');
    for(const region of ['ca_ma','other_regions']) {
      const scoped=price(fixture(w,h,q,{roller_region_scope:region})).repriced.designs[0].result;
      expect(scoped.ok).toBe(true);
      if(scoped.ok)expect(unscoped.total).toBe(scoped.total);
    }
    expect(unscoped.customerCharges).toMatchObject({installationTotal:25*q,shippingTotal:14*q});
    expect(unscoped.validationIssues).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:'roller.matrix.region_scope_required',severity:'warning'})]));
    expect(result.prepared[0].rpcResult.selection).toMatchObject({configuration:expect.not.objectContaining({roller_region_scope:expect.any(String)})});
    expect(JSON.stringify(input)).toBe(before);
    expect(unscoped).toMatchObject({base:w===72?690:941,unitPrice:w===72?1211:1462,total:w===72?2422:1462});
    expect(unscoped.surchargeLines).toEqual([expect.objectContaining({id:'motor:smart_motorization:motor',amount:482})]);
    if(w!==72) {
      expect(unscoped.validationIssues).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:'roller.matrix.maxAreaSqft',severity:'warning'})]));
      // The source restriction remains strict when inspected for manufacturing.
      expect(validateRollerMatrix(result.repriced.designs[0].selection)).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:'roller.matrix.maxAreaSqft',severity:'hard_block'})]));
    }
  });
  it('preserves pre-policy region requirements',()=>{
    const result=price({...fixture(),serverDate:'2026-09-20'});
    expect(result.prepared[0].priceStatus).toBe('blocked');
  });
  it.each([{fabric_program_id:'roller_cordless_fabric_price_group_2_pg2'},{fabric_color_code:'NOT-A-COLOR'},{roller_region_scope:'continental_us'}])('retains actual identity blocks for %j',options=>{
    expect(price(fixture(101,88,1,options)).prepared[0].priceStatus).toBe('blocked');
  });
  it('retains unavailable size cells and regional matrix limits',()=>{
    expect(price(fixture(200,88)).prepared[0].priceStatus).not.toBe('authoritative');
    expect(price(fixture(101,500)).prepared[0].priceStatus).not.toBe('authoritative');
  });
});
