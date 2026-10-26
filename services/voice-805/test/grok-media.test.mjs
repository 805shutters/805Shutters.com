import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_RESERVE_MS, FORCE_DEADLINE_MS, GrokMediaSession, HOST_WALL_MS, INPUT_TRANSCRIPTION, MEDIA_SESSION_MS, TURN_SETTLE_MS, pcmByteLength, playbackWaitMs, STATE_BOUND_MS } from '../grok-media.mjs';
import { COMMON_GREETING } from '../caller-context.mjs';
import { MESSAGE_WINDOW_MS } from '../engine.mjs';
import { SnapshotStore } from '../supabase-store.mjs';
import { Engine } from '../engine.mjs';
import { callerContext } from '../caller-context.mjs';
import { RECEPTIONIST_OPENING, RECEPTIONIST_PROMPT, spokenDecision } from '../receptionist.mjs';
import { fallback } from '../fallback.mjs';
import { loadSupabaseConfig, supabaseReadiness } from '../supabase-config.mjs';
import { createSupabaseHandler } from '../supabase-handler.mjs';
import { promptPublicPath } from '../prompts.mjs';
import { hmac } from '../security.mjs';
class Socket {readyState=1;sent=[];send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;this.onclose?.();}}
function fixture(match='unmatched') {
 const c={...loadSupabaseConfig({}),transport:'media',xaiKey:'fake-test-key',mode:'live',liveAuthorized:true,agentReviewed:true,agentContractVerified:true,workerVerified:true,
  origin:'https://example.supabase.co/functions/v1/voice-805',accountSid:'AC'+'a'.repeat(32),authToken:'t'.repeat(32),number:'+18055550100',
  controlKey:'c'.repeat(32),toolsKey:'k'.repeat(32),workerKey:'w'.repeat(32),hours:Object.fromEntries(Array.from({length:7},(_,i)=>[i,[[0,1440]]])),holidays:{},
  staff:{mike:{kind:'cell',destination:'+18055550101'},jessica:{kind:'cell',destination:'+18055550102'}}};
 const store=new SnapshotStore(), engine=new Engine(store,c);const call=engine.inbound('CA'+'1'.repeat(32),'+18055550199');
 store.put('call',{...call,phase:'message',deadline:Date.now()+300000,context:callerContext({match,first_name:'Alex',statuses:['ordered']})});
 const state={config:c,transact:async fn=>fn(engine,store),readCall:async id=>store.get('call',id)};const socket=new Socket(),ai=new Socket();
 let drains=0;const worker={drain:async()=>{drains++;}};
 const timers=[];const clock={now:()=>new Date('2026-10-20T18:00:00Z'),setTimeout:(fn,ms)=>{const timer={fn,ms,cleared:false,id:timers.length+1};timers.push(timer);return timer.id;},clearTimeout:id=>{const timer=timers.find(item=>item.id===id);if(timer)timer.cleared=true;}};
 const session=new GrokMediaSession({socket,call,state,worker,connect:()=>ai,clock,saveCrm:async()=>({verified:true,id:'callback-1',call_sid:call.sid})});
 const streamSid='MZ'+'2'.repeat(32);
 const start={event:'start',start:{accountSid:c.accountSid,callSid:call.sid,streamSid,mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}};
 const grok=async e=>session.enqueue(()=>session.grok(e));
 const carrier=async e=>session.enqueue(()=>session.carrier(e));
 const mark=async()=>carrier({event:'mark',streamSid,mark:socket.sent.findLast(x=>x.event==='mark').mark});
 const audio=async(id='r1')=>{await grok({type:'response.created',response:{id}});await grok({type:'response.output_audio.delta',response_id:id,delta:'YWJj'});await grok({type:'response.output_audio_transcript.done',response_id:id,transcript:session.prompt?.text});await grok({type:'response.done',response:{id,status:'completed'}});};
 const begin=async()=>{await carrier(start);ai.onopen();await session.chain;await grok({type:'session.updated'});};
 const say=async(text,id='turn-'+text)=>grok({type:'conversation.item.input_audio_transcription.completed',transcript:text,item_id:id});
 return {c,call,state,store,engine,socket,ai,session,streamSid,start,grok,carrier,mark,audio,begin,say,timers,worker,get drains(){return drains;}};
}

function lastLine(f){return [...f.ai.sent].reverse().find(item=>item.item?.content?.[0]?.text)?.item.content[0].text||'';}
async function ready(f){await f.begin();await f.audio();await f.mark();assert.equal(f.session.stage,'collect');}
async function speak(f,text){const id='spoken-'+Math.random();await f.say(text,id);if(['result','readback'].includes(f.session.stage)){await f.audio(id);await f.mark();}}
async function messageMode(f){await ready(f);await speak(f,'yes');assert.match(lastLine(f),/What message/);await speak(f,'Please call me about my shutters');assert.match(lastLine(f),/name/);await f.say('Test Caller','name');assert.equal(f.session.stage,'readback');}
function openPlayback(f,ms){return f.timers.filter(timer=>timer.ms===ms&&!timer.cleared).at(-1);}

test('spoken yes and no are classified without trusting a model boolean',()=>{
 assert.equal(spokenDecision('Yes'),'affirmative');assert.equal(spokenDecision("that's correct"),'affirmative');
 assert.equal(spokenDecision('no'),'negative');assert.equal(spokenDecision('yes but change the time'),'negative');
 assert.equal(spokenDecision(''),'silence');assert.equal(spokenDecision('maybe'),'ambiguous');assert.equal(spokenDecision('confirmed true'),'ambiguous');
});

