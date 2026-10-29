import { applyDelivery, ProviderError } from './provider.mjs';
import { canOperate } from './supabase-config.mjs';
import { reportFailure } from './security.mjs';
import { runSummarySync } from './call-summary.mjs';
import { notificationSendable, transcriptSmsSendingEnabled } from './transcript-sms.mjs';

function interruptsGreeting(item, call) {
  if (['ringback', 'connect-agent', 'fallback', 'collect', 'disconnect-ai'].includes(item.type)) return true;
  return item.type === 'route' && item.data?.sid === call.sid;
}

// At-most-once submission: an expired claim becomes uncertain, never pending.
// Provider callbacks may bind SIDs before REST returns; merge fresh state only.
export class SupabaseWorker {
  constructor(state, provider, options = {}) {
    this.state = state;
    this.provider = provider;
    this.syncMessage = typeof options.syncMessage === 'function' ? options.syncMessage : null;
    this.syncSummary = typeof options.syncSummary === 'function' ? options.syncSummary : null;
    this.syncJessica = typeof options.syncJessica === 'function' ? options.syncJessica : null;
    this.transcriptsEnabled = typeof options.transcriptSmsSendingEnabled === 'function' ? options.transcriptSmsSendingEnabled : transcriptSmsSendingEnabled;
  }
  async finishSummary(item) {
    await runSummarySync({
      load: () => this.state.transact((_e, s) => ({ call: s.get('call', item.callId), messages: s.list('message').filter(message => message.callId === item.callId) })),
      save: (mutate) => this.state.transact((_e, s) => {
        const call = s.get('call', item.callId);
        const effect = s.get('effect', item.id);
        mutate(call, effect);
        if (call) s.put('call', call);
        if (effect) s.put('effect', effect);
      }),
      sync: (call, messages) => {
        if (!this.syncSummary) throw new Error('Summary sync is not configured');
        return this.syncSummary(call, messages);
      },
    });
  }
  async handle(kind, item) {
    const p = this.provider;
    const read = () => typeof this.state.readCall === 'function' ? this.state.readCall(item.callId) : this.state.transact((_e,s) => s.get('call', item.callId));
    const change = fn => this.state.transact(fn);
    try {
      if (kind === 'effect' && item.type === 'sync-message') {
        const data = await change((_e, s) => ({ call: s.get('call', item.callId), message: s.get('message', item.data.messageId) }));
        if (!data.call || !data.message) throw new Error('Message is unavailable');
        if (!data.message.crmVerified) {
          if (!this.syncMessage) throw new Error('Message sync is not configured');
          const result = await this.syncMessage(data.call, data.message);
          if (!result?.verified || !result.id || result.call_sid !== data.call.sid) throw new Error('Message sync was not verified');
          await change((_e, s) => {
            const fresh = s.get('message', data.message.id);
            if (fresh) s.put('message', { ...fresh, crmVerified: true, crmId: result.id, crmRow: result });
          });
        }
        await change((e, s) => {
          const fresh = s.get('effect', item.id);
          const message = s.get('message', item.data.messageId);
          const call = s.get('call', item.callId);
          if (this.syncJessica && call && message?.crmVerified && message.crmRow) {
            const existing = s.list('effect').some(effect => effect.type === 'sync-jessica' && effect.data?.messageId === message.id);
            if (!existing) e.effect(call, 'sync-jessica', { messageId: message.id, row: message.crmRow });
          }
          if (fresh) s.put('effect', { ...fresh, status: 'done' });
        });
        return;
      }
      if (kind === 'effect' && item.type === 'sync-jessica') {
        if (!this.syncJessica) throw new Error('Jessica phone-message delivery is not configured');
        const result = await this.syncJessica(item.data?.row);
        if (!result?.delivered) throw new Error('Jessica phone-message delivery was not verified');
        await change((_e, s) => {
          const fresh = s.get('effect', item.id);
          const message = s.get('message', item.data?.messageId);
          if (message) s.put('message', { ...message, jessicaVerified: true });
          if (fresh) s.put('effect', { ...fresh, status: 'done' });
        });
        return;
      }
      if (kind === 'effect' && item.type === 'sync-summary') {
        await this.finishSummary(item);
        return;
      }
      const c = await read();
      if (kind === 'notification' && !notificationSendable(item, { transcripts: this.transcriptsEnabled() === true, other: true })) {
        await change((_e, s) => {
          const fresh = s.get('notification', item.id);
          if (!fresh) return fresh;
          return s.put('notification', { ...fresh, status: 'pending', attempts: 0, sid: null, nextAt: fresh.nextAt });
        });
        return;
      }
      if (kind === 'notification') {
        const data = await change((_e,s) => ({ blocked: s.get('text-preference',item.destination)?.blocked, message: s.get('message',item.messageId) }));
        if (data.blocked) throw new Error('Recipient opted out');
        const result = await p.send(item, data.message);
        await change((_e,s) => applyDelivery(s,item.id,result.sid,result.status || 'accepted')); return;
      }
      if (c && (c.phase !== 'ended' || ['hangup','disconnect-ai'].includes(item.type))) {
        const d = item.data;
        // A staff answer owns the call and must interrupt the welcome now.
        // A listening welcome is already on the media stream, so its fallback,
        // collect, and failure redirects must not wait for greetingPlayed.
        // Only an older blocking greeting still defers those caller moves.
        if (kind === 'effect' && !c.listeningWelcome && c.greetingPlayed === false && !c.owner && c.phase !== 'ended' && interruptsGreeting(item, c)) {
          const delay = Number(this.state.config.greetingRedirectDelayMs);
          const wait = Number.isFinite(delay) ? delay : 400;
          await change((_e, s) => {
            const fresh = s.get(kind, item.id);
            if (!fresh || fresh.status !== 'sending') return fresh;
            return s.put(kind, { ...fresh, status: 'pending', nextAt: Date.now() + wait, attempts: Math.max(0, (fresh.attempts || 1) - 1) });
          });
          return;
        }
        switch (item.type) {
          case 'dial': {
            const offer = c.offers.find(o=>o.id===d.offerId);
            if (!offer || offer.status !== 'pending') break;
            const result = await p.dial(c,offer);
            await change(e=>e.bind(c.id,offer.id,result.sid)); break;
          }
          case 'dial-customer': {
            if (c.phase !== 'callback-dialing') break;
            const result=await p.dialCustomer(c); await change(e=>e.customerBound(c.id,result.sid)); break;
          }
          case 'route': {
            const allowed = d.room === 'consult' ? c.held && c.phase==='consult-ringing' && [c.ownerSid,c.targetSid].includes(d.sid)
              : (d.sid===c.ownerSid && ['handoff','resuming','callback-connecting'].includes(c.phase)) || (d.sid===c.targetSid && c.phase==='completing') || (d.sid===c.sid && c.phase==='handoff' && !c.ai);
            if (allowed) await p.route(c,d.sid,d.room); break;
          }
          case 'hold': {
            const allowed = d.hold ? ['holding','holding-consult'].includes(c.phase) : ['unholding','unholding-resume','unholding-transfer'].includes(c.phase);
            if (allowed) { await p.hold(c,d.hold); await change(e=>e.holdApplied(c.id,d.hold,`effect:${item.id}`)); } break;
          }
          case 'hangup': await p.hangup(d.sid); break;
          case 'ringback': if (c.phase==='offering') await p.ringback(c); break;
          case 'reconnect-agent': if (c.phase==='followup') await p.resumeAgent(c); break;
          case 'connect-agent': if (c.phase==='message' && !c.mediaStreamSid && !c.mediaFailed) await p.connectAgent(c); break;
          case 'record': break;
          case 'disconnect-ai':
            // Redirecting the parent Twilio leg terminates its SIP child. The signed
            // caller conference-join callback confirms this before marking human.
            if(c.phase==='handoff') await p.route(c,c.sid,'main');
            break;
          case 'fallback': case 'collect':
            await p.fallback(c); await change(e=>e.aiDisconnected(c.id,`fallback:${item.id}`,true)); break;
          default: throw new Error('Unsupported call effect');
        }
      }
      await change((_e,s) => { const fresh=s.get(kind,item.id); return s.put(kind,{...fresh,status:'done'}); });
    } catch (error) {
      const failure = reportFailure('worker-effect', error);
      if (kind === 'effect' && ['sync-summary','sync-message','sync-jessica'].includes(item.type)) {
        await change((_e, s) => {
          const fresh = s.get('effect', item.id);
          const call = s.get('call', item.callId);
          if (!fresh) return fresh;
          const attempts = fresh.attempts || 1;
          const failed = attempts >= 8;
          if (call && item.type === 'sync-summary') s.put('call', { ...call, summarySync: failed ? 'failed' : 'pending' });
          return s.put('effect', { ...fresh, status: failed ? 'failed' : 'pending', error: failure.message, nextAt: Date.now() + Math.min(300000, 5000 * 2 ** Math.min(attempts, 6)) });
        });
        return;
      }
      await change((e,s)=>{
        const fresh=s.get(kind,item.id);
        if(kind==='notification' && fresh.sid) return fresh;
        const call=s.get('call',item.callId);
        if(kind==='effect' && item.type==='dial') {
          const offer=call?.offers.find(o=>o.id===item.data?.offerId);
          if(offer?.sid) return s.put(kind,{...fresh,status:'done',reconciled:'signed callback bound call SID'});
          // 4xx Create failures such as 21215 never produce a CallSid. Uncertain
          // and retryable results stay untouched so a possible live leg is not
          // redialed and the other offer can still be answered.
          if(error instanceof ProviderError && !error.uncertain && !error.retryable && offer?.purpose==='initial')
            e.rejectInitialDial(call.id,offer.id,failure.message,`dial-rejected:${item.id}`);
        }
        return s.put(kind,{...fresh,status:error.uncertain?'uncertain':'failed',error:error.uncertain?'Carrier outcome unknown; reconcile before retry.':failure.message});
      });
    }
  }
  async drain() {
    if(!canOperate(this.state.config)) return;
    await this.state.transact((e,s)=>{s.recover();e.tick();});
    // Batch claims commit before IO; both initial ringing requests start together.
    for(let round=0;round<4;round++) {
      const work=await this.state.transact((_e,s)=>{
        const jobs=[];for(let i=0;i<8;i++){const item=s.claim('effect');if(!item)break;jobs.push(['effect',item]);}
        const transcripts = this.transcriptsEnabled() === true;
        const other = this.state.config.notificationsApproved === true;
        if (transcripts || other) for (let i = 0; i < 4; i++) {
          const item = s.claim('notification', Date.now(), notification =>
            notificationSendable(notification, { transcripts, other }) &&
            (notification.purpose !== 'transcript' || this.state.config.transport !== 'media' ||
              s.get('message', notification.messageId)?.crmVerified === true));
          if (!item) break;
          jobs.push(['notification', item]);
        }
        return jobs;
      });
      if(!work.length)break;
      await Promise.all(work.map(([kind,item])=>this.handle(kind,item)));
    }
  }
}
