import { expect, it } from 'vitest';
import fixture from '@/lib/crm/sundance-pricing.fixture.json';
import { prepareNormanLegacyPricing, type NormanQuotePricingState } from '@/lib/crm/sales-quote-norman-price';
import { priceQuoteV2Selection } from './engine';
import { sundanceSheerviewColorPatch } from '@/lib/quote/sundance/sheerview-assortment';
import { quoteV2CatalogVersionFor } from './catalog';
import type { SelectionContext } from './core';

function selection(changes:Record<string,unknown>={},width=60,height=60,quantity=1):SelectionContext {
  return {manufacturerId:'sundance',productId:'sundance_sheerview',programId:'sundance_sheerview_p23_t1',
    catalogAsOf:'2026-09-26',catalogVersion:quoteV2CatalogVersionFor('sundance_sheerview','2026-09-26'),widthInches:width,heightInches:height,quantity,options:{},
    configuration:{...sundanceSheerviewColorPatch({},'sundance_sheerview:S70PN100'),mount_type:'Inside',sundance_sheerview_control:'Continuous Cord Loop',sundance_sheerview_headrail:'Curved',sundance_sheerview_cord_option:'Cord',sundance_sheerview_assembly:'Single',...changes} as SelectionContext['configuration']};
}
function price(s=selection(),discountPercent=0,purpose:'quote'|'order'='quote') {
  return priceQuoteV2Selection({selection:s,priceInput:{productId:s.productId,programId:s.programId!,widthInches:s.widthInches,heightInches:s.heightInches,quantity:s.quantity,discountPercent},validationPurpose:purpose,applyCustomerCharges:true,includeInternalCost:true});
}
it('prices the saved legacy single shade without changing its selections or manual overrides',()=>{
  const state=structuredClone(fixture) as unknown as NormanQuotePricingState,before=structuredClone(state);
  const [result]=prepareNormanLegacyPricing(state,'2026-09-26');
  expect(result.priceStatus,JSON.stringify(result.rpcResult)).toBe('authoritative');
  expect(result.rpcResult.selection).toMatchObject({configuration:{sundance_sheerview_assembly:'Single'}});
  expect(state).toEqual(before);
  state.designs[0].options_json.manual_price_override=true;
  expect(prepareNormanLegacyPricing(state,'2026-09-26')).toEqual([]);
});
it.each([[24,36],[60,60],[116,144]])('prices source grid boundaries %s x %s with explicit unknown cost',(w,h)=>{
  const r=price(selection({},w,h));expect(r.ok,JSON.stringify(r)).toBe(true);
  if(r.ok){expect(r.internalCost).toBeUndefined();expect(r.wholesaleTotal).toBeNull();expect(r.total).toBe(r.unitPrice);expect(r.components.every(c=>c.source.sourceId)).toBe(true);}
});
it('charges the two-on-one retail upgrade and two motors, while preserving order review',()=>{
  const single=price(selection({sundance_sheerview_control:'Rechargeable Motor with Wand',sundance_sheerview_cord_option:null}));
  const s=selection({sundance_sheerview_assembly:'Two on one',sundance_sheerview_control:'Rechargeable Motor with Wand',sundance_sheerview_cord_option:null});
  const pair=price(s);expect(single.ok,JSON.stringify(single)).toBe(true);expect(pair.ok,JSON.stringify(pair)).toBe(true);
  if(single.ok&&pair.ok){expect(pair.surchargeLines).toEqual(expect.arrayContaining([expect.objectContaining({id:'sundance:two_on_one',amount:80}),expect.objectContaining({id:'sundance:motor',amount:730})]));expect(pair.base).toBe(single.base);expect(pair.configurationUnits).toBe(2);expect(pair.unitPrice).toBeGreaterThan(single.unitPrice+445);}
  expect(price(s,0,'order').ok).toBe(false);
});
it('allocates an accessory quantity once per line and discounts merchandise only',()=>{
  const r=price(selection({sundance_sheerview_control:'Rechargeable Motor with Wand',sundance_sheerview_cord_option:null,sundance_sheerview_usb6_qty:1},60,60,3),10);
  expect(r.ok,JSON.stringify(r)).toBe(true);
  if(r.ok){expect(r.onceTotal).toBe(68);expect(r.total).toBe(Math.round((r.unitPrice*3+68)*100)/100);expect(r.componentTotals.customerOncePerLine).toBe(68);expect(r.discountAmount).toBe(Math.round((r.base+365)*10)/100);}
});
it.each([{fabric_color_code:'unknown'},{sundance_sheerview_control:'invented'},{sundance_sheerview_usb6_qty:1},{sundance_sheerview_assembly:'unknown'}])('rejects invalid priced selections %j',changes=>expect(price(selection(changes)).ok).toBe(false));
it('does not clamp an out-of-grid dimension',()=>expect(price(selection({},117,60)).ok).toBe(false));
it('matches independent published retail cells and retains service charges',()=>{
  for (const [w,h,base] of [[24,36,513],[60,60,1111],[116,144,4965]]) {
    const r=price(selection({},w,h));expect(r).toMatchObject({ok:true,base,unitPrice:base+39+(w>93?110:0)});
  }
});
it('rejects two-on-one below its published combined minimum width',()=>{
  expect(price(selection({sundance_sheerview_assembly:'Two on one',sundance_sheerview_control:'Rechargeable Motor with Wand',sundance_sheerview_cord_option:null},43,60)).ok).toBe(false);
});