test('a yes before the played readback does not book, and the same yes after the mark still does not',async()=>{
 const f=fixture();await messageMode(f);await f.audio('readback');
 assert.equal(f.session.stage,'readback-playback');
 await f.say('yes','early-yes');
 assert.equal(f.store.list('message').length,0);
 await f.mark();
 await f.say('yes','early-yes');
 assert.equal(f.store.list('message').length,0);
 assert.equal(f.store.get('call',f.call.id).booking,undefined);
 assert.equal(f.store.get('call',f.call.id).intent?.confirmedAt,undefined);
 f.session.finish();
});

test('wrong account, call, format and reused start cannot attach',async()=>{
 for(const field of ['accountSid','callSid','mediaFormat']){const f=fixture();const start=structuredClone(f.start);start.start[field]=field==='mediaFormat'?{encoding:'bad',sampleRate:8000,channels:1}:'bad';await f.carrier(start);assert.equal(f.session.closed,true);assert.equal(f.store.get('call',f.call.id).mediaStreamSid,undefined);}
 const f=fixture();await f.begin();const other=new GrokMediaSession({socket:new Socket(),call:f.call,state:f.state,worker:f.worker,connect:()=>new Socket(),clock:{setTimeout:()=>1,clearTimeout:()=>{}}});await other.carrier(f.start);assert.equal(other.closed,true);f.session.finish();
});

test('missing audio and the worker deadline fall back without confirmation',async()=>{
 const f=fixture();await f.begin();await f.grok({type:'response.created',response:{id:'silent'}});await f.grok({type:'response.output_audio_transcript.done',response_id:'silent',transcript:lastLine(f)});await f.grok({type:'response.done',response:{id:'silent',status:'completed'}});assert.equal(f.session.closed,true);assert.equal(f.store.get('call',f.call.id).mediaFailed,true);
 const g=fixture();await g.begin();const limit=g.timers.find(timer=>timer.ms===MEDIA_SESSION_MS);await limit.fn();await g.session.chain;assert.equal(g.session.closed,true);assert.equal(limit.cleared,true);assert.equal(g.drains,1);
 const expired=g.store.get('call',g.call.id);assert.equal(expired.mediaFailed,true);assert.equal(expired.bookingIntent,undefined);assert.equal(expired.booking,undefined);assert.equal(g.store.list('message').length,0);
 await limit.fn();await g.session.chain;assert.equal(g.drains,1);
 const stopped=fixture();await stopped.begin();await stopped.carrier({event:'stop',streamSid:stopped.streamSid});const ended=stopped.store.get('call',stopped.call.id);
 assert.equal(ended.phase,'ended');assert.equal(ended.bookingIntent,undefined);assert.equal(ended.booking,undefined);assert.equal(stopped.store.list('message').filter(item=>item.confirmed).length,0);stopped.session.finish();
});

test('media handshake upgrades before the call lookup and closes an ineligible socket',async()=>{
 const f=fixture();const gates=[];const upgraded={status:101};
 const handler=createSupabaseHandler({state:f.state,client:{},worker:f.worker,upgradeMedia:(_request,gate)=>{gates.push(gate);return upgraded;}});const path='/twilio/media/'+f.call.id;
 const signed=(signature=hmac(f.c.authToken,f.c.origin+path,'sha1'),suffix='')=>new Request('http://runtime/voice-805'+path+suffix,{headers:{upgrade:'websocket','x-twilio-signature':signature}});
 assert.equal((await handler(signed('bad'))).status,401);assert.equal((await handler(signed(undefined,'?foo=1'))).status,400);
 const wss=f.c.origin.replace(/^https:/,'wss:')+path;
 assert.equal((await handler(signed(hmac(f.c.authToken,wss,'sha1')))).status,101);
 assert.equal((await handler(signed(hmac(f.c.authToken,`${wss}/`,'sha1')))).status,101);
 const rewritten=new Request(`https://example.supabase.co/voice-805${path}`,{headers:{upgrade:'websocket','x-twilio-signature':hmac(f.c.authToken,wss,'sha1')}});
 assert.equal((await handler(rewritten)).status,101);
 assert.equal((await handler(signed(hmac(f.c.authToken,`http://example.supabase.co/functions/v1/voice-805${path}`,'sha1')))).status,401);
 assert.equal((await handler(signed(hmac(f.c.authToken,`wss://example.supabase.co/voice-805${path}`,'sha1')))).status,401);
 assert.equal((await handler(signed(hmac(f.c.authToken,wss.replace(f.call.id,'00000000-0000-4000-8000-000000000000'),'sha1')))).status,401);
 assert.equal((await handler(new Request(`http://runtime/voice-805${path}`,{headers:{upgrade:'websocket'}}))).status,401);
 const blocked=new Promise(()=>{});
 const original=f.state.transact.bind(f.state);
 f.state.transact=()=>blocked;
 const waiting=createSupabaseHandler({state:f.state,client:{},worker:f.worker,upgradeMedia:()=>upgraded});
 const raced=Promise.race([waiting(signed()),new Promise(resolve=>setTimeout(()=>resolve({status:'blocked'}),30))]);
 assert.equal((await raced).status,101);
 f.state.transact=original;
 assert.equal((await handler(signed())).status,101);assert.equal(gates[0].eligible(f.store.get('call',f.call.id)),true);
 await f.begin();assert.equal((await handler(signed())).status,101);assert.equal(gates[1].eligible(await gates[1].load()),false);
 const closed=[];const socket={readyState:1,onmessage:null,close(code,reason){this.readyState=3;closed.push({code,reason});}};
 const {attachMediaSocket}=await import('../supabase-handler.mjs');
 await attachMediaSocket(socket,{load:async()=>f.call,eligible:()=>false,start(){throw new Error('started');}});
 assert.deepEqual(closed,[{code:1008,reason:'unavailable'}]);
 const replayed=[];const open={readyState:1,onmessage:null,close(){}};
 await attachMediaSocket(open,{load:async()=>f.call,eligible:()=>true,start(){open.onmessage=event=>replayed.push(event.data);}});
 assert.deepEqual(replayed,[]);
 f.session.finish();
});

