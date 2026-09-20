// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatusOverview, type WorkflowAction } from './OperationsOverview';
import type { CrmDashboardData } from '@/lib/crm/types';

const at = '2026-09-19T12:00:00Z';
const products = [['Shutters', 'Norman'], ['Roller Shades', 'Onyx'], ['Roller Shades', 'Norman']].map(([product_type, supplier], i) => ({ id: `${i+1}1111111-1111-4111-8111-111111111111`, quote_id: 'q1', job_id: 'j1', product_type, supplier, status: 'pending', quantity: 2, updated_at: at, meta: {} }));
const data = { jobs: [], quotes: [{ id: 'q1', job_id: 'j1', customer_name: 'Sample customer', quote_number: '805-DEMO', created_at: at, updated_at: at, status: 'sold', sold_at: at, quote_total: 6000, materials_cost: 1780.28, meta: {} }], bookkeepingRows: [], customerFiles: [], customerProducts: products, orderCogsEmails: [], installationInvoiceEmails: [], bookkeepingPayments: [] } as unknown as CrmDashboardData;
let host: HTMLDivElement, root: Root;
const action = vi.fn<WorkflowAction>(async () => {});
async function render(busy = false) { await act(async () => { root.render(createElement(JobStatusOverview, { data, busy, onOpen: vi.fn(), onSaveCost: async () => true, onAction: action })); }); }
async function toggle() { await act(async () => { host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click(); }); }
function button(label: string) { return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!; }
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); action.mockClear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe('condensed job view', () => {
  it('keeps the full-view financial values and all manufacturer controls in one customer row', async () => {
    await render();
    const finances = [...host.querySelectorAll('section[aria-label="Finances for Sample customer"] strong')].map(el => el.textContent);
    await toggle();
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    const row = host.querySelector('tbody tr')!;
    const cells = [...row.children];
    expect(cells.slice(9,17).map(el => el.querySelector('span')?.textContent)).toEqual(finances);
    for (const step of ['ordered', 'shipped']) {
      for (const [type, manufacturer] of [['Shutters','Norman'],['Roller Shades','Onyx'],['Roller Shades','Norman']]) expect(button(`Mark ${type} · ${manufacturer} ${step} for Sample customer`)).not.toBeNull();
    }
    expect(host.querySelector('article')).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });
  it('remembers the view after remount and restores cards without writing CRM data', async () => {
    await render(); await toggle();
    await act(async () => root.unmount()); root = createRoot(host); await render();
    expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    await toggle();
    expect(host.querySelector('article[aria-label="Job status for Sample customer"]')).not.toBeNull();
    expect(action).not.toHaveBeenCalled();
  });
  it('uses the existing workflow action and disables every completion control while busy', async () => {
    await render(); await toggle();
    await act(async () => button('Mark Installed for Sample customer').click());
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0][1]).toBe('installed');
    await render(true);
    expect([...host.querySelectorAll<HTMLButtonElement>('tbody button[aria-pressed]')].every(el => el.disabled)).toBe(true);
  });
});
