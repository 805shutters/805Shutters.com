import { applyDelivery } from './provider.mjs';
import { supabaseReadiness } from './supabase-config.mjs';

// At-most-once submission: an expired claim becomes uncertain, never pending.
// Provider callbacks may bind SIDs before REST returns; merge fresh state only.
export class SupabaseWorker {
  constructor(state, provider) { this.state = state; this.provider = provider; }
  async handle(kind, item) {
    const p = this.provider;
    const read = () => this.state.transact((_e,s) => s.get('call', item.callId));
    const change = fn => this.state.transact(fn);
    try {
      const c = await read();
      if (kind === 'notification') {
        const data = await change((_e,s) => ({ blocked: s.get('text-preference',item.destination)?.blocked, message: s.get('message',item.messageId) }));
        if (data.blocked) throw new Error('Recipient opted out');
        const result = await p.send(item, data.message);
        await change((_e,s) => applyDelivery(s,item.id,result.sid,result.status || 'accepted')); return;
      }
      if (c && (c.phase !== 'ended' || ['hangup','disconnect-ai'].includes(item.type))) {
        const d = item.data;
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
      await change((_e,s)=>{
        const fresh=s.get(kind,item.id);
        if(kind==='notification' && fresh.sid) return fresh;
        const call=s.get('call',item.callId);
        if(kind==='effect' && item.type==='dial' && call?.offers.find(o=>o.id===item.data.offerId)?.sid) return s.put(kind,{...fresh,status:'done'});
        return s.put(kind,{...fresh,status:error.uncertain?'uncertain':'failed',error:error.uncertain?'Carrier outcome unknown; reconcile before retry.':'Carrier action failed; staff review needed.'});
      });
    }
  }
  async drain() {
    if(!supabaseReadiness(this.state.config).ready) return;
    await this.state.transact((e,s)=>{s.recover();e.tick();});
    // Batch claims commit before IO; both initial ringing requests start together.
    for(let round=0;round<4;round++) {
      const work=await this.state.transact((_e,s)=>{
        const jobs=[];for(let i=0;i<8;i++){const item=s.claim('effect');if(!item)break;jobs.push(['effect',item]);}
        if(this.state.config.notificationsApproved) for(let i=0;i<4;i++){const item=s.claim('notification');if(!item)break;jobs.push(['notification',item]);}
        return jobs;
      });
      if(!work.length)break;
      await Promise.all(work.map(([kind,item])=>this.handle(kind,item)));
    }
  }
}
