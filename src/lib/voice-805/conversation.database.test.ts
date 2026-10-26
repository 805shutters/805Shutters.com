import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { bookingDatabaseFixture } from '@/lib/booking/database-fixture';
import { prepareVoiceVisit, commitVoiceVisit } from './scheduling';
// Only the external geocoder is replaced. Availability, route validation,
// confirmation, atomic SQL writes and calendar read-back use production code.
vi.mock('@/lib/booking/geo', () => ({ geocodeBookingAddress: async () => ({
  configured: true, point: { lat: 34.2164, lng: -119.0376 },
  formattedAddress: '123 Test Street, Camarillo',
}) }));
// @ts-expect-error The deployed Edge service is native JavaScript.
import { GrokMediaSession } from '../../../services/voice-805/grok-media.mjs';
// @ts-expect-error The deployed Edge service is native JavaScript.
import { SupabaseState } from '../../../services/voice-805/supabase-store.mjs';
// @ts-expect-error The deployed Edge service is native JavaScript.
import { loadSupabaseConfig } from '../../../services/voice-805/supabase-config.mjs';

const db = new PGlite();
const now = new Date('2035-09-30T18:00:00Z');
beforeAll(async () => {
  const phone = readFileSync('supabase/migrations/20261011014441_voice_805_supabase_call_center.sql', 'utf8').split('create function public.voice_805_normalize_phone')[0];
  await db.exec(bookingDatabaseFixture() + phone + readFileSync('supabase/migrations/20261019230000_voice_805_confirmed_booking.sql', 'utf8') + readFileSync('supabase/migrations/20261020035500_voice_805_agent_staff_notice.sql', 'utf8'));
}, 30000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec(`truncate booking_travel_buffer_exceptions,booking_outbox,booking_requests,booking_route_protections,crm_quotes,crm_calendar_events,crm_jobs,leads,sales_805_appointments,crm_availability_slots cascade;
    update voice_805_state set body='{"entities":{"call":{}},"events":{},"inbound":{}}',revision=0;`);
  const snap = await db.query<{ s: { revision: string } }>("select booking_schedule_snapshot('2035-10') s");
  await db.query('select booking_publish_ranges($1,$2,$3,$4)', ['2035-10', snap.rows[0].s.revision, JSON.stringify([{ start_at: '2035-10-01T15:00:00Z', end_at: '2035-10-02T00:00:00Z' }]), 'test@local.invalid']);
});

// Supabase wire adapter to an isolated PostgreSQL engine. It calls the actual
// migrations, including voice_805_commit CAS and voice_805_book_confirmed.
const client: any = {
  async rpc(name: string, args: Record<string, unknown>) {
    const fields: Record<string, string[]> = {
      booking_schedule_snapshot: ['p_month'], voice_805_commit: ['p_id', 'p_revision', 'p_body'],
      voice_805_book_confirmed: ['p_call_id', 'p_intent_id', 'p_payload', 'p_hash', 'p_revision', 'p_lead', 'p_job', 'p_event', 'p_proofs'],
    };
    if (!fields[name]) throw new Error('Unexpected RPC');
    try {
      const values = fields[name].map(key => typeof args[key] === 'object' ? JSON.stringify(args[key]) : args[key]);
      const result = await db.query<{ data: unknown }>(`select ${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) data`, values);
      return { data: result.rows[0].data, error: null };
    } catch (error) { return { data: null, error: { message: String(error) } }; }
  },
  from(table: string) {
    if (!['voice_805_state', 'booking_requests', 'crm_calendar_events', 'booking_outbox'].includes(table)) throw new Error('Unexpected table');
    let columns = '*', key = '', value: unknown;
    const read = async (single = false) => {
      const result = await db.query(`select ${columns} from ${table} where "${key}"=$1`, [value]);
      return { data: single ? result.rows[0] || null : result.rows, error: null };
    };
    return {
      select(next: string) { if (!/^[a-z_,]+$/.test(next)) throw new Error('Invalid columns'); columns = next; return this; },
      eq(next: string, val: unknown) { if (!/^[a-z_]+$/.test(next)) throw new Error('Invalid key'); key = next; value = val; return this; },
      single: () => read(true), maybeSingle: () => read(true),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => read().then(resolve, reject),
    };
  },
};

