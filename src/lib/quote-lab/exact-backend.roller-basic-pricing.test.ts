import { describe, expect, it } from 'vitest';
import type { SalesQuoteDesign, SalesQuoteLineItem } from '@mts/types/quote';
import { getProductColorOptions } from '@/lib/quote/product-color-options';
import { repriceExactQuoteBuilderForServerDate } from './exact-backend';
import { prepareSalesQuoteV2PricingBatch } from '@/lib/crm/sales-quote-v2-price-save';
import { validateSelection } from '@/lib/quote-v2/rules';

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
  it('prices the reported 34 x 82 Ohara line, all four shades, and saves the same result', () => {
    const q = fixture();
    const actual = price(q), row = actual.designs[0];
    expect(row.result.ok, JSON.stringify(row.result)).toBe(true);
    const measured = structuredClone(q);
    measured.designs[0].options_json = { ...measured.designs[0].options_json, tube_class: 'All Tubes' };
    const reference = price(measured).designs[0];
    expect(reference.result.ok, JSON.stringify(reference.result)).toBe(true);
    if (!row.result.ok || !reference.result.ok) return;
    expect(row.result.base).toBe(465);
    expect(row.result.base).toBe(reference.result.base);
    expect(row.result.surchargeLines).toEqual(reference.result.surchargeLines);
    expect(row.result.total).toBe(reference.result.total);
    expect(row.result.surchargeLines).toEqual([expect.objectContaining({ id: 'fabric_valance_3_1_2in_4_1_2in_and_6in', amount: 155 })]);
    expect(row.result.unitPrice).toBe(659);
    expect(row.result.total).toBe(2636);
    expect(row.result.customerCharges).toMatchObject({ installationTotal: 100, shippingTotal: 56 });
    expect(row.result.matchedWidth).toBe(36);
    expect(row.result.matchedHeight).toBe(84);
    expect(actual.total).toBeGreaterThan(row.result.base * 4);
    expect(row.selection.configuration.roller_tube ?? null).toBeNull();
    expect(validateSelection(row.selection)).toContainEqual(expect.objectContaining({ ruleId: 'roller.required.roller_tube', severity: 'hard_block' }));
    const saved = prepareSalesQuoteV2PricingBatch({ lines: q.lines, selectedDesigns: q.designs, serverDate: '2026-09-23' });
    expect(saved.prepared[0].priceStatus).toBe('authoritative');
    expect(saved.repriced.total).toBe(actual.total);
    expect(price(JSON.parse(JSON.stringify(q)))).toEqual(actual);
  });
  it.each(['Continuous Cord Loop', 'Smart Release', 'Motorized'])('prices %s without a tube selection', lift => {
    const q = fixture(); q.designs[0].lift_system = lift;
    if (lift === 'Motorized') {
      q.designs[0].motor_type = 'Low Voltage DC Motor';
      Object.assign(q.designs[0].options_json!, { power_configuration: 'Automate Low Voltage DC Motor', dc_power_supply: 'Individual DC Power Supply', motorization_selections: [{ groupId: 'automate_home', optionId: 'low_voltage_dc_motor', role: 'base_motor', units: 1 }] });
    }
    const result = price(q).designs[0].result;
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });
  it('still blocks actual missing fabric identity and unavailable grid cells', () => {
    const unknown = fixture(); unknown.designs[0].options_json!.fabric_color_code = 'NO-SUCH-COLOR';
    expect(price(unknown).designs[0].result.ok).toBe(false);
    const outside = fixture(); outside.lines[0].width_whole = 1000;
    expect(price(outside).designs[0].result.ok).toBe(false);
  });
});
