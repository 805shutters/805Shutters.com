import { createHmac } from 'node:crypto';
import { after, NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { POST } from './route';
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({ getSupabaseServiceClient: vi.fn() }));
const writes = vi.fn();
beforeEach(() => { vi.clearAllMocks(); process.env.SQUARE_WEBHOOK_URL = 'https://test.invalid/api/webhooks/square/'; process.env.SQUARE_WEBHOOK_SIGNING_KEY = 'test-key'; writes.mockResolvedValue({ error: null }); vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: (table: string) => { expect(table).toBe('crm_square_events'); return { upsert: writes }; } } as never); });
function request(type = 'payment.updated', valid = true, patch: Record<string, unknown> = {}) {
 const raw = JSON.stringify({ event_id: 'event1', merchant_id: 'merchant1', type, data: { id: 'payment1', object: { payment: { id: 'payment1', status: 'COMPLETED', amount_money: { amount: 10000, currency: 'USD' }, metadata: { quote_id: 'forged' } } } }, ...patch });
 const signature = createHmac('sha256', 'test-key').update(`https://test.invalid/api/webhooks/square/${raw}`).digest('base64');
 return new NextRequest('https://test.invalid/api/webhooks/square/', { method: 'POST', body: raw, headers: { 'x-square-hmacsha256-signature': valid ? signature : 'wrong' } });
}
it.each(['payment.created','payment.updated','refund.created','refund.updated','dispute.created','dispute.state.updated','payout.paid','payout.failed'])('durably stores %s without trusting money/CRM metadata', async type => {
 expect((await POST(request(type))).status).toBe(200);
 expect(writes).toHaveBeenCalledWith(expect.objectContaining({ id: 'event1', object_id: 'payment1', event_type: type, merchant_id: 'merchant1' }), { onConflict: 'environment,id', ignoreDuplicates: true });
 expect(writes.mock.calls[0][0]).not.toHaveProperty('amount_money'); expect(after).toHaveBeenCalledOnce();
});
it('asks Square to retry if storage fails, never acknowledging a lost event', async () => { writes.mockResolvedValue({ error: { message: 'unavailable' } }); expect((await POST(request())).status).toBe(503); expect(after).not.toHaveBeenCalled(); });
it('rejects forged signatures and events without stable identities', async () => { expect((await POST(request('payment.updated', false))).status).toBe(401); expect((await POST(request('payment.updated', true, { event_id: '' }))).status).toBe(400); expect(writes).not.toHaveBeenCalled(); });
it('does not queue the exact Square test fixture as customer money', async () => {
 expect((await POST(request('payment.updated', true, { data: { object: { payment: { id: 'hYy9pRFVxpDsO1FB05SunFWUe9JZY', order_id: '03O3USaPaAaFnI6kkwB1JxGgBsUZY', status: 'COMPLETED', amount_money: { amount: 100, currency: 'USD' }, created_at: '2020-11-22T21:16:51.086Z' } } } }))).status).toBe(200); expect(writes).not.toHaveBeenCalled();
});
