// @vitest-environment happy-dom
// Real call-state CAS and callback SQL in isolated PostgreSQL, followed by the
// authenticated Next proxy, signed Edge control read, and actual React desk.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { NextRequest } from 'next/server';
vi.mock('@/lib/crm/auth', () => ({ requireCrmUser: async () => ({ email: 'test@local.invalid', supabase: {} }), crmAuthErrorResponse: () => new Response('', { status: 401 }) }));
vi.mock('@/lib/supabase-browser', () => ({ getSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'isolated-session' } } }) } }) }));
import { GET } from '@/app/api/crm/phone/[...path]/route';
import { PhoneDesk } from '@/app/crm/phone/phone-desk';
// @ts-expect-error Native Edge JavaScript.
import { GrokMediaSession } from '../../../services/voice-805/grok-media.mjs';
// @ts-expect-error Native Edge JavaScript.
import { SupabaseState } from '../../../services/voice-805/supabase-store.mjs';
// @ts-expect-error Native Edge JavaScript.
import { SupabaseWorker } from '../../../services/voice-805/supabase-worker.mjs';
// @ts-expect-error Native Edge JavaScript.
import { savePhoneMessage } from '../../../services/voice-805/callbacks.mjs';
// @ts-expect-error Native Edge JavaScript.
import { createSupabaseHandler } from '../../../services/voice-805/supabase-handler.mjs';
// @ts-expect-error Native Edge JavaScript.
import { loadSupabaseConfig } from '../../../services/voice-805/supabase-config.mjs';
const db = new PGlite();
const config = { ...loadSupabaseConfig({}), transport: 'media', mode: 'live', dataset: 'production', xaiKey: 'isolated',
  liveAuthorized: true, agentReviewed: true, agentContractVerified: true, workerVerified: true,
  number: '+18055550100', accountSid: 'AC' + 'a'.repeat(32), authToken: 'x', origin: 'https://phone.example',
  controlKey: 'c'.repeat(32), toolsKey: 't'.repeat(32), workerKey: 'w'.repeat(32),
  hours: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, [[0, 1440]]])), holidays: {},
  staff: { mike: { kind: 'cell', destination: '+18055550101', sms: '+18055550101' }, jessica: { kind: 'cell', destination: '+18055550102', sms: '+18055550102' } },
};
let failWrites = 0, failReads = 0;
beforeAll(async () => {
  const read = (file: string) => readFileSync('supabase/migrations/' + file, 'utf8');
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table crm_customers(id uuid primary key);
    create table crm_calendar_events(id uuid primary key);
    create table crm_activity_events(id uuid primary key default gen_random_uuid(), actor_email text,entity_type text,entity_id uuid,action text,after_data jsonb);`);
  await db.exec(read('20261011014441_voice_805_supabase_call_center.sql').split('create function public.voice_805_normalize_phone')[0]);
  await db.exec(read('20261019231000_voice_805_callbacks.sql'));
}, 30000);
afterAll(() => db.close());
beforeEach(async () => {
  failWrites = failReads = 0;
  await db.exec(`truncate crm_callback_items; update voice_805_state set body='{"entities":{},"events":{},"inbound":{}}',revision=0;`);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const client: any = {
  async rpc(name: string, args: Record<string, unknown>) {
    if (name === 'voice_805_save_callback' && failWrites-- > 0) return { error: { message: 'simulated database outage' } };
    const fields: Record<string, string[]> = {
      voice_805_commit: ['p_id', 'p_revision', 'p_body'],
      voice_805_save_callback: ['p_call_sid','p_caller_name','p_callback_number','p_reason','p_transcript','p_recording_url','p_call_time','p_phone','p_status','p_appointment_id','p_customer_id'],
    };
    if (!fields[name]) throw new Error('Unexpected RPC');
    try {
      const values = fields[name].map(key => args[key] !== null && typeof args[key] === 'object' ? JSON.stringify(args[key]) : args[key]);
      const result = await db.query<{ data: unknown }>(`select ${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) data`, values);
      return { data: result.rows[0].data, error: null };
    } catch (error) { return { data: null, error: { message: String(error) } }; }
  },
  from(table: string) {
    if (!['voice_805_state', 'crm_callback_items'].includes(table)) throw new Error('Unexpected table');
    let columns = '*', key = '', value: unknown;
    const read = async (single = false) => {
      if (table === 'crm_callback_items' && failReads-- > 0) return { error: { message: 'simulated read outage' } };
      const result = await db.query(`select ${columns} from ${table} where "${key}"=$1`, [value]);
      return { data: single ? result.rows[0] || null : result.rows, error: null };
    };
    return {
      select(next: string) { if (!/^[a-z_,]+$/.test(next)) throw new Error('Invalid columns'); columns = next; return this; },
      eq(next: string, val: unknown) { if (!/^[a-z_]+$/.test(next)) throw new Error('Invalid key'); key = next; value = val; return this; },
      single: () => read(true), maybeSingle: () => read(true),
    };
  },
};
async function fixture(from = '+18055550199') {
  const state = new SupabaseState(client, config);
  const call = await state.transact((engine: any, store: any) => {
    const inbound = engine.inbound('CA' + '1'.repeat(32), from);
    // Isolate message intake from carrier dialing effects; no provider exists.
    for (const effect of store.list('effect')) store.put('effect', { ...effect, status: 'done' });
    return store.put('call', { ...inbound, phase: 'message', deadline: Date.now() + 300000 });
  });
  const carrier: any = { readyState: 1, sent: [] as any[], send(raw: string) { this.sent.push(JSON.parse(raw)); }, close() { this.readyState = 3; } };
  const ai: any = { ...carrier, sent: [], close() {} };
  const session = new GrokMediaSession({ socket: carrier, call, state, worker: { drain: async () => {} }, connect: () => ai,
    saveCrm: async (message: any) => savePhoneMessage(client, await state.readCall(call.id), message),
  });
  const grok = (event: unknown) => session.enqueue(() => session.grok(event));
  let sequence = 0;
  const play = async () => {
    const id = 'question-' + ++sequence, expected = session.prompt.text;
    await grok({ type: 'response.created', response: { id } });
    await grok({ type: 'response.output_audio.delta', response_id: id, delta: 'YWJj' });
    await grok({ type: 'response.output_audio_transcript.done', response_id: id, transcript: expected });
    await grok({ type: 'response.done', response: { id, status: 'completed' } });
    await session.carrier({ event: 'mark', streamSid: 'MZ' + '2'.repeat(32), mark: carrier.sent.findLast((item: any) => item.event === 'mark').mark });
    return expected;
  };
  const say = (text: string, id = 'caller-' + ++sequence) => grok({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text });
  await session.carrier({ event: 'start', start: { accountSid: config.accountSid, callSid: call.sid, streamSid: 'MZ' + '2'.repeat(32), mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } });
  ai.onopen(); await session.chain; await grok({ type: 'session.updated' }); await play();
  return { state, call, session, say, play };
}
async function renderSavedDesk(state: any, expected: string, transcript: string) {
  vi.stubEnv('VOICE_805_STAFF_EMAILS_JSON', JSON.stringify({ 'test@local.invalid': 'mike' }));
  vi.stubEnv('VOICE_805_SERVICE_ORIGIN', config.origin); vi.stubEnv('VOICE_805_CONTROL_KEY', config.controlKey);
  const handler = createSupabaseHandler({ state, client, worker: { drain: async () => {} } });
  const paths: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    paths.push(url);
    if (url === '/api/crm/phone/state') return GET(new NextRequest('https://isolated.invalid' + url, { ...init, signal: init.signal || undefined }), { params: Promise.resolve({ path: ['state'] }) });
    if (url === config.origin + '/control') return handler(new Request(url, init));
    throw new Error('Unexpected network request');
  });
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => { root.render(createElement(PhoneDesk)); await new Promise(resolve => setTimeout(resolve, 150)); });
    expect(paths).toEqual(['/api/crm/phone/state', config.origin + '/control']);
    expect(host.textContent).toContain(expected);
    expect(host.textContent).toContain('Call summary');
    expect(host.textContent).toContain(transcript);
    expect(host.querySelectorAll('article[id^="phone-message-"]')).toHaveLength(1);
    const details = host.querySelector('details'); expect(details?.textContent).toContain(transcript);
    const messages = await state.transact((_e: any, store: any) => store.list('message'));
    if (messages[0]?.completed) expect(host.textContent).not.toContain('Incomplete message');
  } finally { await act(async () => root.unmount()); host.remove(); }
}
it.each(['short', 'long', 'volunteered', 'blocked'])('message %s: complete SQL save without readback, restart and CRM display', async scenario => {
 const f=await fixture(scenario==='blocked'?'anonymous':undefined);
 const original=scenario==='long'?'My living room shade sticks halfway down. '.repeat(75)+'Please call me after lunch.':scenario==='volunteered'?'This is Pat Example. Please call about repairs.':'Please call me about my shutters.';
 try {
  await f.say('yes');if(scenario==='blocked')expect(f.session.prompt.text).toMatch(/phone number/);await f.play();
  if(scenario==='blocked'){await f.say('eight zero five five five five zero one two three');await f.play();}
  await f.say(original,'message');expect(f.session.prompt.text).toBe("Thank you very much. We'll relay the message. Have a great day.");
  await f.say(original,'message');await f.play();expect(f.session.closed).toBe(true);
  const saved=(await db.query<any>('select * from crm_callback_items')).rows;
  expect(saved).toHaveLength(1);expect(saved[0].reason).toBe('Received message: '+original);expect(saved[0].transcript).toContain(original);
  expect(saved[0].caller_name).toBe(scenario==='volunteered'?'Pat Example':'');expect(saved[0].recording_url).toBe('');expect(saved[0].appointment_id).toBeNull();
  expect(saved[0].callback_number).toBe(scenario==='blocked'?'+18055550123':'+18055550199');expect((await db.query('select * from crm_calendar_events')).rows).toHaveLength(0);
  const restarted=new SupabaseState(client,config);expect((await restarted.readCall(f.call.id)).summary.outcome).toBe('message');
  await renderSavedDesk(restarted,original,original);
 } finally {f.session.finish();}
},30000);
it.each(['write', 'read'])('a failed %s is retried idempotently; exhausted failure remains recoverable after disconnect', async failure => {
  const f = await fixture();
  try {
    if (failure === 'write') failWrites = 2; else failReads = 2;
    await f.say('This is Pat Example. Please call about repairs.'); expect(f.session.prompt.text).toMatch(/could not verify/); await f.play();
    const restarted = new SupabaseState(client, config);
    let writes = 0;
    const worker = new SupabaseWorker(restarted, {}, { transcriptSmsSendingEnabled: () => false, syncMessage: async (call: any, message: any) => { writes++; return savePhoneMessage(client, call, message); } });
    // Emulate process interruption after durable claim. Expired CRM claims may
    // retry safely; carrier effects remain at-most-once.
    await restarted.transact((_e: any, s: any) => { for (const e of s.list('effect')) s.put('effect', e.type === 'sync-message' ? { ...e, status: 'sending', leaseUntil: 0 } : { ...e, status: 'done' }); });
    await worker.drain(); await worker.drain();
    expect(writes).toBe(1); expect((await db.query('select * from crm_callback_items')).rows).toHaveLength(1);
    const snapshot = await restarted.transact((e: any) => e.snapshot());
    expect(snapshot.messages[0].crmVerified).toBe(true); expect(snapshot.notifications).toHaveLength(2);
    expect(snapshot.notifications.every((n: any) => n.status === 'pending' && !n.sid)).toBe(true);
    await renderSavedDesk(restarted, 'Please call about repairs.', 'This is Pat Example. Please call about repairs.');
  } finally { f.session.finish(); }
}, 30000);
it('hangup saves an explicitly unconfirmed draft, retries the CRM write, and displays its full text', async () => {
  const f = await fixture();
  try {
    await f.session.grok({type:'input_audio_buffer.speech_started',item_id:'partial'});
    await f.say('Please call me about my kitchen shutters.','partial');
    await f.session.carrier({ event: 'stop', streamSid: 'MZ' + '2'.repeat(32) });
    const worker = new SupabaseWorker(f.state, {}, { transcriptSmsSendingEnabled: () => false, syncMessage: (call: any, message: any) => savePhoneMessage(client, call, message) });
    await f.state.transact((_e: any, s: any) => { for (const e of s.list('effect')) if (e.type !== 'sync-message') s.put('effect', { ...e, status: 'done' }); });
    failWrites = 1; await worker.drain();
    let effects = await f.state.transact((_e: any, s: any) => s.list('effect').filter((e: any) => e.type === 'sync-message'));
    expect(effects[0]).toMatchObject({ status: 'pending', attempts: 1 });
    await f.state.transact((_e: any, s: any) => s.put('effect', { ...effects[0], nextAt: 0 })); await worker.drain();
    const rows = (await db.query<any>('select * from crm_callback_items')).rows;
    expect(rows).toHaveLength(1); expect(rows[0].reason).toMatch(/^Unconfirmed message:/); expect(rows[0].recording_url).toBe('');
    await renderSavedDesk(new SupabaseState(client, config), 'Incomplete message', 'Please call me about my kitchen shutters.');
  } finally { f.session.finish(); }
}, 30000);

// Replay the actual synthetic provider captures, not hand-written transcript
// expectations, through production SQL, a fresh reader and the CRM UI.
const providerReport = { cases: ['message-provider-verification-20261025.json', 'simple-message-provider-verification-20261025.json'].flatMap(file => JSON.parse(readFileSync('docs/phone-system/' + file, 'utf8')).cases) };
it.each(providerReport.cases as any[])('provider audio $caseName survives SQL and CRM retrieval unchanged', async captured => {
  expect(captured.pass).toBe(true);
  const state = new SupabaseState(client, config);
  await state.transact((_e: any, store: any) => {
    store.put('call', { ...captured.call, phase: 'ended', schedule: captured.schedule, offers: [] });
    for (const message of captured.messages) store.put('message', message);
  });
  for (const message of captured.messages) {
    const saved = await savePhoneMessage(client, captured.call, message);
    expect(saved.verified).toBe(true);
    // Duplicate delivery/restart uses the same callback row.
    await savePhoneMessage(client, captured.call, message);
    const rows = (await db.query<any>('select * from crm_callback_items')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe(`${message.completed ? 'Received' : message.confirmed ? 'Confirmed' : 'Unconfirmed'} message: ${message.text}`);
    expect(rows[0].transcript).toBe(captured.call.callerTranscript.map((turn: any) => `Caller: ${turn.text}`).join('\n'));
    expect(rows[0].callback_number).toBe(message.callback);
    expect(rows[0].recording_url).toBe('');
    await renderSavedDesk(new SupabaseState(client, config), message.text, captured.call.callerTranscript[0].text);
  }
  expect((await db.query('select * from crm_calendar_events')).rows).toHaveLength(0);
  if (!captured.messages.length) expect((await db.query('select * from crm_callback_items')).rows).toHaveLength(0);
}, 30000);

it('staff notices wait for verified SQL save, retain long-message evidence and send once per recipient after recovery', async () => {
  const f = await fixture();
  const text = 'The bedroom shade needs service. '.repeat(50).trim();
  const sends: any[] = [];
  try {
    failWrites = 2; await f.say('This is Pat Example. ' + text); await f.play();
    const worker = new SupabaseWorker(new SupabaseState(client, config), {
      send: async (note: any, message: any) => {
        expect(message.crmVerified).toBe(true);
        expect((await db.query<any>('select * from crm_callback_items')).rows[0].reason).toContain(text);
        sends.push({ ...note });
        return { sid: 'SM' + String(sends.length).repeat(32), status: 'accepted' };
      },
    }, { transcriptSmsSendingEnabled: () => true, syncMessage: (call: any, message: any) => savePhoneMessage(client, call, message) });
    await f.state.transact((_e: any, s: any) => {
      for (const effect of s.list('effect')) if (effect.type !== 'sync-message') s.put('effect', { ...effect, status: 'done' });
    });
    failWrites = 1; await worker.drain();
    expect(sends).toHaveLength(0);
    expect((await f.state.transact((_e: any, s: any) => s.list('notification'))).every((n: any) => n.status === 'pending' && n.attempts === 0)).toBe(true);
    await f.state.transact((_e: any, s: any) => { for (const effect of s.list('effect')) if (effect.type === 'sync-message') s.put('effect', { ...effect, nextAt: 0 }); });
    await worker.drain(); await worker.drain();
    await f.state.transact((e: any, s: any) => { const message = s.list('message')[0]; e.queueTranscript(message); e.queueTranscript(message); });
    await worker.drain();
    expect(sends).toHaveLength(2);
    expect(sends.map(n => n.recipient).sort()).toEqual(['jessica', 'mike']);
    for (const note of sends) {
      expect(note.destination).toBe(config.staff[note.recipient as 'mike' | 'jessica'].sms);
      expect(note.body.length).toBeLessThanOrEqual(1600);
      expect(note.body).toContain('Message shortened; full transcript in CRM Message Center');
      expect(note.body).toContain('Reply STOP to unsubscribe; HELP for help.');
    }
    expect((await db.query('select * from crm_callback_items')).rows).toHaveLength(1);
    const notes = await f.state.transact((_e: any, s: any) => s.list('notification'));
    const handler = createSupabaseHandler({ state: f.state, client, worker: { drain: async () => {} } });
    for (const note of notes) {
      const path = '/twilio/sms/' + encodeURIComponent(note.id);
      for (const status of [note.recipient === 'mike' ? 'delivered' : 'undelivered', 'queued']) {
        const fields = new URLSearchParams({ AccountSid: config.accountSid, MessageSid: note.sid, To: note.destination, From: '+18055908050', MessageStatus: status });
        const payload = config.origin + path + [...new Set(fields.keys())].sort().map(key => key + fields.get(key)).join('');
        const result = await handler(new Request(config.origin + path, { method: 'POST', body: fields, headers: { 'x-twilio-signature': createHmac('sha1', config.authToken).update(payload).digest('base64') } }));
        expect(result.status).toBe(200);
      }
    }
    await worker.drain(); expect(sends).toHaveLength(2);
    await renderSavedDesk(new SupabaseState(client, config), text, 'This is Pat Example. ' + text);
    await renderSavedDesk(new SupabaseState(client, config), 'jessica: undelivered', 'This is Pat Example. ' + text);
  } finally { f.session.finish(); }
}, 30000);
