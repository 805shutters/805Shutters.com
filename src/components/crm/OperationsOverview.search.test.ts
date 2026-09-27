// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatusOverview } from './OperationsOverview';
import { buildActiveJobsSnapshot } from '@/lib/crm/active-jobs';
import type { CrmDashboardData } from '@/lib/crm/types';

vi.mock('./CustomerEmailStatus', () => ({ CustomerEmailStatus: () => null }));

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


it('shows paid unsigned work accurately and signed jobs in sale-date order in both views', async () => {
  const fixture = {
    ...data,
    quotes: [
      { ...data.quotes[1], id: 'older', job_id: 'older-job', customer_name: 'Earlier sale', sold_at: '2026-09-22' },
      { ...data.quotes[1], id: 'signed', job_id: 'signed-job', customer_name: 'Signed sale', status: 'sent', sold_at: null, signed_at: '2026-09-23T18:00:00Z', source_signed_at: '2026-09-23T18:00:00Z', source_sold_at: null },
      { ...data.quotes[1], id: 'unsigned', job_id: 'unsigned-job', customer_name: 'Paid unsigned', status: 'sent', live_status: 'sold', sold_at: null, signed_at: null, source_signed_at: null, source_sold_at: null },
    ],
    bookkeepingRows: [
      { id: 'signed', source: 'crm_quote', quoteId: 'signed', jobId: 'signed-job', sourceSoldDate: null, total: 1000, balance: 500, depositDue: 500, depositPaid: 500 },
      { id: 'unsigned', source: 'crm_quote', quoteId: 'unsigned', jobId: 'unsigned-job', sourceSoldDate: null, total: 1000, balance: 500, depositDue: 500, depositPaid: 500 },
    ],
  } as unknown as CrmDashboardData;
  await render(fixture);
  expect(cards()).toEqual(['Job status for Signed sale', 'Job status for Earlier sale', 'Job status for Paid unsigned']);
  const verify = () => {
    expect(host.querySelector('[aria-label="Review Sold for Signed sale"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[aria-label="Record Sold for Paid unsigned"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[aria-label="Review Deposit for Paid unsigned"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).toContain('Payment received · Signature needed');
    expect(host.textContent).toContain('Sep 23, 2026');
  };
  verify();
  await act(async () => [...host.querySelectorAll('label')].find(label => label.textContent === 'List view')!.querySelector('input')!.click());
  verify();
  expect([...host.querySelectorAll('tr[aria-label]')].map(el => el.getAttribute('aria-label'))).toEqual(['Job status for Signed sale', 'Job status for Earlier sale', 'Job status for Paid unsigned']);
  await filter('Sold');
  expect(host.textContent).not.toContain('Paid unsigned');
  await filter('Deposit');
  expect(host.textContent).toContain('Paid unsigned');
  expect(action).not.toHaveBeenCalled();
});