test('carrier greeting starts both offers and a second greeting callback does not dial again',async()=>{
 const f=fixture('matched');f.store.put('call',{...f.store.get('call',f.call.id),phase:'greeting'});
 const tasks=[];const handler=createSupabaseHandler({state:f.state,client:{rpc:async()=>({data:{match:'matched'}})},worker:f.worker,waitUntil:p=>tasks.push(p)});
 const request=path=>{const p=new URLSearchParams({AccountSid:f.c.accountSid,CallSid:f.call.sid,To:f.c.number,From:f.call.from});const sig=hmac(f.c.authToken,f.c.origin+path+[...p.keys()].sort().map(k=>k+p.get(k)).join(''),'sha1');return new Request(f.c.origin+path,{method:'POST',headers:{'x-twilio-signature':sig,'content-type':'application/x-www-form-urlencoded'},body:p});};
 const response=await handler(request('/twilio/inbound'));assert.equal(response.status,200);const xml=await response.text();assert.match(xml,/<Connect><Stream /);assert(!xml.includes('<Say>'));assert(!xml.includes('Gather'));assert(!xml.includes('ringback'));
 assert.equal(f.store.get('call',f.call.id).phase,'offering');assert.equal(f.store.get('call',f.call.id).greetingPlayed,false);assert.equal(f.store.list('effect').filter(e=>e.type==='dial').length,2);assert.equal(f.store.list('effect').some(e=>e.type==='ringback'),false);
 const finished=await handler(request('/twilio/greeted/'+f.call.id));assert.equal(finished.status,200);assert.match(await finished.text(),/Conference/);assert.equal(f.store.get('call',f.call.id).greetingPlayed,true);
 assert.equal((await handler(request('/twilio/greeted/'+f.call.id))).status,200);
 assert.equal(f.store.get('call',f.call.id).phase,'offering');assert.equal(f.store.list('effect').filter(e=>e.type==='dial').length,2);await Promise.all(tasks);f.session.finish();
});

test('media readiness needs the Grok key, and an invalid transport fails closed',()=>{
 const f=fixture();assert.equal(supabaseReadiness(f.c).ready,true);assert.equal(supabaseReadiness({...f.c,xaiKey:''}).ready,false);assert.equal(supabaseReadiness({...f.c,transport:'invalid'}).ready,false);f.session.finish();
});

test('allowlisted pilot can test audio without declaring production ready',()=>{
 const f=fixture();Object.assign(f.c,{mode:'pilot',liveAuthorized:false,agentContractVerified:false,pilotAuthorized:true,pilotCallers:['+18055550199'],dataset:'pilot'});
 const readiness=supabaseReadiness(f.c);assert.equal(readiness.ready,false);assert.equal(readiness.pilotReady,true);
 for(const patch of [{pilotAuthorized:false},{pilotCallers:[]},{pilotCallers:['garbage']},{dataset:'production'},{transport:'sip'},{notificationsApproved:true},{workerVerified:false},{xaiKey:''}])assert.equal(supabaseReadiness({...f.c,...patch}).pilotReady,false);
 f.session.finish();
});

test('pilot rejects a non-allowlisted caller before creating another call',async()=>{
 const f=fixture();Object.assign(f.c,{mode:'pilot',liveAuthorized:false,agentContractVerified:false,pilotAuthorized:true,pilotCallers:['+18055550198'],dataset:'pilot'});
 const handler=createSupabaseHandler({state:f.state,client:{},worker:f.worker});const path='/twilio/inbound';
 const p=new URLSearchParams({AccountSid:f.c.accountSid,CallSid:'CA'+'3'.repeat(32),To:f.c.number,From:'+18055550199'});
 const sig=hmac(f.c.authToken,f.c.origin+path+[...p.keys()].sort().map(k=>k+p.get(k)).join(''),'sha1');
 const response=await handler(new Request(f.c.origin+path,{method:'POST',headers:{'x-twilio-signature':sig,'content-type':'application/x-www-form-urlencoded'},body:p}));
 const denied=await response.text();assert.equal(response.status,200);assert.match(denied,/<Say>This test line is not available\.<\/Say><Hangup\/>/);assert.equal(f.store.list('call').length,1);
 const wav=Uint8Array.from([0x52,0x49,0x46,0x46,0x24,0x00,0x00,0x00,0x57,0x41,0x56,0x45,0x66,0x6d,0x74,0x20,0x10,0x00,0x00,0x00,0x07,0x00,0x01,0x00,0x40,0x1f,0x00,0x00,0x40,0x1f,0x00,0x00,0x01,0x00,0x08,0x00,0x64,0x61,0x74,0x61,0x00,0x00,0x00,0x00]);
 f.c.promptAudio={unavailable:wav};const againBody=new URLSearchParams({AccountSid:f.c.accountSid,CallSid:'CA'+'4'.repeat(32),To:f.c.number,From:'+18055550197'});
 const againSig=hmac(f.c.authToken,f.c.origin+path+[...againBody.keys()].sort().map(k=>k+againBody.get(k)).join(''),'sha1');
 const played=await handler(new Request(f.c.origin+path,{method:'POST',headers:{'x-twilio-signature':againSig,'content-type':'application/x-www-form-urlencoded'},body:againBody}));
 const playedXml=await played.text();assert.match(playedXml,new RegExp(`<Play>[^<]+${promptPublicPath('unavailable')}</Play><Hangup/>`));assert.doesNotMatch(playedXml,/<Say>/);assert.equal(f.store.list('call').length,1);f.session.finish();
});

