import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { SnapshotStore, SupabaseState } from '../supabase-store.mjs';
import { SupabaseWorker } from '../supabase-worker.mjs';
import { createSupabaseHandler } from '../supabase-handler.mjs';
import { SimulationProvider } from '../provider.mjs';
import { hmac } from '../security.mjs';
import { loadConfig, readiness, incomingRingStaff } from '../config.mjs';
import { loadSupabaseConfig, supabaseReadiness } from '../supabase-config.mjs';

const staff = {
  mike: { kind: 'cell', destination: '+18055550101', sms: '+18055550101' },
  jessica: { kind: 'cell', destination: '+18055550102', sms: '+18055550102' },
};
function liveConfig(env = {}) {
  return {
    ...loadSupabaseConfig(env),
    mode: 'live',
    liveAuthorized: true,
    agentReviewed: true,
    agentContractVerified: true,
    workerVerified: true,
    transport: 'media',
    xaiKey: 'x'.repeat(20),
    origin: 'https://example.supabase.co/functions/v1/voice-805',
    accountSid: 'AC' + 'a'.repeat(32),
    authToken: 't'.repeat(32),
    number: '+18055550100',
    toolsKey: 't'.repeat(32),
    controlKey: 'c'.repeat(32),
    workerKey: 'w'.repeat(32),
    offerSeconds: 20,
    hours: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, [[0, 1440]]])),
    holidays: {},
    staff: structuredClone(staff),
  };
}
function legacyReady(env = {}) {
  return {
    ...loadConfig(env),
    mode: 'live',
    origin: 'https://phone.example',
    accountSid: 'AC' + 'a'.repeat(32),
    authToken: 't'.repeat(32),
    number: '+18055550100',
    xaiKey: 'x'.repeat(20),
    agentId: 'agent-805',
    controlKey: 'c'.repeat(32),
    greeting: 'hello',
    closedGreeting: 'closed',
    fallbackGreeting: 'fallback',
    offerSeconds: 20,
    retentionDays: 30,
    hours: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, [[0, 1440]]])),
    holidays: {},
    staff: structuredClone(staff),
    liveAuthorized: true,
    agentReviewed: true,
    notificationsApproved: true,
  };
}
class FakeClient {
  constructor() { this.row = { revision: 0, body: { entities: {}, events: {}, inbound: {} } }; }
  from() { return { select: () => ({ eq: () => ({ single: async () => ({ data: structuredClone(this.row) }) }) }) }; }
  async rpc(name, p) {
    if (name !== 'voice_805_commit') return { data: { id: 'cb-1' } };
    await new Promise((r) => setImmediate(r));
    if (p.p_revision !== this.row.revision) return { data: false };
    this.row = { revision: this.row.revision + 1, body: structuredClone(p.p_body) };
    return { data: true };
  }
}
function fixture(ring) {
  const env = ring === undefined ? {} : { VOICE_805_RING_STAFF_JSON: ring };
  const c = liveConfig(env);
  const client = new FakeClient();
  const state = new SupabaseState(client, c);
  const provider = new SimulationProvider();
  const worker = new SupabaseWorker(state, provider);
  const tasks = [];
  return { c, state, provider, worker, tasks, handler: createSupabaseHandler({ state, client, worker, waitUntil: (p) => tasks.push(p) }) };
}
function carrier(f, path, fields) {
  const p = new URLSearchParams({ AccountSid: f.c.accountSid, ...fields });
  const payload = f.c.origin + path + [...new Set(p.keys())].sort().map((k) => k + p.get(k)).join('');
  return new Request(f.c.origin + path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': hmac(f.c.authToken, payload, 'sha1') },
    body: p,
  });
}
function dials(f) { return f.provider.operations.filter((item) => item.type === 'dial').map((item) => item.staff).sort(); }
async function inbound(f, sid) {
  const response = await f.handler(carrier(f, '/twilio/inbound', { CallSid: sid, To: f.c.number, From: '+18055550199' }));
  await Promise.all(f.tasks);
  const call = await f.state.transact((_e, s) => s.list('call').find((item) => item.sid === sid));
  return { greeting: await response.text(), call };
}
function amd(f, call, offer, answeredBy) {
  return carrier(f, `/twilio/offer/${call.id}/${offer.id}/amd`, {
    CallSid: offer.sid, To: f.c.staff[offer.staff].destination, From: f.c.number, AnsweredBy: answeredBy,
  });
}

