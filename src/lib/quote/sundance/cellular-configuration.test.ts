import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SelectionContext } from '@/lib/quote-v2/core';
import { validateSelection, productRuleStatusForSelection } from '@/lib/quote-v2/rules';
import { SundanceDesignOptions } from '@/components/crm/SundanceDesignOptions';
import { sundanceCellularColors, sundanceCellularColorMatchesContext } from './cellular-assortment';
import { sundanceCellularSelectionPatch } from './configuration';
import { sundanceCellularSystemPatch, sundanceCellularBottomPatch, validateSundanceCellularConfiguration } from './cellular-configuration';
function context(system = 'Cordless', width = 36, height = 60, code = 'PS310-001'): SelectionContext {
  let config = sundanceCellularSystemPatch(sundanceCellularSelectionPatch({}, `sundance_cellular:${code}`)!, system);
  if (system === 'Cordless Day/Night') config = sundanceCellularBottomPatch(config, 'sundance_cellular:PS320-001')!;
  return { manufacturerId: 'sundance', productId: 'sundance_cellular', programId: config.catalog_program_id as string,
    catalogVersion: 'sundance-assortment-2026-09-20-r14', catalogAsOf: '2026-09-20', widthInches: width, heightInches: height, quantity: 1,
    configuration: { ...config, mount_type: 'Inside', ...(system === 'Verticell' ? { sundance_cellular_stack: 'Center Split', sundance_cellular_mount_depth: 4, sundance_cellular_recess: 'Flush' } : {}) } as SelectionContext['configuration'], options: {} };
}
it.each([
  ['Cordless', 12, 96, 10, 96], ['Cordless Top Down/Bottom Up', 19, 96, 10, 84], ['Cordless Day/Night', 19, 72, 10, 72],
  ['Cordloop', 12, 120, 10, 120], ['Skylight', 16, 60, 10, 60], ['Verticell', 24, 120, 24, 118], ['Somfy Cord Lift WireFree TL25', 18, 96, 12, 96],
])('checks independently transcribed %s source bounds', (system, minW, maxW, minH, maxH) => {
  for (const [w, h] of [[minW, minH], [maxW, maxH]]) expect(validateSundanceCellularConfiguration(context(String(system), Number(w), Number(h)))).toEqual([]);
  for (const [w, h] of [[Number(minW) - .0625, minH], [Number(maxW) + .0625, minH], [minW, Number(minH) - .0625], [minW, Number(maxH) + .0625]])
    expect(validateSundanceCellularConfiguration(context(String(system), Number(w), Number(h))).map(i => i.ruleId)).toContain('sundance.cellular.size');
});
it.each([['Simphony Cell Shade WireFree', 17], ['Simphony Concerto TDBU', 36]])('preserves %s published width and max without inventing minimum height', (name, min) => {
  expect(validateSundanceCellularConfiguration(context(String(name), Number(min), 1))).toEqual([]);
  for (const [w,h] of [[Number(min)-.0625,60],[96.0625,60],[36,96.0625],[36,0]]) expect(validateSundanceCellularConfiguration(context(String(name),w,h)).map(i=>i.ruleId)).toContain('sundance.cellular.size');
});
it('retains independent Day/Night fabric grids and rejects reversed, stale or forged identities', () => {
  const c = context('Cordless Day/Night'); expect(c.programId).toBe('sundance_cellular_p7_t1'); expect(c.configuration.sundance_cellular_bottom_program_id).toBe('sundance_cellular_p9_t1');
  const bad = { ...c, configuration: { ...c.configuration, sundance_cellular_bottom_program_id: 'sundance_cellular_p7_t1' } };
  expect(validateSelection(bad).map(i => i.ruleId)).toContain('sundance.cellular.daynight_bottom');
  expect(sundanceCellularBottomPatch(c.configuration, 'sundance_cellular:PS310-001')).toBeNull();
  const next = sundanceCellularSystemPatch(c.configuration, 'Cordless'); expect(next.sundance_cellular_bottom_fabric_id).toBeNull();
  expect(validateSundanceCellularConfiguration({ ...c, configuration: { ...c.configuration, sundance_cellular_system: 'Cordless' } }).map(i => i.ruleId)).toContain('sundance.cellular.stale_bottom');
  expect(productRuleStatusForSelection(c)).toBe('manual_quote_required');
});
it('enforces Verticell material exclusions across every exact color and clears incompatible selection', () => {
  for (const row of sundanceCellularColors) {
    const excluded = row.collection.startsWith('Linen Print ') || row.collection.startsWith('Sheer ') || row.automaticDetails.cell_size === '7/16"';
    expect(sundanceCellularColorMatchesContext(row, { sundance_cellular_system: 'Verticell' })).toBe(!excluded);
    const c = context('Cordless',36,60,row.colorCode); const patch = sundanceCellularSystemPatch(c.configuration, 'Verticell');
    expect(patch.fabric_color_id).toBe(excluded ? null : row.id);
    const forced = { ...c, configuration: { ...c.configuration, sundance_cellular_system: 'Verticell', sundance_cellular_stack: 'Left Stack', sundance_cellular_rail_color: 'Off White', sundance_cellular_mount_depth: 4, sundance_cellular_recess: 'Flush' } };
    expect(validateSundanceCellularConfiguration(forced).some(i=>i.ruleId==='sundance.cellular.verticell_fabric')).toBe(excluded);
  }
});
it('checks Verticell mount depth, skylight finished size and incomplete component assemblies', () => {
  const v=context('Verticell');
  for (const [mount,recess,depth] of [['Inside','Flush',4],['Inside','Partial recess',2.75],['Outside','',2.25]] as const) {
    const c={...v,configuration:{...v.configuration,mount_type:mount,sundance_cellular_recess:recess,sundance_cellular_mount_depth:depth}};
    expect(validateSundanceCellularConfiguration(c)).toEqual([]);
    expect(validateSundanceCellularConfiguration({...c,configuration:{...c.configuration,sundance_cellular_mount_depth:depth-.0625}}).map(i=>i.ruleId)).toContain('sundance.cellular.mount_depth');
  }
  const sky=context('Skylight');expect(validateSundanceCellularConfiguration({...sky,configuration:{...sky.configuration,sundance_cellular_size_basis:'Opening size'}}).map(i=>i.ruleId)).toContain('sundance.cellular.skylight');
  const c=context();expect(validateSelection({...c,configuration:{...c.configuration,sundance_cellular_assembly:'Two on one'}}).map(i=>i.ruleId)).toContain('sundance.cellular.components');
});
it('renders current choices and blackout-only second fabrics', () => {
  const c=context('Cordless Day/Night');const html=renderToStaticMarkup(createElement(SundanceDesignOptions,{design:{options_json:c.configuration},productId:'sundance_cellular',widthInches:36,heightInches:60,onUpdateFields:()=>{}}));
  expect(html).toContain('Sundance cellular operating system');expect(html).toContain('Sundance cellular bottom fabric');expect(html).toContain('$500');
  const secondary=html.split('aria-label="Sundance cellular bottom fabric"')[1].split('</select>')[0];expect(secondary).toContain('PS320-001');expect(secondary).not.toContain('PS310-001');
});
