import { it, expect, vi } from 'vitest';
const access = vi.hoisted(() => vi.fn(() => { throw new Error('Retired phone bridge accessed CRM'); }));
vi.mock('@/lib/supabase-server', () => ({ getSupabaseServiceClient: access }));
import { POST } from './route';
it.each(['find_appointments', 'prepare_appointment', 'commit'])('retired phone action %s cannot reach CRM even with activation enabled', async action => {
 vi.stubEnv('VOICE_805_BOOKING_AUTHORIZED', 'true');
 try {
  const result = await POST(new Request('https://www.805shutters.com/api/voice-805/scheduling', { method: 'POST', body: JSON.stringify({ action, dataset: 'production' }) }));
  expect(result.status).toBe(410); expect(await result.json()).toMatchObject({ saved: false }); expect(access).not.toHaveBeenCalled();
 } finally { vi.unstubAllEnvs(); }
});
