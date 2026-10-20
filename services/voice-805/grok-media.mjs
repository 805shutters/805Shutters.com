import { randomUUID } from 'node:crypto';
import { reportFailure } from './security.mjs';
import { RECEPTIONIST_OPENING, RECEPTIONIST_PROMPT, RECEPTIONIST_TOOLS, schedulingRequest, messageIntent, spokenDecision } from './receptionist.mjs';
import { VOICE_ID } from './prompts.mjs';
import { applyFindResult, applyScheduleTurn, bookedSchedule, callbackSchedule, callerPhone, findPayload, initialSchedule, preparePayload } from './schedule-intake.mjs';

const validAudio = value => typeof value === 'string' && value.length > 0 && value.length <= 256000 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
const CONFIRM_MS = 60000;
const SILENCE_MS = 12000;
// Paid Supabase Edge workers, including this Pro project, are stopped at 400s of wall clock.
// Free is 150s. https://supabase.com/docs/guides/functions/limits
// The socket ends first and leaves time for the state write, worker drain, and voicemail fallback.
export const HOST_WALL_MS = 400000;
export const FALLBACK_RESERVE_MS = 30000;
export const MEDIA_SESSION_MS = 270000;
// A scripted line that never reaches playback must not wait for the whole media session.
export const FORCE_DEADLINE_MS = 10000;
// Queued G.711 is 8000 bytes per second. The Twilio mark may trail the whole buffer.
export const PLAYBACK_MARGIN_MS = 5000;
export function pcmByteLength(payload) {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}
export function playbackWaitMs(pcmBytes) {
  return Math.ceil(pcmBytes / 8) + PLAYBACK_MARGIN_MS;
}
// https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech
// Final captions are emitted only when this nested model is set. `grok` at the top level is not the documented field.
export const INPUT_TRANSCRIPTION = Object.freeze({ model: 'grok-transcribe', language_hint: 'en' });
const PREPARE_FAIL = 'I could not verify that opening. May I take a callback message so our team can check it?';
const SAVE_FAIL = 'I could not verify the save. May I take a callback message so our team can check it?';
const REPLAN_QUESTION = 'That time no longer fits. What day or time should I check instead?';
const CHANGE_QUESTION = 'Nothing new was saved. Tell me what you would like to change.';
const SILENCE_QUESTION = 'I did not hear a clear yes, so nothing was saved. May I take a callback message so our team can check it?';

