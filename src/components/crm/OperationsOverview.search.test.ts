// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatusOverview } from './OperationsOverview';
import { buildActiveJobsSnapshot } from '@/lib/crm/active-jobs';
import type { CrmDashboardData } from '@/lib/crm/types';

const at = '2026-09-01';
const data = {
  jobs: [],
  quotes: [
    { id: 'q-closed', customer_name: 'John Charamonte', quote_number: '805-0252', status: 'sold', quote_total: 702, balance_due: 0, created_at: at, meta: {} },
    { id: 'q-open', customer_name: 'Open customer', status: 'sold', quote_total: 1000, balance_due: 500, created_at: at, meta: {} },
    { id: 'q-lost', customer_name: 'Lost customer', status: 'lost', quote_total: 500, balance_due: 500, created_at: at, meta: {} },
    { id: 'q-archived', customer_name: 'Archived customer', status: 'archived', quote_total: 500, balance_due: 500, created_at: at, meta: {} },
  ],
  bookkeepingRows: [], customerFiles: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [], bookkeepingPayments: [],
} as unknown as CrmDashboardData;
let host: HTMLDivElement, root: Root;
const action = vi.fn();
const snapshot = buildActiveJobsSnapshot(data);
async function render(full: CrmDashboardData | null = data, onLoadAll?: () => Promise<unknown>) {
  await act(async () => root.render(createElement(JobStatusOverview, { data: full, activeSnapshot: snapshot, onLoadAll, busy: false, onOpen: vi.fn(), onSaveCost: async () => true, onAction: action })));
}
async function search(query: string) {
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>('input[type=search]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function cards() { return [...host.querySelectorAll('article[aria-label]')].map(el => el.getAttribute('aria-label')); }
async function filter(label: string) {
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('nav button')].find(el => el.textContent === label)!.click());
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); action.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe('search across all job statuses', () => {
  it('finds a closed job regardless of every highlighted filter and restores the filter when cleared', async () => {
    await render();
    expect(cards()).not.toContain('Job status for John Charamonte');
    await search('  CHARAmONTE  ');
    expect(cards()).toEqual(['Job status for John Charamonte']);
    for (const label of ['Quote', 'Sold', 'Deposit', 'Ordered', 'Shipped', 'Installed', 'Balance paid']) {
      await filter(label);
      expect(cards()).toEqual(['Job status for John Charamonte']);
    }
    await search('');
    expect(cards()).toEqual(['Job status for John Charamonte']); // Balance paid remains selected.
    await filter('Balance paid'); // Return to active.
    expect(cards()).not.toContain('Job status for John Charamonte');
    expect(action).not.toHaveBeenCalled();
  });
  it('includes lost and archived jobs even when Sold is selected', async () => {
    await render(); await filter('Sold');
    for (const name of ['Lost customer', 'Archived customer']) {
      await search(name);
      expect(cards()).toEqual([`Job status for ${name}`]);
    }
    await search('no matching customer');
    expect(host.textContent).toContain('No jobs match this view.');
  });
  it('loads history from an active-only start and waits before reporting results', async () => {
    let finish!: () => void;
    const load = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    await render(null, load);
    await search('   '); expect(load).not.toHaveBeenCalled();
    await search('Chara'); await search('Charamonte');
    expect(load).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('Loading all jobs');
    expect(host.textContent).not.toContain('No jobs match');
    await render(data, load); await act(async () => finish());
    expect(cards()).toEqual(['Job status for John Charamonte']);
    await search('');
    expect(cards()).not.toContain('Job status for John Charamonte');
  });
  it('shows a load failure instead of false empty results and supports clearing to retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('History unavailable')).mockResolvedValue(undefined);
    await render(null, load); await search('Charamonte');
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Clear search and try again');
    expect(host.textContent).not.toContain('No jobs match');
    await render(null, load); expect(load).toHaveBeenCalledOnce();
    await search(''); await search('Charamonte');
    expect(load).toHaveBeenCalledTimes(2);
    await render(data, load);
    expect(cards()).toEqual(['Job status for John Charamonte']);
  });
});