test('unset ring config is both people and a valid subset stays ready', () => {
  assert.deepEqual(incomingRingStaff(liveConfig()), ['mike', 'jessica']);
  assert.deepEqual(incomingRingStaff(liveConfig({ VOICE_805_RING_STAFF_JSON: '["mike"]' })), ['mike']);
  assert.deepEqual(incomingRingStaff(liveConfig({ VOICE_805_RING_STAFF_JSON: '["jessica","mike"]' })), ['jessica', 'mike']);
  assert.equal(supabaseReadiness(liveConfig()).ready, true);
  assert.equal(supabaseReadiness(liveConfig({ VOICE_805_RING_STAFF_JSON: '["mike"]' })).ready, true);
  assert.equal(readiness(legacyReady()).ready, true);
  assert.equal(readiness(legacyReady({ VOICE_805_RING_STAFF_JSON: '["mike"]' })).ready, true);
  const withoutJessica = liveConfig({ VOICE_805_RING_STAFF_JSON: '["mike"]' });
  delete withoutJessica.staff.jessica;
  assert.equal(supabaseReadiness(withoutJessica).ready, false);
  assert.ok(supabaseReadiness(withoutJessica).missing.includes('jessica cellular destination'));
  const withoutSms = legacyReady({ VOICE_805_RING_STAFF_JSON: '["mike"]' });
  withoutSms.staff = { ...withoutSms.staff, jessica: { ...withoutSms.staff.jessica, sms: '' } };
  assert.equal(readiness(withoutSms).ready, false);
  assert.ok(readiness(withoutSms).missing.includes('jessica SMS destination'));
});

test('empty or invalid ring config fails closed and does not become Jessica', () => {
  for (const raw of ['[]', '["mike","mike"]', '["pat"]', '"jessica"', 'null', '{', '["mike","jessica","mike"]']) {
    const loaded = liveConfig({ VOICE_805_RING_STAFF_JSON: raw });
    assert.deepEqual(incomingRingStaff(loaded), [], raw);
    assert.equal(supabaseReadiness(loaded).ready, false);
    assert.ok(supabaseReadiness(loaded).missing.includes('Incoming ring staff'));
    assert.equal(readiness(legacyReady({ VOICE_805_RING_STAFF_JSON: raw })).ready, false);
    assert.ok(readiness(legacyReady({ VOICE_805_RING_STAFF_JSON: raw })).missing.includes('incoming ring staff'));
  }
});

test('the default inbound greeting rings Mike and Jessica', async () => {
  const f = fixture();
  const { call } = await inbound(f, 'CA' + '1'.repeat(32));
  assert.equal(call.phase, 'offering');
  assert.deepEqual(dials(f), ['jessica', 'mike']);
  assert.deepEqual(call.offers.map((offer) => offer.staff).sort(), ['jessica', 'mike']);
  const mike = call.offers.find((offer) => offer.staff === 'mike');
  assert.match(await (await f.handler(amd(f, call, mike, 'machine_start'))).text(), /<Hangup\/>/);
  await Promise.all(f.tasks);
  const waiting = await f.state.transact((_e, s) => s.get('call', call.id));
  assert.equal(waiting.phase, 'offering');
  assert.equal(waiting.offers.find((offer) => offer.staff === 'jessica').status, 'ringing');
});

