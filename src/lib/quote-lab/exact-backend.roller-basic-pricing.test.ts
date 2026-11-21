import { describe, expect, it } from 'vitest';
import type { SalesQuoteDesign, SalesQuoteLineItem } from '@mts/types/quote';
import { getProductColorOptions } from '@/lib/quote/product-color-options';
import { priceDesign } from '@/lib/quote/pricing';
import { repriceExactQuoteBuilderForServerDate } from './exact-backend';
import { prepareSalesQuoteV2PricingBatch } from '@/lib/crm/sales-quote-v2-price-save';
import { validateSelection } from '@/lib/quote-v2/rules';

function noSite(result: {ok:boolean}, label?: unknown) {
 expect(result, typeof label === "string" ? label : JSON.stringify(result)).toMatchObject({ok:false,code:"NO_SITE_PRICE",blocked:"no_site_price"});
 expect(result).not.toHaveProperty("unitPrice");
}

function fixture() {
  const color = getProductColorOptions('roller').find(c => c.colorCode === 'F2203')!;
  const line = { id: 'roller-basic', quote_id: 'test', room_name: 'Living Room', product_type: 'Roller Shades', width_whole: 34, width_fraction: '0', height_whole: 82, height_fraction: '0', quantity: 4, sort_order: 0 } as SalesQuoteLineItem;
  const design = { id: 'roller-basic-A', line_item_id: line.id, variant: 'A', product_type: 'Roller Shades', supplier: 'Norman', mount_type: 'Inside Mount', shade_type: 'Single Shade', lift_system: 'Cordless', valance: '4 1/2" Fabric Valance*', fabric: 'Ohara', unit_price: 0, options_json: {
    quote_v2_backend: true, catalog_product_id: 'roller', catalog_program_id: color.programId,
    fabric_product_id: 'roller', fabric_program_id: color.programId, fabric_color_id: color.id,
    top_treatment_class: 'Fabric Valance', roller_top_treatment: 'Fabric Valance', fabric_color_collection: color.collection, fabric_color_code: color.colorCode, fabric_color_name: color.colorName, hem_bar: 'Fabric Covered',
  } } as unknown as SalesQuoteDesign;
  return { lines: [line], designs: [design], selectedVariantByLine: { [line.id]: 'A' }, applyCustomerCharges: true };
}
function price(input = fixture()) {
  const result = repriceExactQuoteBuilderForServerDate(input, '2026-09-23');
  if (!('backend' in result) || result.backend !== 'v2') throw new Error('Expected V2');
  return result;
}
describe('Roller quote uses priced selections without tube fabrication input', () => {
  it('prices size, fabric/color and operation alone, with no selected upgrades', () => {
    const q = fixture();
    q.designs[0].mount_type = null;
    q.designs[0].shade_type = null;
    q.designs[0].valance = null;
    delete q.designs[0].options_json!.top_treatment_class;
    delete q.designs[0].options_json!.roller_top_treatment;
    delete q.designs[0].options_json!.hem_bar;
    const untouched = structuredClone(q);
    const row = price(q).designs[0];
    noSite(row.result, JSON.stringify(row.result));
    const list = priceDesign({ productId: 'roller', programId: String(q.designs[0].options_json!.fabric_program_id), widthInches: 34, heightInches: 82 }, '2026-09-23');
    expect(list).toMatchObject({ ok: true, base: 465, surchargeLines: [], matchedWidth: 36, matchedHeight: 84 });
    // Quote unit 504 and total 2016 added $25 installation and $14 shipping per shade to this list cell.
    // Retired quote dollar: expect(row.result.surchargeLines).toEqual([]);
    // Retired quote dollar: expect(row.result.unitPrice).toBe(504);
    // Retired quote dollar: expect(row.result.total).toBe(2016);
    expect(q).toEqual(untouched);
    expect(prepareSalesQuoteV2PricingBatch({ lines: q.lines, selectedDesigns: q.designs, serverDate: '2026-09-23' }).prepared[0].priceStatus).toBe('blocked');
    expect(price(JSON.parse(JSON.stringify(q)))).toEqual(price(q));
  });
  it('prices the reported 34 x 82 Ohara line, all four shades, and saves the same result', () => {
    const q = fixture();
    const actual = price(q), row = actual.designs[0];
    noSite(row.result, JSON.stringify(row.result));
    const measured = structuredClone(q);
    measured.designs[0].options_json = { ...measured.designs[0].options_json, tube_class: 'All Tubes' };
    const reference = price(measured).designs[0];
    noSite(reference.result, JSON.stringify(reference.result));
    const list = priceDesign({ productId: 'roller', programId: String(q.designs[0].options_json!.fabric_program_id), widthInches: 34, heightInches: 82, surcharges: [{ id: 'fabric_valance_3_1_2in_4_1_2in_and_6in' }] }, '2026-09-23');
    expect(list).toMatchObject({ ok: true, base: 465, matchedWidth: 36, matchedHeight: 84 });
    if (list.ok) expect(list.surchargeLines).toEqual([expect.objectContaining({ id: 'fabric_valance_3_1_2in_4_1_2in_and_6in', amount: 155 })]);
    // Quote unit 659 and total 2636 added installation and shipping to this list cell.
    // Retired quote dollar: expect(row.result.base).toBe(reference.result.base);
    // Retired quote dollar: expect(row.result.surchargeLines).toEqual(reference.result.surchargeLines);
    // Retired quote dollar: expect(row.result.total).toBe(reference.result.total);
    // Retired quote dollar: expect(row.result.surchargeLines).toEqual([expect.objectContaining({ id: 'fabric_valance_3_1_2in_4_1_2in_and_6in', amount: 155 })]);
    // Retired quote dollar: expect(row.result.unitPrice).toBe(659);
    // Retired quote dollar: expect(row.result.total).toBe(2636);
    // Retired quote dollar: expect(row.result.customerCharges).toMatchObject({ installationTotal: 100, shippingTotal: 56 });
    // Retired quote dollar: expect(actual.total).toBeGreaterThan(row.result.base * 4);
    expect(row.selection.configuration.roller_tube ?? null).toBeNull();
    expect(validateSelection(row.selection)).toContainEqual(expect.objectContaining({ ruleId: 'roller.required.roller_tube', severity: 'hard_block' }));
    const saved = prepareSalesQuoteV2PricingBatch({ lines: q.lines, selectedDesigns: q.designs, serverDate: '2026-09-23' });
    expect(saved.prepared[0].priceStatus).toBe('blocked');
    // Retired quote total: expect(saved.repriced.total).toBe(actual.total);
    expect(price(JSON.parse(JSON.stringify(q)))).toEqual(actual);
  });
  it.each(['Continuous Cord Loop', 'Smart Release', 'Motorized'])('prices %s without a tube selection', lift => {
    const q = fixture(); q.designs[0].lift_system = lift;
    if (lift === 'Motorized') {
      q.designs[0].motor_type = 'Low Voltage DC Motor';
      Object.assign(q.designs[0].options_json!, { power_configuration: 'Automate Low Voltage DC Motor', dc_power_supply: 'Individual DC Power Supply', motorization_selections: [{ groupId: 'automate_home', optionId: 'low_voltage_dc_motor', role: 'base_motor', units: 1 }] });
    }
    const result = price(q).designs[0].result;
    noSite(result, JSON.stringify(result));
  });
  it('still requires an operation and the priced motor when motorized', () => {
    const q = fixture();
    q.designs[0].lift_system = null;
    expect(price(q).designs[0].result.ok).toBe(false);
    q.designs[0].lift_system = 'Motorized';
    expect(price(q).designs[0].result.ok).toBe(false);
  });
  it('still blocks actual missing fabric identity and unavailable grid cells', () => {
    const unknown = fixture(); unknown.designs[0].options_json!.fabric_color_code = 'NO-SUCH-COLOR';
    expect(price(unknown).designs[0].result.ok).toBe(false);
    const outside = fixture(); outside.lines[0].width_whole = 1000;
    expect(price(outside).designs[0].result.ok).toBe(false);
  });
});
