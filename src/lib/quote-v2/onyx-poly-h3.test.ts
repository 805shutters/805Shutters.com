import { describe, expect, it } from 'vitest';
import { getProduct, findProductSurcharge } from '../quote/catalog';
import { priceDesign } from '../quote/pricing';
import type { SelectionContext } from './core';
import { ONYX_POLY_H3_SURCHARGE_ID as id, onyxPolyH3, withOnyxPolyH3Surcharges } from './onyx-poly-h3';
const selection = (layout='LLRR', programId='poly_composite'): SelectionContext => ({
  manufacturerId:'Onyx',productId:'onyx_shutters',programId,catalogAsOf:'2026-09-21',catalogVersion:'test',
  widthInches:92,heightInches:71,quantity:1,options:{},configuration:{tilt_type:'hidden',tilt_source_code:'H3 - Hidden Tiltrod In Stile',panel_configuration:layout},
});
describe('existing Poly Composite H3 owner selling policy',()=>{
  it.each([['LLRR',4,40],['LR',2,20]] as const)('charges %s exactly %s panels', (layout,count,amount)=>{
    const s=selection(layout), options=withOnyxPolyH3Surcharges(s,[{id:'hidden_tilt_rod',units:99},{id,units:99}]);
    expect(options).toEqual([{id,units:count}]);expect(onyxPolyH3(s)?.issues).toEqual([]);
    const result=priceDesign({productId:s.productId,programId:s.programId!,widthInches:92,heightInches:71,quantity:1,surcharges:options});
    expect(result.ok).toBe(true);if(!result.ok)return;
    expect(result.surchargeLines).toMatchObject([{id,amount}]);expect(result.surchargeLines[0].wholesaleAmount).toBeUndefined();
    expect(result.wholesaleUnitPrice).toBeNull();expect(result.wholesaleTotal).toBeNull();
  });
  it('matches owner policy totals without multiplying the panel count by line quantity twice',()=>{
    for(const [width,height,quantity,layout,total] of [[100,72,1,'LLRR',1590],[78,72,2,'LR',2458]] as const){
      // Explicit billable footprints of 50 and 39 square feet. Parent integration tests
      // cover the real 92×71 / 69×71 opening-to-frame conversions.
      const s=selection(layout);const r=priceDesign({productId:s.productId,programId:'poly_composite',widthInches:width,heightInches:height,quantity,surcharges:withOnyxPolyH3Surcharges(s,[])});
      expect(r.ok).toBe(true);if(r.ok)expect(r.total).toBe(total);
    }
  });
  it.each(['','Select','Double Hung','2','LLRR?'])('holds ambiguous/missing panel count %j',layout=>{
    const result=onyxPolyH3(selection(layout));expect(result?.selections).toEqual([]);expect(result?.issues[0].ruleId).toBe('onyx.price.poly_h3_panel_count');
  });
  it('does not assign the owner price to other materials, H1/H2, or generic hidden tilt',()=>{
    for(const program of ['vinyl','onyx_us_made_vinyl','painted_basswood'])expect(onyxPolyH3(selection('LR',program))).toBeNull();
    for(const tilt of ['H1','H2','hidden','Hidden Tilt']){const s=selection();s.configuration={...s.configuration,tilt_source_code:tilt};expect(onyxPolyH3(s)).toBeNull();}
    const old=findProductSurcharge(getProduct('onyx_shutters')!,'hidden_tilt_rod');expect(old?.value).toBeNull();expect(old?.dealerNetValue).toBe(1);
  });
  it('rejects manually injecting the owner option into another program',()=>{
    const r=priceDesign({productId:'onyx_shutters',programId:'vinyl',widthInches:36,heightInches:60,quantity:1,surcharges:[{id,units:2}]});
    expect(r.ok).toBe(false);if(!r.ok)expect(r.code).toBe('SURCHARGE_UNKNOWN');
  });
  it('retains the known base-cost floor when full option cost is unresolved',()=>{
    const r=priceDesign({productId:'onyx_shutters',programId:'poly_composite',widthInches:36,heightInches:60,quantity:1,discountPercent:99,surcharges:[{id,units:2}]});
    expect(r.ok).toBe(false);if(!r.ok)expect(r.code).toBe('CUSTOMER_PRICE_BELOW_COST');
  });
  it('preserves unrelated options and uses source option aliases',()=>{
    const s=selection();s.configuration={tilt_type:'H3',panel_config:'LR'};expect(withOnyxPolyH3Surcharges(s,[{id:'double_hung',units:1}])).toEqual([{id:'double_hung',units:1},{id,units:2}]);
  });
});
