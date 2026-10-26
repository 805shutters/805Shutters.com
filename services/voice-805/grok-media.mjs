import { randomUUID } from 'node:crypto';
import { reportFailure } from './security.mjs';
import { COMMON_GREETING } from './caller-context.mjs';
import { RECEPTIONIST_OPENING, RECEPTIONIST_PROMPT, messageIntent, spokenDecision } from './receptionist.mjs';
import { VOICE_ID } from './prompts.mjs';
import { applyMessageTurn, appendCallerTranscript, initialMessage, messageSilence, mergeCallerCaptions, MESSAGE_SAVED } from './message-intake.mjs';
import { intakeActive, retainRingingIntake } from './engine.mjs';

const validAudio = value => typeof value === 'string' && value.length > 0 && value.length <= 256000 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
const CONFIRM_MS = 60000;
const SILENCE_MS = 12000;
export const TURN_SETTLE_MS = 1600;
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
const QUESTION_STAGES = new Set(['opening', 'opening-playback', 'result', 'result-playback']);
const READBACK_STAGES = new Set(['readback', 'readback-playback']);
const FORWARDED_STAGES = new Set(['assist', 'collect', 'confirm', 'welcome', 'welcome-playback', 'opening', 'opening-playback', 'result', 'result-playback', 'readback', 'readback-playback']);
const SAVE_FAIL = 'I could not verify the message save. Please call back so our team can help. Goodbye.';
// The force_message response has no client correlation metadata. Its completed
// output transcript is the ownership proof; arrival order is not proof.
export const spokenLineKey = text => String(text || '').normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const MAX_SCRIPT_AUDIO_BYTES = 1200000;

