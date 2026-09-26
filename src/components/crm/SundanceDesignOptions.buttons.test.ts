// @vitest-environment happy-dom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { SundanceDesignOptions } from './SundanceDesignOptions';
import { sundanceCellularSelectionPatch } from '@/lib/quote/sundance/configuration';
import type { SalesQuoteDesign } from '@mts/types/quote';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
type DraftDesign = Partial<SalesQuoteDesign> & Pick<SalesQuoteDesign, "options_json">;
let saved: DraftDesign;
let writes: number;
function Harness() {
  const [design, setDesign] = useState<DraftDesign>({
    options_json: sundanceCellularSelectionPatch({ sundance_cellular_system: 'Somfy Cord Lift WireFree TL25', mount_type: 'Inside', sundance_cellular_assembly: 'Single', untouched: 'keep' }, 'sundance_cellular:PU422SS-766')!,
  });
  saved = design;
  return React.createElement(SundanceDesignOptions, { productId: 'sundance_cellular', design, widthInches: 48, heightInches: 60,
    onUpdateFields: fields => { writes++; setDesign(old => ({ ...old, ...fields })); },
  });
}
beforeEach(async () => { writes = 0; host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(() => root.render(React.createElement(Harness))); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
const button = (name: string) => {
  const found = [...host.querySelectorAll('button')].find(el => (el.getAttribute('aria-label') ?? el.textContent?.replace('✓', '').trim()) === name);
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
};
const click = async (name: string) => act(() => button(name).click());

it('keeps exact saved fabric and pricing identity when tapping an already selected choice', async () => {
  const before = structuredClone(saved);
  await click('3/4"'); await click('Blackout'); await click('Somfy Cord Lift WireFree TL25');
  expect(saved).toEqual(before); expect(writes).toBe(0);
  expect(host.querySelectorAll('select')).toHaveLength(0);
});
it('changes mount using buttons and clears stale mount measurements without changing the fabric', async () => {
  await click('Outside');
  expect(saved.mount_type).toBe('Outside');
  expect(saved.options_json).toMatchObject({ mount_type: 'Outside', fabric_color_id: 'sundance_cellular:PU422SS-766', sundance_cellular_mount_depth: null, untouched: 'keep' });
  expect(button('Outside').getAttribute('aria-pressed')).toBe('true');
});
it('clears the old fabric price route when its light-control filter changes', async () => {
  await click('Light Filtering');
  expect(saved.fabric).toBeNull();
  expect(saved.options_json).toMatchObject({ light_control: 'Light Filtering', fabric_color_id: null, catalog_program_id: null, untouched: 'keep' });
});
it('adds, increments and removes an accessory using the original saved quantity key', async () => {
  const label = 'Somfy Li-ion charger V2, 13-foot cable';
  const before = { ...saved.options_json };
  await click(`Add ${label}`);
  const changedKey = Object.keys(saved.options_json!).find(key => saved.options_json![key] !== before[key])!;
  expect(changedKey).toContain('sundance_cellular_');
  expect(saved.options_json![changedKey]).toBe('1');
  await click(`Increase ${label}`); expect(saved.options_json![changedKey]).toBe('2');
  await click(`Decrease ${label}`); await click(`Decrease ${label}`);
  expect(saved.options_json![changedKey]).toBe('0'); expect(button(`Add ${label}`)).toBeTruthy();
  expect(saved.options_json).toMatchObject(before);
  expect(host.querySelectorAll('input[type="number"]')).toHaveLength(0);
});
it('searches fabric buttons and saves the exact catalog route', async () => {
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Ivory'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  const fabrics = host.querySelector('[role="group"][aria-label="Sundance fabric and color"]')!;
  expect(fabrics.querySelectorAll('button')).toHaveLength(2); // Matching fabric plus current selection.
  await click('PU42SS-765 · Cell-In-A-Cell 3/4" · Ivory · Blackout');
  expect(saved.options_json).toMatchObject({ fabric_color_id: 'sundance_cellular:PU42SS-765', fabric_color_code: 'PU42SS-765', fabric_color_name: 'Ivory', untouched: 'keep' });
  expect(saved.options_json!.catalog_program_id).toBeTruthy();
});

it('defaults SheerView to single and exposes a persisted two-on-one upgrade',async()=>{
  let patch:Partial<SalesQuoteDesign>|undefined;
  await act(()=>root.render(React.createElement(SundanceDesignOptions,{productId:'sundance_sheerview',design:{options_json:{catalog_program_id:'sundance_sheerview_p23_t1',untouched:'keep'}},widthInches:60,heightInches:60,onUpdateFields:fields=>{patch=fields;}})));
  const select=host.querySelector<HTMLSelectElement>('select[aria-label="Sundance SheerView assembly"]')!;
  expect(select.value).toBe('Single');
  expect(host.textContent).toContain('two-on-one is a priced upgrade');
  await act(()=>{select.value='Two on one';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(patch?.options_json).toMatchObject({sundance_sheerview_assembly:'Two on one',untouched:'keep'});
});
