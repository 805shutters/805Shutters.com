import { randomUUID } from 'node:crypto';
import { RECEPTIONIST_OPENING, RECEPTIONIST_PROMPT, RECEPTIONIST_TOOLS, schedulingRequest, messageIntent, spokenDecision } from './receptionist.mjs';

const validAudio = value => typeof value === 'string' && value.length > 0 && value.length <= 256000 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
const CONFIRM_MS = 60000;
const SILENCE_MS = 12000;

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
    this.chain = Promise.resolve();
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
    this.startTimer = clock.setTimeout(() => this.enqueue(() => this.fail('Voice connection timed out')), 10000);
    this.limitTimer = clock.setTimeout(() => this.enqueue(() => this.fail('Voice session duration reached')), 110000);
    socket.onmessage = event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return this.enqueue(() => this.fail('Invalid carrier event')); }
      if (data.event === 'stop' && this.streamSid && data.streamSid === this.streamSid) { void this.carrier(data).catch(() => this.finish()); return; }
      this.enqueue(() => this.carrier(data));
    };
    socket.onclose = () => this.enqueue(() => this.fail('Carrier connection closed'));
    socket.onerror = () => this.enqueue(() => this.fail('Carrier audio connection failed'));
  }
  enqueue(task) { this.chain = this.chain.then(async () => { if (!this.closed) await task(); }).catch(() => this.fail('Voice session unavailable')); return this.chain; }
  sendAI(value) { if (this.ai?.readyState === 1) this.ai.send(JSON.stringify(value)); }
  sendCarrier(value) { if (this.socket.readyState === 1) this.socket.send(JSON.stringify({ ...value, streamSid: this.streamSid })); }
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
      this.ai.onopen = () => this.enqueue(async () => this.sendAI({ type: 'session.update', session: { voice: 'eve', instructions: RECEPTIONIST_PROMPT, turn_detection: null, audio: { input: { format: { type: 'audio/pcmu' } }, output: { format: { type: 'audio/pcmu' } } }, tools: [] } }));
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
    if (event.event === 'media' && this.stage === 'assist' && validAudio(event.media?.payload)) this.sendAI({ type: 'input_audio_buffer.append', audio: event.media.payload });
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
    this.clearSilence();
    this.sendAI({ type: 'session.update', session: { turn_detection: null, tools: [] } });
    this.sendAI({ type: 'conversation.item.create', item: { type: 'force_message', role: 'assistant', interruptible: false, content: [{ type: 'output_text', text }] } });
  }
  mark(next) { const name = randomUUID(); this.marks.set(name, next); this.sendCarrier({ event: 'mark', mark: { name } }); }
  assist() { this.stage = 'assist'; this.clearSilence(); this.sendAI({ type: 'session.update', session: { turn_detection: { type: 'server_vad' }, tools: RECEPTIONIST_TOOLS } }); }
  output(id, result) { this.sendAI({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: id, output: JSON.stringify(result) } }); }
  clearSilence() { if (this.silenceTimer) { this.clock.clearTimeout(this.silenceTimer); this.silenceTimer = null; } }
  armConfirm() {
    this.stage = 'confirm';
    this.sendAI({ type: 'session.update', session: { turn_detection: { type: 'server_vad' }, tools: [], input_audio_transcription: { model: 'grok' } } });
    this.silenceTimer = this.clock.setTimeout(() => this.enqueue(() => this.silence()), SILENCE_MS);
  }
  callerTurn(event) {
    if (event.type === 'conversation.item.input_audio_transcription.completed' && typeof event.transcript === 'string') return { id: String(event.item_id || event.transcript), text: event.transcript };
    if (event.type === 'conversation.item.created' && event.item?.role === 'user') {
      const text = event.item.transcript || event.item.content?.find(part => typeof part?.transcript === 'string')?.transcript || event.item.content?.find(part => typeof part?.text === 'string')?.text;
      if (typeof text === 'string') return { id: String(event.item.id || text), text };
    }
    return null;
  }
  async grok(event) {
    if (event.type === 'session.updated' && this.stage === 'starting') { this.clock.clearTimeout(this.startTimer); this.force(RECEPTIONIST_OPENING, 'opening'); return; }
    if (event.type === 'error') return this.fail('Grok rejected the voice session');
    const turn = this.callerTurn(event);
    if (turn) return this.hear(turn);
    if (event.type === 'response.created') { this.audioBytes = 0; return; }
    if (['response.output_audio.delta', 'response.audio.delta'].includes(event.type)) {
      if (['opening', 'readback', 'result', 'assist'].includes(this.stage) && validAudio(event.delta)) { this.audioBytes += event.delta.length; this.sendCarrier({ event: 'media', media: { payload: event.delta } }); }
      return;
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      if (this.stage === 'readback' || this.stage === 'readback-playback') {
        this.marks.clear();
        this.sendCarrier({ event: 'clear' });
        this.intent = null;
        await this.state.transact((_e, s) => { const c = s.get('call', this.call.id); if (c?.phase === 'message') s.put('call', { ...c, intent: null }); });
        this.force('I did not finish the readback, so nothing was saved. Tell me what you want changed.', 'result');
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
    this.responses.add(event.response.id);
    if (event.response.status && event.response.status !== 'completed') return this.fail('Grok response incomplete');
    if (['opening', 'readback', 'result'].includes(this.stage)) {
      if (!this.audioBytes) return this.fail('Required audio missing');
      const stage = this.stage;
      this.stage = stage + '-playback';
      this.mark(async () => {
        if (stage === 'readback') {
          const armed = await this.state.transact((_e, s) => {
            const c = s.get('call', this.call.id);
            if (c?.phase !== 'message' || c.intent?.id !== this.intent?.id || c.intent.confirmedAt) return false;
            s.put('call', { ...c, intent: { ...c.intent, playedAt: Date.now() } });
            return true;
          });
          if (armed) this.armConfirm(); else this.finish();
        } else this.assist();
      });
    } else if (this.stage === 'assist' && this.pendingTool) {
      const task = this.pendingTool;
      this.pendingTool = null;
      this.stage = 'tool';
      if (this.audioBytes) this.mark(() => this.tool(task)); else await this.tool(task);
    }
  }
  async silence() {
    if (this.stage !== 'confirm') return;
    this.intent = null;
    await this.state.transact((_e, s) => { const c = s.get('call', this.call.id); if (c?.phase === 'message' && !c.intent?.confirmedAt) s.put('call', { ...c, intent: null }); });
    this.force('I did not hear a clear yes, so nothing was saved. You can leave a message or tell me another time.', 'result');
  }
  async hear(turn) {
    if (this.stage !== 'confirm' || this.heard.has(turn.id)) return;
    this.heard.add(turn.id);
    this.clearSilence();
    const decision = spokenDecision(turn.text);
    const intentId = this.intent?.id;
    if (decision !== 'affirmative') {
      this.intent = null;
      await this.state.transact((_e, s) => {
        const c = s.get('call', this.call.id);
        if (c?.phase === 'message' && !c.intent?.confirmedAt) s.put('call', { ...c, intent: null, lastCallerTurn: { id: turn.id, decision, at: Date.now() } });
      });
      this.force('Nothing new was saved. Tell me what you would like to change.', 'result');
      return;
    }
    const intent = await this.state.transact((_e, s) => {
      const c = s.get('call', this.call.id);
      if (c?.phase !== 'message' || c.intent?.id !== intentId || !c.intent.playedAt || c.intent.confirmedAt || Date.now() - c.intent.playedAt > CONFIRM_MS) return null;
      const next = { ...c.intent, confirmedAt: Date.now(), transcript: turn.text, turnId: turn.id };
      s.put('call', { ...c, intent: next, lastCallerTurn: { id: turn.id, decision, at: next.confirmedAt }, ...(next.kind === 'appointment' ? { bookingIntent: next } : {}) });
      return next;
    });
    if (!intent) { this.intent = null; this.force('Nothing new was saved. Tell me what you would like to change.', 'result'); return; }
    this.stage = 'committing';
    try {
      if (intent.kind === 'message') await this.persistMessage(intent);
      else await this.persistAppointment(intent);
    } catch {
      await this.state.transact((_e, s) => { const c = s.get('call', this.call.id); if (c) s.put('call', { ...c, bookingAttention: 'Confirmation outcome requires verification before another booking.' }); });
      this.force('I could not verify the save. I can take a callback message so our team can check it.', 'result');
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
    this.force('Your message has been saved for our team to review. Is there anything else I can help with?', 'result');
  }
  async persistAppointment(intent) {
    const result = await this.schedule(this.config, this.call.id, 'commit', {});
    const current = await this.current();
    if (current?.phase !== 'message') return;
    if (result?.replan === true) {
      await this.state.transact((_e, s) => { const c = s.get('call', this.call.id); if (c?.bookingIntent?.id === intent.id && !c.booking?.verified) s.put('call', { ...c, bookingIntent: null, intent: null }); });
      this.force('That time no longer fits. We can check another time, or I can take a callback message.', 'result');
      return;
    }
    if (!result?.verified) throw Error('Booking not verified');
    this.force(`Your consultation is booked for ${result.date} at ${result.time} Pacific time. Is there anything else I can help with?`, 'result');
  }
  async tool(event) {
    try {
      const data = JSON.parse(event.arguments || '{}');
      if (!RECEPTIONIST_TOOLS.some(t => t.name === event.name) || !data || Array.isArray(data) || data.confirmed === true) throw Error('Unsupported action');
      const current = await this.current();
      if (current?.phase !== 'message') return this.finish();
      if (current.bookingAttention || current.booking?.verified) throw Error('Verify the existing booking outcome first.');
      if (event.name === 'prepare_message' && current.messageId) throw Error('A message is already saved for this call.');
      let result;
      if (event.name === 'draft_message') result = await this.state.transact(e => ({ retained: true, confirmed: false, draft: e.updateDraft(this.call.id, data) }));
      else if (event.name === 'prepare_message') {
        this.intent = messageIntent(data);
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
      this.output(event.call_id, fit === false ? { ...result, saved: false, next: 'No nearby time fits. Take a callback message.' } : result);
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
    this.marks.clear();
    if (this.ai) { this.ai.onclose = null; this.ai.onerror = null; this.ai.close(); }
    this.socket.onclose = null;
    if (this.socket.readyState < 2) this.socket.close();
    this.resolveDone();
  }
}