test('pilot carrier allows staff offers but blocks customer callbacks and SMS',async()=>{
 const {TwilioProvider}=await import('../provider.mjs');const f=fixture();Object.assign(f.c,{mode:'pilot',liveAuthorized:false,pilotAuthorized:true});let requests=0;
 const provider=new TwilioProvider(f.c,async()=>{requests++;return new Response(JSON.stringify({sid:'CA'+'4'.repeat(32)}));});
 await provider.dial(f.call,{id:'offer',staff:'mike'});assert.equal(requests,1);
 assert.throws(()=>provider.dialCustomer(f.call),/disabled during pilot/);assert.throws(()=>provider.send({},{}),/disabled during pilot/);assert.equal(requests,1);f.session.finish();
});

test('pilot staff controls cannot start a customer callback or send a text',async()=>{
 const f=fixture();Object.assign(f.c,{mode:'pilot',liveAuthorized:false,agentContractVerified:false,pilotAuthorized:true,pilotCallers:['+18055550199'],dataset:'pilot'});
 const handler=createSupabaseHandler({state:f.state,client:{},worker:f.worker});
 for(const action of ['callback','text']){
  const path='/control/messages/abc/'+action,at=String(Date.now()),nonce='pilot-request-'+action,body='{}';
  const response=await handler(new Request(f.c.origin+path,{method:'POST',headers:{'x-805-actor':'mike','x-805-time':at,'x-805-nonce':nonce,'x-805-signature':hmac(f.c.controlKey,`POST\n${path}\n${at}\n${nonce}\nmike\n${body}`)},body}));
  assert.equal(response.status,409);assert.match((await response.json()).error,/Outbound contact is disabled/);
 }
 f.session.finish();
});

test('scripted audio is released only after exact text and complete audio are verified',async()=>{
 const f=fixture();await ready(f);await f.say('Thursday');
 const before=f.socket.sent.filter(x=>x.event==='media').length;
 await f.grok({type:'response.created',response:{id:'forced'}});
 await f.grok({type:'response.output_audio.delta',response_id:'forced',delta:'Rk9SQ0U'});
 assert.equal(f.socket.sent.filter(x=>x.event==='media').length,before);
 await f.grok({type:'response.output_audio_transcript.done',response_id:'forced',transcript:lastLine(f)});
 assert.equal(f.socket.sent.filter(x=>x.event==='media').length,before);
 await f.grok({type:'response.done',response:{id:'forced',status:'completed'}});
 assert.equal(f.session.stage,'result-playback');assert.equal(f.session.prompt.responseId,'forced');
 assert.equal(f.socket.sent.filter(x=>x.event==='media').length,before+1);f.session.finish();
});

test('missing, mismatched and cancelled output never arms readback or a booking',async()=>{
 for(const kind of ['missing','mismatch','cancelled']){
  const f=fixture();await messageMode(f);const before=f.socket.sent.filter(x=>x.event==='media').length;
  await f.grok({type:'response.created',response:{id:kind}});
  await f.grok({type:'response.output_audio.delta',response_id:kind,delta:'QkFE'});
  if(kind!=='missing')await f.grok({type:'response.output_audio_transcript.done',response_id:kind,transcript:kind==='mismatch'?'silent':lastLine(f)});
  await f.grok({type:'response.done',response:{id:kind,status:kind==='cancelled'?'cancelled':'completed'}});
  assert.equal(f.socket.sent.filter(x=>x.event==='media').length,before);
  assert.equal(f.session.stage,'readback');assert.equal(f.store.get('call',f.call.id).intent.playedAt,undefined);
  await f.say('yes','unsafe-yes');assert.equal(f.store.list('message').length,0);
  await openPlayback(f,FORCE_DEADLINE_MS).fn();await f.session.chain;
  assert.equal(f.session.closed,true);assert.equal(f.store.list('message').length,0);
 }
});

test('startup speaks the welcome when the claim write lands but its response stays open', async () => {
 const f = fixture();
 f.store.put('call', { ...f.store.get('call', f.call.id), phase: 'offering', listeningWelcome: true, greetingPlayed: false, deadline: Date.now() + 20000 });
 const original = f.state.transact.bind(f.state);
 let release = () => {};
 f.state.transact = async fn => {
  const value = await original(fn);
  if (f.store.get('call', f.call.id).mediaStreamSid) return new Promise(resolve => { release = () => resolve(value); });
  return value;
 };
 f.state.readCall = async () => f.store.get('call', f.call.id);
 const pending = f.carrier(f.start);
 for (let i = 0; i < 20 && !f.timers.some(timer => !timer.cleared && timer.ms === STATE_BOUND_MS); i++) await new Promise(resolve => setImmediate(resolve));
 const bound = f.timers.find(timer => !timer.cleared && timer.ms === STATE_BOUND_MS);
 assert.equal(typeof bound?.fn, 'function');
 await bound.fn();
 await pending;
 assert.equal(f.session.closed, false);
 assert.equal(f.session.streamSid, f.streamSid);
 assert.equal(f.store.get('call', f.call.id).mediaStreamSid, f.streamSid);
 f.ai.onopen();
 await f.session.chain;
 await f.grok({ type: 'session.updated' });
 assert.equal(f.ai.sent.at(-1).item.content[0].text, COMMON_GREETING);
 assert.equal(f.session.stage, 'welcome');
 assert.equal(f.session.closed, false);
 release();
 f.session.finish();
});

