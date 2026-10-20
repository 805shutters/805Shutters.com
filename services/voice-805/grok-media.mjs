import { randomUUID } from 'node:crypto';
import { reportFailure } from './security.mjs';
import { COMMON_GREETING } from './caller-context.mjs';
import { RECEPTIONIST_OPENING, RECEPTIONIST_PROMPT, RECEPTIONIST_TOOLS, schedulingRequest, messageIntent, spokenDecision } from './receptionist.mjs';
import { VOICE_ID } from './prompts.mjs';
import { applyFindResult, applyScheduleTurn, bookedSchedule, callbackSchedule, callerPhone, findPayload, initialSchedule, preparePayload } from './schedule-intake.mjs';
import { intakeActive, retainRingingIntake } from './engine.mjs';

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
// A state commit that has already been sent must not pin the media queue.
export const STATE_BOUND_MS = 8000;
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
    this.callerChose = false;
    this.forceRetries = 0;
    this.promptTimer = null;
    this.playbackToken = 0;
    this.pcmBytes = 0;
    this.trace = [];
    this.promptTranscripts = new Map();
    this.chain = Promise.resolve();
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
    this.startTimer = clock.setTimeout(() => this.recoverNow('Voice connection timed out'), 10000);
    this.limitTimer = clock.setTimeout(() => this.recoverNow('Voice session duration reached'), MEDIA_SESSION_MS);
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
  async current() {
    if (typeof this.state.readCall !== 'function') return this.commitBounded((_e, s) => s.get('call', this.call.id));
    const loaded = await this.boundRead(() => this.state.readCall(this.call.id));
    if (this.closed || !loaded) return null;
    if (loaded.value) return loaded.value;
    return loaded.timeout ? this.call : null;
  }
  async startupCall() {
    if (typeof this.state.readCall !== 'function') return this.commitBounded((_e, s) => s.get('call', this.call.id));
    const loaded = await this.boundRead(() => this.state.readCall(this.call.id));
    if (this.closed) return null;
    if (loaded?.value) return loaded.value;
    return this.call;
  }
  async boundRead(task) {
    if (this.closed) return null;
    let timer;
    const op = Promise.resolve().then(task).then(value => ({ value }), error => ({ error }));
    const timeout = new Promise(resolve => { timer = this.clock.setTimeout(() => resolve({ timeout: true }), STATE_BOUND_MS); });
    const result = await Promise.race([op, timeout]);
    this.clock.clearTimeout(timer);
    if (this.closed) return null;
    return result;
  }
  async carrier(event) {
    if (event.event === 'connected') return;
    if (event.event === 'start') {
      const s = event.start;
      if (this.streamSid || s?.accountSid !== this.config.accountSid || s?.callSid !== this.call.sid || !/^MZ[0-9a-f]{32}$/i.test(s?.streamSid || '') || s?.mediaFormat?.encoding !== 'audio/x-mulaw' || s.mediaFormat.sampleRate !== 8000 || s.mediaFormat.channels !== 1) return this.finish();
      const claimed = await this.commitBounded((_e, store) => {
        const c = store.get('call', this.call.id);
        if (!c || !['message', 'offering'].includes(c.phase) || c.mediaStreamSid || c.mediaFailed) return false;
        store.put('call', { ...c, mediaStreamSid: s.streamSid });
        return true;
      }, false);
      if (this.closed) return this.finish();
      let accepted = claimed === true;
      // The CAS response can outlive the bound after Postgres has stored the stream id.
      if (!accepted && claimed?.timeout && typeof this.state.readCall === 'function') {
        const fresh = await this.state.readCall(this.call.id).catch(() => null);
        accepted = fresh?.mediaStreamSid === s.streamSid;
      }
      if (!accepted) return claimed?.timeout ? this.recoverNow('Voice stream was not claimed') : this.finish();
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
      await this.commitBounded((e, s) => {
        const c = s.get('call', this.call.id);
        if (c?.phase === 'message' || (c?.phase === 'offering' && !c.owner)) e.ended(c.id, c.sid, `media-stop:${this.streamSid}`);
      });
      if (!this.closed) await this.worker?.drain?.();
      return this.finish();
    }
    if (event.event === 'media' && (this.listening || ['assist', 'collect', 'confirm', 'welcome', 'welcome-playback'].includes(this.stage)) && validAudio(event.media?.payload)) this.sendAI({ type: 'input_audio_buffer.append', audio: event.media.payload });
    if (event.event === 'mark') {
      const next = this.marks.get(event.mark?.name);
      if (!next) return;
      this.marks.delete(event.mark.name);
      await next();
    }
  }
  force(text, stage, options = {}) {
    if (this.closed) return;
    this.listening = Boolean(options.listen);
    this.interruptible = Boolean(options.interruptible);
    this.stage = stage;
    this.audioBytes = 0;
    this.pcmBytes = 0;
    if (this.prompt?.responseId) this.stray.add(this.prompt.responseId);
    for (const id of this.pending) this.stray.add(id);
    if (this.openResponseId) this.stray.add(this.openResponseId);
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
    this.sendAI({ type: 'session.update', session: this.voiceSession({ turn_detection: this.listening ? { type: 'server_vad' } : { type: null }, tools: [] }) });
    this.speakLine();
  }
  speakLine() {
    if (this.closed || !this.prompt?.text) return;
    this.note('force');
    this.logCheckpoint('speaking');
    this.armPromptDeadline();
    this.sendAI({ type: 'conversation.item.create', item: { type: 'force_message', role: 'assistant', interruptible: this.interruptible === true, content: [{ type: 'output_text', text: this.prompt.text }] } });
  }
  armPromptDeadline() {
    this.clearPromptTimer();
    this.promptTimer = this.clock.setTimeout(() => this.promptExpired(), FORCE_DEADLINE_MS);
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
    this.promptTimer = this.clock.setTimeout(() => this.playbackExpired(token), wait);
  }
  playbackExpired(token) {
    if (this.closed || token !== this.playbackToken || !String(this.stage).endsWith('-playback')) return;
    this.note('playback-timeout');
    return this.recoverNow('Playback mark did not arrive');
  }
  promptExpired() {
    if (this.closed || !this.prompt || String(this.stage).endsWith('-playback')) return;
    this.note('timeout');
    return this.recoverNow('Scripted line did not complete');
  }
  note(event, extra = {}) {
    this.trace.push({ stage: this.stage, event, pending: this.pending.length, cancel: this.cancelSent, audio: this.audioBytes > 0, retries: this.forceRetries, ...extra });
    if (this.trace.length > 12) this.trace.shift();
  }
  logLifecycle(message) {
    console.error(JSON.stringify({ event: 'voice-805-lifecycle', call: this.call.id, message, stage: this.stage, pending: this.pending.length, cancel: this.cancelSent, audio: this.audioBytes > 0, retries: this.forceRetries, trace: this.trace }));
  }
  logCheckpoint(step, awaiting) {
    const body = { event: 'voice-805-checkpoint', call: this.call.id, step, stage: this.stage };
    if (typeof awaiting === 'string' && awaiting) body.awaiting = awaiting;
    console.error(JSON.stringify(body));
  }
  // Deadlines run here, not on the serial queue. A state save can stay unresolved
  // after it has committed, and that wait must not block fallback.
  recoverNow(reason) {
    if (this.closed) return Promise.resolve();
    this.note('recover');
    this.logCheckpoint('recover');
    this.logLifecycle(reason);
    const persist = this.persistFailure(reason).then(() => this.worker?.drain?.()).catch(() => {});
    this.finish();
    return persist;
  }
  persistFailure(reason) {
    if (!this.streamSid) return Promise.resolve();
    return this.state.transact((e, s) => {
      const c = s.get('call', this.call.id);
      if (!c || c.phase === 'ended') return;
      if (c.phase === 'message' || c.phase === 'offering') {
        e.failed(c.id, reason, `media-recover:${this.streamSid}`);
        const next = s.get('call', this.call.id);
        if (next) s.put('call', { ...next, mediaFailed: true, intent: next.intent?.confirmedAt ? next.intent : null });
      }
    }).catch(() => {});
  }
  async commitBounded(fn, fatal = true) {
    if (this.closed) return null;
    let timer;
    const op = Promise.resolve(this.state.transact(fn)).then(value => ({ value }), error => ({ error }));
    const timeout = new Promise(resolve => { timer = this.clock.setTimeout(() => resolve({ timeout: true }), STATE_BOUND_MS); });
    const result = await Promise.race([op, timeout]);
    this.clock.clearTimeout(timer);
    if (this.closed) return null;
    if (result.timeout) {
      if (fatal) this.recoverNow('State save timed out');
      return fatal ? null : { timeout: true };
    }
    if (result.error) throw result.error;
    return result.value;
  }
  noteChoice() {
    this.callerChose = true;
    if (this.offerTimer) { this.clock.clearTimeout(this.offerTimer); this.offerTimer = null; }
  }
  async liveIntake() {
    const call = await this.current();
    if (this.closed || !intakeActive(call)) return null;
    return call;
  }
  // Commit phase "message" before a CRM call. The live scheduling route reads that phase.
  async commitIntake() {
    const call = await this.commitBounded((_e, s) => {
      const c = s.get('call', this.call.id);
      if (!c) return null;
      if (retainRingingIntake(c)) s.put('call', c);
      return intakeActive(c) ? c : null;
    });
    if (this.closed || !call) return null;
    return call;
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
    this.marks.set(name, async () => { this.releasePlayback(); this.note('mark'); this.logCheckpoint('played'); await next(); });
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
    if (!['opening', 'readback', 'result', 'welcome'].includes(this.stage)) return;
    if (!this.audioBytes) return this.fail('Required audio missing');
    const stage = this.stage;
    this.stage = stage + '-playback';
    this.armPlaybackDeadline();
    this.mark(async () => {
      if (this.closed) return;
      if (stage === 'welcome') return this.afterWelcome();
      if (stage === 'readback') {
        const armed = await this.commitBounded((_e, s) => {
          const c = s.get('call', this.call.id);
          if (!intakeActive(c) || c.intent?.id !== this.intent?.id || c.intent.confirmedAt) return false;
          s.put('call', { ...c, intent: { ...c.intent, playedAt: Date.now() } });
          return true;
        });
        if (this.closed) return;
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
    if (event.type === 'session.updated' && this.stage === 'starting') {
      this.clock.clearTimeout(this.startTimer);
      const call = await this.startupCall();
      if (this.closed || !call) return;
      if (call.phase === 'offering' && !call.owner) this.force(COMMON_GREETING, 'welcome', { listen: true, interruptible: true });
      else this.force(RECEPTIONIST_OPENING, 'opening');
      return;
    }
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
    if (turn && (this.stage === 'confirm' || this.stage === 'collect' || this.stage === 'welcome' || this.stage === 'welcome-playback')) this.noteChoice();
    if (turn && this.stage === 'confirm') return this.hear(turn);
    if (turn && (this.stage === 'welcome' || this.stage === 'welcome-playback')) {
      this.vadTurn = true;
      this.sendCarrier({ event: 'clear' });
      return this.collectTurn(turn);
    }
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
        if (['opening', 'readback', 'result', 'assist', 'welcome', 'welcome-playback'].includes(this.stage) && validAudio(event.delta)) this.playDelta(event.delta);
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
        this.noteChoice();
        this.marks.clear();
        this.sendCarrier({ event: 'clear' });
        this.intent = null;
        const saved = await this.commitBounded((_e, s) => {
          const c = s.get('call', this.call.id);
          if (!intakeActive(c)) return false;
          s.put('call', { ...c, intent: null, schedule: { ...(c.schedule || {}), awaiting: 'correction', asked: CHANGE_QUESTION } });
          return true;
        });
        if (this.closed || saved !== true || !(await this.liveIntake())) return;
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
    if (this.stage !== 'confirm' || this.closed) return;
    this.intent = null;
    const saved = await this.commitBounded((_e, s) => {
      const c = s.get('call', this.call.id);
      if (!intakeActive(c) || c.intent?.confirmedAt) return false;
      s.put('call', { ...c, intent: null, schedule: callbackSchedule(c.schedule || initialSchedule(c.from, this.config.number), SILENCE_QUESTION) });
      return true;
    });
    if (this.closed || saved !== true || !(await this.liveIntake())) return;
    this.force(SILENCE_QUESTION, 'result');
  }
  async saveSchedule(schedule) {
    if (this.closed) return false;
    const saved = await this.commitBounded((_e, s) => {
      const c = s.get('call', this.call.id);
      if (!intakeActive(c)) return false;
      s.put('call', { ...c, schedule });
      return true;
    });
    return saved === true && !this.closed;
  }
  async collectTurn(turn) {
    if (this.heard.has(turn.id) || this.closed) return;
    this.heard.add(turn.id);
    this.noteChoice();
    const applied = await this.commitBounded((_e, s) => {
      const c = s.get('call', this.call.id);
      retainRingingIntake(c);
      if (!intakeActive(c)) return null;
      const prior = c.schedule || initialSchedule(c.from, this.config.number);
      const next = applyScheduleTurn(prior, turn.text, c.from, this.config.number, this.now());
      const saved = { ...c, schedule: next.state };
      if (next.invalidate && !c.intent?.confirmedAt) saved.intent = null;
      s.put('call', saved);
      return next;
    });
    if (this.closed || !applied || !(await this.liveIntake())) return;
    if (applied.invalidate) this.intent = null;
    this.logCheckpoint('saved', applied.state?.awaiting);
    if (applied.readback && applied.state.purpose === 'message') return this.readbackMessage(applied.state);
    if (applied.prepare) return this.prepareFromSchedule(applied.state);
    if (applied.search) return this.searchSchedule(applied.state);
    this.force(applied.say, 'result');
  }
  async afterWelcome() {
    if (this.closed || this.callerChose) return;
    const call = await this.current();
    if (this.closed || this.callerChose || !call) return;
    if (call.owner || !['offering', 'message'].includes(call.phase)) return this.finish();
    const unanswered = call.phase === 'message' || (typeof call.deadline === 'number' && call.deadline <= Date.now());
    if (unanswered) return this.force(RECEPTIONIST_OPENING, 'opening');
    this.collect();
    if (this.closed || this.callerChose) return;
    const wait = Math.max(0, call.deadline - Date.now());
    this.offerTimer = this.clock.setTimeout(() => this.offerWatch(), wait);
  }
  async offerWatch() {
    if (this.closed || this.callerChose || this.stage !== 'collect') return;
    const call = await this.current();
    if (this.closed || this.callerChose || this.stage !== 'collect' || !call || call.owner || !['offering', 'message'].includes(call.phase)) return;
    if (call.phase === 'offering' && call.deadline > Date.now()) return;
    if (this.closed || this.callerChose || this.stage !== 'collect') return;
    this.force(RECEPTIONIST_OPENING, 'opening');
  }
  async searchSchedule(state) {
    if (this.closed || !(await this.commitIntake())) return;
    this.stage = 'tool';
    let result;
    try { result = await this.schedule(this.config, this.call.id, 'find_appointments', findPayload(state)); }
    catch { result = { fit: false, saved: false }; }
    if (this.closed) return;
    const offered = applyFindResult(state, result || { fit: false, saved: false });
    if (!(await this.saveSchedule(offered.state)) || !(await this.liveIntake())) return;
    this.force(offered.say, 'result');
  }
  async offerCallback(state, say) {
    if (this.closed) return;
    this.intent = null;
    if (!(await this.saveSchedule(callbackSchedule(state, say))) || !(await this.liveIntake())) return;
    this.force(say, 'result');
  }
  async readbackMessage(state) {
    if (this.closed || !(await this.commitIntake())) return;
    this.intent = messageIntent({ name: state.name, callback: state.phone, message: state.messageText });
    const next = { ...state, awaiting: 'confirm', asked: this.intent.readback };
    const saved = await this.commitBounded((_e, s) => {
      const c = s.get('call', this.call.id);
      if (!intakeActive(c)) return false;
      s.put('call', { ...c, intent: this.intent, schedule: next });
      return true;
    });
    if (this.closed || saved !== true || !(await this.liveIntake())) return;
    this.force(this.intent.readback, 'readback');
  }
  async prepareFromSchedule(state) {
    const current = await this.commitIntake();
    if (!current) return;
    if (current.bookingAttention || current.booking?.verified) return this.offerCallback(state, SAVE_FAIL);
    this.stage = 'tool';
    let result;
    try { result = await this.schedule(this.config, this.call.id, 'prepare_appointment', preparePayload(state)); }
    catch { return this.offerCallback(state, PREPARE_FAIL); }
    if (this.closed) return;
    if (!result?.intent?.id || result.intent.kind !== 'appointment' || !result.intent.readback || result.intent.payload?.phone !== state.phone) return this.offerCallback(state, PREPARE_FAIL);
    if (!(await this.liveIntake())) return;
    this.intent = result.intent;
    const next = { ...state, awaiting: 'confirm', asked: this.intent.readback };
    const saved = await this.commitBounded((e, s) => {
      const c = s.get('call', this.call.id);
      if (!intakeActive(c) || c.booking?.verified || c.bookingIntent?.confirmedAt || c.bookingAttention) return false;
      s.put('call', { ...c, intent: this.intent, schedule: next });
      e.updateDraft(this.call.id, { name: state.name, callback: state.phone, message: `Consultation requested for ${state.offer.date} at ${state.offer.time} Pacific, ${state.address}. Booking not verified; check calendar before following up.` });
      return true;
    });
    if (this.closed || saved !== true || !(await this.liveIntake())) return;
    this.force(this.intent.readback, 'readback');
  }
  async hear(turn) {
    if (this.stage !== 'confirm' || this.heard.has(turn.id) || this.closed) return;
    this.heard.add(turn.id);
    this.noteChoice();
    this.clearSilence();
    const decision = spokenDecision(turn.text);
    const intentId = this.intent?.id;
    if (!(await this.liveIntake())) return;
    if (decision !== 'affirmative') {
      this.intent = null;
      const current = await this.current();
      if (this.closed || !intakeActive(current)) return;
      const schedule = current?.schedule || initialSchedule(current?.from, this.config.number);
      const applied = applyScheduleTurn({ ...schedule, awaiting: 'correction' }, turn.text, current?.from, this.config.number, this.now());
      const cleared = await this.commitBounded((_e, s) => {
        const c = s.get('call', this.call.id);
        if (!intakeActive(c) || c.intent?.confirmedAt) return false;
        s.put('call', { ...c, intent: null, lastCallerTurn: { id: turn.id, decision, at: Date.now() } });
        return true;
      });
      if (this.closed || cleared !== true || !(await this.liveIntake())) return;
      if (applied.changed) {
        if (!(await this.saveSchedule(applied.state)) || !(await this.liveIntake())) return;
        if (applied.readback && applied.state.purpose === 'message') return this.readbackMessage(applied.state);
        if (applied.search) return this.searchSchedule(applied.state);
        this.force(applied.say, 'result');
        return;
      }
      if (!(await this.saveSchedule({ ...schedule, awaiting: 'correction', asked: CHANGE_QUESTION, offer: null, alternatives: [] })) || !(await this.liveIntake())) return;
      this.force(CHANGE_QUESTION, 'result');
      return;
    }
    const intent = await this.commitBounded((_e, s) => {
      const c = s.get('call', this.call.id);
      if (!intakeActive(c)) return { blocked: true };
      if (c.intent?.id !== intentId || !c.intent.playedAt || c.intent.confirmedAt || Date.now() - c.intent.playedAt > CONFIRM_MS) return { blocked: false };
      const next = { ...c.intent, confirmedAt: Date.now(), transcript: turn.text, turnId: turn.id };
      s.put('call', { ...c, intent: next, lastCallerTurn: { id: turn.id, decision, at: next.confirmedAt }, ...(next.kind === 'appointment' ? { bookingIntent: next } : {}) });
      return { blocked: false, intent: next };
    });
    if (this.closed || !intent || intent.blocked) return;
    if (!intent.intent) {
      this.intent = null;
      const current = await this.liveIntake();
      if (!current) return;
      if (!(await this.saveSchedule({ ...(current.schedule || {}), awaiting: 'correction', asked: CHANGE_QUESTION, offer: null, alternatives: [] }))) return;
      if (!(await this.liveIntake())) return;
      this.force(CHANGE_QUESTION, 'result');
      return;
    }
    if (!(await this.liveIntake())) return;
    this.stage = 'committing';
    try {
      if (intent.intent.kind === 'message') await this.persistMessage(intent.intent);
      else await this.persistAppointment(intent.intent);
    } catch {
      if (this.closed) return;
      const noted = await this.commitBounded((_e, s) => {
        const c = s.get('call', this.call.id);
        if (!intakeActive(c)) return false;
        s.put('call', { ...c, bookingAttention: 'Confirmation outcome requires verification before another booking.', schedule: callbackSchedule(c.schedule || initialSchedule(c.from, this.config.number), SAVE_FAIL) });
        return true;
      });
      if (this.closed || noted !== true || !(await this.liveIntake())) return;
      this.force(SAVE_FAIL, 'result');
    }
    this.intent = null;
  }
  async persistMessage(intent) {
    if (this.closed || !(await this.commitIntake())) return;
    const message = await this.commitBounded(e => e.saveMessage(this.call.id, { ...intent.payload, confirmed: true }, intent.id));
    if (this.closed || !message?.confirmed) throw Error('Save not verified');
    if (this.saveCrm) {
      const row = await this.saveCrm(message);
      if (this.closed) return;
      if (!row?.verified || !row.id || row.call_sid !== this.call.sid) throw Error('CRM save not verified');
      await this.commitBounded((_e, s) => { const saved = s.get('message', message.id); if (saved) s.put('message', { ...saved, crmId: row.id, crmVerified: true }); });
    }
    const current = await this.liveIntake();
    if (!current || current.messageId !== message.id) return;
    const say = 'Your message has been saved for our team to review. Is there anything else I can help with?';
    if (!(await this.saveSchedule({ ...(current.schedule || {}), awaiting: 'help', asked: say })) || !(await this.liveIntake())) return;
    this.force(say, 'result');
  }
  async persistAppointment(intent) {
    if (this.closed || !(await this.commitIntake())) return;
    const result = await this.schedule(this.config, this.call.id, 'commit', {});
    if (this.closed) return;
    const current = await this.liveIntake();
    if (!current) return;
    if (result?.replan === true) {
      const schedule = { ...(current.schedule || {}), awaiting: 'replan', asked: REPLAN_QUESTION, offer: null, alternatives: [] };
      const saved = await this.commitBounded((_e, s) => {
        const c = s.get('call', this.call.id);
        if (!intakeActive(c) || c.bookingIntent?.id !== intent.id || c.booking?.verified) return false;
        s.put('call', { ...c, bookingIntent: null, intent: null, schedule });
        return true;
      });
      if (this.closed || saved !== true || !(await this.liveIntake())) return;
      this.force(REPLAN_QUESTION, 'result');
      return;
    }
    if (!result?.verified) throw Error('Booking not verified');
    const saved = await this.liveIntake();
    if (!saved) return;
    const schedule = bookedSchedule(saved.schedule || current.schedule, result.date, result.time);
    if (!(await this.saveSchedule(schedule)) || !(await this.liveIntake())) return;
    this.force(schedule.asked, 'result');
  }
  async tool(event) {
    try {
      const data = JSON.parse(event.arguments || '{}');
      if (!RECEPTIONIST_TOOLS.some(t => t.name === event.name) || !data || Array.isArray(data) || data.confirmed === true) throw Error('Unsupported action');
      const current = await this.commitIntake();
      if (!current) return this.finish();
      if (current.bookingAttention || current.booking?.verified) throw Error('Verify the existing booking outcome first.');
      if (event.name === 'prepare_message' && current.messageId) throw Error('A message is already saved for this call.');
      const trusted = callerPhone(current.from, this.config.number);
      const spoken = current.schedule?.phoneSource === 'spoken' && current.schedule.phone ? current.schedule.phone : null;
      const messageData = { ...data, callback: spoken || trusted || data.callback };
      let result;
      if (event.name === 'draft_message') result = await this.commitBounded(e => ({ retained: true, confirmed: false, draft: e.updateDraft(this.call.id, messageData) }));
      else if (event.name === 'prepare_message') {
        if (!(await this.liveIntake())) return;
        this.intent = messageIntent(messageData);
        await this.commitBounded(e => e.updateDraft(this.call.id, this.intent.payload));
      } else {
        if (!(await this.liveIntake())) return;
        result = await this.schedule(this.config, this.call.id, event.name, data);
        if (this.closed) return;
        if (event.name === 'prepare_appointment') {
          if (!result.intent?.id || result.intent.kind !== 'appointment' || !result.intent.readback) throw Error('No verified proposal');
          if (!(await this.liveIntake())) return;
          this.intent = result.intent;
          await this.commitBounded(e => e.updateDraft(this.call.id, { name: this.intent.payload.name, callback: this.intent.payload.phone, message: `Consultation requested for ${this.intent.payload.date} at ${this.intent.payload.time} Pacific, ${this.intent.payload.address}. Booking not verified; check calendar before following up.` }));
        }
      }
      if (this.closed) return;
      if (['prepare_message', 'prepare_appointment'].includes(event.name)) {
        const saved = await this.commitBounded((_e, s) => {
          const c = s.get('call', this.call.id);
          if (!intakeActive(c) || (this.intent.kind === 'appointment' && (c.booking?.verified || c.bookingIntent?.confirmedAt || c.bookingAttention))) return false;
          s.put('call', { ...c, intent: this.intent });
          return true;
        });
        if (this.closed || saved !== true || !(await this.liveIntake())) return;
        this.output(event.call_id, { prepared: true, saved: false, awaiting: 'spoken yes after the readback plays' });
        this.force(this.intent.readback, 'readback');
        return;
      }
      if (this.closed) return;
      const fit = result?.fit;
      this.output(event.call_id, fit === false ? { ...result, saved: false, next: 'No open CRM time fits. Take a callback message so staff can see whether they can accommodate.' } : result);
      this.assist();
      this.sendAI({ type: 'response.create' });
    } catch {
      if (this.closed) return;
      this.output(event.call_id, { saved: false, error: 'Could not verify this request. Collect missing details, try another time, or offer a callback message.' });
      this.assist();
      this.sendAI({ type: 'response.create' });
    }
  }
  fail(reason) {
    return this.recoverNow(reason);
  }
  finish() {
    if (this.closed) return;
    this.closed = true;
    this.clock.clearTimeout(this.startTimer);
    this.clock.clearTimeout(this.limitTimer);
    if (this.offerTimer) this.clock.clearTimeout(this.offerTimer);
    this.clearSilence();
    this.releasePlayback();
    this.marks.clear();
    if (this.ai) { this.ai.onclose = null; this.ai.onerror = null; this.ai.close(); }
    this.socket.onclose = null;
    if (this.socket.readyState < 2) this.socket.close();
    this.resolveDone();
  }
}
