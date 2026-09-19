// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { SquareFinanceWorkspace } from './SquareFinanceWorkspace';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const session = { access_token: 'test-only' } as Session;
const payment = (id: string, occurred_at: string) => ({ id, kind: 'payment', status: 'COMPLETED', occurred_at, amount_cents: 12500, fee_cents: 390, details: {} });
const baseline = () => ({
  environment: 'production', canReview: true, objects: [payment('older', '2026-09-17T18:00:00Z'), payment('newer', '2026-09-19T18:00:00Z')],
  allocations: [], bankMatches: [], classifications: [], events: [], requests: [], credits: [], quotes: [], entries: [], payments: [], alerts: [], smsConfigured: true,
  sync: { history_from: '2020-01-01T00:00:00Z', last_finished_at: null, state: {} },
  totals: { completedGrossCents: 25000, assignedGrossCents: 0, knownFeeCents: 780, feesPending: 0, completedRefundCents: 0, pendingCount: 0 }, webhook: { configured: false, url: null },
});
let data: ReturnType<typeof baseline>;
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
let sync: () => Promise<Response>;
const json = (body: unknown) => new Response(JSON.stringify(body), {status: 200});
let fetchMock: ReturnType<typeof vi.fn>;
const postCount = () => fetchMock.mock.calls.filter(call => call[1]?.method === 'POST').length;
async function mount() { await act(() => root.render(React.createElement(SquareFinanceWorkspace, {session}))); }
async function tick(ms = 60_000) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function click(text: string) { await act(() => { [...container.querySelectorAll('button')].find(button => button.textContent === text)!.click(); }); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T19:00:00Z'));
  vi.stubGlobal('React', React);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  data = baseline(); sync = async () => json({ status: 'synced' });
  fetchMock = vi.fn(async (_url: string, options: RequestInit) => options.method === 'POST' ? sync() : json(data));
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Square transaction home', () => {
  it('opens the newest-first transaction feed and checks Square immediately', async () => {
    await mount();
    expect(container.querySelector('nav button[aria-pressed=true]')?.textContent).toBe('Transactions');
    expect([...container.querySelectorAll('tbody button')].map(b => b.getAttribute('aria-label'))).toEqual(['View payment newer', 'View payment older']);
    expect(postCount()).toBe(1);
    expect(container.textContent).toContain('Checks Square every minute while open');
  });
  it('automatically inserts the newest payment and cleans up its timer on unmount', async () => {
    await mount(); data.objects.push(payment('latest', '2026-09-19T19:01:00Z'));
    await tick();
    expect(container.querySelector('tbody button')?.getAttribute('aria-label')).toBe('View payment latest');
    expect(postCount()).toBe(2);
    await act(() => root.unmount()); root = createRoot(container);
    await tick(); expect(postCount()).toBe(2);
  });
  it('pauses hidden tabs and resumes on visibility without making duplicate requests', async () => {
    await mount();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await tick(); expect(postCount()).toBe(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    expect(postCount()).toBe(2);
  });
  it('does not overlap slow imports or refresh a payment review form', async () => {
    let finish!: (r: Response) => void;
    sync = () => new Promise(resolve => { finish = resolve; });
    await mount(); await tick(120_000); expect(postCount()).toBe(1);
    await act(() => finish(json({status:'synced'})));
    await act(() => { (container.querySelector('tbody button') as HTMLButtonElement).click(); });
    await tick(); expect(postCount()).toBe(1);
    expect(container.querySelector('textarea')).not.toBeNull();
    await click('Close'); expect(postCount()).toBe(2);
    await act(() => finish(json({status:'synced'})));
  });
  it('keeps previous payments visible when an automatic refresh fails', async () => {
    await mount(); sync = async () => { throw new Error('Square is unavailable'); };
    await tick();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Square is unavailable');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.textContent).toContain('Refresh needs attention');
  });
  it('refreshes read-only users without initiating a provider sync', async () => {
    data.canReview = false; await mount(); await tick();
    expect(postCount()).toBe(0);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(container.textContent).toContain('Updates this list every minute');
  });
});