test('a startup read that does not return still speaks from the attached call', async () => {
 const f = fixture();
 Object.assign(f.call, { phase: 'offering', owner: null, listeningWelcome: true });
 f.store.put('call', { ...f.store.get('call', f.call.id), phase: 'offering', listeningWelcome: true, greetingPlayed: false, deadline: Date.now() + 20000 });
 await f.carrier(f.start);
 f.state.readCall = () => new Promise(() => {});
 f.ai.onopen();
 await f.session.chain;
 const pending = f.grok({ type: 'session.updated' });
 for (let i = 0; i < 20 && !f.timers.some(timer => !timer.cleared && timer.ms === STATE_BOUND_MS); i++) await new Promise(resolve => setImmediate(resolve));
 const bound = f.timers.filter(timer => !timer.cleared && timer.ms === STATE_BOUND_MS).at(-1);
 assert.equal(typeof bound?.fn, 'function');
 await bound.fn();
 await pending;
 assert.equal(f.session.closed, false);
 assert.equal(f.session.stage, 'welcome');
 assert.equal(f.ai.sent.at(-1).item.content[0].text, COMMON_GREETING);
 f.session.finish();
});

test('a rejected startup read closes and a late continuation cannot speak or book', async () => {
 const f = fixture();
 f.store.put('call', { ...f.store.get('call', f.call.id), phase: 'offering', listeningWelcome: true, greetingPlayed: false, deadline: Date.now() + 20000 });
 Object.assign(f.call, { phase: 'offering', owner: null, listeningWelcome: true });
 await f.carrier(f.start);
 let rejectRead = () => {};
 f.state.readCall = () => new Promise((_resolve, reject) => { rejectRead = () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })); });
 f.ai.onopen();
 await f.session.chain;
 const pending = f.grok({ type: 'session.updated' });
 for (let i = 0; i < 20 && !f.timers.some(timer => !timer.cleared && timer.ms === STATE_BOUND_MS); i++) await new Promise(resolve => setImmediate(resolve));
 const bound = f.timers.filter(timer => !timer.cleared && timer.ms === STATE_BOUND_MS).at(-1);
 assert.equal(typeof bound?.fn, 'function');
 assert.equal(f.timers.find(timer => timer.ms === 10000).cleared, true);
 assert.equal(f.session.closed, false);
 rejectRead();
 await pending;
 assert.equal(f.session.closed, true);
 assert.equal(f.timers.find(timer => timer.ms === MEDIA_SESSION_MS).cleared, true);
 assert.equal(bound.cleared, true);
 assert.equal(f.store.get('call', f.call.id).recovery, 'Startup call read failed');
 assert.equal(f.store.get('call', f.call.id).mediaFailed, true);
 assert.equal(f.store.list('effect').some(item => item.type === 'fallback'), true);
 assert.equal(f.ai.sent.some(item => item.item?.type === 'force_message'), false);
 assert.equal(f.store.get('call', f.call.id).booking, undefined);
 await f.grok({ type: 'session.updated' });
 await f.session.chain;
 assert.equal(f.session.closed, true);
 assert.equal(f.ai.sent.some(item => item.item?.type === 'force_message'), false);
 assert.equal(f.store.get('call', f.call.id).booking, undefined);
});

test('a claim confirmation that arrives after close does not connect', async () => {
 const f = fixture();
 f.store.put('call', { ...f.store.get('call', f.call.id), phase: 'offering', listeningWelcome: true, greetingPlayed: false, deadline: Date.now() + 20000 });
 const original = f.state.transact.bind(f.state);
 f.state.transact = async fn => {
  const value = await original(fn);
  if (f.store.get('call', f.call.id).mediaStreamSid) return new Promise(() => {});
  return value;
 };
 let releaseRead = () => {};
 f.state.readCall = () => new Promise(resolve => { releaseRead = () => resolve(f.store.get('call', f.call.id)); });
 let connections = 0;
 f.session.connect = () => { connections += 1; return f.ai; };
 const pending = f.carrier(f.start);
 for (let i = 0; i < 20 && !f.timers.some(timer => !timer.cleared && timer.ms === STATE_BOUND_MS); i++) await new Promise(resolve => setImmediate(resolve));
 await f.timers.find(timer => !timer.cleared && timer.ms === STATE_BOUND_MS).fn();
 for (let i = 0; i < 20 && !f.timers.some(timer => !timer.cleared && timer.ms === STATE_BOUND_MS); i++) await new Promise(resolve => setImmediate(resolve));
 const startTimer = f.timers.find(timer => !timer.cleared && timer.ms === 10000);
 assert.equal(typeof startTimer?.fn, 'function');
 await startTimer.fn();
 assert.equal(f.session.closed, true);
 releaseRead();
 await pending;
 assert.equal(connections, 0);
 assert.equal(f.session.streamSid, null);
 assert.equal(f.ai.sent.some(item => item.item?.type === 'force_message'), false);
});

test('startup does not speak when the call is already owned, ended, or in handoff', async () => {
 for (const phase of ['handoff', 'ended', 'human']) {
  const f = fixture();
  f.store.put('call', { ...f.store.get('call', f.call.id), phase: 'offering', listeningWelcome: true, greetingPlayed: false, deadline: Date.now() + 20000 });
  await f.carrier(f.start);
  f.store.put('call', { ...f.store.get('call', f.call.id), phase, owner: phase === 'ended' ? null : 'mike' });
  f.ai.onopen();
  await f.session.chain;
  await f.grok({ type: 'session.updated' });
  assert.equal(f.ai.sent.some(item => item.item?.type === 'force_message'), false);
  assert.equal(f.session.closed, true);
 }
});

