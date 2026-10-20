import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SupabaseState } from '../supabase-store.mjs';
import { SupabaseWorker } from '../supabase-worker.mjs';
import { createSupabaseHandler } from '../supabase-handler.mjs';
import { SimulationProvider } from '../provider.mjs';
import { hmac } from '../security.mjs';
import { loadSupabaseConfig } from '../supabase-config.mjs';

const SIP = 'sip:+18055908050@sip.voice.x.ai;transport=tls';
const TOKEN = 'a'.repeat(40);

class ToolClient {
  constructor() {
    this.row = { revision: 0, body: { entities: {}, events: {}, inbound: {} } };
    this.customers = [{ id: 'cust-1', phone: '8055550199' }];
    this.callbacks = [];
  }
  from(table) {
    if (table === 'crm_customers') {
      return { select: () => ({ in: async (_column, keys) => ({ data: this.customers.filter((row) => keys.includes(row.phone)).map((row) => ({ id: row.id })), error: null }) }) };
    }
    return { select: () => ({ eq: () => ({ single: async () => ({ data: structuredClone(this.row), error: null }) }) }) };
  }
  async rpc(name, p) {
    if (name === 'voice_805_caller_context') return { data: { match: 'unmatched' } };
    if (name === 'voice_805_log_failure') return { data: null, error: null };
    if (name === 'voice_805_save_callback') {
      const prior = this.callbacks.find((item) => item.call_sid === p.p_call_sid);
      const row = { id: prior?.id || randomUUID(), call_sid: p.p_call_sid, status: p.p_status, customer_id: p.p_customer_id, caller_name: p.p_caller_name, callback_number: p.p_callback_number, reason: p.p_reason, transcript: p.p_transcript || '' };
      if (prior) Object.assign(prior, row);
      else this.callbacks.push(row);
      return { data: row, error: null };
    }
    if (name !== 'voice_805_commit') return { data: null, error: null };
    await new Promise((resolve) => setImmediate(resolve));
    if (p.p_revision !== this.row.revision) return { data: false };
    this.row = { revision: this.row.revision + 1, body: structuredClone(p.p_body) };
    return { data: true };
  }
}
function fixture(patch = {}) {
  const c = { ...loadSupabaseConfig({}), mode: 'live', dataset: 'pilot', liveAuthorized: true, agentReviewed: true, agentContractVerified: true, workerVerified: true, transport: 'media', xaiKey: 'x'.repeat(20),
    origin: 'https://example.supabase.co/functions/v1/voice-805', accountSid: 'AC' + 'a'.repeat(32), authToken: 't'.repeat(32), number: '+18055550100',
    toolsKey: 't'.repeat(32), controlKey: 'c'.repeat(32), workerKey: 'w'.repeat(32), offerSeconds: 20, sipUri: SIP, agentToolToken: TOKEN, bookingAuthorized: false,
    hours: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, [[0, 1440]]])), holidays: {},
    staff: { mike: { kind: 'cell', destination: '+18055550101', sms: '+18055550101' }, jessica: { kind: 'cell', destination: '+18055550102', sms: '+18055550102' } }, ...patch };
  const client = new ToolClient(), state = new SupabaseState(client, c), provider = new SimulationProvider(), worker = new SupabaseWorker(state, provider), tasks = [], scheduled = [];
  const schedule = async (...args) => { scheduled.push(args); return { exact: true, slots: ['10:00'], saved: false, verified: args[2] === 'commit' }; };
  return { c, client, state, provider, worker, tasks, scheduled, handler: createSupabaseHandler({ state, client, worker, waitUntil: (p) => tasks.push(p), schedule }) };
}
function carrier(f, path, fields) {
  const p = new URLSearchParams({ AccountSid: f.c.accountSid, ...fields });
  const payload = f.c.origin + path + [...new Set(p.keys())].sort().map((k) => k + p.get(k)).join('');
  return new Request(f.c.origin + path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': hmac(f.c.authToken, payload, 'sha1') }, body: p });
}
function tool(f, path, body, authorization = `Bearer ${f.c.agentToolToken}`) {
  const headers = { 'content-type': 'application/json' };
  if (authorization != null) headers.authorization = authorization;
  return new Request(f.c.origin + path, { method: 'POST', headers, body: JSON.stringify(body) });
}
async function messagePhase(f, sid) {
  assert.equal((await f.handler(carrier(f, '/twilio/inbound', { CallSid: sid, To: f.c.number, From: '+18055550199' }))).status, 200);
  await Promise.all(f.tasks);
  await f.state.transact((e) => e.tick(Date.now() + 20000));
  await f.worker.drain();
  const call = await f.state.transact((_e, s) => s.list('call').find((item) => item.sid === sid));
  assert.equal(call.phase, 'message');
  return call;
}
const message = { caller_number: '+18055550199', name: 'Test Caller', callback_number: '+18055550198', reason: 'Shutter quote', transcript: 'Please call tomorrow morning.' };

test('an answered SIP leg hangs up and does not record voicemail', async () => {
  const f = fixture();
  const call = await messagePhase(f, 'CA' + '1'.repeat(32));
  const greeted = await f.handler(carrier(f, `/twilio/greeted/${call.id}`, { CallSid: call.sid, To: f.c.number, From: '+18055550199' }));
  const xml = await greeted.text();
  assert.equal(greeted.status, 200);
  assert.match(xml, new RegExp(`<Dial action="${f.c.origin}/twilio/continue/${call.id}" method="POST" timeout="30"><Sip>${SIP.replace('+', '\\+')}\\?X-805-Call-Id=${call.id}</Sip></Dial>`));
  assert.doesNotMatch(xml, /Stream|<Record|Conference/);
  const done = await f.handler(carrier(f, `/twilio/continue/${call.id}`, { CallSid: call.sid, To: f.c.number, From: '+18055550199', DialCallStatus: 'completed' }));
  const doneXml = await done.text();
  assert.match(doneXml, /<Hangup\/>/);
  assert.doesNotMatch(doneXml, /<Record/);
  const later = fixture();
  const laterCall = await messagePhase(later, 'CA' + '2'.repeat(32));
  await later.state.transact((e) => e.markGreetingPlayed(laterCall.id, 'played-for-agent'));
  const agent = await later.handler(carrier(later, `/twilio/agent/${laterCall.id}`, { CallSid: laterCall.sid, To: later.c.number, From: '+18055550199' }));
  const agentXml = await agent.text();
  assert.match(agentXml, new RegExp(`<Sip>${SIP.replace('+', '\\+')}\\?X-805-Call-Id=${laterCall.id}</Sip>`));
  assert.doesNotMatch(agentXml, /Stream|<Record/);
});

test('a failed or unanswered SIP leg returns voicemail', async () => {
  for (const [index, status] of ['failed', 'no-answer', 'busy', 'canceled'].entries()) {
    const f = fixture();
    const call = await messagePhase(f, 'CA' + String(index + 3).repeat(32));
    const response = await f.handler(carrier(f, `/twilio/continue/${call.id}`, { CallSid: call.sid, To: f.c.number, From: '+18055550199', DialCallStatus: status }));
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(xml, /<Record /);
    assert.match(xml, /No one can take your call right now/);
    assert.match(xml, new RegExp(`/twilio/recording/${call.id}`));
    assert.doesNotMatch(xml, /<Sip>/);
  }
  const closed = fixture({ sipUri: 'not-a-sip-uri' });
  const call = await messagePhase(closed, 'CA' + 'a'.repeat(32));
  const xml = await (await closed.handler(carrier(closed, `/twilio/greeted/${call.id}`, { CallSid: call.sid, To: closed.c.number, From: '+18055550199' }))).text();
  assert.match(xml, /<Record /);
  assert.doesNotMatch(xml, /<Sip>/);
});

test('console tool bearer is rejected when it is missing, wrong, or short', async () => {
  const f = fixture();
  assert.equal((await f.handler(tool(f, '/tools/save_message', message, null))).status, 401);
  assert.equal((await f.handler(tool(f, '/tools/save_message', message, `Bearer ${'b'.repeat(40)}`))).status, 401);
  assert.equal((await f.handler(tool(f, '/tools/check_availability', { call_id: randomUUID(), preferred_time: '2035-10-01 10:00' }, `Bearer ${f.c.toolsKey}`))).status, 401);
  const short = fixture({ agentToolToken: 'short-token' });
  assert.equal((await short.handler(tool(short, '/tools/book_consultation', { call_id: randomUUID() }, 'Bearer short-token'))).status, 401);
  assert.equal(f.client.callbacks.length, 0);
  assert.equal(short.client.callbacks.length, 0);
  assert.equal(f.scheduled.length, 0);
  assert.equal(short.scheduled.length, 0);
});

test('save_message writes a needs_callback row and the test deletes it', async () => {
  const f = fixture();
  const call = await messagePhase(f, 'CA' + 'b'.repeat(32));
  const response = await f.handler(tool(f, '/tools/save_message', message));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.verified, true);
  assert.equal(body.customer_id, 'cust-1');
  assert.equal(f.client.callbacks.length, 1);
  const row = f.client.callbacks[0];
  assert.equal(body.id, row.id);
  assert.equal(row.status, 'needs_callback');
  assert.equal(row.call_sid, call.sid);
  assert.equal(row.customer_id, 'cust-1');
  assert.equal(row.caller_name, 'Test Caller');
  assert.equal(row.callback_number, '+18055550198');
  assert.equal(row.reason, 'Shutter quote');
  f.client.callbacks.splice(f.client.callbacks.findIndex((item) => item.id === body.id), 1);
  assert.equal(f.client.callbacks.length, 0);
});

