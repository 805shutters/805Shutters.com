import {it,expect} from 'vitest';
import fixtures from './legacy-pricing-regression.fixtures.json';
import sundance from './sundance-pricing.fixture.json';
import type {NormanQuotePricingState} from './sales-quote-norman-price';
import {prepareNormanLegacyPricing} from './sales-quote-norman-price';
it('replays saved Roman, vertical Honeycomb and Sundance selections without overwriting them',()=>{

 for(const f of [...fixtures,sundance]){const before=structuredClone(f);const r=prepareNormanLegacyPricing(f as unknown as NormanQuotePricingState,'2026-09-25')[0]; expect(r.priceStatus, String(r.rpcResult.staffPricingError)).toBe('authoritative');expect(f).toEqual(before);}
});