test('Mike-only ringing does not dial Jessica and one no-answer returns to Grok', async () => {
  const during = fixture('["mike"]');
  const early = await inbound(during, 'CA' + '2'.repeat(32));
  assert.deepEqual(dials(during), ['mike']);
  assert.equal(early.call.offers.length, 1);
  assert.equal(early.call.greetingPlayed, false);
  assert.equal(during.c.staff.jessica.destination, '+18055550102');
  assert.equal(during.c.staff.jessica.sms, '+18055550102');
  const mike = early.call.offers[0];
  assert.match(await (await during.handler(amd(during, early.call, mike, 'machine_start'))).text(), /<Hangup\/>/);
  await Promise.all(during.tasks);
  const dropped = await during.state.transact((_e, s) => s.get('call', early.call.id));
  assert.equal(dropped.phase, 'message');
  assert.equal(dropped.owner, null);
  assert.equal(dropped.greetingPlayed, false);
  assert.ok(dropped.deadline - Date.now() > 60000);
  assert.equal(during.provider.operations.filter((item) => item.type === 'connect-agent').length, 0);
  assert.deepEqual(dials(during), ['mike']);
  const greeted = await during.handler(carrier(during, `/twilio/greeted/${dropped.id}`, { CallSid: early.call.sid, To: during.c.number, From: '+18055550199' }));
  const xml = await greeted.text();
  await Promise.all(during.tasks);
  assert.match(xml, /<Connect><Stream /);
  assert.doesNotMatch(xml, /Conference/);
  assert.deepEqual(dials(during), ['mike']);

  const after = fixture('["mike"]');
  const sid = 'CA' + '3'.repeat(32);
  const first = await inbound(after, sid);
  const played = await after.handler(carrier(after, `/twilio/greeted/${first.call.id}`, { CallSid: sid, To: after.c.number, From: '+18055550199' }));
  assert.match(await played.text(), /Conference/);
  await Promise.all(after.tasks);
  const ringing = await after.state.transact((_e, s) => s.get('call', first.call.id));
  assert.equal(ringing.greetingPlayed, true);
  assert.match(await (await after.handler(amd(after, ringing, ringing.offers[0], 'machine_end_beep'))).text(), /<Hangup\/>/);
  await Promise.all(after.tasks);
  const next = await after.state.transact((_e, s) => s.get('call', first.call.id));
  assert.equal(next.phase, 'message');
  assert.equal(after.provider.operations.filter((item) => item.type === 'connect-agent').length, 1);
  assert.deepEqual(dials(after), ['mike']);
  const saved = await after.state.transact((e) => e.saveMessage(next.id, {
    name: 'Pat Example', callback: '+18055550199', message: 'Please call me back.', confirmed: true,
  }, randomUUID()));
  const notes = await after.state.transact((_e, s) => s.list('notification').filter((item) => item.messageId === saved.id));
  assert.deepEqual(notes.map((item) => item.recipient).sort(), ['jessica', 'mike']);
  assert.deepEqual(notes.map((item) => item.destination).sort(), ['+18055550101', '+18055550102']);
});

test('requestStaff uses the same ring list, while consult and callback still reach Jessica', async () => {
  const f = fixture('["mike"]');
  const created = await f.state.transact((e) => e.inbound('CA' + '4'.repeat(32), '+18055550199'));
  await f.state.transact((e) => e.requestStaff(created.id, `agent-transfer:${created.id}`));
  await f.worker.drain();
  const offered = await f.state.transact((_e, s) => s.get('call', created.id));
  assert.deepEqual(offered.offers.map((offer) => offer.staff), ['mike']);
  assert.deepEqual(dials(f), ['mike']);

  const live = fixture('["mike"]');
  const sid = 'CA' + '5'.repeat(32);
  const first = await inbound(live, sid);
  await live.state.transact((e) => e.joined(first.call.id, first.call.sid, 'main', 'CFmain', `caller:${first.call.id}`));
  const mike = first.call.offers[0];
  assert.match(await (await live.handler(amd(live, first.call, mike, 'human'))).text(), /<Pause/);
  await Promise.all(live.tasks);
  await live.state.transact((e) => e.joined(first.call.id, mike.sid, 'main', 'CFmain', `owner:${first.call.id}`));
  await live.worker.drain();
  const human = await live.state.transact((_e, s) => s.get('call', first.call.id));
  assert.equal(human.phase, 'human');
  assert.equal(human.owner, 'mike');
  await live.state.transact((e) => e.command(human.id, 'mike', human.revision, 'consult', randomUUID()));
  await live.worker.drain();
  const consulting = await live.state.transact((_e, s) => s.get('call', human.id));
  assert.equal(consulting.offers.find((offer) => offer.purpose === 'consult').staff, 'jessica');
  assert.ok(dials(live).includes('jessica'));
  const messageId = randomUUID();
  await live.state.transact((_e, s) => s.put('message', {
    id: messageId, callId: human.id, name: 'Pat Example', callback: '+18055550199', text: 'Callback please.', confirmed: true, status: 'open', createdAt: Date.now(),
  }));
  const callback = await live.state.transact((e) => e.callback(messageId, 'jessica', randomUUID()));
  assert.equal(callback.offers[0].staff, 'jessica');
  assert.equal(callback.offers[0].purpose, 'callback');
  assert.equal(dials(live).filter((staff) => staff === 'jessica').length, 1);
});

