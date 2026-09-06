import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/crm/auth', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/crm/auth')>(), requireCrmUser: mock.auth }));
import { GET } from './route';
describe('communication hub release readiness', () => {
  beforeEach(() => {
    mock.limit.mockReset().mockResolvedValue({ error: null });
    mock.rpc.mockReset().mockResolvedValue({ error: null, data: null });
    mock.auth.mockReset().mockResolvedValue({ supabase: { from: () => ({ select: () => ({ limit: mock.limit }) }), rpc: mock.rpc } });
  });
  it('allows the hub only when its tables and fingerprint RPC are available', async () => {
    const result = await GET(new NextRequest('http://localhost/api/crm/quote-hub/status'));
    expect(await result.json()).toEqual({ ready: true });
    expect(mock.rpc).toHaveBeenCalledWith('quote_hub_fingerprint', { p_quote_id: '00000000-0000-0000-0000-000000000000' });
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });
  it('keeps the original sent list when a migration table is missing', async () => {
    mock.limit.mockResolvedValueOnce({ error: { code: '42P01' } });
    expect(await (await GET(new NextRequest('http://localhost/api/crm/quote-hub/status'))).json()).toEqual({ ready: false });
  });
  it('keeps the original sent list when the RPC is unavailable', async () => {
    mock.rpc.mockResolvedValueOnce({ error: { code: 'PGRST202' } });
    expect(await (await GET(new NextRequest('http://localhost/api/crm/quote-hub/status'))).json()).toEqual({ ready: false });
  });
});