test('a read timeout after staff takeover does not speak the apology', async () => {
 const f = fixture();
 f.store.put('call', { ...f.store.get('call', f.call.id), phase: 'offering', listeningWelcome: true, greetingPlayed: false, deadline: Date.now() + 20000 });
 await f.begin();
 await f.audio('welcome');
 await f.mark();
 assert.equal(f.session.stage, 'collect');
 f.store.put('call', { ...f.store.get('call', f.call.id), phase: 'handoff', owner: 'mike' });
 Object.assign(f.call, { phase: 'offering', owner: null, deadline: Date.now() - 1 });
 f.state.readCall = () => new Promise(() => {});
 const before = f.ai.sent.filter(item => item.item?.content?.[0]?.text === RECEPTIONIST_OPENING).length;
 const pending = f.session.offerWatch();
 for (let i = 0; i < 20 && !f.timers.some(timer => !timer.cleared && timer.ms === STATE_BOUND_MS); i++) await new Promise(resolve => setImmediate(resolve));
 const bound = f.timers.filter(timer => !timer.cleared && timer.ms === STATE_BOUND_MS).at(-1);
 assert.equal(typeof bound?.fn, 'function');
 await bound.fn();
 await pending;
 assert.equal(f.ai.sent.filter(item => item.item?.content?.[0]?.text === RECEPTIONIST_OPENING).length, before);
 assert.notEqual(f.session.stage, 'opening');
 assert.equal(f.store.get('call', f.call.id).booking, undefined);
 assert.equal(f.store.list('effect').some(item => item.type === 'fallback'), false);
 f.session.finish();
});

test('a known missing call closes without reusing the attached call or falling back', async () => {
 const f = fixture();
 await f.begin();
 Object.assign(f.call, { phase: 'message', owner: null, deadline: Date.now() - 1 });
 f.state.readCall = async () => null;
 const before = f.ai.sent.filter(item => item.item?.content?.[0]?.text === RECEPTIONIST_OPENING).length;
 const call = await f.session.current();
 assert.equal(call, null);
 assert.equal(f.session.closed, true);
 assert.equal(f.ai.sent.filter(item => item.item?.content?.[0]?.text === RECEPTIONIST_OPENING).length, before);
 assert.equal(f.store.list('effect').some(item => item.type === 'fallback'), false);
 assert.equal(f.store.get('call', f.call.id).booking, undefined);
});

test('a read error closes without waiting for the media limit', async () => {
 const f = fixture();
 await ready(f);
 f.state.readCall = async () => { throw new Error('read down'); };
 const before = f.ai.sent.filter(item => item.item?.content?.[0]?.text === RECEPTIONIST_OPENING).length;
 const pending = f.session.offerWatch();
 await pending;
 assert.equal(f.session.closed, true);
 assert.equal(f.timers.find(timer => timer.ms === MEDIA_SESSION_MS).cleared, true);
 assert.equal(f.store.get('call', f.call.id).recovery, 'Call read failed');
 assert.equal(f.store.get('call', f.call.id).mediaFailed, true);
 assert.equal(f.ai.sent.filter(item => item.item?.content?.[0]?.text === RECEPTIONIST_OPENING).length, before);
 assert.equal(f.store.get('call', f.call.id).booking, undefined);
});

