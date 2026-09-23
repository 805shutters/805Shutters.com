// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesQuoteDesign } from '@mts/types/quote';
import { NormanRollerAccessoriesOptions } from './NormanRollerAccessoriesOptions';
import { NormanRollerHardwareOptions } from './NormanRollerHardwareOptions';
import { emptyRollerHardware, ROLLER_HARDWARE_KEY } from '@/lib/quote/norman-roller-hardware';
import { NormanRollerChainOptions } from './NormanRollerChainOptions';
import { NormanSmartdrapeReplacementOptions } from './NormanSmartdrapeReplacementOptions';
import { NormanRollerValanceOptions } from './NormanRollerValanceOptions';
import { emptyReplacementRequest, SMARTDRAPE_REPLACEMENT_RECORD } from '@/lib/quote/norman-smartdrape-replacement';
import { emptyRollerValance, ROLLER_VALANCE_KEY, ROLLER_SEPARATE_VALANCE } from '@/lib/quote/norman-roller-valance-only';
import { NormanShutterPanelOptions } from './NormanShutterPanelOptions';
import { emptyRollerAccessories, ROLLER_ACCESSORY_KEY } from '@/lib/quote/norman-roller-accessories';
import { emptyRollerChain, ROLLER_CHAIN_KEY } from '@/lib/quote/norman-roller-chain';
import { emptyNormanBifold90 } from '@/lib/quote/norman-shutter-bifold90';
import { NORMAN_SHUTTER_PANEL_RECORD } from '@/lib/quote/norman-shutter-panels';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
const design = (options_json: Record<string, unknown>) => ({ id: 'test-line', lift_system: 'Continuous Cord Loop', panel_config: 'LLRR', options_json }) as SalesQuoteDesign;
async function render(element: React.ReactElement) { await act(() => root.render(element)); }
async function select(label: string, value: string) {
  await act(() => {
    const node = host.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
    expect(node).not.toBeNull(); node.value = value; node.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function save(label: string) {
  const node = [...host.querySelectorAll('button')].find(button => button.textContent === label)!;
  expect(node.disabled).toBe(false); await act(() => node.click());
}

describe('Norman pricing-only quote controls', () => {
  it('asks for Roller mounting details only when purchased shims need their quantity basis', async () => {
    const base = emptyRollerHardware();
    const props = { design: design({ [ROLLER_HARDWARE_KEY]: base }), pricingOnly: true, onUpdateFields: vi.fn() };
    await render(React.createElement(NormanRollerHardwareOptions, props));
    expect(host.querySelector('[aria-label="Roller hardware installation"]')).toBeNull();
    expect(host.querySelector('[aria-label="Confirmed Roller physical tube diameter"]')).toBeNull();
    expect(host.querySelector('[aria-label="Roller shim layers"]')).not.toBeNull();
    await render(React.createElement(NormanRollerHardwareOptions, { ...props, design: design({ [ROLLER_HARDWARE_KEY]: { ...base, shimLayers: 1 } }) }));
    expect(host.querySelector('[aria-label="Roller hardware installation"]')).not.toBeNull();
  });
  it('keeps priced magnet choices editable, hides installation inputs, and preserves saved measurements', async () => {
    const record = { ...emptyRollerAccessories(), holdDown: 'Magnetic' as const, leftClearance: 1, rightClearance: 2, bottomClearance: 3 };
    const onUpdateFields = vi.fn();
    await render(React.createElement(NormanRollerAccessoriesOptions, { design: design({ [ROLLER_ACCESSORY_KEY]: record, historical_note: 'keep' }), onUpdateFields, pricingOnly: true }));
    expect(host.querySelectorAll('input')).toHaveLength(0);
    expect(host.textContent).not.toContain('Measure beyond');
    await select('Roller magnet catch color', 'Black'); await save('Save Roller accessories');
    expect(onUpdateFields).toHaveBeenCalledExactlyOnceWith({ options_json: { historical_note: 'keep', [ROLLER_ACCESSORY_KEY]: { ...record, magnetColor: 'Black' } } });
  });

  it('keeps chain options editable and preserves hidden safety evidence on save', async () => {
    const record = { ...emptyRollerChain(), lengthMode: 'Custom' as const, customLength: 30, unobstructedBelow: true, deviceClearance: 2.5, safetyDeviceConfirmed: true };
    const onUpdateFields = vi.fn();
    await render(React.createElement(NormanRollerChainOptions, { design: design({ [ROLLER_CHAIN_KEY]: record }), onUpdateFields, pricingOnly: true }));
    expect(host.querySelector('[aria-label="Roller custom chain length"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Roller tension device clearance"]')).toBeNull();
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    await select('Roller chain material', 'Stainless Steel'); await save('Save Roller chain');
    expect(onUpdateFields).toHaveBeenCalledExactlyOnceWith({ options_json: { [ROLLER_CHAIN_KEY]: { ...record, material: 'Stainless Steel' } } });
  });

  it('retains full ordering controls when pricing-only mode is not requested', async () => {
    await render(React.createElement(NormanRollerAccessoriesOptions, { design: design({ [ROLLER_ACCESSORY_KEY]: { ...emptyRollerAccessories(), holdDown: 'Magnetic' } }), onUpdateFields: vi.fn() }));
    expect(host.querySelectorAll('input[type="number"]')).toHaveLength(3);
    await render(React.createElement(NormanRollerChainOptions, { design: design({ [ROLLER_CHAIN_KEY]: { ...emptyRollerChain(), lengthMode: 'Custom', customLength: 30 } }), onUpdateFields: vi.fn() }));
    expect(host.querySelector('[aria-label="Roller tension device clearance"]')).not.toBeNull();
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it('hides the replacement work-order reference but preserves it when priced pack selections change', async () => {
    const record = { ...emptyReplacementRequest(), originalWorkOrder: 'previous-order', style: 'A' as const, vaneLengthInches: 82.625, shadeLengthInches: 84 };
    const onUpdateFields = vi.fn();
    const props = { design: design({ [SMARTDRAPE_REPLACEMENT_RECORD]: record }), onUpdateFields };
    await render(React.createElement(NormanSmartdrapeReplacementOptions, props));
    expect(host.querySelector('[aria-label="Original Norman work-order number"]')).not.toBeNull();
    await render(React.createElement(NormanSmartdrapeReplacementOptions, { ...props, pricingOnly: true }));
    expect(host.querySelector('[aria-label="Original Norman work-order number"]')).toBeNull();
    expect(host.querySelector('[aria-label="Requested finished vane length"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('[aria-label="Original shade length"]')?.value).toBe('84');
    await select('Replacement pack style', 'B'); await save('Save replacement request');
    expect(onUpdateFields.mock.calls[0][0].options_json[SMARTDRAPE_REPLACEMENT_RECORD]).toEqual({ ...record, style: 'B' });
  });

  it('hides separate-valance control-clearance confirmation while retaining associated priced shades', async () => {
    const record = { ...emptyRollerValance(), controlClearanceConfirmed: true };
    const onUpdateFields = vi.fn();
    const roller = { ...design({ catalog_product_id: 'roller' }), supplier: 'Norman' } as SalesQuoteDesign;
    const props = { design: design({ [ROLLER_VALANCE_KEY]: record }), productId: ROLLER_SEPARATE_VALANCE,
      lineOptions: [{ lineId: 'shade-1', label: 'Associated shade', design: roller }], onUpdateFields };
    await render(React.createElement(NormanRollerValanceOptions, props));
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    await render(React.createElement(NormanRollerValanceOptions, { ...props, pricingOnly: true }));
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect(host.textContent).not.toContain('Space is available for all required');
    await act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await save('Save Roller valance');
    expect(onUpdateFields.mock.calls[0][0].options_json[ROLLER_VALANCE_KEY]).toEqual({ ...record, associatedLineIds: ['shade-1'] });
  });

  it.each(['bifold_180', 'bifold_other'] as const)('hides %s flat-surface confirmation while retaining priced application and motor controls', async application => {
    const record = { version: 1, application, motor: 'none', existingDoorGlassOrSidelight: false, panels: [],
      ...(application === 'bifold_180' ? { bifold180: { version: 1, layout: 'LLRR', flatMountingSurface: true } } : { bifold90: { ...emptyNormanBifold90(), kind: 'standard_90', layout: 'LLRR', flatMountingSurface: true } }) };
    const onUpdateFields = vi.fn();
    const props = { design: design({ catalog_program_id: 'woodlore', [NORMAN_SHUTTER_PANEL_RECORD]: record }), onUpdateFields };
    const label = application === 'bifold_180' ? 'Norman Bi-fold 180 flat mounting surface' : 'Norman Bi-fold 90 flat mounting surface';
    await render(React.createElement(NormanShutterPanelOptions, props));
    expect(host.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    await render(React.createElement(NormanShutterPanelOptions, { ...props, pricingOnly: true }));
    expect(host.querySelector(`[aria-label="${label}"]`)).toBeNull();
    expect(host.querySelector('[aria-label="Norman shutter application"]')).not.toBeNull();
    await select('Norman shutter motor generation', 'perfect_tilt_g4'); await save('Save panel construction');
    const saved = onUpdateFields.mock.calls[0][0].options_json[NORMAN_SHUTTER_PANEL_RECORD];
    expect(saved.motor).toBe('perfect_tilt_g4');
    expect((saved.bifold180 ?? saved.bifold90).flatMountingSurface).toBe(true);
  });
});