it.each([false, true])('full conversation verifies a durable CRM booking; withdrawn slot=%s', async withdrawn => {
  const config = { ...loadSupabaseConfig({}), transport: 'media', mode: 'live', dataset: 'production', xaiKey: 'isolated',
    liveAuthorized: true, agentReviewed: true, agentContractVerified: true, workerVerified: true,
    number: '+18055550100', accountSid: 'AC' + 'a'.repeat(32),
    hours: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, [[0, 1440]]])), holidays: {},
  };
  const state = new SupabaseState(client, config);
  const call = await state.transact((engine: any, store: any) => {
    const inbound = engine.inbound('CA' + '1'.repeat(32), '+18055550199');
    return store.put('call', { ...inbound, phase: 'message', deadline: Date.now() + 300000 });
  });
  const carrier: any = { readyState: 1, sent: [] as any[], send(raw: string) { this.sent.push(JSON.parse(raw)); }, close() { this.readyState = 3; } };
  const ai: any = { ...carrier, sent: [], close() {} };
  const actions: string[] = [];
  const session = new GrokMediaSession({ socket: carrier, call, state, worker: { drain: async () => {} }, connect: () => ai,
    clock: { setTimeout, clearTimeout, now: () => now },
    schedule: async (_config: unknown, id: string, action: string, input: unknown) => {
      actions.push(action);
      if (action === 'commit') return commitVoiceVisit(client, id, await state.readCall(id));
      return prepareVoiceVisit(client, id, input, action === 'prepare_appointment', { now });
    },
  });
  const grok = (event: unknown) => session.enqueue(() => session.grok(event));
  let sequence = 0;
  const play = async () => {
    const id = 'question-' + ++sequence, expected = session.prompt.text;
    await grok({ type: 'response.created', response: { id: 'stray-' + id } });
    await grok({ type: 'response.output_audio.delta', response_id: 'stray-' + id, delta: 'YmFk' });
    await grok({ type: 'response.output_audio_transcript.done', response_id: 'stray-' + id, transcript: 'silent' });
    await grok({ type: 'response.done', response: { id: 'stray-' + id, status: 'completed' } });
    expect(carrier.sent.some((item: any) => item.media?.payload === 'YmFk')).toBe(false);
    await grok({ type: 'response.created', response: { id } });
    await grok({ type: 'response.output_audio.delta', response_id: id, delta: 'YWJj' });
    await grok({ type: 'response.output_audio_transcript.done', response_id: id, transcript: expected });
    await grok({ type: 'response.done', response: { id, status: 'completed' } });
    await session.carrier({ event: 'mark', streamSid: 'MZ' + '2'.repeat(32), mark: carrier.sent.findLast((item: any) => item.event === 'mark').mark });
    return expected;
  };
  const say = (text: string, id = 'caller-' + ++sequence) => grok({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text });
  try {
    await session.carrier({ event: 'start', start: { accountSid: config.accountSid, callSid: call.sid, streamSid: 'MZ' + '2'.repeat(32), mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } });
    ai.onopen(); await session.chain; await grok({ type: 'session.updated' }); await play();
    for (const text of ['schedule an appointment', 'Monday', '10 a.m.', '123 Test Street, Camarillo', 'yes', 'my home', 'Pat Example']) {
      await say(text); expect(session.prompt.text.match(/\?/g)?.length || 0).toBeLessThanOrEqual(1); await play();
    }
    expect(actions).toEqual(['find_appointments']);
    expect((await state.readCall(call.id)).schedule.offer).toMatchObject({ date: '2035-10-01', time: '10:00' });
    await say('yes'); expect(session.stage).toBe('readback');
    expect(session.prompt.text).toContain('60 minutes');
    await say('yes', 'early-yes');
    expect((await db.query('select * from crm_calendar_events')).rows).toHaveLength(0);
    await play(); expect(session.stage).toBe('confirm');
    if (withdrawn) await db.exec('delete from crm_availability_slots');
    await say('yes', 'confirmed-yes');
    const rows = (await db.query<{ meta: any; start_at: string }>('select meta,start_at from crm_calendar_events')).rows;
    if (withdrawn) {
      expect(rows).toHaveLength(0); expect(session.prompt.text).not.toMatch(/is booked|we.re confirmed/i);
      expect((await db.query('select * from leads')).rows).toHaveLength(0);
    } else {
      expect(rows).toHaveLength(1); expect(rows[0].meta).toMatchObject({ bookedVia: 'agent', bookingSource: '805_phone', voiceCallId: call.id });
      expect(new Date(rows[0].start_at).toISOString()).toBe('2035-10-01T17:00:00.000Z');
      expect((await state.readCall(call.id)).booking.verified).toBe(true);
      expect(session.prompt.text).toMatch(/booked|confirmed/i);
      expect((await db.query('select * from booking_outbox')).rows).toHaveLength(2);
      await say('yes', 'confirmed-yes');
      expect((await db.query('select * from crm_calendar_events')).rows).toHaveLength(1);
      await play();
    }
  } finally { session.finish(); }
}, 30000);