test('exact message-only opening, no scheduling tools, and caller-ID reuse',async()=>{
 const f=fixture();await ready(f);
 assert.equal(RECEPTIONIST_OPENING,"I'm sorry, our team members are tied up at the moment. May I please take a message and we'll get back to you as soon as possible.");
 assert.doesNotMatch(COMMON_GREETING,/help you schedule|book an appointment/i);
 assert.equal(f.ai.sent.filter(e=>e.type==='session.update').every(e=>(e.session.tools||[]).length===0),true);
 await speak(f,'yes');assert.match(lastLine(f),/What message/);await speak(f,'Please call about my shutters');assert.match(lastLine(f),/name/);
 await f.say('Pat Example');assert.equal(f.session.stage,'readback');assert.match(lastLine(f),/1 8 0 5 5 5 5 0 1 9 9/);
 assert.doesNotMatch(f.ai.sent.map(x=>x.item?.content?.[0]?.text||'').join(' '),/What phone|What day|What time|address/);
 f.session.finish();
});
test('permission decline ends politely without message, booking, notification or recording',async()=>{
 const f=fixture();await ready(f);await speak(f,'No thank you');assert.equal(f.session.closed,true);
 assert.equal(f.store.get('call',f.call.id).phase,'ended');assert.equal(f.store.list('message').length,0);assert.equal(f.store.list('notification').length,0);
 assert.equal(f.store.list('effect').some(x=>x.type==='record'),false);
});
test('verified message persists once, keeps transcript/summary, and prepares only gated staff notices',async()=>{
 const f=fixture();let writes=0;f.session.saveCrm=async()=>{writes++;return {verified:true,id:'row',call_sid:f.call.sid};};
 await messageMode(f);await f.audio('readback');await f.mark();await f.say('yes','final');await f.say('yes','final');
 const message=f.store.list('message')[0];assert.equal(writes,1);assert.equal(message.confirmed,true);assert.equal(message.crmVerified,true);
 assert.deepEqual(f.store.list('notification').map(n=>n.recipient).sort(),['jessica','mike']);assert.equal(f.store.list('notification').every(n=>n.status==='pending'&&n.purpose==='transcript'),true);
 assert.match(lastLine(f),/message has been saved/);await f.audio('saved');await f.mark();
 const c=f.store.get('call',f.call.id);assert.equal(c.phase,'ended');assert.equal(c.summary.outcome,'message');assert.match(c.summary.text,/shutters/);assert.equal(c.callerTranscript.at(-1).text,'yes');
 assert.equal(c.booking,undefined);assert.equal(c.bookingIntent,undefined);
});
test('volunteered name, number and long message survive readback without repeated field questions',async()=>{
 const f=fixture();await ready(f);const text='This is Pat Example. Call me at 8055550123. '+('The living room shade needs service and the upstairs shutter needs a new handle. ').repeat(8);
 await f.say(text);assert.equal(f.session.stage,'readback');const s=f.store.get('call',f.call.id).schedule;
 assert.equal(s.name,'Pat Example');assert.equal(s.phone,'+18055550123');assert.equal(s.messageText,('The living room shade needs service and the upstairs shutter needs a new handle. ').repeat(8).trim());assert.ok(lastLine(f).includes(s.messageText));assert.equal(f.store.get('call',f.call.id).callerTranscript.at(-1).text,text.trim());
 f.session.finish();
});
test('blocked caller gets one callback question and spoken digits are repeated in readback',async()=>{
 const f=fixture();f.store.put('call',{...f.store.get('call',f.call.id),from:'anonymous'});await ready(f);
 for(const text of ['yes','Please call me about shades','Pat Example'])await speak(f,text);
 assert.equal(f.store.get('call',f.call.id).schedule.awaiting,'phone');await f.say('eight zero five five five five zero one two three');
 assert.equal(f.store.get('call',f.call.id).schedule.phone,'+18055550123');assert.equal(f.session.stage,'readback');f.session.finish();
});
test('corrections replace message and callback and require a new played readback',async()=>{
 const f=fixture();await messageMode(f);await f.audio('old');await f.mark();await f.say('Change the message to please call me about the kitchen blind');
 assert.equal(f.session.stage,'readback');assert.match(lastLine(f),/kitchen blind/);assert.equal(f.store.list('message').length,0);
 await f.audio('revised');await f.mark();await f.say('No, my number is 8055550123');
 assert.equal(f.session.stage,'readback');assert.match(lastLine(f),/1 8 0 5 5 5 5 0 1 2 3/);await f.audio('number');await f.mark();await f.say('yes');
 assert.equal(f.store.list('message')[0].callback,'+18055550123');assert.equal(f.store.list('message')[0].text,'please call me about the kitchen blind');f.session.finish();
});
test('appointment requests become callback messages and injected booking tools cannot act',async()=>{
 const f=fixture();let bookingCalls=0;f.session.schedule=async()=>{bookingCalls++;throw Error('not allowed');};await ready(f);
 await speak(f,'Please schedule an appointment Friday at ten at my house');assert.match(lastLine(f),/callback/);assert.match(lastLine(f),/name/);
 for(const name of ['find_appointments','prepare_appointment','commit','prepare_message'])await f.session.tool({name,arguments:'{}',call_id:name});
 assert.equal(bookingCalls,0);assert.equal(f.store.get('call',f.call.id).bookingIntent,undefined);
 await f.say('Pat Example');assert.equal(f.session.stage,'readback');assert.match(lastLine(f),/Please schedule an appointment Friday at ten at my house/);
 await f.audio('readback');await f.mark();await f.say('yes');assert.equal(f.store.list('message').length,1);assert.equal(bookingCalls,0);assert.equal(f.store.get('call',f.call.id).booking,undefined);f.session.finish();
});
test('CRM failure never claims save, retries idempotently, and retains durable retry work',async()=>{
 for(const succeeds of [false,true]){
  const f=fixture();let attempts=0;f.session.saveCrm=async()=>{attempts++;if(!succeeds||attempts===1)throw Error('database down');return {verified:true,id:'row',call_sid:f.call.sid};};
  await messageMode(f);await f.audio('readback');await f.mark();await f.say('yes');assert.equal(attempts,2);assert.equal(f.store.list('message').length,1);
  if(succeeds)assert.match(lastLine(f),/message has been saved/);else {assert.match(lastLine(f),/could not verify/);assert.doesNotMatch(lastLine(f),/has been saved/);assert.equal(f.store.list('effect').some(x=>x.type==='sync-message'&&x.status==='pending'),true);assert.doesNotMatch(fallback(f.engine,f.store.get('call',f.call.id),'voicemail',null,f.c),/written message is saved|<Record/);}
  f.session.finish();
 }
});
test('unclear replies and silence are bounded and never save without a yes',async()=>{
 for(const mode of ['unclear','silence']){
  const f=fixture();await ready(f);
  if(mode==='unclear'){await speak(f,'perhaps');await speak(f,'maybe');}else {await f.session.silence();await f.audio('retry');await f.mark();await f.session.silence();await f.audio('bye');await f.mark();}
  assert.equal(f.session.closed,true);assert.equal(f.store.list('message').length,0);
 }
 const f=fixture();await messageMode(f);await f.audio('readback');await f.mark();await f.session.silence();assert.equal(f.store.list('message').length,0);await f.audio('repeat');await f.mark();await f.session.silence();await f.audio('end');await f.mark();assert.equal(f.store.list('message').filter(m=>m.confirmed).length,0);
});
test('readback interruption waits for the full correction, never accepts an early yes',async()=>{
 const f=fixture();await messageMode(f);await f.audio('readback');await f.grok({type:'input_audio_buffer.speech_started',item_id:'change'});
 const before=f.ai.sent.length;await f.say('Change the message to','change');assert.equal(f.ai.sent.length,before);
 await f.grok({type:'input_audio_buffer.speech_stopped',item_id:'change'});await f.say('Change the message to call about the bedroom shade','change');await f.timers.findLast(t=>t.ms===TURN_SETTLE_MS&&!t.cleared).fn();await f.session.chain;
 assert.equal(f.session.stage,'readback');assert.match(lastLine(f),/bedroom shade/);assert.equal(f.store.list('message').length,0);f.session.finish();
});
test('caller speech prefixes, history, duplicates and stray generated speech do not lose message details',async()=>{
 for(const order of ['history-first','duplicate','vad-prefix','auto-first']){
  const f=fixture();await ready(f);await speak(f,'yes');
  if(order==='history-first')await f.grok({type:'conversation.item.added',item:{id:'body',role:'user',status:'completed',content:[{type:'input_audio',transcript:'wrong prefix'}]}});
  if(order==='vad-prefix'){await f.grok({type:'input_audio_buffer.speech_started',item_id:'body'});await f.say('My living','body');assert.equal(f.store.get('call',f.call.id).schedule.messageText,null);await f.grok({type:'input_audio_buffer.speech_stopped',item_id:'body'});}
  await f.say('My living room shade needs service','body');
  if(order==='vad-prefix'){await f.timers.findLast(t=>t.ms===TURN_SETTLE_MS&&!t.cleared).fn();await f.session.chain;}
  if(order==='duplicate')await f.say('My living room shade needs service','body');
  if(order==='auto-first'){await f.grok({type:'response.created',response:{id:'bad'}});await f.grok({type:'response.output_audio.delta',response_id:'bad',delta:'U0lMRU5U'});await f.grok({type:'response.output_audio_transcript.done',response_id:'bad',transcript:'silent'});await f.grok({type:'response.done',response:{id:'bad',status:'completed'}});assert.equal(f.socket.sent.some(x=>x.media?.payload==='U0lMRU5U'),false);}
  assert.match(lastLine(f),/name/);assert.equal(f.store.get('call',f.call.id).schedule.messageText,'My living room shade needs service');await f.audio('name');await f.mark();f.session.finish();
 }
});
test('hangup retains an unconfirmed transcript and a reconnect cannot duplicate the call stream',async()=>{
 const f=fixture();await ready(f);await speak(f,'Please call about my shutters');await f.carrier({event:'stop',streamSid:f.streamSid});
 const m=f.store.list('message')[0];assert.equal(m.confirmed,false);assert.equal(m.text,'Please call about my shutters');assert.equal(f.store.list('effect').some(x=>x.type==='sync-message'),true);
 const other=new GrokMediaSession({socket:new Socket(),call:f.call,state:f.state,worker:f.worker,connect:()=>new Socket(),clock:f.session.clock});await other.carrier(f.start);assert.equal(other.closed,true);assert.equal(f.store.list('message').length,1);
});
test('staff pickup interrupts the message question without saving or resuming the bot',async()=>{
 const f=fixture();await ready(f);await speak(f,'yes');f.store.put('call',{...f.store.get('call',f.call.id),owner:'mike',phase:'handoff'});await f.say('Please call me');assert.equal(f.store.list('message').length,0);assert.equal(f.store.get('call',f.call.id).owner,'mike');f.session.finish();
});