// The carrier socket is authenticated before construction. The model can propose.
// A spoken yes counts only after the exact readback has played on this call.
export class GrokMediaSession {
  constructor({ socket, call, state, worker, connect, clock = globalThis, saveCrm = null, saveSummary = null }) {
    Object.assign(this, { socket, call, state, worker, connect, clock, saveCrm, saveSummary });
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
    this.beforeReadback = new Set();
    this.forceRetries = 0;
    this.promptTimer = null;
    this.playbackToken = 0;
    this.pcmBytes = 0;
    this.trace = [];
    this.promptTranscripts = new Map();
    this.promptSequence = 0;
    this.bufferBytes = new Map();
    this.inputSpeaking = false;
    this.pendingCallerEvents = new Map();
    this.vadItems = new Set();
    this.inputFinalTimer = null;
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
    if (typeof this.state.readCall !== 'function') {
      const call = await this.commitBounded((_e, s) => s.get('call', this.call.id));
      if (this.closed) return null;
      if (!call) this.finish();
      return call || null;
    }
    const loaded = await this.boundRead(() => this.state.readCall(this.call.id));
    if (this.closed) return null;
    // Close before returning. Waiting here would leave the caller silent until the media limit.
    // Persistence is not awaited: finish() has already run, and a handoff is not rewritten.
    if (!loaded || loaded.timeout || loaded.error) {
      this.recoverNow('Call read failed');
      return null;
    }
    // A row that is already gone must close. The call captured at construction can be stale.
    if (!loaded.value) {
      this.finish();
      return null;
    }
    return loaded.value;
  }
  async startupCall() {
    if (typeof this.state.readCall !== 'function') return this.commitBounded((_e, s) => s.get('call', this.call.id));
    const loaded = await this.boundRead(() => this.state.readCall(this.call.id));
    if (this.closed) return null;
    if (loaded?.value) return loaded.value;
    // Only a timeout may use the call that was eligible when the socket attached.
    if (loaded?.timeout) return this.call;
    // A rejected read is not a timeout. session.updated has already cleared the start timer.
    if (loaded?.error) {
      this.recoverNow('Startup call read failed');
      return null;
    }
    if (loaded) this.finish();
    return null;
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
      // The start timer can close the session while that confirmation is still waiting.
      if (!accepted && claimed?.timeout && typeof this.state.readCall === 'function') {
        const fresh = await this.boundRead(() => this.state.readCall(this.call.id));
        if (this.closed) return;
        accepted = fresh?.value?.mediaStreamSid === s.streamSid;
      }
      if (this.closed) return;
      if (!accepted) return claimed?.timeout ? this.recoverNow('Voice stream was not claimed') : this.finish();
      if (this.closed) return;
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
      await this.flushCallerTurn();
      await this.commitBounded((e, s) => {
        const c = s.get('call', this.call.id);
        if (c?.phase === 'message' || (c?.phase === 'offering' && !c.owner)) e.ended(c.id, c.sid, `media-stop:${this.streamSid}`);
      });
      await this.writeSummary();
      if (!this.closed) await this.worker?.drain?.();
      return this.finish();
    }
    if (event.event === 'media' && validAudio(event.media?.payload) && (this.listening || FORWARDED_STAGES.has(this.stage))) this.sendAI({ type: 'input_audio_buffer.append', audio: event.media.payload });
    if (event.event === 'mark') {
      const next = this.marks.get(event.mark?.name);
      if (!next) return;
      this.marks.delete(event.mark.name);
      await next();
    }
  }
  force(text, stage, options = {}) {
    if (this.closed) return;
    this.listening = Boolean(options.listen) || ['opening', 'result', 'readback', 'welcome'].includes(stage);
    this.interruptible = Boolean(options.interruptible);
    this.stage = stage;
    this.audioBytes = 0;
    this.pcmBytes = 0;
    if (this.prompt?.responseId) this.stray.add(this.prompt.responseId);
    for (const id of this.pending) this.stray.add(id);
    if (this.openResponseId) this.stray.add(this.openResponseId);
    this.prompt = { text, responseId: null, sequence: ++this.promptSequence };
    this.pending = [];
    this.buffers = new Map();
    this.settled = new Map();
    this.promptTranscripts = new Map();
    this.bufferBytes = new Map();
    this.cancelSent = false;
    this.forceRetries = 0;
    this.clearSilence();
    this.releasePlayback();
    this.marks.clear();
    // Cancel only a known old response. An unscoped cancel can race the new
    // force_message. All unverified model output is buffered/discarded below.
    if (this.openResponseId && !this.responses.has(this.openResponseId)) {
      this.stray.add(this.openResponseId);
      this.cancel(this.openResponseId);
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
  logOutput(step, id, extra = {}) {
    console.error(JSON.stringify({ event: 'voice-805-output', call: this.call.id, step,
      stage: this.stage, sequence: this.prompt?.sequence || null, response: id || null, ...extra }));
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
    const pending = [...this.pendingCallerEvents.values()];
    if (!this.streamSid) return Promise.resolve();
    return this.state.transact((e, s) => {
      const c = s.get('call', this.call.id);
      if (!c || c.phase === 'ended') return;
      if (c.phase === 'message' || c.phase === 'offering') {
        if (intakeActive(c) && pending.length) {
          const turn = { id: String(pending[0].item_id), text: mergeCallerCaptions(pending) };
          const result = applyMessageTurn(c.schedule || initialMessage(c.from, this.config.number), turn.text, c.from, this.config.number);
          s.put('call', { ...c, schedule: result.state, callerTranscript: appendCallerTranscript(c, turn) });
          if (result.state.messageText) e.updateDraft(c.id, { name: result.state.name, callback: result.state.phone, message: result.state.messageText });
        }
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
  // Commit phase "message" before a CRM call. The callback writer reads that phase.
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
  mark(next) {
    const name = randomUUID();
    this.marks.set(name, async () => { this.releasePlayback(); this.note('mark'); this.logCheckpoint('played'); this.logOutput('played', this.prompt?.responseId, { bytes: this.pcmBytes }); await next(); });
    this.sendCarrier({ event: 'mark', mark: { name } });
  }
  assist() { this.assistMessages(); }
  collect() {
    this.stage = 'collect';
    this.prompt = null;
    this.pending = [];
    this.vadTurn = false;
    this.clearSilence();
    this.silenceTimer = this.clock.setTimeout(() => this.enqueue(() => this.silence()), SILENCE_MS);
    this.sendAI({ type: 'session.update', session: this.voiceSession({ instructions: 'The application supplies each spoken reply using force_message. Wait for that supplied reply. Do not generate additional answers or tools.', turn_detection: { type: 'server_vad' }, tools: [] }) });
  }
  assistMessages() { this.collect(); }
  output(id, result) { this.sendAI({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: id, output: JSON.stringify(result) } }); }
  clearSilence() { if (this.silenceTimer) { this.clock.clearTimeout(this.silenceTimer); this.silenceTimer = null; } }
  stopOverlap() {
    this.marks.clear();
    this.releasePlayback();
    this.sendCarrier({ event: 'clear' });
    if (this.prompt?.responseId) this.stray.add(this.prompt.responseId);
    this.prompt = null;
    this.pending = [];
  }
  async writeSummary() {
    if (!this.saveSummary) return;
    try { await this.saveSummary(); } catch (error) { reportFailure('call-summary', error); }
  }
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
  // Release no audio until the completed response says exactly the server's
  // prepared line. Automatic VAD responses can arrive before or after the force
  // response and can complete even after cancellation.
  acceptResponse(id) {
    if (!this.prompt || !id || this.stray.has(id) || this.prompt.responseId || !this.pending.includes(id)) return;
    if (this.settled.get(id) !== 'completed' || !this.promptTranscripts.has(id)) return;
    const matches = spokenLineKey(this.promptTranscripts.get(id)) === spokenLineKey(this.prompt.text);
    this.logOutput(matches ? 'verified' : 'rejected', id, { matches, bytes: this.bufferBytes.get(id) || 0 });
    if (!matches) {
      this.stray.add(id); this.buffers.delete(id); this.bufferBytes.delete(id); this.promptTranscripts.delete(id);
      this.pending = this.pending.filter(value => value !== id);
      return;
    }
    this.prompt.responseId = id;
    this.cancelSent = false;
    for (const other of this.pending) if (other !== id) this.stray.add(other);
    this.pending = [id];
    for (const delta of this.buffers.get(id) || []) this.playDelta(delta);
    this.buffers.delete(id);
    this.logOutput('sent', id, { bytes: this.pcmBytes });
    this.advancePrompt();
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
      } else if (this.endAfterPlayback) await this.endConversation(); else this.collect();
    });
  }
  noteCancelled(id) {
    this.stray.add(id);
    this.buffers.delete(id);
    this.pending = this.pending.filter(item => item !== id);
    this.settled.set(id, 'cancelled');
    this.bufferBytes.delete(id);
    this.promptTranscripts.delete(id);
  }
  callerTurn(event) {
    if (event.type === 'conversation.item.input_audio_transcription.updated') return null;
    if (event.type === 'conversation.item.input_audio_transcription.completed' && typeof event.transcript === 'string' && event.transcript.trim()) return { id: String(event.item_id || event.transcript), text: event.transcript.trim() };
    if (event.type === 'conversation.item.added' && event.item?.role === 'user' && event.item.status === 'completed') {
      // Audio history can arrive before grok-transcribe's final caption with the
      // same item ID. Consuming it here would discard the authoritative reply.
      const part = event.item.content?.find(content => content?.type === 'input_text' && typeof content?.text === 'string' && content.text.trim());
      const text = part?.text;
      if (typeof text === 'string' && text.trim()) return { id: String(event.item.id || text), text: text.trim() };
    }
    return null;
  }
  settleCallerTurn() {
    if (this.inputFinalTimer) this.clock.clearTimeout(this.inputFinalTimer);
    this.inputFinalTimer = this.clock.setTimeout(() => this.enqueue(() => this.flushCallerTurn()), TURN_SETTLE_MS);
  }
  async flushCallerTurn() {
    if (this.inputFinalTimer) this.clock.clearTimeout(this.inputFinalTimer);
    this.inputFinalTimer = null;
    const events = [...this.pendingCallerEvents.values()];
    this.pendingCallerEvents.clear();
    if (!events.length || this.closed) return;
    const first = events[0];
    for (const event of events.slice(1)) this.heard.add(String(event.item_id));
    await this.grok({ ...first, transcript: mergeCallerCaptions(events) }, true);
  }
  async grok(event, settledCaller = false) {
    if (event.type === 'session.updated' && this.stage === 'starting') {
      this.clock.clearTimeout(this.startTimer);
      const call = await this.startupCall();
      if (this.closed || !call) return;
      if (call.owner || !['offering', 'message'].includes(call.phase)) return this.finish();
      if (call.phase === 'offering') this.force(COMMON_GREETING, 'welcome', { listen: true, interruptible: true });
      else this.force(RECEPTIONIST_OPENING, 'opening');
      return;
    }
    if (event.type === 'error') {
      this.logOutput('provider-error', null, { code: String(event.error?.code || '').slice(0, 80), kind: String(event.error?.type || '').slice(0, 80) });
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
    // An early audio item must still be ineligible to confirm a readback even
    // when its final transcription arrives after the playback mark.
    if (READBACK_STAGES.has(this.stage)) {
      const earlyId = event.type === 'conversation.item.added' && event.item?.role === 'user'
        ? event.item.id : event.type === 'conversation.item.input_audio_transcription.updated' ? event.item_id : null;
      if (earlyId) this.beforeReadback.add(String(earlyId));
    }
    const turn = this.callerTurn(event);
    // A replay must not replace a new in-progress caller caption either.
    if (turn && this.heard.has(turn.id)) return;
    // Keep the latest caption for each audio item, and merge nearby VAD
    // segments. Natural sentence pauses are not permission to interrupt a
    // longer message or reconfigure input while the caller continues.
    if (turn && !settledCaller && (this.inputSpeaking || this.vadItems.has(turn.id) || this.pendingCallerEvents.size)) {
      if (READBACK_STAGES.has(this.stage)) this.beforeReadback.add(turn.id);
      this.pendingCallerEvents.set(turn.id, { type: 'conversation.item.input_audio_transcription.completed', item_id: turn.id, transcript: turn.text });
      if (!this.inputSpeaking) this.settleCallerTurn();
      return;
    }
    if (turn && (this.stage === 'confirm' || this.stage === 'collect' || this.stage === 'welcome' || this.stage === 'welcome-playback' || QUESTION_STAGES.has(this.stage))) this.noteChoice();
    if (turn && READBACK_STAGES.has(this.stage)) {
      this.beforeReadback.add(turn.id);
      return;
    }
    if (turn && this.stage === 'confirm') return this.hear(turn);
    if (turn && (this.stage === 'welcome' || this.stage === 'welcome-playback')) {
      this.vadTurn = true;
      this.sendCarrier({ event: 'clear' });
      return this.collectTurn(turn);
    }
    if (turn && (this.stage === 'collect' || QUESTION_STAGES.has(this.stage))) {
      if (QUESTION_STAGES.has(this.stage)) this.stopOverlap();
      return this.collectTurn(turn);
    }
    if (turn) return;
    if (event.type === 'input_audio_buffer.speech_stopped' || event.type === 'input_audio_buffer.timeout_triggered') {
      this.inputSpeaking = false;
      if (this.pendingCallerEvents.size) this.settleCallerTurn();
      else if (['collect', 'confirm'].includes(this.stage)) {
        this.clearSilence();
        this.silenceTimer = this.clock.setTimeout(() => this.enqueue(() => this.silence()), SILENCE_MS);
      }
      if (['collect', 'confirm', 'assist', 'opening', 'opening-playback', 'result', 'result-playback', 'readback', 'readback-playback'].includes(this.stage)) this.vadTurn = true;
      return;
    }
    if (event.type === 'response.created' && event.response?.id) {
      const id = String(event.response.id);
      this.openResponseId = id;
      this.note('created', { bound: Boolean(this.prompt?.responseId) });
      this.logOutput('created', id);
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
      if (this.pending.length > 4) return this.fail('Too many concurrent voice responses');
      return;
    }
    if (['response.output_audio_transcript.done', 'response.audio_transcript.done'].includes(event.type)) {
      const id = String(event.response_id || '');
      if (!id || !this.prompt || this.stray.has(id) || !this.pending.includes(id)) return;
      if (typeof event.transcript !== 'string' || event.transcript.length > 12000) return;
      this.promptTranscripts.set(id, event.transcript);
      this.logOutput('transcript', id, { matches: spokenLineKey(event.transcript) === spokenLineKey(this.prompt.text) });
      this.acceptResponse(id);
      return;
    }
    if (['response.output_audio.delta', 'response.audio.delta'].includes(event.type)) {
      if (this.stage === 'collect' || this.stage === 'confirm') return;
      const id = event.response_id ? String(event.response_id) : '';
      if (id && this.stray.has(id)) return;
      if (this.prompt?.responseId) return;
      if (this.prompt && id && this.pending.includes(id) && validAudio(event.delta)) {
        const bytes = (this.bufferBytes.get(id) || 0) + pcmByteLength(event.delta);
        if (bytes > MAX_SCRIPT_AUDIO_BYTES) return this.fail('Voice response exceeded audio limit');
        this.bufferBytes.set(id, bytes);
        const queued = this.buffers.get(id) || [];
        queued.push(event.delta);
        this.buffers.set(id, queued);
        return;
      }
      if (this.stage === 'assist' && !this.prompt && validAudio(event.delta)) this.playDelta(event.delta);
      return;
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      this.inputSpeaking = true;
      if (event.item_id) this.vadItems.add(String(event.item_id));
      if (this.inputFinalTimer) this.clock.clearTimeout(this.inputFinalTimer);
      this.inputFinalTimer = null;
      this.clearSilence();
      if (QUESTION_STAGES.has(this.stage)) {
        // VAD also fires for noise and incomplete speech. Keep the scripted
        // question and its deadline until a final caller turn replaces it.
        this.note('speech-started', { questionPending: Boolean(this.prompt) });
        return;
      }
      if (READBACK_STAGES.has(this.stage)) {
        this.noteChoice();
        this.stopOverlap();
        this.intent = null;
        await this.commitBounded((_e, s) => {
          const c = s.get('call', this.call.id);
          if (intakeActive(c)) s.put('call', { ...c, intent: null, schedule: { ...(c.schedule || {}), awaiting: 'correction', asked: 'What would you like me to change?' } });
        });
        // Wait for the complete interrupted utterance before speaking again.
        this.stage = 'collect';
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
    this.logOutput('completed', responseId, { status: event.response.status || 'completed', bytes: this.bufferBytes.get(responseId) || 0 });
    if (this.openResponseId === responseId) this.openResponseId = null;
    if (this.stray.has(responseId)) {
      this.buffers.delete(responseId);
      this.pending = this.pending.filter(id => id !== responseId);
      return;
    }
    if (event.response.status === 'cancelled') return this.noteCancelled(responseId);
    if (this.prompt) {
      this.settled.set(responseId, event.response.status || 'completed');
      if (event.response.status && event.response.status !== 'completed') return this.noteCancelled(responseId);
      return this.acceptResponse(responseId);
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
    if (!['collect', 'confirm'].includes(this.stage) || this.closed || this.inputSpeaking) return;
    const current = await this.liveIntake();
    if (!current) return;
    const result = messageSilence(current.schedule || initialMessage(current.from, this.config.number));
    this.endAfterPlayback = result.end === true;
    if (!(await this.saveSchedule(result.state))) return;
    if (this.stage === 'confirm' && !result.end && this.intent?.readback) this.force(this.intent.readback, 'readback');
    else this.force(result.say, 'result');
  }
  async saveSchedule(schedule) {
    if (this.closed) return false;
    const saved = await this.commitBounded((_e, s) => {
      const c = s.get('call', this.call.id);
      if (!intakeActive(c)) return false;
      s.put('call', { ...c, schedule });
      if (schedule.messageText) _e.updateDraft(c.id, { name: schedule.name, callback: schedule.phone, message: schedule.messageText });
      return true;
    });
    return saved === true && !this.closed;
  }
  async collectTurn(turn) {
    if (this.heard.has(turn.id) || this.closed) return;
    this.heard.add(turn.id);
    this.noteChoice();
    const applied = await this.commitBounded((e, s) => {
      const c = s.get('call', this.call.id);
      retainRingingIntake(c);
      if (!intakeActive(c)) return null;
      const prior = c.schedule || initialMessage(c.from, this.config.number);
      const next = applyMessageTurn(prior, turn.text, c.from, this.config.number);
      const saved = { ...c, schedule: next.state, callerTranscript: appendCallerTranscript(c, turn) };
      if (next.state.messageText) e.updateDraft(c.id, { name: next.state.name, callback: next.state.phone, message: next.state.messageText });
      if (!c.intent?.confirmedAt) saved.intent = null;
      s.put('call', saved);
      return next;
    });
    if (this.closed || !applied || !(await this.liveIntake())) return;
    if (applied.state?.purpose === 'message') void this.worker?.drain?.().catch(() => {});
    if (!this.intent?.confirmedAt) this.intent = null;
    this.logCheckpoint('saved', applied.state?.awaiting);
    if (applied.readback && applied.state.purpose === 'message') return this.readbackMessage(applied.state);
    this.endAfterPlayback = applied.end === true;
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
  async hear(turn) {
    if (this.stage !== 'confirm' || this.heard.has(turn.id) || this.closed) return;
    this.heard.add(turn.id);
    this.noteChoice();
    this.clearSilence();
    const decision = this.beforeReadback.has(turn.id) ? 'early' : spokenDecision(turn.text);
    this.beforeReadback.delete(turn.id);
    const intentId = this.intent?.id;
    if (!(await this.liveIntake())) return;
    if (decision === 'early' && this.intent?.readback) return this.force(this.intent.readback, 'readback');
    await this.commitBounded((_e, s) => {
      const c = s.get('call', this.call.id);
      if (intakeActive(c)) s.put('call', { ...c, callerTranscript: appendCallerTranscript(c, turn) });
    });
    if (decision !== 'affirmative') {
      const current = await this.liveIntake();
      if (!current) return;
      const applied = applyMessageTurn({ ...(current.schedule || initialMessage(current.from, this.config.number)), awaiting: 'correction' }, turn.text, current.from, this.config.number);
      this.intent = null;
      await this.commitBounded((_e, s) => {
        const c = s.get('call', this.call.id);
        if (intakeActive(c)) s.put('call', { ...c, intent: null, lastCallerTurn: { id: turn.id, decision, at: Date.now() } });
      });
      if (!(await this.saveSchedule(applied.state)) || !(await this.liveIntake())) return;
      if (applied.readback) return this.readbackMessage(applied.state);
      this.force(applied.say, 'result');
      return;
    }
    const intent = await this.commitBounded((_e, s) => {
      const c = s.get('call', this.call.id);
      if (!intakeActive(c)) return { blocked: true };
      if (c.intent?.kind !== 'message' || c.intent?.id !== intentId || !c.intent.playedAt || c.intent.confirmedAt || Date.now() - c.intent.playedAt > CONFIRM_MS) return { blocked: false };
      const next = { ...c.intent, confirmedAt: Date.now(), transcript: turn.text, turnId: turn.id };
      s.put('call', { ...c, intent: next, lastCallerTurn: { id: turn.id, decision, at: next.confirmedAt } });
      return { blocked: false, intent: next };
    });
    if (this.closed || !intent || intent.blocked) return;
    if (!intent.intent) return this.recoverNow('Message confirmation expired');
    if (!(await this.liveIntake())) return;
    this.stage = 'committing';
    try { await this.persistMessage(intent.intent); }
    catch {
      if (this.closed || !(await this.liveIntake())) return;
      this.endAfterPlayback = true;
      this.force(SAVE_FAIL, 'result');
    }
    this.intent = null;
  }
  async verifyCrm(message) {
    let row = null;
    for (let attempt = 0; attempt < 2 && !this.closed; attempt++) {
      const result = await this.boundRead(() => this.saveCrm?.(message));
      row = result?.value || null;
      if (row?.verified && row.id && row.call_sid === this.call.sid) break;
    }
    if (this.closed) return false;
    if (!row?.verified || !row.id || row.call_sid !== this.call.sid) throw Error('CRM message was not verified');
    const verified = await this.commitBounded((_e, s) => {
      const saved = s.get('message', message.id);
      if (!saved) return false;
      s.put('message', { ...saved, crmId: row.id, crmVerified: true });
      return true;
    });
    return verified === true && !this.closed;
  }
  async persistMessage(intent) {
    if (this.closed || !(await this.commitIntake())) return;
    const message = await this.commitBounded(e => e.saveMessage(this.call.id, { ...intent.payload, confirmed: true }, intent.id));
    if (this.closed || !message?.confirmed) throw Error('Save not verified');
    if (!(await this.verifyCrm(message))) return;
    const current = await this.liveIntake();
    if (!current || current.messageId !== message.id) return;
    const say = MESSAGE_SAVED;
    this.endAfterPlayback = true;
    if (!(await this.saveSchedule({ ...(current.schedule || {}), awaiting: 'done', asked: say })) || !(await this.liveIntake())) return;
    this.force(say, 'result');
  }
  async tool(event) {
    // No model tools can create, search, prepare or commit an appointment.
    this.output(event.call_id, { saved: false, error: 'Only the server-directed message conversation is available.' });
  }
  async endConversation() {
    await this.commitBounded((e, s) => {
      const c = s.get('call', this.call.id);
      if (intakeActive(c)) e.ended(c.id, c.sid, `message-end:${c.id}`);
    });
    await this.writeSummary();
    this.finish();
    await this.worker?.drain?.();
  }
  fail(reason) {
    return this.recoverNow(reason);
  }
  finish() {
    if (this.closed) return;
    this.closed = true;
    this.clock.clearTimeout(this.startTimer);
    this.clock.clearTimeout(this.limitTimer);
    if (this.inputFinalTimer) this.clock.clearTimeout(this.inputFinalTimer);
    this.pendingCallerEvents.clear();
    this.buffers.clear();
    this.bufferBytes.clear();
    this.promptTranscripts.clear();
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
