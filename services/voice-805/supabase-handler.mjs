import { Conflict } from './engine.mjs';
import { equal, hmac, mediaStreamSignatureUrls, publicError, reportFailure, twilioSignature, twilioSignatureMatches, twiml, xml } from './security.mjs';
import { e164 } from './config.mjs';
import { phaseInstruction, prefetchContext } from './caller-context.mjs';
import { canOperate, supabaseReadiness } from './supabase-config.mjs';
import { conferenceXml, applyDelivery } from './provider.mjs';
import { fallback, mediaStreamTwiml, ringbackTwiml, ringbackWav, voicemailXml } from './fallback.mjs';
import { PROMPTS, ensureSpoken, promptDigest, promptSource, promptVerb } from './prompts.mjs';
import { logFailure, saveCallback } from './callbacks.mjs';
const terminal = ['completed','failed','canceled','busy','no-answer'];
// The hosted Supabase gateway records 502 for an Upgrade request that does not
// return 101 on the first turn (plain GET /health is 200; the same path with
// Upgrade: websocket is 502 and never reaches a JSON response). Load the call
// after the socket is upgraded, and close it if this call cannot take audio.
export function attachMediaSocket(socket, { load, eligible, start }) {
 const early = [];
 socket.onmessage = event => early.push(event);
 return (async () => {
  let call = null;
  try { call = await load(); }
  catch { try { socket.close(1011, 'unavailable'); } catch { /* already closed */ } return; }
  if (!eligible(call) || (typeof socket.readyState === 'number' && socket.readyState > 1)) {
   try { socket.close(1008, 'unavailable'); } catch { /* already closed */ }
   return;
  }
  start(call);
  const deliver = socket.onmessage;
  for (const event of early) deliver?.(event);
 })();
}
const json = (value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const xmlResponse = value=>new Response(value,{headers:{'content-type':'text/xml','cache-control':'no-store'}});
export function callToken(c,call) { const value=`${call.id}.${call.createdAt+2*60*60*1000}`;return `${value}.${hmac(c.toolsKey,value).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}`; }
function verifyToken(c,token) { if(typeof token!=='string')return null;const [id,expires,signature]=token.split('.');if(!/^[0-9a-f-]{36}$/.test(id||'')||Number(expires)<Date.now()||!Number.isFinite(Number(expires)))return null;return equal(hmac(c.toolsKey,`${id}.${expires}`).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''),signature)?id:null; }
export function createSupabaseHandler({state,client,worker,upgradeMedia,prompts=null,waitUntil=()=>{}}) {
 const c=state.config;
 const run=fn=>state.transact(fn);
 const queue=()=>waitUntil(worker.drain().catch(error=>reportFailure('worker-drain',error)));
 return async request=>{
  try {
   const u=new URL(request.url),base=new URL(c.origin);
   const publicPrefix=base.pathname.replace(/\/$/,'');
   // The hosted gateway removes /functions/v1 before invoking the function.
   // Keep the configured public URL for Twilio signature validation below.
   const prefixes=[publicPrefix];
   if(publicPrefix.startsWith('/functions/v1/'))prefixes.push(publicPrefix.slice('/functions/v1'.length));
   const prefix=prefixes.find(p=>u.pathname===p||u.pathname.startsWith(p+'/'));
   if(prefix===undefined||u.search)return json({error:'Invalid route'},400);
   const path=u.pathname.slice(prefix.length)||'/';
   if(path==='/health'&&request.method==='GET')return json({service:'805-phone',...supabaseReadiness(c)});
   if(path==='/twilio/ringback.wav'){
    if(request.method!=='GET')return json({error:'Method rejected'},405);
    return new Response(ringbackWav(),{headers:{'content-type':'audio/wav','cache-control':'public, max-age=86400'}});
   }
   const versionedPrompt=path.match(/^\/twilio\/prompts\/(greeting|unavailable|voicemail)-([0-9a-f]{16})\.wav$/);
   const plainPrompt=path.match(/^\/twilio\/prompts\/(greeting|unavailable|voicemail)\.wav$/);
   if(versionedPrompt||plainPrompt){
    if(request.method!=='GET')return json({error:'Method rejected'},405);
    const promptName=(versionedPrompt||plainPrompt)[1];
    if(versionedPrompt&&versionedPrompt[2]!==promptDigest(promptName))return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
    await ensureSpoken(c,[promptName],prompts,waitUntil);
    const bytes=promptSource(c,promptName);
    if(!bytes)return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
    const cache=versionedPrompt?'public, max-age=86400':'no-store';
    return new Response(bytes,{headers:{'content-type':'audio/wav','cache-control':cache}});
   }
   if(path.startsWith('/twilio/media/')) {
    if(!canOperate(c))return json({error:'805 calling is in standby'},503);
    const id=path.slice('/twilio/media/'.length);
    if(c.transport!=='media'||!upgradeMedia||request.method!=='GET'||request.headers.get('upgrade')?.toLowerCase()!=='websocket')return json({error:'Media unavailable'},400);
    if(!/^[0-9a-f-]{36}$/.test(id)||!twilioSignatureMatches(c.authToken,mediaStreamSignatureUrls(c.origin,path),new URLSearchParams(),request.headers.get('x-twilio-signature')))return json({error:'Rejected'},401);
    return upgradeMedia(request,{
     load:()=>run((_e,s)=>s.get('call',id)),
     eligible:call=>!!(call&&call.phase==='message'&&!call.mediaStreamSid&&!call.mediaFailed&&Date.now()<=call.deadline),
    });
   }
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
     if(!canOperate(c))throw new Conflict('Calling is not activated');
     if(c.mode==='pilot'&&parts[1]==='messages'&&['callback','text'].includes(parts[3]))throw new Conflict('Outbound contact is disabled during the pilot');
     if(parts[1]==='calls'&&parts[3]==='command')return e.command(parts[2],actor,data.revision,data.command,data.commandId);
     if(parts[1]==='messages'&&parts[3]==='callback')return e.callback(parts[2],actor,data.commandId);
     if(parts[1]==='messages'&&parts[3]==='text')return e.sendText(parts[2],actor,data.text,data.consent,data.commandId);
     throw new Conflict('Unsupported phone action');
    });queue();return json(result);
   }
   if(path==='/worker'&&request.method==='POST') {
    if(c.workerKey.length<32||!equal(request.headers.get('authorization'),`Bearer ${c.workerKey}`))return json({error:'Rejected'},401);
    await worker.drain();return json({ok:true,callingEnabled:canOperate(c)});
   }
   if(path==='/twilio/fallback.xml'||path==='/twilio/fallback-recording'||path==='/twilio/fallback-transcription') {
    if(request.method!=='POST')return json({error:'POST required'},405);
    if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return json({error:'Form required'},415);
    const fp=new URLSearchParams(raw);
    if(fp.get('AccountSid')!==c.accountSid||!twilioSignature(c.authToken,c.origin.replace(/\/$/,'')+path,fp,request.headers.get('x-twilio-signature')))return json({error:'Rejected'},401);
    if(path==='/twilio/fallback.xml'){await ensureSpoken(c,['voicemail'],prompts,waitUntil);return xmlResponse(voicemailXml(c.origin,'/twilio/fallback-recording','/twilio/fallback-transcription',c));}
    try { await saveCallback(client,callbackFields(fp,fp.get('TranscriptionText')||'')); }
    catch(error){ const failure=reportFailure('crm-callback',error); await logFailure(client,'crm_write_failed',null,failure.message).catch(logError=>reportFailure('failure-log',logError)); }
    return xmlResponse(twiml(''));
   }
   if(!canOperate(c))return json({error:'805 calling is in standby'},503);
   if(request.method!=='POST')return json({error:'POST required'},405);
   if(path==='/agent') {
    if(c.transport==='media')return json({error:'Hosted agent tools disabled'},403);
    if(!equal(request.headers.get('authorization'),`Bearer ${c.toolsKey}`))return json({error:'Rejected'},401);
    const data=JSON.parse(raw);const id=verifyToken(c,data.callToken);if(!id)return json({error:'Invalid call token'},401);
    if(data.action==='context') {
     let call=await run((_e,s)=>s.get('call',id));if(!call||call.phase==='ended')return json({error:'Call unavailable'},404);
     if(!call.context)await prefetchContext(state,id,client,c.statusTopics);
     call=await run((_e,s)=>s.get('call',id));
     return json({...call.context,phase:call.phase,callerId:call.from,greeting:c.greeting,instruction:phaseInstruction(call.phase,call.from)});
    }
    if(data.action==='save_message') {
     const saved=await run((e,s)=>{const message=e.saveMessage(id,data.message,`agent-message:${id}`);return {message,call:s.get('call',id)};});
     try { const row=await saveCallback(client,callbackFields({get:(k)=>({CallSid:saved.call.sid,From:saved.call.from,RecordingUrl:''}[k])},data.message?.transcript||'',saved.call,data.message)); queue(); return json({saved:true,callback:row}); }
     catch(error){ const failure=reportFailure('crm-callback',error); await logFailure(client,'crm_write_failed',id,failure.message).catch(logError=>reportFailure('failure-log',logError)); queue(); return json({saved:false,error:'The message was kept on the call, but the callback list could not be updated.'}); }
    }
    const value=await run((e,s)=>{
     const call=s.get('call',id);if(!call||call.phase==='ended')throw new Conflict('Call unavailable');
     if(data.action==='greeting_complete') {
      e.greeted(id,`greeting:${id}`);return {ok:true,phase:s.get('call',id).phase};
     }
     if(data.action==='choose') {
      if(data.choice==='message'){const next=e.beginMessage(id,`choose-message:${id}`);return {ok:next.phase==='message',phase:next.phase,callerId:next.from};}
      if(data.choice==='schedule'){const next=e.beginSchedule(id,`choose-schedule:${id}`);if(next.phase!=='schedule')throw new Conflict('Scheduling is only offered when nobody answers. 805 will call the customer back.');return {ok:true,phase:'schedule'};}
      throw new Conflict('Choose message or schedule');
     }
     if(data.action==='transfer') {
      if(call.phase==='greeting')throw new Conflict('Complete the audible greeting first');
      e.requestStaff(id,`agent-transfer:${id}`);return {ok:true,phase:s.get('call',id).phase,answered:false};
     }
     if(data.action==='draft')return e.updateDraft(id,data.message);
     throw new Conflict('Unsupported agent action');
    });queue();return json(value);
   }
   if(!path.startsWith('/twilio/'))return json({error:'Not found'},404);
   if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return json({error:'Form required'},415);
   const p=new URLSearchParams(raw),sid=p.get('CallSid'),parts=path.split('/').filter(Boolean);
   if(p.get('AccountSid')!==c.accountSid||!twilioSignature(c.authToken,c.origin.replace(/\/$/,'')+path,p,request.headers.get('x-twilio-signature')))return json({error:'Rejected'},401);
   if(path==='/twilio/inbound') {
    if(p.get('To')!==c.number||!/^CA[0-9a-f]{32}$/i.test(sid||''))return json({error:'Wrong call'},403);
    if(c.mode==='pilot'&&!c.pilotCallers.includes(p.get('From'))){await ensureSpoken(c,['unavailable'],prompts,waitUntil);return xmlResponse(twiml(`${promptVerb(c,'unavailable',PROMPTS.unavailable)}<Hangup/>`));}
    const call=await run(e=>{const created=e.inbound(sid,e164.test(p.get('From')||'')?p.get('From'):'anonymous');e.greeted(created.id,`answer:${sid}`);return created;});
    queue();
    waitUntil(prefetchContext(state,call.id,client,c.statusTopics).catch(error=>reportFailure('caller-lookup',error)));
    await ensureSpoken(c,['greeting'],prompts,waitUntil);
    waitUntil(ensureSpoken(c,['unavailable','voicemail'],prompts,waitUntil));
    return xmlResponse(twiml(`${promptVerb(c,'greeting',c.greeting)}<Redirect method="POST">${xml(c.origin+'/twilio/greeted/'+call.id)}</Redirect>`));
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
   if(path==='/twilio/ringback')return xmlResponse(ringbackTwiml(c.origin));
   if(['greeted','agent','continue','fallback'].includes(parts[1]))await ensureSpoken(c,['voicemail'],prompts,waitUntil);
   let downId=null;
   const response=await run((e,s)=>{
    const call=s.get('call',parts[2]);if(!call)throw new Conflict('Unknown call');
    const eventId=[parts[1],call.id,sid,p.get('SequenceNumber'),p.get('StatusCallbackEvent'),p.get('CallStatus'),p.get('ConferenceSid')].join(':');
    if(parts[1]==='offer') {
     const offer=call.offers.find(o=>o.id===parts[3]);if(!offer||p.get('To')!==c.staff[offer.staff].destination||p.get('From')!==c.number)throw new Conflict('Wrong staff leg');
     e.bind(call.id,offer.id,sid);
     if(parts[4]==='status') {if(terminal.includes(p.get('CallStatus')))e.ended(call.id,sid,eventId);return twiml('');}
     if(parts[4]==='amd') {const next=e.accept(call.id,offer.id,sid,p.get('AnsweredBy')||'unknown');return next.offers.find(o=>o.id===offer.id)?.status==='accepted'?twiml('<Pause length="60"/>'):twiml('<Hangup/>');}
     return ['pending','ringing'].includes(s.get('call',call.id).offers.find(o=>o.id===offer.id).status)?twiml(`<Pause length="${c.offerSeconds}"/><Hangup/>`):twiml('<Hangup/>');
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
    if(parts[1]==='greeted'){
     if(call.phase==='greeting')e.greeted(call.id,`carrier-greeting:${call.id}`);
     e.markGreetingPlayed(call.id,`greeting-played:${call.id}`);
     const current=s.get('call',call.id);
     if(current.phase==='ended')return twiml('<Hangup/>');
     if(current.phase==='voicemail'||(current.phase==='message'&&current.mediaFailed))return voicemailXml(c.origin,`/twilio/recording/${current.id}`,`/twilio/transcription/${current.id}`,c);
     if(current.phase==='message'&&c.transport==='media'&&!current.mediaStreamSid&&!current.mediaFailed)return mediaStreamTwiml(c.origin,current.id);
     if(['offering','handoff','human','held'].includes(current.phase))return conferenceXml(c,current,'main');
     return twiml('<Hangup/>');
    }
    if(parts[1]==='agent'){
     if(call.phase==='ended')return twiml('<Hangup/>');
     if(call.phase!=='message'||c.transport!=='media'||call.mediaFailed||call.mediaStreamSid)return fallback(e,call,'voicemail',p,c);
     return mediaStreamTwiml(c.origin,call.id);
    }
    if(parts[1]==='stream'){
     const streamEvent=p.get('StreamEvent')||'';
     const streamSid=p.get('StreamSid')||'';
     if(!['stream-started','stream-stopped','stream-error'].includes(streamEvent)||!/^MZ[0-9a-f]{32}$/i.test(streamSid))throw new Conflict('Unknown stream event');
     const detail=streamEvent==='stream-error'?publicError({message:p.get('StreamError')||''}).message:'';
     e.recordStream(call.id,streamEvent,detail,`stream:${call.id}:${sid}:${streamEvent}:${streamSid}`);
     return twiml('');
    }
    if(parts[1]==='fallback')return fallback(e,call,parts[3],p,c);
    if(parts[1]==='recording'||parts[1]==='transcription'){
     const transcript=p.get('TranscriptionText')||'';
     if(parts[1]==='recording'&&p.get('RecordingStatus')&&p.get('RecordingStatus')!=='completed')return twiml('');
     if(parts[1]==='transcription'&&!transcript)return twiml('');
     return {callback:callbackFields(p,transcript,call)};
    }
    if(parts[1]==='resume'){
     if(call.phase==='ended')return twiml('<Hangup/>');
     if(c.transport==='media')return twiml(`<Redirect method="POST">${xml(c.origin+'/twilio/agent/'+call.id)}</Redirect>`);
     if(!['followup','message','schedule'].includes(call.phase))return twiml('<Hangup/>');
     const sip=`${c.sipUri}?X-805-Call-Token=${encodeURIComponent(callToken(c,call))}`;
     return twiml(`<Dial action="${xml(c.origin+'/twilio/continue/'+call.id)}" method="POST"><Sip>${xml(sip)}</Sip></Dial>`);
    }
    if(parts[1]==='continue') {
     const mail=()=>voicemailXml(c.origin,`/twilio/recording/${call.id}`,`/twilio/transcription/${call.id}`,c);
     if(call.phase==='ended')return twiml('<Hangup/>');
     if(call.phase==='voicemail'||(call.phase==='message'&&call.mediaFailed))return mail();
     if(['offering','handoff','human','held'].includes(call.phase))return conferenceXml(c,call,'main');
     if(call.phase==='greeting'||call.phase==='followup'){const before=call.phase;const next=e.agentDown(call.id,eventId);if(before!=='voicemail'&&next.phase==='voicemail')downId=next.id;return mail();}
     if(call.phase==='message'&&!call.mediaStreamSid){e.mediaAttachFailed(call.id,'Media stream did not attach',eventId);return mail();}
     e.failed(call.id,'AI SIP call ended',eventId);for(const effect of s.list('effect'))if(effect.callId===call.id&&effect.type==='fallback'&&effect.status==='pending')s.put('effect',{...effect,status:'done',reason:'Fallback returned directly in TwiML'});return mail();
    }
    throw new Conflict('Unknown callback');
   });
   if(response&&response.callback){try{await saveCallback(client,response.callback);}catch(error){const failure=reportFailure('crm-callback',error);await logFailure(client,'crm_write_failed',null,failure.message).catch(logError=>reportFailure('failure-log',logError));}queue();return xmlResponse(twiml(''));}
   if(downId)waitUntil(logFailure(client,'agent_down',downId,'The voice agent disconnected.').catch(error=>reportFailure('failure-log',error)));
   queue();return xmlResponse(response);
  } catch(error) {if(!(error instanceof Conflict)){const failure=reportFailure('handler',error);waitUntil(logFailure(client,'webhook_error',null,failure.message).catch(logError=>reportFailure('failure-log',logError)));}return json({error:error instanceof Conflict?error.message:'805 phone operation unavailable'},error instanceof Conflict?409:503);}
 };
}
function callbackFields(p, transcript, call, message) {
 const read=key=>typeof p?.get==='function'?p.get(key)||'':'';
 return {
  p_call_sid:read('CallSid')||call?.sid,
  p_caller_name:message?.name||'',
  p_callback_number:message?.callback||read('From')||call?.from||'',
  p_reason:message?.reason||message?.message||(read('RecordingUrl')?'Voicemail recording':''),
  p_transcript:transcript||message?.transcript||'',
  p_recording_url:read('RecordingUrl'),
  p_call_time:call?.createdAt?new Date(call.createdAt).toISOString():new Date().toISOString(),
  p_phone:call?.from||read('From')||'',
  p_status:'needs_callback',
  p_appointment_id:null,
 };
}
