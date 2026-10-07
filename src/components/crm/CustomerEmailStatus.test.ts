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