test('sentence pauses merge the complete message before the next question; late captions cannot repeat it',async()=>{
 const f=fixture();await ready(f);await speak(f,'yes');const before=f.ai.sent.filter(x=>x.item?.type==='force_message').length;
 for(const [id,text] of [['first','The bedroom shade is broken.'],['second','Please call after lunch.'],['third','I also need a replacement part.']]){
  await f.grok({type:'input_audio_buffer.speech_started',item_id:id});await f.say(text,id);await f.grok({type:'input_audio_buffer.speech_stopped',item_id:id});await f.say(text,id);
  assert.equal(f.ai.sent.filter(x=>x.item?.type==='force_message').length,before);
 }
 await f.timers.findLast(t=>t.ms===TURN_SETTLE_MS&&!t.cleared).fn();await f.session.chain;
 const expected='The bedroom shade is broken. Please call after lunch. I also need a replacement part.';
 assert.equal(f.store.get('call',f.call.id).schedule.messageText,expected);assert.match(lastLine(f),/name/);
 await f.say('Please call after lunch.','second');assert.equal(f.ai.sent.filter(x=>x.item?.type==='force_message').length,before+1);f.session.finish();
});
test('carrier hangup or socket failure retains captions still waiting for a natural pause',async()=>{
 for(const stop of [true,false]){
  const f=fixture();await ready(f);await speak(f,'yes');await f.grok({type:'input_audio_buffer.speech_started',item_id:'last'});await f.say('Please call about my broken shade.','last');
  if(stop)await f.carrier({event:'stop',streamSid:f.streamSid});else {await f.session.fail('Carrier connection closed');f.engine.ended(f.call.id,f.call.sid,'end');}
  assert.equal(f.store.list('message')[0].confirmed,false);assert.equal(f.store.list('message')[0].text,'Please call about my broken shade.');f.session.finish();
 }
});

test('cumulative final captions with different IDs produce one complete message',async()=>{
 const f=fixture();await ready(f);await speak(f,'yes');
 for(const [id,text] of [['one','The shade is broken.'],['two','The shade is broken. Please call after lunch.'],['three','The shade is broken. Please call after lunch. I need a part.']]){
  await f.grok({type:'input_audio_buffer.speech_started',item_id:id});await f.say(text,id);await f.grok({type:'input_audio_buffer.speech_stopped',item_id:id});
 }
 await f.timers.findLast(t=>t.ms===TURN_SETTLE_MS&&!t.cleared).fn();await f.session.chain;
 assert.equal(f.store.get('call',f.call.id).schedule.messageText,'The shade is broken. Please call after lunch. I need a part.');f.session.finish();
});
