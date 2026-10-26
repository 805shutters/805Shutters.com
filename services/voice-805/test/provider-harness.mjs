// Opt-in provider integration harness. No Twilio provider, database client, or
// durable storage is constructed. All phone/CRM state is isolated in memory.
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
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

// These are fictional callers. No customer names, addresses or contacts enter
// this harness. The local SQL suite separately executes the real booking RPC.
export const PROVIDER_CASES = Object.freeze({
  thursday: { utterances: ['I want to schedule an appointment', 'Thursday', '10 a.m.'], awaiting: 'address' },
  booked: { utterances: ['I want to schedule an appointment', 'Thursday', '10 a.m.', '123 Test Street, Camarillo', 'yes', 'my home', 'Pat Example', 'yes', 'yes'], booked: true },
  flexible: { utterances: ['schedule an appointment', 'Friday', 'anytime', '123 Test Street, Camarillo', 'yes', 'my home', 'Pat Example', 'yes', 'yes'], booked: true },
  unavailable: { utterances: ['schedule an appointment', 'Sunday', '10 p.m.', '123 Test Street, Camarillo', 'yes', 'my home', 'Pat Example', 'yes', 'yes', 'Please call me about another opening', 'yes'], availability: 'none', message: true },
  alternative: { utterances: ['book an appointment', 'Friday', '10 a.m.', '123 Test Street, Camarillo', 'yes', 'my home', 'Pat Example', 'yes', 'yes'], availability: 'alternative', booked: true },
  correction: { utterances: ['schedule an appointment', 'Thursday', '10 a.m.', 'Actually Friday at 3 p.m.', '123 Test Street, Camarillo', 'No, 125 Test Street, Camarillo', 'yes', 'my home', 'Pat Example', 'yes', 'yes'], booked: true },
  unclear: { utterances: ['perhaps', 'maybe'], awaiting: 'callback' },
  past: { utterances: ['schedule an appointment', 'October first 2020', 'Thursday', '10 a.m.'], awaiting: 'address' },
  duration: { utterances: ['schedule an appointment', 'Thursday', 'How long is the consultation?', '10 a.m.'], awaiting: 'address' },
  decline: { utterances: ['schedule an appointment', 'Thursday', '10 a.m.', '123 Test Street, Camarillo', 'yes', 'my home', 'Pat Example', 'yes', 'no'], awaiting: 'correction' },
});

export async function runProviderConversation({ key, WebSocket, caseName = 'thursday', delayMs = 500, stateDelayMs = 250, voice = 'rex' }) {
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
  const call = engine.inbound('CA' + '1'.repeat(32), '+18055550199');
  store.put('call', { ...call, phase: 'message', deadline: Date.now() + 300000, context: callerContext({ match: 'unmatched' }) });
  const state = { config, transact: async fn => { await pause(stateDelayMs); return fn(engine, store); }, readCall: async id => { await pause(stateDelayMs); return store.get('call', id); } };
  const started = Date.now(), trace = [], outputs = [], transcripts = new Map(), frameResponses = new Map(), audioChecks = [];
  let session, media = [], marks = 0, lastResponse = null, booking = null;
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
        setTimeout(() => session.enqueue(async () => {
          if (session.closed) return;
          await session.carrier({ event: 'mark', streamSid: 'MZ' + '2'.repeat(32), mark: event.mark }); marks++;
        }), Math.ceil(bytes.length / 8));
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
    schedule: async (_config, id, action, input) => {
      actions.push(action);
      if (id !== call.id) throw new Error('Unexpected isolated call');
      const current = store.get('call', id), schedule = current.schedule;
      if (action === 'find_appointments') {
        if (scenario.availability === 'none') return { exact: false, fit: false, slots: [], alternatives: [], saved: false };
        const time = scenario.availability === 'alternative' ? '11:00' : schedule.time || '10:00';
        return { exact: scenario.availability !== 'alternative' && !!schedule.time, date: schedule.date, requested: schedule.time,
          slots: [time], alternatives: [{ date: schedule.date, time }], fit: true, saved: false, searchComplete: true };
      }
      if (action === 'prepare_appointment') return { intent: { id: randomUUID(), kind: 'appointment', payload: input,
        // Match the full production prepareVoiceVisit readback, including the
        // name, duration and callback number, to exercise its longer playback.
        readback: `Consultation for ${input.name}, at ${input.address}, on ${input.date} at ${input.time} Pacific time, for 60 minutes. Callback number ${input.phone.split('').join(' ')}. Please say yes to book this appointment, or say what you want changed.` } };
      if (action === 'commit') {
        const intent = current.bookingIntent;
        if (!intent?.playedAt || !intent?.confirmedAt || !intent.turnId || current.phase !== 'message') throw new Error('Unconfirmed isolated save');
        booking ||= { verified: true, calendarEventId: randomUUID(), date: intent.payload.date, time: intent.payload.time };
        store.put('call', { ...current, booking });
        return booking;
      }
      throw new Error('Unknown isolated scheduling action');
    },
    saveCrm: async () => ({ verified: true, id: 'isolated-callback', call_sid: call.sid }),
  });
  const waitFor = async (condition, timeout = 35000) => {
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
    await waitFor(() => marks === 1);
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
  } catch (error) { failure = error.message; }
  finally { session.finish(); }
  await Promise.all(audioChecks);
  const final = store.get('call', call.id);
  const mismatches = outputs.filter(row => row.expected !== row.transcript);
  const assertions = { allAudioMatchesPreparedLine: mismatches.length === 0 && outputs.length > 0,
    generatedSpeechVerified: outputs.length > 0 && outputs.every(row => !row.audioError && row.wordAgreement >= 0.75 && !/^(?:stay )?silent[.!]?$/i.test(String(row.audioTranscript || '').trim())),
    progressedEveryTurn: outputs.length === utterances.length + 1, booking: Boolean(booking) === Boolean(scenario.booked),
    message: store.list('message').some(row => row.confirmed) === Boolean(scenario.message),
    awaiting: !scenario.awaiting || final?.schedule?.awaiting === scenario.awaiting };
  return { caseName, delayMs, stateDelayMs, voice, failure, assertions, pass: !failure && Object.values(assertions).every(Boolean), durationMs: Date.now() - started, outputs, trace, actions, booking,
    responses: [...frameResponses].map(([id, row]) => ({ id, bytes: row.bytes, hash: row.hash.digest('hex').slice(0, 16), transcript: transcripts.get(id) || null })),
    schedule: final?.schedule, messages: store.list('message').length, lastResponse };
}
