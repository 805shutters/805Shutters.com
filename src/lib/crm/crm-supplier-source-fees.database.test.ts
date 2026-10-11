import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { customerDraftOperations } from './crm-supplier-customer-draft-adapter';
import { buildSupplierSpec, supplierSourceFeeProgram } from './mobile-supplier-spec';
import { syntheticDraft } from './mobile-supplier-test-fixture';
import { customerChargeEligible, customerPhysicalUnits } from '@/lib/quote/customer-charges';

// Execute ONLY the pinned pure fee functions in an isolated local database.
const pg = new PGlite();
function sourceFunction(file: string, name: string) {
  const sql = readFileSync('supabase/migrations/' + file, 'utf8');
  const start = sql.indexOf('create or replace function public.' + name + '(');
  const end = sql.indexOf('end $$;', start);
  if (start < 0 || end < 0) throw new Error('Pinned SQL function not found: ' + name);
  return sql.slice(start, end + 'end $$;'.length);
}
beforeAll(async () => {
  await pg.exec(sourceFunction('20260914231500_customer_installation_shipping_snapshots.sql', 'quote_customer_charges'));
  await pg.exec(sourceFunction('20260921120000_manual_customer_installation_policy.sql', 'quote_manual_customer_charges'));
}, 30000);
afterAll(() => pg.close());

const cases: Array<[string, string, Record<string, unknown>, number]> = [
  ['roller', 'Roller Shades', { roller_coupling_count: 2 }, 3],
  ['roller', 'Roller Shades', { coupled_shade_count: 3 }, 1],
  ['roller', 'Roller Shades', { lightguard_360_shade_count: 4 }, 1],
  ['roller', 'Roller Shades', { roller_application: 'Dual' }, 1],
  ['roman', 'Roman Shades', { shade_type: 'Common valance' }, 1],
  ['honeycomb', 'Honeycomb Shades', { honeycomb_operating_system: 'SmartFit dual' }, 1],
  ['lotus_synthetic', 'Faux Wood Blinds', { lotus_blind_count: 3 }, 1],
  ['faux_wood', 'Faux Wood Blinds', { faux_blind_count: 2 }, 1],
  ['shutter', 'Shutters', {}, 1],
  ['remote', 'Remote', {}, 1],
  ['roller', 'Roller Shades', { program_id: 'remote accessory' }, 1],
  ['roller', 'Roller Shades', { catalog_program_id: 'SYNTHETIC', program_id: 'remote accessory' }, 1],
  ['roller', 'Roller Shades', { quote_lab_program_id: 'SYNTHETIC', program_id: 'remote accessory' }, 1],
];
for (const [productId, productType, config, quantity] of cases) {
  it(`matches actual pinned SQL fees for ${productId} ${JSON.stringify(config)} × ${quantity}`, async () => {
    const spec = buildSupplierSpec(syntheticDraft());
    const line = spec.lines[0];
    Object.assign(line, { productId, productType, quantity });
    line.configuration = config;
    const operation = customerDraftOperations(spec, 'SYNTHETIC').find(op => op.type === 'design.upsert')!;
    if (operation.type !== 'design.upsert') throw new Error('Missing design');
    const design = { product_type: productType, options_json: operation.patch.optionsJson };
    const result = await pg.query<{ charges: { perWindowTotal: number; total: number } | null }>(
      'select public.quote_manual_customer_charges($1::jsonb,$2::jsonb,$3::jsonb) as charges',
      [JSON.stringify(design), JSON.stringify({ product_type: productType, quantity }), '{}'],
    );
    const program = supplierSourceFeeProgram(config);
    const expected = customerChargeEligible(productType + ' ' + productId, program)
      ? 39 * customerPhysicalUnits({ productId, configuration: config }) : 0;
    expect(result.rows[0].charges?.perWindowTotal ?? 0).toBe(expected);
    expect(result.rows[0].charges?.total ?? 0).toBe(expected * quantity);
  });
}
