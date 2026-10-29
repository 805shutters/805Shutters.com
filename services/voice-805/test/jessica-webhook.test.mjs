import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../engine.mjs';
import { loadJessicaWebhookConfig, sendJessicaPhoneMessage } from '../jessica-webhook.mjs';
import { SnapshotStore } from '../supabase-store.mjs';
import { SupabaseWorker } from '../supabase-worker.mjs';

const webhookUrl = 'https://api2.cursor.sh/automations/webhook/03b84273-6a7e-52d3-a737-5c161771aba2';
const webhookKey = 'k'.repeat(64);
const crmRow = {
  id: '11111111-1111-4111-8111-111111111111',
  call_sid: 'CA' + '1'.repeat(32),
  caller_name: 'Pat Example',
  callback_number: '+18055550199',
  call_time: '2026-10-29T17:00:00.000Z',
  transcript: 'Caller: Please call about shutters.',
  reason: 'Received message: Please call about shutters.',
  recording_url: '',
  status: 'needs_callback',
};

test('Jessica webhook accepts only the pinned Grok Bot endpoint and a private key', () => {
  assert.equal(loadJessicaWebhookConfig({ VOICE_805_JESSICA_WEBHOOK_URL: webhookUrl, VOICE_805_JESSICA_WEBHOOK_KEY: webhookKey }).configured, true);
  for (const url of [
    'http://api2.cursor.sh/automations/webhook/03b84273-6a7e-52d3-a737-5c161771aba2',
    'https://example.com/automations/webhook/03b84273-6a7e-52d3-a737-5c161771aba2',
    'https://api2.cursor.sh/not-a-webhook',
    webhookUrl + '?copy=1',
  ]) assert.equal(loadJessicaWebhookConfig({ VOICE_805_JESSICA_WEBHOOK_URL: url, VOICE_805_JESSICA_WEBHOOK_KEY: webhookKey }).configured, false);
  assert.equal(loadJessicaWebhookConfig({ VOICE_805_JESSICA_WEBHOOK_URL: webhookUrl, VOICE_805_JESSICA_WEBHOOK_KEY: 'short' }).configured, false);
});

test('Jessica webhook sends the verified CRM row with authentication and an idempotency key', async () => {
  const requests = [];
  const result = await sendJessicaPhoneMessage(async (url, init) => {
    requests.push({ url, init });
    return new Response('{}', { status: 202 });
  }, loadJessicaWebhookConfig({ VOICE_805_JESSICA_WEBHOOK_URL: webhookUrl, VOICE_805_JESSICA_WEBHOOK_KEY: webhookKey }), { ...crmRow, verified: true, internal_note: 'must not leave the phone service' });
  assert.deepEqual(result, { delivered: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, webhookUrl);
  assert.equal(requests[0].init.headers.Authorization, `Bearer ${webhookKey}`);
  assert.equal(requests[0].init.headers['X-Idempotency-Key'], `805-phone:${crmRow.call_sid}`);
  assert.deepEqual(JSON.parse(requests[0].init.body), crmRow);
});

test('Jessica delivery is a separate retryable effect after CRM verification', async () => {
  const store = new SnapshotStore();
  const config = { transport: 'media', staff: {} };
  const state = {
    config,
    transact: async (fn) => store.tx(() => fn(new Engine(store, config), store)),
  };
  const call = store.put('call', { id: 'call-1', sid: crmRow.call_sid, phase: 'ended' });
  const message = store.put('message', { id: 'message-1', callId: call.id, crmVerified: true, crmRow });
  const crmEffect = store.put('effect', { id: 'effect-1', callId: call.id, type: 'sync-message', data: { messageId: message.id }, status: 'sending', attempts: 1 });
  let attempts = 0;
  const worker = new SupabaseWorker(state, {}, { syncJessica: async (row) => {
    attempts += 1;
    assert.deepEqual(row, crmRow);
    if (attempts === 1) throw new Error('temporary outage');
    return { delivered: true };
  } });

  await worker.handle('effect', crmEffect);
  const queued = store.list('effect').find(effect => effect.type === 'sync-jessica');
  assert.equal(store.get('effect', crmEffect.id).status, 'done');
  assert.equal(queued.status, 'pending');

  store.put('effect', { ...queued, status: 'sending', attempts: 1 });
  await worker.handle('effect', store.get('effect', queued.id));
  assert.equal(store.get('effect', queued.id).status, 'pending');
  assert.equal(store.get('message', message.id).crmVerified, true);
  assert.equal(store.get('message', message.id).jessicaVerified, undefined);

  store.put('effect', { ...store.get('effect', queued.id), status: 'sending', attempts: 2 });
  await worker.handle('effect', store.get('effect', queued.id));
  assert.equal(store.get('effect', queued.id).status, 'done');
  assert.equal(store.get('message', message.id).jessicaVerified, true);
});
