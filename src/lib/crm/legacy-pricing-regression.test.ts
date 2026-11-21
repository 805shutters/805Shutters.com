import {it,expect} from 'vitest';
import fixtures from './legacy-pricing-regression.fixtures.json';
import sundance from './sundance-pricing.fixture.json';
import type {NormanQuotePricingState} from './sales-quote-norman-price';
import {prepareNormanLegacyPricing} from './sales-quote-norman-price';
it('replays saved Roman, vertical Honeycomb and Sundance selections without overwriting them',()=>{
 for(const f of fixtures){
  const before=structuredClone(f);
  const r=prepareNormanLegacyPricing(f as unknown as NormanQuotePricingState,'2026-09-25')[0];
  expect(r.priceStatus, JSON.stringify(r.rpcResult)).toBe('blocked');
  expect(r.customerPrice).toMatchObject({ok:false,code:'NO_SITE_PRICE'});
  expect(r.rpcResult.authoritativeSnapshot).toBeNull();
  expect(r.rpcResult.validationSnapshot).toMatchObject({pricingFailure:{code:'NO_SITE_PRICE'}});
  expect(f).toEqual(before);
 }
 const before=structuredClone(sundance);
 const priced=prepareNormanLegacyPricing(sundance as unknown as NormanQuotePricingState,'2026-09-25')[0];
 expect(priced.priceStatus, String(priced.rpcResult.staffPricingError)).toBe('authoritative');
 expect(sundance).toEqual(before);
});
