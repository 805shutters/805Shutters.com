import { Conflict } from './engine.mjs';
import { equal, hmac, twilioSignature, twiml, xml } from './security.mjs';
import { e164 } from './config.mjs';
import { prefetchContext } from './caller-context.mjs';
import { supabaseReadiness } from './supabase-config.mjs';
import { conferenceXml, applyDelivery } from './provider.mjs';
import { fallback } from './fallback.mjs';
const terminal = ['completed','failed','canceled','busy','no-answer'];
const json = (value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const xmlResponse = value=>new Response(value,{headers:{'content-type':'text/xml','cache-control':'no-store'}});
const say = value=>`<Say>${xml(value)}</Say>`;
export function callToken(c,call) { const value=`${call.id}.${call.createdAt+2*60*60*1000}`;return `${value}.${hmac(c.toolsKey,value).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}`; }
function verifyToken(c,token) { if(typeof token!=='string')return null;const [id,expires,signature]=token.split('.');if(!/^[0-9a-f-]{36}$/.test(id||'')||Number(expires)<Date.now()||!Number.isFinite(Number(expires)))return null;return equal(hmac(c.toolsKey,`${id}.${expires}`).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''),signature)?id:null; }
export function createSupabaseHandler({state,client,worker,waitUntil=()=>{}}) {
 const c=state.config;
 const run=fn=>state.transact(fn);
 const queue=()=>waitUntil(worker.drain().catch(()=>{}));
 return async request=>{
  try {
   const u=new URL(request.url),base=new URL(c.origin); const path=u.pathname.slice(base.pathname.replace(/\/$/,'').length)||'/';
   if(!(u.pathname===base.pathname || u.pathname.startsWith(base.pathname.replace(/\/$/,'')+'/'))||u.search)return json({error:'Invalid route'},400);
   if(path==='/health'&&request.method==='GET')return json({service:'805-phone',...supabaseReadiness(c)});
   if(!['GET','POST'].includes(request.method))return json({error:'Method rejected'},405);
   if(Number(request.headers.get('content-length')||0)>65536)return json({error:'Body too large'},413);
   const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return json({error:'Body too large'},413);
   if(path.startsWith('/control')) {
    const actor=request.headers.get('x-805-actor'),at=request.headers.get('x-805-time'),nonce=request.headers.get('x-805-nonce');
    if(!['mike','jessica'].includes(actor)||!/^[-\w]{16,80}$/.test(nonce||'')||!Number.isFinite(Number(at))||Math.abs(Date.now()-Number(at))>30000||c.controlKey.length<32||!equal(hmac(c.controlKey,`${request.method}\n${path}\n${at}\n${nonce}\n${actor}\n${raw}`),request.headers.get('x-805-signature')))return json({error:'Staff authorization required'},401);
    const data=raw?JSON.parse(raw):{},parts=path.split('/').filter(Boolean);
    const result=await run((e,s)=>{
     if(!s.once(`control:${nonce}`,'control'))throw new Conflict('Request already used');
     if(path==='/control'&&request.method==='GET'){
      const snapshot=e.snapshot();
      // Internal lookup prompts, destinations, SID credentials and outbox bodies
      // are not necessary for the UI. Keep only the reviewed CRM contract.
      snapshot.calls=snapshot.calls.map(({context,...call})=>call);
      snapshot.notifications=snapshot.notifications.map(({destination,...n})=>n);
      return {...snapshot,actor,readiness:supabaseReadiness(c)};
     }
     if(request.method!=='POST')throw new Conflict('Unsupported phone action');
     if(parts[1]==='links') { for(const link of (data.links||[]).slice(0,100))e.link(link.callId,link,actor,false);return {ok:true}; }
     if(parts[1]==='calls'&&parts[3]==='link')return e.link(parts[2],data,actor,true);
     if(parts[1]==='messages'&&parts[3]==='ack')return e.acknowledge(parts[2],actor);
     if(parts[1]==='messages'&&parts[3]==='followup')return e.followup(parts[2],actor,data.status,data.note);
     if(!supabaseReadiness(c).ready)throw new Conflict('Calling is not activated');
     if(parts[1]==='calls'&&parts[3]==='command')return e.command(parts[2],actor,data.revision,data.command,data.commandId);
     if(parts[1]==='messages'&&parts[3]==='callback')return e.callback(parts[2],actor,data.commandId);
     if(parts[1]==='messages'&&parts[3]==='text')return e.sendText(parts[2],actor,data.text,data.consent,data.commandId);
     throw new Conflict('Unsupported phone action');
    });queue();return json(result);
   }
   if(path==='/worker'&&request.method==='POST') {
    if(c.workerKey.length<32||!equal(request.headers.get('authorization'),`Bearer ${c.workerKey}`))return json({error:'Rejected'},401);
    await worker.drain();return json({ok:true,callingEnabled:supabaseReadiness(c).ready});
   }
   if(!supabaseReadiness(c).ready)return json({error:'805 calling is in standby'},503);
   if(request.method!=='POST')return json({error:'POST required'},405);
   if(path==='/agent') {
    if(!equal(request.headers.get('authorization'),`Bearer ${c.toolsKey}`))return json({error:'Rejected'},401);
    const data=JSON.parse(raw);const id=verifyToken(c,data.callToken);if(!id)return json({error:'Invalid call token'},401);
    if(data.action==='context') {
     let call=await run((_e,s)=>s.get('call',id));if(!call||call.phase==='ended')return json({error:'Call unavailable'},404);
     if(!call.context)await prefetchContext(state,id,client,c.statusTopics);
     call=await run((_e,s)=>s.get('call',id));return json(call.context);
    }
    const value=await run((e,s)=>{
     const call=s.get('call',id);if(!call||call.phase==='ended')throw new Conflict('Call unavailable');
     if(data.action==='greeting_complete') {
      if(!call.context)throw new Conflict('Caller context still pending');
      e.greeted(id,`greeting:${id}`);return {ok:true,phase:s.get('call',id).phase};
     }
     if(data.action==='transfer') {
      if(call.phase==='greeting')throw new Conflict('Complete the audible greeting first');
      e.requestStaff(id,`agent-transfer:${id}`);return {ok:true,phase:s.get('call',id).phase,answered:false};
     }
     if(data.action==='draft')return e.updateDraft(id,data.message);
     if(data.action==='save_message')return {saved:!!e.saveMessage(id,data.message,`agent-message:${id}`)};
     throw new Conflict('Unsupported agent action');
    });queue();return json(value);
   }
   if(!path.startsWith('/twilio/'))return json({error:'Not found'},404);
   if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return json({error:'Form required'},415);
   const p=new URLSearchParams(raw),sid=p.get('CallSid'),parts=path.split('/').filter(Boolean);
   if(p.get('AccountSid')!==c.accountSid||!twilioSignature(c.authToken,c.origin.replace(/\/$/,'')+path,p,request.headers.get('x-twilio-signature')))return json({error:'Rejected'},401);
   if(path==='/twilio/inbound') {
    if(p.get('To')!==c.number||!/^CA[0-9a-f]{32}$/i.test(sid||''))return json({error:'Wrong call'},403);
    const call=await run(e=>e.inbound(sid,e164.test(p.get('From')||'')?p.get('From'):'anonymous'));
    // Start the lookup now; do not await it before returning the SIP connection.
    waitUntil(prefetchContext(state,call.id,client,c.statusTopics).catch(()=>{}));
    const sip=`${c.sipUri}?X-805-Call-Token=${encodeURIComponent(callToken(c,call))}`;
    return xmlResponse(twiml(`<Dial action="${xml(c.origin+'/twilio/continue/'+call.id)}" method="POST"><Sip>${xml(sip)}</Sip></Dial>`));
   }
   if(path==='/twilio/text') {
    if(p.get('To')!==c.number)return json({error:'Wrong number'},403);
    await run(e=>e.inboundText(p.get('MessageSid'),p.get('From'),p.get('Body')||'',p.get('OptOutType')||'',Number(p.get('NumMedia')||0)));queue();return xmlResponse(twiml(''));
   }
   if(parts[1]==='sms') {
    await run((_e,s)=>{const item=s.get('notification',decodeURIComponent(parts[2]));if(!item||p.get('To')!==item.destination||p.get('From')!==c.number)throw new Conflict('Wrong message');return applyDelivery(s,item.id,p.get('MessageSid'),p.get('MessageStatus'));});return xmlResponse(twiml(''));
   }
   if(path==='/twilio/status') {
    if(p.get('To')!==c.number)return json({error:'Wrong number'},403);
    await run((e,s)=>{const id=s.state.inbound[sid];if(!id)throw new Conflict('Unknown caller');if(terminal.includes(p.get('CallStatus')))e.ended(id,sid,`parent-status:${sid}:${p.get('CallStatus')}`);});queue();return xmlResponse(twiml(''));
   }
   const response=await run((e,s)=>{
    const call=s.get('call',parts[2]);if(!call)throw new Conflict('Unknown call');
    const eventId=[parts[1],call.id,sid,p.get('SequenceNumber'),p.get('StatusCallbackEvent'),p.get('CallStatus'),p.get('ConferenceSid')].join(':');
    if(parts[1]==='offer') {
     const offer=call.offers.find(o=>o.id===parts[3]);if(!offer||p.get('To')!==c.staff[offer.staff].destination||p.get('From')!==c.number)throw new Conflict('Wrong staff leg');
     e.bind(call.id,offer.id,sid);
     if(parts[4]==='status') {if(terminal.includes(p.get('CallStatus')))e.ended(call.id,sid,eventId);return twiml('');}
     if(parts[4]==='accept') {const next=e.accept(call.id,offer.id,sid,p.get('Digits'));return next.offers.find(o=>o.id===offer.id)?.status==='accepted'?twiml('<Pause length="60"/>'):twiml('<Hangup/>');}
     return ['pending','ringing'].includes(s.get('call',call.id).offers.find(o=>o.id===offer.id).status)?twiml(`<Gather input="dtmf" numDigits="1" timeout="${c.offerSeconds}" action="${xml(c.origin+path+'/accept')}">${say('805 Shutters call. Press 1 to accept.')}</Gather><Hangup/>`):twiml('<Hangup/>');
    }
    if(parts[1]==='conference') {
     const room=parts[3];if(!['main','consult'].includes(room)||![call.sid,...call.offers.map(o=>o.sid)].includes(sid)||p.get('FriendlyName')!==`805-${call.id}-${room}`)throw new Conflict('Wrong conference');
     if(p.get('StatusCallbackEvent')==='participant-join') {
      if(sid===call.sid&&room==='main'&&call.phase==='handoff'&&call.ai)e.aiDisconnected(call.id,`sip-detached:${eventId}`,true);
      e.joined(call.id,sid,room,p.get('ConferenceSid'),eventId);
     }
     if(p.get('StatusCallbackEvent')==='participant-leave'&&sid===call.sid&&['human','held'].includes(call.phase))e.ended(call.id,sid,eventId);
     return twiml('');
    }
    if(parts[1]==='customer') {
     if(call.direction!=='outbound'||p.get('To')!==call.outboundTarget||p.get('From')!==c.number)throw new Conflict('Wrong callback');
     e.customerBound(call.id,sid);if(parts[3]==='status'){if(terminal.includes(p.get('CallStatus')))e.ended(call.id,sid,eventId);return twiml('');}return call.phase==='ended'?twiml('<Hangup/>'):conferenceXml(c,call,'main');
    }
    if(sid!==call.sid)throw new Conflict('Wrong caller leg');
    if(parts[1]==='status'){if(terminal.includes(p.get('CallStatus')))e.ended(call.id,sid,eventId);return twiml('');}
    if(parts[1]==='fallback')return fallback(e,call,parts[3],p,c);
    if(parts[1]==='continue') {
     if(call.phase==='ended')return twiml('<Hangup/>');
     if(call.phase==='handoff'&&!call.ai)return conferenceXml(c,call,'main');
     e.failed(call.id,'AI SIP call ended',eventId);for(const effect of s.list('effect'))if(effect.callId===call.id&&effect.type==='fallback'&&effect.status==='pending')s.put('effect',{...effect,status:'done',reason:'Fallback returned directly in TwiML'});return twiml(`<Redirect>${xml(c.origin+'/twilio/fallback/'+call.id+'/name')}</Redirect>`);
    }
    throw new Conflict('Unknown callback');
   });queue();return xmlResponse(response);
  } catch(error) {return json({error:error instanceof Conflict?error.message:'805 phone operation unavailable'},error instanceof Conflict?409:503);}
 };
}