test('an invalid ring list does not dial Jessica or wait out the offer', async () => {
  const f = fixture('[]');
  const refused = await f.handler(carrier(f, '/twilio/inbound', { CallSid: 'CA' + '6'.repeat(32), To: f.c.number, From: '+18055550199' }));
  assert.equal(refused.status, 503);
  assert.deepEqual(dials(f), []);
  assert.equal(f.c.staff.jessica.destination, '+18055550102');
  assert.equal(f.c.staff.jessica.sms, '+18055550102');
  const created = await f.state.transact((e) => e.inbound('CA' + '7'.repeat(32), '+18055550199'));
  await f.state.transact((e) => e.greeted(created.id, `answer:${created.id}`));
  const call = await f.state.transact((_e, s) => s.get('call', created.id));
  assert.equal(call.phase, 'message');
  assert.equal(call.offers.length, 0);
  assert.equal(call.greetingPlayed, false);
  assert.ok(call.deadline - Date.now() > 60000);
  await f.state.transact((e) => e.tick(Date.now() + 20000));
  const settled = await f.state.transact((_e, s) => s.get('call', created.id));
  assert.equal(settled.phase, 'message');
  assert.deepEqual(dials(f), []);
  const broken = fixture('{');
  const again = await broken.state.transact((e) => e.inbound('CA' + '8'.repeat(32), '+18055550199'));
  await broken.state.transact((e) => e.requestStaff(again.id, `agent-transfer:${again.id}`));
  const transferred = await broken.state.transact((_e, s) => s.get('call', again.id));
  assert.equal(transferred.phase, 'message');
  assert.equal(transferred.offers.length, 0);
  assert.deepEqual(dials(broken), []);
});

test('booking notices still name Jessica and Mike and ignore the ring list', () => {
  const root = new URL('../../../', import.meta.url);
  const sql = readFileSync(new URL('supabase/migrations/20261020035500_voice_805_agent_staff_notice.sql', root), 'utf8');
  const scheduling = readFileSync(new URL('src/lib/voice-805/scheduling.ts', root), 'utf8');
  const delivery = readFileSync(new URL('src/lib/booking/delivery.ts', root), 'utf8');
  const numbers = readFileSync(new URL('src/lib/crm/calendar-notifications.ts', root), 'utf8');
  for (const source of [sql, scheduling, delivery, numbers]) assert.doesNotMatch(source, /VOICE_805_RING_STAFF_JSON|incomingRingStaff/);
  assert.match(sql, /agent_staff_sms_jessica/);
  assert.match(sql, /agent_staff_sms_mike/);
  assert.match(scheduling, /AGENT_NOTICE_KINDS=\['agent_staff_sms_jessica','agent_staff_sms_mike'\]/);
  assert.match(delivery, /agent_staff_sms_jessica: "Jessica"/);
  assert.match(delivery, /agent_staff_sms_mike: "Mike"/);
  assert.match(numbers, /JESSICA_805_SALES_SMS_NUMBER/);
  assert.match(numbers, /MIKE_805_SALES_SMS_NUMBER/);
});
