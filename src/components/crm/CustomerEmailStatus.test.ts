// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CustomerEmailStatus } from './CustomerEmailStatus';

vi.mock('@/lib/supabase-browser', () => ({ getSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } } }) } }) }));

it('keeps email issues compact while preserving delivery details and refresh', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ activated: true, ok: false, attention: 2, workerFailed: true }) });
  vi.stubGlobal('fetch', fetch);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(CustomerEmailStatus, { compact: true })));
    expect(host.querySelector('h3')).toBeNull();
    expect(host.querySelector('summary')?.textContent).toBe('2 email issues');
    expect(host.querySelector('details')?.open).toBe(false);
    await act(async () => host.querySelector('summary')!.click());
    expect(host.querySelector('details')?.open).toBe(true);
    expect(host.textContent).toContain('The latest email worker run failed');
    fetch.mockResolvedValue({ ok: true, json: async () => ({ activated: true, ok: true }) });
    await act(async () => host.querySelector('button')!.click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(host.querySelector('summary')?.textContent).toBe('Emails current');
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it('marks one attention email handled and leaves delivered or resolved rows alone', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const attention = { id: '6f1c2b7e-8a4d-4e1a-9c3b-2d5e6f708192', kind: 'signed_contract', status: 'blocked', recipient: 'missing', created_at: '2026-09-27T22:30:13.477Z', provider_accepted_at: null, delivery_status: null, delivery_checked_at: null, delivery_error: null, last_error: 'The signed customer contract has no valid customer email.', attention_resolved_at: null };
  const delivered = { ...attention, id: '7a1c2b7e-8a4d-4e1a-9c3b-2d5e6f708193', status: 'accepted', delivery_status: 'delivered', last_error: null };
  const handled = { ...attention, id: '8b1c2b7e-8a4d-4e1a-9c3b-2d5e6f708194', attention_resolved_at: '2026-11-15T18:00:00.000Z', attention_resolved_by: '805shutters@gmail.com', attention_resolved_note: 'Called' };
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => ({ ok: true, json: async () => String(url).includes('/resolve') ? { ok: true } : { messages: [attention, delivered, handled], activation: '2026-09-24T00:00:00.000Z' } }));
  vi.stubGlobal('fetch', fetch);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(CustomerEmailStatus, { jobId: 'job-1' })));
    expect(host.querySelectorAll('button').length).toBe(2);
    const input = host.querySelector('input')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Called the customer'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Mark handled')!.click());
    const resolve = fetch.mock.calls.find(([url]) => String(url).includes('/resolve'));
    expect(resolve?.[1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer fixture-token' } });
    expect(JSON.parse(String(resolve?.[1]?.body))).toEqual({ id: attention.id, note: 'Called the customer' });
    expect(fetch.mock.calls.map(([url]) => String(url)).every(url => url.startsWith('/api/crm/customer-email-status'))).toBe(true);
    expect(host.textContent).toContain('Handled');
    expect(host.textContent).toContain('805shutters@gmail.com');
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
