import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { catalog } from './catalog';
import { isNonNormanOrderingOnlyRule, nonNormanQuoteIssues } from './non-norman-ordering-only';
import { validateLotusAmx } from '@/lib/quote-v2/lotus-amx';
import { validateLotusRoller } from '@/lib/quote-v2/lotus-roller';
import { LOTUS_AMX_VERSION } from './lotus-amx';
import { LOTUS_ROLLER_VERSION } from './lotus-roller';
import { QUOTE_V2_CATALOG_VERSION } from '@/lib/quote-v2/catalog';
import { priceQuoteV2Selection } from '@/lib/quote-v2/engine';
import type { SelectionContext } from '@/lib/quote-v2/core';
import { sundanceHorizontalOptionEvidence } from './sundance/horizontal-configuration';
import { lookupSundanceSourceGrid } from './sundance/catalog';
import { sundanceHorizontalSource } from './sundance/horizontal-assortment';

const amx: SelectionContext = { manufacturerId: 'lotus', productId: 'lotus_mini_blinds', programId: 'lotus_amx_1in_aluminum_custom', catalogVersion: QUOTE_V2_CATALOG_VERSION, catalogAsOf: '2026-09-21', widthInches: 30, heightInches: 48, quantity: 2, options: {}, configuration: { lotus_amx_configuration_version: LOTUS_AMX_VERSION, color: 'White', lift_system: 'Cordless', valance: 'None' } };
const price = (selection: SelectionContext) => priceQuoteV2Selection({ validationPurpose: 'quote', selection, priceInput: { productId: selection.productId, programId: selection.programId ?? undefined, widthInches: selection.widthInches, heightInches: selection.heightInches, quantity: selection.quantity }, includeInternalCost: true });
describe('non-Norman pricing excludes only explicit order checks', () => {
  it('separates AMX measurement basis from priced operation and preserves the source order checks', () => {
    const issues = validateLotusAmx(amx);
    expect(issues.map(i => i.ruleId)).toContain('lotus.amx.measurement_basis');
    expect(nonNormanQuoteIssues(issues).filter(i => i.severity === 'hard_block')).toEqual([]);
    expect(nonNormanQuoteIssues(issues, false)).toEqual(issues);
    const motor = validateLotusAmx({ ...amx, configuration: { ...amx.configuration, lift_system: 'Motorized' } });
    expect(nonNormanQuoteIssues(motor).map(i => i.ruleId)).toContain('lotus.amx.standard_configuration');
  });
  it('retains the actual AMX grid price with no installation selections', () => {
    const quote = price(amx);
    const ordered = price({ ...amx, configuration: { ...amx.configuration, mount_type: 'Inside Mount', lotus_measurement_basis: 'inside_opening' } });
    expect(quote.ok, JSON.stringify(quote)).toBe(true); expect(ordered.ok, JSON.stringify(ordered)).toBe(true);
    if (quote.ok && ordered.ok) {
      expect(quote.unitPrice).toBe(ordered.unitPrice);
      expect(quote.total).toBe(ordered.total);
      expect(quote.unitPrice).toBeGreaterThan(0);
    }
  });
  it('preserves the exact Polar grid result without any installation measurements', () => {
    const polar: SelectionContext = { ...amx, manufacturerId: 'polar', productId: 'polar_interior_roller', programId: 'group_2', configuration: { fabric_collection: 'SunTex 80 25%', polar_interior_fabric_orientation: 'standard', lift_system: 'manual_clutch' } };
    const clean = price(polar), withOrder = price({ ...polar, configuration: { ...polar.configuration, available_depth_inches: 0.1, opening_diagonal_difference_inches: 1 } });
    expect(clean.ok, JSON.stringify(clean)).toBe(true);
    expect(withOrder.ok, JSON.stringify(withOrder)).toBe(true);
    if (clean.ok && withOrder.ok) { expect(clean.unitPrice).toBe(withOrder.unitPrice); expect(clean.total).toBe(withOrder.total); expect(clean.unitPrice).toBeGreaterThan(0); }
  });
  it('accounts for every non-Norman catalog product in the review ledger', () => {
    const products = catalog.products.filter(p => ['Onyx', 'Polar', 'Lotus', 'Sundance'].includes(p.manufacturer ?? ''));
    expect(products).toHaveLength(62);
    const report = readFileSync('reports/non-norman-pricing-only-review-20260921.md', 'utf8');
    for (const product of products) expect(report).toContain('`' + product.id + '`');
  });
  it('keeps Lotus roller opacity and motor pricing errors while excluding recess depth', () => {
    const roller = { ...amx, productId: 'lotus_roller_shades', programId: 'lotus_rs_1pct_custom', configuration: { lotus_roller_configuration_version: LOTUS_ROLLER_VERSION, lotus_roller_opacity: '1%', color: 'White', lift_system: 'Cordless Spring Roller', valance: 'Smooth valance', mount_type: 'Inside Mount', lotus_roller_shade_count: 1 } };
    expect(validateLotusRoller(roller).map(i => i.ruleId)).toContain('lotus.roller.inside_depth');
    expect(nonNormanQuoteIssues(validateLotusRoller(roller))).toEqual([]);
    expect(nonNormanQuoteIssues(validateLotusRoller({ ...roller, configuration: { ...roller.configuration, motor_type: 'Battery' } })).map(i => i.ruleId)).toContain('lotus.roller.motorization');
  });
  it('keeps all priced Sundance options and real base cells independent of mounting measurements', () => {
    const productId = 'sundance_chateau_woods';
    const row = sundanceHorizontalSource.rows.find(r => r.productId === productId)!;
    const choices = { fabric_color_id: row.id, sundance_blind_valance: '4-inch Rope', sundance_blind_ladder: 'Decorative 1-inch tape', sundance_blind_rounded_corners: 'Yes' };
    const before = sundanceHorizontalOptionEvidence(productId, { ...choices, sundance_blind_depth: 4, sundance_blind_flush: 'Yes' }, 36);
    const after = sundanceHorizontalOptionEvidence(productId, choices, 36);
    expect(after).toEqual(before); expect(after.retailSubtotal).toBe(157); expect(after.netSubtotal).toBe(15); expect(after.percentages).toContainEqual(expect.objectContaining({percent:20}));
    expect(lookupSundanceSourceGrid(productId, row.programId, 36, 60)?.sourceRetail).toBeGreaterThan(0);
  });
  it('recognizes nested assembly order checks without relaxing component price requirements', () => {
    expect(isNonNormanOrderingOnlyRule('sundance.assembly.component_2.sundance.walden.depth')).toBe(true);
    for (const id of ['sundance.assembly.grid', 'sundance.horizontal.grid', 'sundance.portfolio.valance_depth', 'polar.drapery.brackets.exact_quantity', 'lotus.amx.standard_configuration', 'sundance.horizontal.extra_length']) expect(isNonNormanOrderingOnlyRule(id)).toBe(false);
  });
});