// The carrier socket is authenticated before construction. The model can propose.
// A spoken yes counts only after the exact readback has played on this call.
export class GrokMediaSession {
  constructor({ socket, call, state, worker, connect, clock = globalThis, schedule = schedulingRequest, saveCrm = null }) {
    Object.assign(this, { socket, call, state, worker, connect, clock, schedule, saveCrm });
    this.config = state.config;
    this.stage = 'starting';
    this.closed = false;
    this.streamSid = null;
    this.marks = new Map();
    this.responses = new Set();
    this.tools = new Set();
    this.heard = new Set();
    this.stray = new Set();
    this.prompt = null;
    this.pending = [];
    this.buffers = new Map();
    this.settled = new Map();
    this.cancelSent = false;
    this.vadTurn = false;
    this.forceRetries = 0;
    this.promptTimer = null;
    this.playbackToken = 0;
    this.pcmBytes = 0;
    this.trace = [];
    this.promptTranscripts = new Map();
    this.chain = Promise.resolve();
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
    this.startTimer = clock.setTimeout(() => this.enqueue(() => this.fail('Voice connection timed out')), 10000);
    this.limitTimer = clock.setTimeout(() => this.enqueue(() => this.fail('Voice session duration reached')), MEDIA_SESSION_MS);
    socket.onmessage = event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return this.enqueue(() => this.fail('Invalid carrier event')); }
      if (data.event === 'stop' && this.streamSid && data.streamSid === this.streamSid) { void this.carrier(data).catch(error => { reportFailure('media-stop', error); this.finish(); }); return; }
      this.enqueue(() => this.carrier(data));
    };
    socket.onclose = () => this.enqueue(() => this.fail('Carrier connection closed'));
    socket.onerror = () => this.enqueue(() => this.fail('Carrier audio connection failed'));
  }
  enqueue(task) { this.chain = this.chain.then(async () => { if (!this.closed) await task(); }).catch(error => { reportFailure('media-session', error); this.fail('Voice session unavailable'); }); return this.chain; }
  sendAI(value) { if (this.ai?.readyState === 1) this.ai.send(JSON.stringify(value)); }
  sendCarrier(value) { if (this.socket.readyState === 1) this.socket.send(JSON.stringify({ ...value, streamSid: this.streamSid })); }
  now() { return typeof this.clock.now === 'function' ? this.clock.now() : new Date(); }
  voiceSession(extra = {}) {
    return {
      voice: VOICE_ID,
      audio: { input: { format: { type: 'audio/pcmu' }, transcription: INPUT_TRANSCRIPTION }, output: { format: { type: 'audio/pcmu' } } },
      ...extra,
    };
  }
  async current() { return this.state.transact((_e, s) => s.get('call', this.call.id)); }
  async carrier(event) {
    if (event.event === 'connected') return;
    if (event.event === 'start') {
      const s = event.start;
      if (this.streamSid || s?.accountSid !== this.config.accountSid || s?.callSid !== this.call.sid || !/^MZ[0-9a-f]{32}$/i.test(s?.streamSid || '') || s?.mediaFormat?.encoding !== 'audio/x-mulaw' || s.mediaFormat.sampleRate !== 8000 || s.mediaFormat.channels !== 1) return this.finish();
      const claimed = await this.state.transact((_e, store) => {
        const c = store.get('call', this.call.id);
        if (!c || c.phase !== 'message' || c.mediaStreamSid || c.mediaFailed) return false;
        store.put('call', { ...c, mediaStreamSid: s.streamSid });
        return true;
      });
      if (!claimed) return this.finish();
      this.streamSid = s.streamSid;
      this.ai = this.connect();
      this.ai.onopen = () => this.enqueue(async () => this.sendAI({ type: 'session.update', session: this.voiceSession({ instructions: RECEPTIONIST_PROMPT, turn_detection: { type: null }, tools: [] }) }));
      this.ai.onmessage = e => this.enqueue(() => this.grok(JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString())));
      this.ai.onerror = () => this.enqueue(() => this.fail('Grok audio connection failed'));
      this.ai.onclose = () => this.enqueue(() => this.fail('Grok audio connection closed'));
      return;
    }
    if (!this.streamSid || event.streamSid !== this.streamSid) return;
    if (event.event === 'stop') {
      await this.state.transact((e, s) => { const c = s.get('call', this.call.id); if (c?.phase === 'message') e.ended(c.id, c.sid, `media-stop:${this.streamSid}`); });
      await this.worker.drain();
      return this.finish();
    }
    if (event.event === 'media' && ['assist', 'collect', 'confirm'].includes(this.stage) && validAudio(event.media?.payload)) this.sendAI({ type: 'input_audio_buffer.append', audio: event.media.payload });
    if (event.event === 'mark') {
      const next = this.marks.get(event.mark?.name);
      if (!next) return;
      this.marks.delete(event.mark.name);
      await next();
    }
  }
  force(text, stage) {
    this.stage = stage;
    this.audioBytes = 0;
    this.pcmBytes = 0;
    this.prompt = { text, responseId: null };
    this.pending = [];
    this.buffers = new Map();
    this.settled = new Map();
    this.cancelSent = false;
    this.forceRetries = 0;
    this.clearSilence();
    this.releasePlayback();
    this.marks.clear();
    // A response already created for this caller turn is the automatic server_vad turn. Cancel that id.
    // If speech has ended and no id has arrived yet, cancel whatever is in progress, then speak the scripted line.
    if (this.openResponseId && !this.responses.has(this.openResponseId)) {
      this.stray.add(this.openResponseId);
      this.cancel(this.openResponseId);
    } else if (this.vadTurn) {
      this.cancelSent = true;
      this.cancel();
    }
    this.vadTurn = false;
    this.sendAI({ type: 'session.update', session: this.voiceSession({ turn_detection: { type: null }, tools: [] }) });
    this.speakLine();
  }
  speakLine() {
    this.note('force');
    this.armPromptDeadline();
    this.sendAI({ type: 'conversation.item.create', item: { type: 'force_message', role: 'assistant', interruptible: false, content: [{ type: 'output_text', text: this.prompt.text }] } });
  }
  armPromptDeadline() {
    this.clearPromptTimer();
    this.promptTimer = this.clock.setTimeout(() => this.enqueue(() => this.promptExpired()), FORCE_DEADLINE_MS);
  }
  clearPromptTimer() {
    if (this.promptTimer) { this.clock.clearTimeout(this.promptTimer); this.promptTimer = null; }
  }
  releasePlayback() {
    this.playbackToken += 1;
    this.clearPromptTimer();
  }
  armPlaybackDeadline() {
    this.clearPromptTimer();
    const token = ++this.playbackToken;
    const wait = playbackWaitMs(this.pcmBytes);
    this.note('playback', { wait });
    this.promptTimer = this.clock.setTimeout(() => this.enqueue(() => this.playbackExpired(token)), wait);
  }
  playbackExpired(token) {
    if (this.closed || token !== this.playbackToken || !String(this.stage).endsWith('-playback')) return;
    this.note('playback-timeout');
    this.logLifecycle('Playback mark did not arrive');
    return this.fail('Playback mark did not arrive');
  }
  promptExpired() {
    if (this.closed || !this.prompt || String(this.stage).endsWith('-playback')) return;
    this.note('timeout');
    this.logLifecycle('Scripted line did not complete');
    return this.fail('Scripted line did not complete');
  }
  note(event, extra = {}) {
    this.trace.push({ stage: this.stage, event, pending: this.pending.length, cancel: this.cancelSent, audio: this.audioBytes > 0, retries: this.forceRetries, ...extra });
    if (this.trace.length > 12) this.trace.shift();
  }
  logLifecycle(message) {
    console.error(JSON.stringify({ event: 'voice-805-lifecycle', call: this.call.id, message, stage: this.stage, pending: this.pending.length, cancel: this.cancelSent, audio: this.audioBytes > 0, retries: this.forceRetries, trace: this.trace }));
  }
  // Two completed responses means the automatic turn and the scripted line both finished.
  // Neither may play: metadata is null for both, so the audio cannot be assigned safely.
  retryScript() {
    if (this.forceRetries >= 1 || !this.prompt?.text) return this.fail('Scripted line was not the only response');
    this.forceRetries += 1;
    for (const id of this.pending) this.stray.add(id);
    this.pending = [];
    this.buffers = new Map();
    this.settled = new Map();
    this.audioBytes = 0;
    this.pcmBytes = 0;
    this.cancelSent = false;
    this.prompt.responseId = null;
    this.note('retry');
    this.logLifecycle('Scripted line overlapped an automatic response');
    this.speakLine();
  }
  mark(next) {
    const name = randomUUID();
    this.marks.set(name, async () => { this.releasePlayback(); this.note('mark'); await next(); });
    this.sendCarrier({ event: 'mark', mark: { name } });
  }
  assist() { this.assistMessages(); }
  collect() {
    this.stage = 'collect';
    this.prompt = null;
    this.pending = [];
    this.vadTurn = false;
    this.clearSilence();
    this.sendAI({ type: 'session.update', session: this.voiceSession({ instructions: 'Stay silent. Do not speak, ask questions, or call tools. The server records each answer and supplies the next line.', turn_detection: { type: 'server_vad' }, tools: [] }) });
  }
  assistMessages() { this.stage = 'assist'; this.prompt = null; this.pending = []; this.vadTurn = false; this.messageOnly = true; this.clearSilence(); this.sendAI({ type: 'session.update', session: this.voiceSession({ instructions: RECEPTIONIST_PROMPT, turn_detection: { type: 'server_vad' }, tools: RECEPTIONIST_TOOLS }) }); }
  output(id, result) { this.sendAI({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: id, output: JSON.stringify(result) } }); }
  clearSilence() { if (this.silenceTimer) { this.clock.clearTimeout(this.silenceTimer); this.silenceTimer = null; } }
  armConfirm() {
    this.stage = 'confirm';
    this.prompt = null;
    this.pending = [];
    this.vadTurn = false;
    this.sendAI({ type: 'session.update', session: this.voiceSession({ turn_detection: { type: 'server_vad' }, tools: [] }) });
    this.silenceTimer = this.clock.setTimeout(() => this.enqueue(() => this.silence()), SILENCE_MS);
  }
  playDelta(delta) {
    this.audioBytes += delta.length;
    this.pcmBytes += pcmByteLength(delta);
    this.sendCarrier({ event: 'media', media: { payload: delta } });
  }
  cancel(id) {
    this.ignoreCancelError = true;
    this.sendAI(id ? { type: 'response.cancel', response_id: id } : { type: 'response.cancel' });
  }
  // The scripted line is the force_message lifecycle: response.created, audio deltas, response.done.
  // A response created before that send, or one the server reports as cancelled, is not that line.
  acceptResponse(id) {
    if (!this.prompt || !id || this.stray.has(id) || (this.prompt.responseId && this.prompt.responseId !== id)) return;
    this.prompt.responseId = id;
    this.cancelSent = false;
    for (const other of this.pending) if (other !== id) this.stray.add(other);
    this.pending = [id];
    for (const delta of this.buffers.get(id) || []) this.playDelta(delta);
    this.buffers.delete(id);
  }
  advancePrompt() {
    if (!['opening', 'readback', 'result'].includes(this.stage)) return;
    if (!this.audioBytes) return this.fail('Required audio missing');
    const stage = this.stage;
    this.stage = stage + '-playback';
    this.armPlaybackDeadline();
    this.mark(async () => {
      if (stage === 'readback') {
        const armed = await this.state.transact((_e, s) => {
          const c = s.get('call', this.call.id);
          if (c?.phase !== 'message' || c.intent?.id !== this.intent?.id || c.intent.confirmedAt) return false;
          s.put('call', { ...c, intent: { ...c.intent, playedAt: Date.now() } });
          return true;
        });
        if (armed) this.armConfirm(); else this.finish();
      } else if (this.messageOnly) this.assistMessages(); else this.collect();
    });
  }
  noteCancelled(id) {
    this.stray.add(id);
    this.buffers.delete(id);
    this.pending = this.pending.filter(item => item !== id);
    this.settled.set(id, 'cancelled');
    const rest = this.pending.filter(item => !this.stray.has(item));
    if (this.prompt?.responseId === id) return this.fail('Grok response incomplete');
    if (this.prompt && !this.prompt.responseId && rest.length === 1) {
      this.acceptResponse(rest[0]);
      if (this.settled.get(rest[0]) === 'completed') this.advancePrompt();
      return;
    }
    if (rest.length === 0) this.cancelSent = false;
  }
  callerTurn(event) {
    if (event.type === 'conversation.item.input_audio_transcription.updated') return null;
    if (event.type === 'conversation.item.input_audio_transcription.completed' && typeof event.transcript === 'string' && event.transcript.trim()) return { id: String(event.item_id || event.transcript), text: event.transcript.trim() };
    if (event.type === 'conversation.item.added' && event.item?.role === 'user' && event.item.status === 'completed') {
      const part = event.item.content?.find(content => typeof content?.transcript === 'string' && content.transcript.trim())
        || event.item.content?.find(content => content?.type === 'input_text' && typeof content?.text === 'string' && content.text.trim());
      const text = part?.transcript || part?.text;
      if (typeof text === 'string' && text.trim()) return { id: String(event.item.id || text), text: text.trim() };
    }
    return null;
  }
  async grok(event) {
    if (event.type === 'session.updated' && this.stage === 'starting') { this.clock.clearTimeout(this.startTimer); this.force(RECEPTIONIST_OPENING, 'opening'); return; }
    if (event.type === 'error') {
      if (this.ignoreCancelError) {
        this.ignoreCancelError = false;
        if (this.cancelSent && this.prompt && !this.prompt.responseId) {
          this.cancelSent = false;
          if (this.pending.length === 1) this.acceptResponse(this.pending[0]);
        }
        return;
      }
      return this.fail('Grok rejected the voice session');
    }
    const turn = this.callerTurn(event);
    if (turn && this.stage === 'confirm') return this.hear(turn);
    if (turn && this.stage === 'collect') return this.collectTurn(turn);
    if (turn) return;
    if (event.type === 'input_audio_buffer.speech_stopped' || event.type === 'input_audio_buffer.timeout_triggered') {
      if (['collect', 'confirm', 'assist'].includes(this.stage)) this.vadTurn = true;
      return;
    }
    if (event.type === 'response.created' && event.response?.id) {
      const id = String(event.response.id);
      this.openResponseId = id;
      this.note('created', { bound: Boolean(this.prompt?.responseId) });
      if (this.stage === 'assist' && !this.prompt) { this.audioBytes = 0; return; }
      if (!this.prompt || this.stray.has(id)) {
        this.stray.add(id);
        this.vadTurn = false;
        this.cancel(id);
        return;
      }
      if (this.prompt.responseId && this.prompt.responseId !== id) {
        this.stray.add(id);
        return;
      }
      if (!this.pending.includes(id)) this.pending.push(id);
      // A retry still has to see the whole lifecycle. Accepting the first created response
      // would play automatic speech when a second response arrives late.
      if (!this.cancelSent && this.forceRetries === 0) this.acceptResponse(id);
      return;
    }
    if (['response.output_audio.delta', 'response.audio.delta'].includes(event.type)) {
      if (this.stage === 'collect' || this.stage === 'confirm') return;
      const id = event.response_id ? String(event.response_id) : '';
      if (id && this.stray.has(id)) return;
      if (this.prompt?.responseId) {
        if (id && id !== this.prompt.responseId) return;
        if (['opening', 'readback', 'result', 'assist'].includes(this.stage) && validAudio(event.delta)) this.playDelta(event.delta);
        return;
      }
      if (this.prompt && id && validAudio(event.delta)) {
        const queued = this.buffers.get(id) || [];
        queued.push(event.delta);
        this.buffers.set(id, queued);
        return;
      }
      if (this.stage === 'assist' && !this.prompt && validAudio(event.delta)) this.playDelta(event.delta);
      return;
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      if (this.stage === 'readback' || this.stage === 'readback-playback') {
        this.marks.clear();
        this.sendCarrier({ event: 'clear' });
        this.intent = null;
        await this.state.transact((_e, s) => { const c = s.get('call', this.call.id); if (c?.phase === 'message') s.put('call', { ...c, intent: null, schedule: { ...(c.schedule || {}), awaiting: 'correction', asked: CHANGE_QUESTION } }); });
        this.force(CHANGE_QUESTION, 'result');
        return;
      }
      if (this.stage === 'assist') { this.marks.clear(); this.sendCarrier({ event: 'clear' }); }
      return;
    }
    if (event.type === 'response.function_call_arguments.done') {
      if (this.stage !== 'assist' || this.tools.has(event.call_id)) return;
      this.tools.add(event.call_id);
      if (this.pendingTool) { this.output(event.call_id, { error: 'One action at a time.' }); return; }
      this.pendingTool = event;
      return;
    }
    if (event.type !== 'response.done' || !event.response?.id || this.responses.has(event.response.id)) return;
    const responseId = String(event.response.id);
    this.responses.add(responseId);
    this.note('done', { status: event.response.status || 'completed' });
    if (this.openResponseId === responseId) this.openResponseId = null;
    if (this.stray.has(responseId)) {
      this.buffers.delete(responseId);
      this.pending = this.pending.filter(id => id !== responseId);
      return;
    }
    if (event.response.status === 'cancelled') return this.noteCancelled(responseId);
    if (this.prompt?.responseId === responseId) {
      if (event.response.status && event.response.status !== 'completed') return this.fail('Grok response incomplete');
      return this.advancePrompt();
    }
    if (this.prompt && !this.prompt.responseId) {
      const open = this.pending.filter(id => !this.stray.has(id));
      if (open.length > 1) {
        this.settled.set(responseId, event.response.status || 'completed');
        const statuses = open.map(id => this.settled.get(id));
        if (!statuses.every(Boolean)) return;
        if (this.forceRetries >= 1) return this.fail('Scripted line was not the only response');
        if (this.cancelSent && statuses.every(status => status === 'completed')) return this.retryScript();
        return this.fail('Grok response incomplete');
      }
      if (event.response.status && event.response.status !== 'completed') return this.fail('Grok response incomplete');
      this.acceptResponse(responseId);
      return this.advancePrompt();
    }
    if (!this.prompt && this.stage !== 'assist') return;
    if (event.response.status && event.response.status !== 'completed') return this.fail('Grok response incomplete');
    if (this.stage === 'assist' && this.pendingTool) {
      const task = this.pendingTool;
      this.pendingTool = null;
      this.stage = 'tool';
      if (this.audioBytes) this.mark(() => this.tool(task)); else await this.tool(task);
    }
  }
  async silence() {
    if (this.stage !== 'confirm') return;
    this.intent = null;
    await this.state.transact((_e, s) => {
      const c = s.get('call', this.call.id);
      if (c?.phase === 'message' && !c.intent?.confirmedAt) s.put('call', { ...c, intent: null, schedule: callbackSchedule(c.schedule || initialSchedule(c.from, this.config.number), SILENCE_QUESTION) });
    });
    this.force(SILENCE_QUESTION, 'result');
  }
  async saveSchedule(schedule) {
    await this.state.transact((_e, s) => {
      const c = s.get('call', this.call.id);
      if (c?.phase === 'message') s.put('call', { ...c, schedule });
    });
  }
  async collectTurn(turn) {
    if (this.heard.has(turn.id)) return;
    this.heard.add(turn.id);
    const current = await this.current();
    if (current?.phase !== 'message') return this.finish();
    const prior = current.schedule || initialSchedule(current.from, this.config.number);
    const applied = applyScheduleTurn(prior, turn.text, current.from, this.config.number, this.now());
    if (applied.invalidate) {
      this.intent = null;
      await this.state.transact((_e, s) => { const c = s.get('call', this.call.id); if (c?.phase === 'message' && !c.intent?.confirmedAt) s.put('call', { ...c, intent: null }); });
    }
    await this.saveSchedule(applied.state);
    if (applied.readback && applied.state.purpose === 'message') return this.readbackMessage(applied.state);
    if (applied.prepare) return this.prepareFromSchedule(applied.state);
    if (applied.search) return this.searchSchedule(applied.state);
    this.force(applied.say, 'result');
  }
  async searchSchedule(state) {
    this.stage = 'tool';
    try {
      const result = await this.schedule(this.config, this.call.id, 'find_appointments', findPayload(state));
      const offered = applyFindResult(state, result);
      await this.saveSchedule(offered.state);
      this.force(offered.say, 'result');
    } catch {
      const offered = applyFindResult(state, { fit: false, saved: false });
      await this.saveSchedule(offered.state);
      this.force(offered.say, 'result');
    }
  }
  async offerCallback(state, say) {
    this.intent = null;
    await this.saveSchedule(callbackSchedule(state, say));
    this.force(say, 'result');
  }
  async readbackMessage(state) {
    this.intent = messageIntent({ name: state.name, callback: state.phone, message: state.messageText });
    const next = { ...state, awaiting: 'confirm', asked: this.intent.readback };
    await this.state.transact((_e, s) => { const c = s.get('call', this.call.id); if (c?.phase === 'message') s.put('call', { ...c, intent: this.intent, schedule: next }); });
    this.force(this.intent.readback, 'readback');
  }
  async prepareFromSchedule(state) {
    const current = await this.current();
    if (current?.bookingAttention || current?.booking?.verified) return this.offerCallback(state, SAVE_FAIL);
    this.stage = 'tool';
    let result;
    try { result = await this.schedule(this.config, this.call.id, 'prepare_appointment', preparePayload(state)); }
    catch { return this.offerCallback(state, PREPARE_FAIL); }
    if (!result?.intent?.id || result.intent.kind !== 'appointment' || !result.intent.readback || result.intent.payload?.phone !== state.phone) return this.offerCallback(state, PREPARE_FAIL);
    this.intent = result.intent;
    const next = { ...state, awaiting: 'confirm', asked: this.intent.readback };
    await this.state.transact((e, s) => {
      const c = s.get('call', this.call.id);
      if (c?.phase !== 'message' || c.booking?.verified || c.bookingIntent?.confirmedAt || c.bookingAttention) throw new Error('Call unavailable');
      s.put('call', { ...c, intent: this.intent, schedule: next });
      e.updateDraft(this.call.id, { name: state.name, callback: state.phone, message: `Consultation requested for ${state.offer.date} at ${state.offer.time} Pacific, ${state.address}. Booking not verified; check calendar before following up.` });
    });
    this.force(this.intent.readback, 'readback');
  }
  async hear(turn) {
    if (this.stage !== 'confirm' || this.heard.has(turn.id)) return;
    this.heard.add(turn.id);
    this.clearSilence();
    const decision = spokenDecision(turn.text);
    const intentId = this.intent?.id;
    if (decision !== 'affirmative') {
      this.intent = null;
      const current = await this.current();
      const schedule = current?.schedule || initialSchedule(current?.from, this.config.number);
      const applied = applyScheduleTurn({ ...schedule, awaiting: 'correction' }, turn.text, current?.from, this.config.number, this.now());
      await this.state.transact((_e, s) => {
        const c = s.get('call', this.call.id);
        if (c?.phase === 'message' && !c.intent?.confirmedAt) s.put('call', { ...c, intent: null, lastCallerTurn: { id: turn.id, decision, at: Date.now() } });
      });
      if (applied.changed) {
        await this.saveSchedule(applied.state);
        if (applied.readback && applied.state.purpose === 'message') return this.readbackMessage(applied.state);
        if (applied.search) return this.searchSchedule(applied.state);
        this.force(applied.say, 'result');
        return;
      }
      await this.saveSchedule({ ...schedule, awaiting: 'correction', asked: CHANGE_QUESTION, offer: null, alternatives: [] });
      this.force(CHANGE_QUESTION, 'result');
      return;
    }
    const intent = await this.state.transact((_e, s) => {
      const c = s.get('call', this.call.id);
      if (c?.phase !== 'message' || c.intent?.id !== intentId || !c.intent.playedAt || c.intent.confirmedAt || Date.now() - c.intent.playedAt > CONFIRM_MS) return null;
      const next = { ...c.intent, confirmedAt: Date.now(), transcript: turn.text, turnId: turn.id };
      s.put('call', { ...c, intent: next, lastCallerTurn: { id: turn.id, decision, at: next.confirmedAt }, ...(next.kind === 'appointment' ? { bookingIntent: next } : {}) });
      return next;
    });
    if (!intent) {
      this.intent = null;
      const current = await this.current();
      await this.saveSchedule({ ...(current?.schedule || {}), awaiting: 'correction', asked: CHANGE_QUESTION, offer: null, alternatives: [] });
      this.force(CHANGE_QUESTION, 'result');
      return;
    }
    this.stage = 'committing';
    try {
      if (intent.kind === 'message') await this.persistMessage(intent);
      else await this.persistAppointment(intent);
    } catch {
      await this.state.transact((_e, s) => {
        const c = s.get('call', this.call.id);
        if (c) s.put('call', { ...c, bookingAttention: 'Confirmation outcome requires verification before another booking.', schedule: callbackSchedule(c.schedule || initialSchedule(c.from, this.config.number), SAVE_FAIL) });
      });
      this.force(SAVE_FAIL, 'result');
    }
    this.intent = null;
  }
  async persistMessage(intent) {
    const message = await this.state.transact(e => e.saveMessage(this.call.id, { ...intent.payload, confirmed: true }, intent.id));
    if (!message?.confirmed) throw Error('Save not verified');
    if (this.saveCrm) {
      const row = await this.saveCrm(message);
      if (!row?.verified || !row.id || row.call_sid !== this.call.sid) throw Error('CRM save not verified');
      await this.state.transact((_e, s) => { const saved = s.get('message', message.id); if (saved) s.put('message', { ...saved, crmId: row.id, crmVerified: true }); });
    }
    const current = await this.current();
    if (current?.phase !== 'message' || current.messageId !== message.id) return;
    const say = 'Your message has been saved for our team to review. Is there anything else I can help with?';
    await this.saveSchedule({ ...(current.schedule || {}), awaiting: 'help', asked: say });
    this.force(say, 'result');
  }
  async persistAppointment(intent) {
    const result = await this.schedule(this.config, this.call.id, 'commit', {});
    const current = await this.current();
    if (current?.phase !== 'message') return;
    if (result?.replan === true) {
      const schedule = { ...(current.schedule || {}), awaiting: 'replan', asked: REPLAN_QUESTION, offer: null, alternatives: [] };
      await this.state.transact((_e, s) => { const c = s.get('call', this.call.id); if (c?.bookingIntent?.id === intent.id && !c.booking?.verified) s.put('call', { ...c, bookingIntent: null, intent: null, schedule }); });
      this.force(REPLAN_QUESTION, 'result');
      return;
    }
    if (!result?.verified) throw Error('Booking not verified');
    const saved = await this.current();
    const schedule = bookedSchedule(saved?.schedule || current.schedule, result.date, result.time);
    await this.saveSchedule(schedule);
    this.force(schedule.asked, 'result');
  }
  async tool(event) {
    try {
      const data = JSON.parse(event.arguments || '{}');
      if (!RECEPTIONIST_TOOLS.some(t => t.name === event.name) || !data || Array.isArray(data) || data.confirmed === true) throw Error('Unsupported action');
      const current = await this.current();
      if (current?.phase !== 'message') return this.finish();
      if (current.bookingAttention || current.booking?.verified) throw Error('Verify the existing booking outcome first.');
      if (event.name === 'prepare_message' && current.messageId) throw Error('A message is already saved for this call.');
      const trusted = callerPhone(current.from, this.config.number);
      const spoken = current.schedule?.phoneSource === 'spoken' && current.schedule.phone ? current.schedule.phone : null;
      const messageData = { ...data, callback: spoken || trusted || data.callback };
      let result;
      if (event.name === 'draft_message') result = await this.state.transact(e => ({ retained: true, confirmed: false, draft: e.updateDraft(this.call.id, messageData) }));
      else if (event.name === 'prepare_message') {
        this.intent = messageIntent(messageData);
        await this.state.transact(e => e.updateDraft(this.call.id, this.intent.payload));
      } else {
        result = await this.schedule(this.config, this.call.id, event.name, data);
        if (event.name === 'prepare_appointment') {
          if (!result.intent?.id || result.intent.kind !== 'appointment' || !result.intent.readback) throw Error('No verified proposal');
          this.intent = result.intent;
          await this.state.transact(e => e.updateDraft(this.call.id, { name: this.intent.payload.name, callback: this.intent.payload.phone, message: `Consultation requested for ${this.intent.payload.date} at ${this.intent.payload.time} Pacific, ${this.intent.payload.address}. Booking not verified; check calendar before following up.` }));
        }
      }
      if (['prepare_message', 'prepare_appointment'].includes(event.name)) {
        await this.state.transact((_e, s) => {
          const c = s.get('call', this.call.id);
          if (c?.phase !== 'message' || (this.intent.kind === 'appointment' && (c.booking?.verified || c.bookingIntent?.confirmedAt || c.bookingAttention))) throw Error('Call unavailable');
          s.put('call', { ...c, intent: this.intent });
        });
        this.output(event.call_id, { prepared: true, saved: false, awaiting: 'spoken yes after the readback plays' });
        this.force(this.intent.readback, 'readback');
        return;
      }
      const fit = result?.fit;
      this.output(event.call_id, fit === false ? { ...result, saved: false, next: 'No open CRM time fits. Take a callback message so staff can see whether they can accommodate.' } : result);
      this.assist();
      this.sendAI({ type: 'response.create' });
    } catch {
      this.output(event.call_id, { saved: false, error: 'Could not verify this request. Collect missing details, try another time, or offer a callback message.' });
      this.assist();
      this.sendAI({ type: 'response.create' });
    }
  }
  async fail(reason) {
    if (this.closed) return;
    try {
      if (this.streamSid) {
        await this.state.transact((e, s) => {
          const c = s.get('call', this.call.id);
          if (c?.phase === 'message') {
            e.failed(c.id, reason, `media-error:${this.streamSid}`);
            const next = s.get('call', this.call.id);
            if (next) s.put('call', { ...next, mediaFailed: true, intent: next.intent?.confirmedAt ? next.intent : null });
          }
        });
        await this.worker.drain();
      }
    } catch { /* Signed continuation and the watchdog recover the caller. */ } finally { this.finish(); }
  }
  finish() {
    if (this.closed) return;
    this.closed = true;
    this.clock.clearTimeout(this.startTimer);
    this.clock.clearTimeout(this.limitTimer);
    this.clearSilence();
    this.releasePlayback();
    this.marks.clear();
    if (this.ai) { this.ai.onclose = null; this.ai.onerror = null; this.ai.close(); }
    this.socket.onclose = null;
    if (this.socket.readyState < 2) this.socket.close();
    this.resolveDone();
  }
}
