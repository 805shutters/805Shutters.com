import { MESSAGE_SAVED } from '../message-intake.mjs';
// Opt-in provider integration harness. No Twilio provider, database client, or
// durable storage is constructed. All phone/CRM state is isolated in memory.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { GrokMediaSession } from '../grok-media.mjs';
import { SnapshotStore } from '../supabase-store.mjs';
import { Engine } from '../engine.mjs';
import { loadSupabaseConfig } from '../supabase-config.mjs';
import { callerContext } from '../caller-context.mjs';
import { REALTIME_URL, TTS_URL } from '../prompts.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
function mulawWav(bytes) {
  const wav = Buffer.alloc(44 + bytes.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(bytes.length * 2, 40);
  for (let i = 0; i < bytes.length; i++) {
    const value = (~bytes[i]) & 255;
    const sample = (((value & 15) << 3) + 132) << ((value & 112) >> 4);
    wav.writeInt16LE(value & 128 ? 132 - sample : sample - 132, 44 + i * 2);
  }
  return wav;
}
async function transcribeGeneratedAudio(key, bytes) {
  const form = new FormData();
  form.append('model', 'grok-voice-transcribe-2.0'); form.append('language', 'en'); form.append('format', 'true');
  form.append('file', new Blob([mulawWav(bytes)], { type: 'audio/wav' }), 'synthetic-output.wav');
  const response = await fetch('https://api.x.ai/v1/stt', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Output STT HTTP ${response.status}`);
  return (await response.json()).text;
}
function audioWordAgreement(expected, actual) {
  const words = text => String(text || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(word => word.length > 1);
  const left = words(expected), right = words(actual);
  if (!left.length || !right.length) return 0;
  const pool = [...right]; let matched = 0;
  for (const word of left) { const i = pool.indexOf(word); if (i !== -1) { matched++; pool.splice(i, 1); } }
  return matched / left.length;
}
export async function syntheticSpeech(key, text, voice = 'rex') {
  const response = await fetch(TTS_URL, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voice, language: 'en', output_format: { codec: 'mulaw', sample_rate: 8000 } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Synthetic TTS HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 800000) throw new Error('Synthetic TTS size rejected');
  return bytes;
}

// Fictional callers only. Captured results are subsequently exercised against
// the real callback SQL and CRM display in an isolated database suite.
export const PROVIDER_CASES = Object.freeze({
  welcome_message: { welcome: true, utterances: ['Please call me about a consultation.'], message: true },
  welcome_no_answer: { welcome: true, declined: true, utterances: ['no thank you'], message: false },
  welcome_pickup: { welcome: true, pickup: true, utterances: [], message: false },
  short: { utterances: ['yes', 'Please call me about my shutters.'], message: true },
  volunteered: { utterances: ["I'm Pat Example. Please call me about my broken bedroom shade."], message: true },
  long: { utterances: ['yes', 'The shade in our living room sticks halfway down. We first noticed it on Saturday morning. The cord looks twisted, and the bottom rail is not level. The kitchen shade still works normally. Please call me after lunch so we can discuss a repair. I would also like to know whether a replacement part is available.'], message: true },
  blocked: { from: 'anonymous', utterances: ['yes', 'eight zero five five five five zero one two three', 'Please call about repairs.'], message: true },
  appointment: { utterances: ['Please schedule an appointment Friday at ten.'], message: true },
  duration: { utterances: ['How long is a consultation?', 'yes', 'Please call about a free consultation.'], message: true },
  decline: { declined: true, utterances: ['no thank you'], message: false },
  unclear: { utterances: ['perhaps', 'maybe'], message: false },
});

export async function runProviderConversation({ key, WebSocket, caseName = 'short', delayMs = 500, stateDelayMs = 250, voice = 'rex' }) {
  const scenario = PROVIDER_CASES[caseName];
  if (!scenario) throw new Error('Unknown synthetic case');
  const { utterances } = scenario;
  const config = { ...loadSupabaseConfig({}), transport: 'media', xaiKey: key, mode: 'live', liveAuthorized: true,
    agentReviewed: true, agentContractVerified: true, workerVerified: true,
    origin: 'https://isolated.invalid', accountSid: 'AC' + 'a'.repeat(32), authToken: 'x'.repeat(32),
    number: '+18055550100', controlKey: 'c'.repeat(32), toolsKey: 'k'.repeat(32), workerKey: 'w'.repeat(32),
    hours: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, [[0, 1440]]])), holidays: {},
    staff: { mike: { kind: 'cell', destination: '+18055550101' }, jessica: { kind: 'cell', destination: '+18055550102' } },
  };
  const store = new SnapshotStore(), engine = new Engine(store, config);
  const call = engine.inbound('CA' + '1'.repeat(32), scenario.from || '+18055550199');
  store.put('call', { ...call, phase: scenario.welcome ? 'offering' : 'message', listeningWelcome: Boolean(scenario.welcome), deadline: Date.now() + (scenario.welcome ? 20000 : 300000), context: callerContext({ match: 'unmatched' }) });
  const state = { config, transact: async fn => { await pause(stateDelayMs); return fn(engine, store); }, readCall: async id => { await pause(stateDelayMs); return store.get('call', id); } };
  const started = Date.now(), trace = [], outputs = [], transcripts = new Map(), frameResponses = new Map(), audioChecks = [];
  let session, media = [], marks = 0, lastResponse = null, pickupAt = null;
  const carrierTimers = [];
  const actions = [];
  const socket = {
    readyState: 1,
    send(raw) {
      const event = JSON.parse(raw);
      if (event.event === 'media') {
        const bytes = Buffer.from(event.media.payload, 'base64'); media.push(bytes);
      }
      if (event.event === 'clear') { media = []; trace.push({ ms: Date.now() - started, type: 'clear' }); }
      if (event.event === 'mark') {
        const bytes = Buffer.concat(media); media = [];
        const row = { ms: Date.now() - started, bytes: bytes.length, hash: digest(bytes), stage: session.stage,
          expected: session.prompt?.text, response: session.prompt?.responseId, transcript: transcripts.get(session.prompt?.responseId) || null };
        outputs.push(row);
        audioChecks.push(transcribeGeneratedAudio(key, bytes).then(text => {
          row.audioTranscript = text; row.wordAgreement = audioWordAgreement(row.expected, text);
        }).catch(error => { row.audioError = error.message; }));
        // Simulated Twilio consumes the actual G.711 bytes in real time. Only the
        // acknowledgement is simulated; all TTS and ASR audio is real provider data.
        carrierTimers.push(setTimeout(() => session.enqueue(async () => {
          if (session.closed) return;
          await session.carrier({ event: 'mark', streamSid: 'MZ' + '2'.repeat(32), mark: event.mark }); marks++;
        }), Math.ceil(bytes.length / 8)));
        if (scenario.pickup && row.stage === 'welcome-playback') {
          carrierTimers.push(setTimeout(() => {
            pickupAt = Date.now() - started;
            store.put('call', { ...store.get('call', call.id), phase: 'handoff', owner: 'mike' });
            // The authenticated human-answer path routes the parent to staff,
            // which stops this media stream. No real phone call is created.
            void session.carrier({ event: 'stop', streamSid: 'MZ' + '2'.repeat(32) });
          }, 2500));
        }
      }
    },
    close() { this.readyState = 3; },
  };
  const connect = () => {
    const ws = new WebSocket(REALTIME_URL, { headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 8000, maxPayload: 1048576 });
    ws.on('message', raw => {
      const event = JSON.parse(String(raw));
      const id = event.response_id || event.response?.id;
      if (event.type === 'response.created') lastResponse = id;
      if (event.type === 'response.output_audio.delta' && id) {
        const b = Buffer.from(event.delta, 'base64');
        const row = frameResponses.get(id) || { bytes: 0, hash: createHash('sha256') }; row.bytes += b.length; row.hash.update(b); frameResponses.set(id, row);
      }
      if (event.type === 'response.output_audio_transcript.done') transcripts.set(id, event.transcript || null);
      if (!['response.output_audio.delta', 'response.audio.delta', 'response.output_audio_transcript.delta', 'conversation.item.input_audio_transcription.updated'].includes(event.type)) {
        trace.push({ ms: Date.now() - started, type: event.type, id, itemId: event.item_id || event.item?.id, status: event.response?.status,
          transcript: event.transcript, error: event.error ? { type: event.error.type, code: event.error.code } : undefined });
      }
    });
    return ws;
  };
  session = new GrokMediaSession({ socket, call, state, worker: { drain: async () => {} }, connect,
    saveCrm: async () => ({ verified: true, id: 'isolated-callback', call_sid: call.sid }),
  });
  const waitFor = async (condition, timeout = 120000) => {
    const until = Date.now() + timeout;
    while (!condition()) {
      if (session.closed) throw new Error('Session closed before expected progress');
      if (Date.now() >= until) throw new Error('Provider conversation progress deadline');
      await pause(50);
    }
  };
  let failure = null;
  try {
    await session.carrier({ event: 'start', start: { accountSid: config.accountSid, callSid: call.sid, streamSid: 'MZ' + '2'.repeat(32), mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } });
    if (scenario.pickup) {
      await Promise.race([session.done, pause(40000).then(() => { throw new Error('Pickup did not stop agent'); })]);
    } else {
      if (scenario.welcome) carrierTimers.push(setTimeout(() => engine.tick(Date.now()), 20100));
      await waitFor(() => marks === (scenario.welcome ? 2 : 1));
    }
    for (const text of utterances) {
      const before = marks;
      const bytes = await syntheticSpeech(key, text, voice);
      await pause(delayMs);
      // Trailing G.711 silence lets real VAD end the turn. Audio is never saved.
      const input = Buffer.concat([bytes, Buffer.alloc(8000, 0xff)]);
      for (let offset = 0; offset < input.length; offset += 160) {
        await session.enqueue(() => session.carrier({ event: 'media', streamSid: 'MZ' + '2'.repeat(32), media: { payload: input.subarray(offset, offset + 160).toString('base64') } }));
        await pause(20);
      }
      await waitFor(() => marks > before);
    }
    if (scenario.hangup) await session.carrier({ event: 'stop', streamSid: 'MZ' + '2'.repeat(32) });
  } catch (error) { failure = error.message; }
  finally { session.finish(); for (const timer of carrierTimers) clearTimeout(timer); }
  await Promise.all(audioChecks);
  const final = store.get('call', call.id);
  const mismatches = outputs.filter(row => row.expected !== row.transcript);
  const assertions = { allAudioMatchesPreparedLine: mismatches.length === 0 && outputs.length > 0,
    generatedSpeechVerified: outputs.length > 0 && outputs.every(row => !row.audioError && row.wordAgreement >= 0.75 && !/^(?:stay )?silent[.!]?$/i.test(String(row.audioTranscript || '').trim())),
    progressedEveryTurn: outputs.length === utterances.length + (scenario.welcome && !scenario.pickup ? 2 : 1),
    welcomeOrder: !scenario.welcome || (outputs[0]?.stage === 'welcome-playback' && !/message|voicemail|miss you/i.test(outputs[0]?.audioTranscript || '') && /shutters.*blinds.*shades/i.test(outputs[0]?.audioTranscript || '') && (scenario.pickup ? outputs.length === 1 && marks === 0 && final.owner === 'mike' : outputs[1]?.stage === 'opening-playback' && /team members are tied up/i.test(outputs[1]?.audioTranscript || '') && outputs[1].ms >= outputs[0].ms + outputs[0].bytes / 8)), bookingDisabled: !final?.booking && actions.length === 0,
    message: store.list('message').some(row => row.completed || row.confirmed) === Boolean(scenario.message),
    declineEnded: !scenario.declined || (final.phase === 'ended' && !final.schedule?.messageText && store.list('message').length === 0 && store.list('notification').length === 0 && /thank you for calling/i.test(outputs.at(-1)?.audioTranscript || '')),
    completeLongMessage: caseName !== 'long' || ['Saturday', 'cord', 'kitchen', 'after lunch', 'replacement part'].every(phrase => String(final?.schedule?.messageText).toLowerCase().includes(phrase.toLowerCase())),
    noRepeatedLongPrefixes: caseName !== 'long' || (String(final?.schedule?.messageText).match(/living room/gi) || []).length === 1,
    simpleClose: !scenario.message || (final.phase === 'ended' && outputs.at(-1)?.expected === MESSAGE_SAVED && outputs.filter(row => row.expected === MESSAGE_SAVED).length === 1 && outputs.every(row => !/Please say yes|your name|Callback number/i.test(row.expected))),
    noReadbackConfirmation: !scenario.message || store.list('message').every(row => row.completed && !row.confirmed),
    awaiting: !scenario.awaiting || final?.schedule?.awaiting === scenario.awaiting };
  return { caseName, delayMs, stateDelayMs, voice, failure, assertions, pass: !failure && Object.values(assertions).every(Boolean), durationMs: Date.now() - started, pickupAt, outputs, trace, actions,
    responses: [...frameResponses].map(([id, row]) => ({ id, bytes: row.bytes, hash: row.hash.digest('hex').slice(0, 16), transcript: transcripts.get(id) || null })),
    schedule: final?.schedule, call: { id: final.id, sid: final.sid, from: final.from, createdAt: final.createdAt, callerTranscript: final.callerTranscript, summary: final.summary }, messages: store.list('message'), lastResponse };
}
