import { describe, expect, it } from 'vitest';
import { priceDesign } from './pricing';
import { getProduct } from './catalog';
import { getShutterPrice } from '../../mts-quote/lib/pricingEngine';

// Customer selling rates explicitly confirmed by the owner. Dealer costs are
// deliberately not inputs to these independent retail expectations.
const programs = [
  ['Norman', 'woodlore', 'Woodlore', 35],
  ['Norman', 'woodlore_plus', 'Woodlore Plus', 36],
  ['Norman', 'woodlore_aquashield', 'Woodlore Aquashield', 38],
  ['Norman', 'brightwood', 'Brightwood', 40],
  ['Norman', 'normandy_painted', 'Normandy Painted', 42],
  ['Norman', 'normandy_stained', 'Normandy Stained', 46],
  ['Onyx', 'painted_basswood', 'Painted Basswood', 35],
  ['Onyx', 'stained_basswood', 'Stained Basswood', 38],
  ['Onyx', 'secamore', 'Secamore', 31],
  ['Onyx', 'vinyl', 'Vinyl', 31],
  ['Onyx', 'vlo_hybrid', 'VLO Hybrid', 29],
  ['Onyx', 'onyx_us_made_vinyl', 'Onyx US Made Vinyl', 32],
  ['Onyx', 'poly_composite', 'Poly Composite', 31],
] as const;

const dimensions = [
  [24, 24, 4, 8],
  [24, 48, 8, 8],
  [24.0625, 48, 8.020833333333334, 9],
  [35.9375, 48, 11.979166666666666, 12],
  [36, 48, 12, 12],
  [36.0625, 48, 12.020833333333334, 13],
  [30, 60, 12.5, 13],
  [36.5, 60.25, 15.27170138888889, 16],
  [94.5, 34.25, 22.4765625, 23],
] as const;

describe('all owner-confirmed Norman and Onyx shutter selling rates', () => {
  it('accounts for every configured product program', () => {
    for (const supplier of ['Norman', 'Onyx'] as const) {
      const product = getProduct(`${supplier.toLowerCase()}_shutters`)!;
      expect(product.programs.map(p => p.id).sort()).toEqual(programs.filter(p => p[0] === supplier).map(p => p[1]).sort());
      expect(product.programs.every(p => p.priceAxis === 'sqft')).toBe(true);
    }
  });

  for (const [supplier, programId, programName, rate] of programs) {
    for (const [width, height, actualArea, billableArea] of dimensions) {
      it(`${supplier} ${programName}: ${width} x ${height} uses ${billableArea} sq ft at $${rate}`, () => {
        const productId = `${supplier.toLowerCase()}_shutters`;
        const result = priceDesign({ productId, programId, widthInches: width, heightInches: height, quantity: 3 });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error);
        expect(result.sqft).toBeCloseTo(actualArea, 10);
        expect(result.billableSqft).toBe(billableArea);
        expect(result.base).toBe(billableArea * rate);
        expect(result.unitPrice).toBe(billableArea * rate);
        expect(result.total).toBe(billableArea * rate * 3);
        expect(getShutterPrice({supplier, program: programName, width, height})).toBe(billableArea * rate);
      });
    }
  }
});
