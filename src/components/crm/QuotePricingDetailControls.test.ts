// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesQuoteDesign, SalesQuoteLineItem } from '@mts/types/quote';
import { NormanContractDesignOptions } from './NormanContractDesignOptions';
import { SanClementeDesignOptions } from './SanClementeDesignOptions';
import { LotusObservedDesignOptions } from './LotusObservedDesignOptions';
import { SundanceCellularConfiguration } from './SundanceCellularConfiguration';
import { SundanceWaldenConfiguration } from './SundanceWaldenConfiguration';
import { SundanceHorizontalConfiguration } from './SundanceHorizontalConfiguration';
import { sundanceHorizontalOptionEvidence } from '@/lib/quote/sundance/horizontal-configuration';
import { sundanceWaldenOptionEvidence } from '@/lib/quote/sundance/walden-option-schedules';
import { validateSundanceCellularShape } from '@/lib/quote/sundance/cellular-configuration';
import { nonNormanQuoteIssues } from '@/lib/quote/non-norman-ordering-only';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
const lineItem = { width_whole: 36, height_whole: 60, width_fraction: '', height_fraction: '', quantity: 2 } as SalesQuoteLineItem;
const design = (options_json: Record<string, unknown>) => ({ mount_type: 'Inside Mount', lift_system: 'Cordless', valance: 'None', options_json }) as SalesQuoteDesign;
async function render(element: React.ReactElement) { await act(() => root.render(element)); }
async function select(label: string, value: string) {
  const node = host.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
  expect(node).not.toBeNull();
  await act(() => { node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('quote detail controls preserve the purchased product and order history', () => {
  it('hides Contract mounting evidence but saves customer hardware with existing evidence intact', async () => {
    const onUpdateFields = vi.fn();
    const props = { design: { ...design({ mount_depth_inches: 0.1, contract_mount_fit: 'Semi Inside Minimum', control_side: 'Left', contract_return_inches: 2, contract_wand_drop_inches: 29.75 }), valance: '2.5-inch Modern Curved' }, productId: 'norman_contract_faux_wood', lineItem, onUpdateFields };
    await render(React.createElement(NormanContractDesignOptions, { ...props, pricingOnly: true }));
    expect(host.querySelector('[aria-label="Contract mount fit"]')).toBeNull();
    expect(host.querySelector('[aria-label="Contract recess depth (inches)"]')).toBeNull();
    expect(host.textContent).not.toContain('recess depth in Norman');
    expect(host.querySelector('[aria-label="Contract wand drop"]')).toBeNull();
    expect(host.querySelector('[aria-label="Custom valance return (inches)"]')).toBeNull();
    expect(host.querySelector('[aria-label="Custom valance length (inches)"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Standard wand drop:');
    expect(host.querySelector('[aria-label="Contract color / slat size"]')).not.toBeNull();
    await select('Contract hold-down brackets', 'Yes');
    expect(onUpdateFields).toHaveBeenCalledWith(expect.objectContaining({ options_json: expect.objectContaining({ contract_hold_down_brackets: 'Yes', mount_depth_inches: 0.1, contract_mount_fit: 'Semi Inside Minimum' }) }));
    await render(React.createElement(NormanContractDesignOptions, props));
    expect(host.querySelector('[aria-label="Contract recess depth (inches)"]')).not.toBeNull();
    expect(host.textContent).toContain('recess depth in Norman');
    expect(host.querySelector('[aria-label="Contract wand drop"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Custom valance return (inches)"]')).not.toBeNull();
  });
  it.each(['san_clemente_honeycomb', 'san_clemente_faux_wood'])('hides %s installation inputs while retaining its product options', async productId => {
    const onUpdateFields = vi.fn();
    const props = { design: design({ mount_depth_inches: 0.1, san_clemente_mount_fit: 'Flush', installation_method: 'Side Only' }), productId, lineItem, onUpdateFields };
    await render(React.createElement(SanClementeDesignOptions, { ...props, pricingOnly: true }));
    for (const label of ['San Clemente mount fit', 'San Clemente recess depth', 'San Clemente bracket mounting']) expect(host.querySelector(`[aria-label="${label}"]`)).toBeNull();
    expect(host.textContent).not.toContain('depth of 3 7/16');
    expect(host.textContent).not.toContain('needs 1⅜ inches depth');
    expect(host.querySelector('[aria-label="San Clemente fabric / color"]')).not.toBeNull();
    if (productId.endsWith('honeycomb')) {
      await select('36-inch black pole with attachment', '1');
      expect(onUpdateFields).toHaveBeenCalledWith(expect.objectContaining({ options_json: expect.objectContaining({ san_clemente_pole_36_quantity: 1, mount_depth_inches: 0.1 }) }));
    }
    await render(React.createElement(SanClementeDesignOptions, props));
    expect(host.querySelector('[aria-label="San Clemente recess depth"]')).not.toBeNull();
  });
  it('keeps Lotus intended replacement model editable without asking for installed reference', async () => {
    const onUpdateFields = vi.fn();
    const props = { design: design({ lotus_observed_offering_id: 'lotus_observed_d88af993870e8d8ad72f', lotus_part_target_model: 'AMX', lotus_part_installed_reference: 'saved-order-reference' }), productId: 'lotus_dealer_listed_parts', onUpdateFields };
    await render(React.createElement(LotusObservedDesignOptions, { ...props, pricingOnly: true }));
    expect(host.querySelector('[aria-label="Lotus installed mechanism reference"]')).toBeNull();
    expect(host.textContent).not.toContain('observed September');
    expect(host.textContent).not.toContain('Installed mechanism revision');
    expect(host.textContent).toContain('Price confirmation required.');
    await select('Lotus part intended model', 'AMX');
    expect(onUpdateFields).toHaveBeenCalledWith(expect.objectContaining({ options_json: expect.objectContaining({ lotus_part_target_model: 'AMX', lotus_part_installed_reference: 'saved-order-reference' }) }));
    await render(React.createElement(LotusObservedDesignOptions, props));
    expect(host.querySelector('[aria-label="Lotus installed mechanism reference"]')).not.toBeNull();
  });
  it('keeps cellular shape and bounding-size rules without collecting polygon templates during quoting', async () => {
    const options = { sundance_cellular_system: 'Specialty Shape', sundance_cellular_shape: 'Hexagon', sundance_cellular_assembly: 'Single', sundance_cellular_template_reference: 'history', sundance_cellular_shape_side_1: 20 };
    const props = { options, widthInches: 36, heightInches: 36, onUpdateFields: vi.fn() };
    await render(React.createElement(SundanceCellularConfiguration, props));
    expect(host.querySelector('[aria-label="Sundance cellular specialty shape"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Sundance cellular shape side 1"]')).toBeNull();
    expect(host.querySelector('[aria-label="Sundance cellular template reference"]')).toBeNull();
    expect(host.textContent).not.toContain('Record all6 side');
    const incomplete = validateSundanceCellularShape({ widthInches: 36, heightInches: 36, configuration: { sundance_cellular_shape: 'Hexagon', sundance_cellular_assembly: 'Single' } });
    expect(incomplete.map(i => i.ruleId)).toEqual(['sundance.cellular.shape_sides', 'sundance.cellular.shape_template']);
    expect(nonNormanQuoteIssues(incomplete)).toEqual([]);
    expect(nonNormanQuoteIssues(validateSundanceCellularShape({ widthInches: 90, heightInches: 36, configuration: { sundance_cellular_shape: 'Hexagon', sundance_cellular_assembly: 'Single' } })).map(i => i.ruleId)).toContain('sundance.cellular.shape_size');
    await render(React.createElement(SundanceCellularConfiguration, { ...props, pricingOnly: false }));
    expect(host.querySelector('[aria-label="Sundance cellular shape side 1"]')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('[aria-label="Sundance cellular template reference"]')?.value).toBe('history');
  });
  it('preserves billed Walden cut-outs and hides only their shop drawing details', async () => {
    const options = { sundance_walden_style: 'Standard', sundance_walden_cutout_qty: 2, sundance_walden_cutout_details: 'saved template dimensions' };
    const props = { productId: 'sundance_walden_select', options, widthInches: 36, heightInches: 60, onUpdateFields: vi.fn() };
    await render(React.createElement(SundanceWaldenConfiguration, props));
    expect(host.querySelector('[aria-label="Sundance Walden Cut-out quantity"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Sundance Walden cut-out details"]')).toBeNull();
    expect(host.textContent).not.toContain('Inside factory width deduction');
    expect(host.textContent).toContain('included 6-inch lined front valance');
    expect(sundanceWaldenOptionEvidence(props.productId, options, 36, 60).entries).toContainEqual(expect.objectContaining({ label: 'Cut-outs × 2', retail: 78 }));
    await render(React.createElement(SundanceWaldenConfiguration, { ...props, pricingOnly: false }));
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Sundance Walden cut-out details"]')?.value).toBe('saved template dimensions');
  });
  it('preserves billed horizontal cut-out sides and existing details across hardware edits', async () => {
    const options = { sundance_blind_cutout_sides: 2, sundance_blind_cutout_details: 'saved side dimensions' };
    const onUpdateFields = vi.fn();
    const props = { productId: 'sundance_aluminum_1', options, widthInches: 36, heightInches: 60, onUpdateFields };
    await render(React.createElement(SundanceHorizontalConfiguration, props));
    expect(host.querySelector('[aria-label="Sundance blind Cut-out sides"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Sundance blind cut-out details"]')).toBeNull();
    expect(host.textContent).not.toContain('Factory inside blind-width deduction');
    expect(host.textContent).toContain('Cordless wand-tilt only');
    expect(sundanceHorizontalOptionEvidence(props.productId, options, 36).entries).toContainEqual(expect.objectContaining({ label: 'Cut-out sides', amount: 24, basis: 'net' }));
    await select('Sundance blind Hold-down brackets', 'Yes');
    expect(onUpdateFields).toHaveBeenCalledWith(expect.objectContaining({ options_json: expect.objectContaining({ sundance_blind_cutout_sides: 2, sundance_blind_cutout_details: 'saved side dimensions', sundance_blind_hold_down: 'Yes' }) }));
    await render(React.createElement(SundanceHorizontalConfiguration, { ...props, pricingOnly: false }));
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Sundance blind cut-out details"]')?.value).toBe('saved side dimensions');
  });
});
