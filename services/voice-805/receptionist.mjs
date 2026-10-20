import { randomUUID } from 'node:crypto';
import { hmac } from './security.mjs';

export async function schedulingRequest(config, callId, action, input = {}, fetcher = fetch) {
  const body = JSON.stringify({ callId, dataset: config.dataset, action, input }), at = String(Date.now()), nonce = randomUUID();
  const response = await fetcher('https://www.805shutters.com/api/voice-805/scheduling', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-805-time': at, 'x-805-nonce': nonce, 'x-805-signature': hmac(config.toolsKey, `${at}\n${nonce}\n${body}`) }, body, signal: AbortSignal.timeout(20000),
  });
  if (response.status === 409) { const rejected = await response.json(); if (rejected.replan === true) return { replan: true, verified: false }; }
  if (!response.ok) throw new Error('Scheduling could not be verified. Offer a callback or try another time.');
  return response.json();
}