test('book_consultation stays gated and check_availability does not book', async () => {
  const f = fixture();
  const call = await messagePhase(f, 'CA' + 'c'.repeat(32));
  const looked = await f.handler(tool(f, '/tools/check_availability', { call_id: call.id, preferred_time: '2035-10-01 10:30' }));
  assert.equal(looked.status, 200);
  assert.deepEqual(f.scheduled[0].slice(1, 4), [call.id, 'check_availability', { preferred_time: '2035-10-01 10:30' }]);
  const payload = { call_id: call.id, city: 'Camarillo', address: '1 Test St', date: '2035-10-01', time: '10:00', kind: 'residential', window_count: null, name: 'Test Caller', phone: '+18055550199' };
  const denied = await f.handler(tool(f, '/tools/book_consultation', payload));
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { booked: false, error: 'Booking activation required; offer a callback.' });
  assert.equal(f.scheduled.length, 1);
  const pilot = fixture({ bookingAuthorized: true, dataset: 'pilot' });
  const pilotCall = await messagePhase(pilot, 'CA' + 'd'.repeat(32));
  assert.equal((await pilot.handler(tool(pilot, '/tools/book_consultation', { ...payload, call_id: pilotCall.id }))).status, 403);
  assert.equal(pilot.scheduled.length, 0);
  const open = fixture({ bookingAuthorized: true, dataset: 'production' });
  const openCall = await messagePhase(open, 'CA' + 'e'.repeat(32));
  const booked = await open.handler(tool(open, '/tools/book_consultation', { ...payload, call_id: openCall.id }));
  assert.equal(booked.status, 200);
  assert.equal(open.scheduled.length, 1);
  assert.deepEqual(open.scheduled[0].slice(1, 3), [openCall.id, 'commit']);
  const saved = await open.state.transact((_e, s) => s.get('call', openCall.id));
  assert.equal(saved.bookingIntent.kind, 'appointment');
  assert.equal(typeof saved.bookingIntent.confirmedAt, 'number');
});
