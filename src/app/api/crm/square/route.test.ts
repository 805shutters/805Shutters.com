import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { CrmAuthError, requireCrmUser } from '@/lib/crm/auth';
import { syncSquareFinance } from '@/lib/crm/square-finance';
import { GET, POST } from './route';
vi.mock('@/lib/crm/auth', async original => ({ ...await original<typeof import('@/lib/crm/auth')>(), requireCrmUser: vi.fn() }));
vi.mock('@/lib/crm/square-finance', () => ({ syncSquareFinance: vi.fn(), squareFinanceRows: vi.fn() }));
const rpc = vi.fn();
const request = (body: object) => new NextRequest('https://www.805shutters.com/api/crm/square/', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: { status: 'linked' }, error: null }); });
it('rejects unauthenticated reads and writes before any finance operation', async () => {
  vi.mocked(requireCrmUser).mockRejectedValue(new CrmAuthError(401, 'CRM session is required.'));
  expect((await GET(new NextRequest('https://www.805shutters.com/api/crm/square/'))).status).toBe(401);
  expect((await POST(request({ action: 'sync' }))).status).toBe(401);
  expect(syncSquareFinance).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
it('rejects another CRM user even when the submitted actor claims to be Mike', async () => {
  vi.mocked(requireCrmUser).mockResolvedValue({ email: 'staff@example.com', supabase: { rpc } } as never);
  expect((await POST(request({ action: 'allocate', actor: '805shutters@gmail.com', evidence: 'exact receipt', amountCents: 100 }))).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
it('uses the verified owner identity and preserves existing-credit linkage', async () => {
  vi.mocked(requireCrmUser).mockResolvedValue({ email: '805shutters@gmail.com', supabase: { rpc } } as never);
  const body = { action: 'allocate', paymentId: 'square1', quoteId: 'quote1', existingPaymentId: 'credit1', decisionId: 'decision1', amountCents: 10000, evidence: 'Verified original receipt', actor: 'forged' };
  expect((await POST(request(body))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('allocate_square_payment', expect.objectContaining({ p_actor: '805shutters@gmail.com', p_existing_payment_id: 'credit1', p_amount_cents: 10000 }));
});
