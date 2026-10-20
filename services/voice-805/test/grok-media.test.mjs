import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_RESERVE_MS, FORCE_DEADLINE_MS, GrokMediaSession, HOST_WALL_MS, INPUT_TRANSCRIPTION, MEDIA_SESSION_MS, pcmByteLength, playbackWaitMs, STATE_BOUND_MS } from '../grok-media.mjs';
import { COMMON_GREETING } from '../caller-context.mjs';
import { MESSAGE_WINDOW_MS } from '../engine.mjs';
import { SnapshotStore } from '../supabase-store.mjs';
import { Engine } from '../engine.mjs';
import { callerContext } from '../caller-context.mjs';
import { RECEPTIONIST_OPENING, RECEPTIONIST_PROMPT, spokenDecision } from '../receptionist.mjs';
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
 const session=new GrokMediaSession({socket,call,state,worker,connect:()=>ai,clock});
 const streamSid='MZ'+'2'.repeat(32);
 const start={event:'start',start:{accountSid:c.accountSid,callSid:call.sid,streamSid,mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}};
 const grok=async e=>session.enqueue(()=>session.grok(e));
 const carrier=async e=>session.enqueue(()=>session.carrier(e));
 const mark=async()=>carrier({event:'mark',streamSid,mark:socket.sent.findLast(x=>x.event==='mark').mark});
 const audio=async(id='r1')=>{await grok({type:'response.created',response:{id}});await grok({type:'response.output_audio.delta',delta:'YWJj'});await grok({type:'response.done',response:{id,status:'completed'}});};
 const begin=async()=>{await carrier(start);ai.onopen();await session.chain;await grok({type:'session.updated'});};
 const say=async(text,id='turn-'+text)=>grok({type:'conversation.item.input_audio_transcription.completed',transcript:text,item_id:id});
 return {c,call,state,store,engine,socket,ai,session,streamSid,start,grok,carrier,mark,audio,begin,say,timers,worker,get drains(){return drains;}};
}
test('spoken yes and no are classified without trusting a model boolean',()=>{
 assert.equal(spokenDecision('Yes'),'affirmative');assert.equal(spokenDecision("that's correct"),'affirmative');
 assert.equal(spokenDecision('no'),'negative');assert.equal(spokenDecision('yes but change the time'),'negative');
 assert.equal(spokenDecision(''),'silence');assert.equal(spokenDecision('maybe'),'ambiguous');assert.equal(spokenDecision('confirmed true'),'ambiguous');
});
test('no-answer opening apologizes and offers a message or consultation',async()=>{
 const f=fixture();await f.begin();assert.equal(f.ai.sent[0].session.voice,'ara');assert.equal(f.ai.sent[0].session.audio.output.format.type,'audio/pcmu');
 assert.equal(f.ai.sent.at(-1).item.content[0].text,RECEPTIONIST_OPENING);
 assert.equal(RECEPTIONIST_OPENING,'Apologies, but team members are tied up at the moment. Would you like to leave a message for a callback, or would you like to schedule an appointment?');
 assert.match(RECEPTIONIST_PROMPT,/Do not demand an exact clock time/);assert.match(RECEPTIONIST_PROMPT,/one server-supplied scheduling line/);assert.match(RECEPTIONIST_PROMPT,/spoken yes/);assert.match(RECEPTIONIST_PROMPT,/booking is authorized/);
 assert.match(RECEPTIONIST_PROMPT,/currently open published CRM slot/);assert.match(RECEPTIONIST_PROMPT,/Never suggest or book a time that is not open on the CRM calendar/);
 assert.match(RECEPTIONIST_PROMPT,/Generally about one hour|generally about one hour/);
 assert.doesNotMatch(RECEPTIONIST_PROMPT,/Thank you for calling 805 Shutters/);
 await f.audio();await f.mark();assert.equal(f.session.stage,'collect');assert.equal(f.store.list('effect').filter(item=>item.type==='dial').length,0);
 const tools=f.ai.sent.at(-1).session.tools;assert.deepEqual(tools,[]);
 assert.deepEqual(f.ai.sent[0].session.audio.input.transcription,INPUT_TRANSCRIPTION);assert.equal(f.ai.sent[0].session.input_audio_transcription,undefined);assert.deepEqual(f.ai.sent[0].session.turn_detection,{type:null});
 assert.equal(HOST_WALL_MS,400000);assert.equal(MEDIA_SESSION_MS,270000);assert.ok(MEDIA_SESSION_MS+FALLBACK_RESERVE_MS<=HOST_WALL_MS);assert.ok(MEDIA_SESSION_MS<MESSAGE_WINDOW_MS);
 assert.equal(f.timers.find(timer=>timer.ms===10000).cleared,true);f.session.finish();assert.equal(f.timers.find(timer=>timer.ms===MEDIA_SESSION_MS).cleared,true);
});
function lastLine(f){return [...f.ai.sent].reverse().find(item=>item.item?.content?.[0]?.text)?.item.content[0].text||'';}
async function ready(f){await f.begin();await f.audio();await f.mark();assert.equal(f.session.stage,'collect');}
async function messageMode(f){await ready(f);await speak(f,'I would like to leave a message');assert.match(lastLine(f),/May I have your name/);await speak(f,'Test Caller');assert.match(lastLine(f),/What would you like the message to say/);assert.equal(f.ai.sent.some(item=>/best callback number/i.test(item.item?.content?.[0]?.text||'')),false);await f.say('Please call me back','body');assert.match(lastLine(f),/Message from Test Caller/);assert.match(lastLine(f),/1 8 0 5 5 5 5 0 1 9 9/);assert.equal(f.session.stage,'readback');}
async function speak(f,text){const id='spoken-'+Math.random();await f.say(text,'turn-'+id);if(f.session.stage==='result'||f.session.stage==='readback'){await f.audio(id);await f.mark();}}
async function tool(f,name,data,id='t1'){await f.grok({type:'response.created',response:{id}});await f.grok({type:'response.function_call_arguments.done',name,call_id:id,arguments:JSON.stringify(data)});await f.grok({type:'response.done',response:{id,status:'completed'}});}
const message={name:'Test Caller',callback:'+18055550199',message:'Please call me back'};
test('message requires played readback and one spoken yes, then verifies the CRM row',async()=>{
 const f=fixture();const saved=[];f.session.saveCrm=async row=>{saved.push(row);return {verified:true,id:'cb-1',call_sid:f.call.sid};};
 await messageMode(f);
 await f.say('yes');assert.equal(f.store.list('message').length,0);
 await f.audio('readback');await f.say('yes');assert.equal(f.store.list('message').length,0);
 await f.mark();await f.say('yes','yes-1');await f.say('yes','yes-1');await f.say('yes please','yes-2');
 assert.equal(f.store.list('message').length,1);assert.equal(f.store.list('message')[0].confirmed,true);assert.equal(f.store.list('message')[0].crmVerified,true);
 assert.equal(saved.length,1);assert.match(f.ai.sent.at(-1).item.content[0].text,/has been saved/);f.session.finish();
});
test('negative, ambiguous, silence, and a failed CRM verify do not announce a save',async()=>{
 for(const text of ['no','maybe later']){const f=fixture();await messageMode(f);await f.audio('readback');await f.mark();await f.say(text);assert.equal(f.store.list('message').length,0);assert.equal(f.store.get('call',f.call.id).intent,null);f.session.finish();}
 const silent=fixture();await messageMode(silent);await silent.audio('readback');await silent.mark();
 await silent.timers.filter(timer=>timer.ms===12000).at(-1).fn();await silent.session.chain;assert.equal(silent.store.list('message').length,0);silent.session.finish();
 const failed=fixture();failed.session.saveCrm=async()=>({verified:false});await messageMode(failed);await failed.audio('readback');await failed.mark();await failed.say('yes');
 assert.equal(failed.store.list('message')[0].crmVerified,undefined);assert.match(failed.ai.sent.at(-1).item.content[0].text,/could not verify/);failed.session.finish();
});
test('model confirmation, foreign stream, interruption, and a late yes cannot save',async()=>{
 const f=fixture();await messageMode(f);await f.grok({type:'response.function_call_arguments.done',name:'prepare_message',call_id:'model-yes',arguments:JSON.stringify({...message,confirmed:true})});assert.equal(f.store.list('message').length,0);
 await f.audio('readback');
 await f.grok({type:'input_audio_buffer.speech_started'});await f.mark();assert.equal(f.store.list('message').length,0);assert.equal(f.store.get('call',f.call.id).intent,null);f.session.finish();
 const late=fixture();await messageMode(late);await late.audio('again');await late.mark();
 await late.carrier({event:'mark',streamSid:'MZ'+'9'.repeat(32),mark:late.socket.sent.at(-1).mark});
 const stale=late.store.get('call',late.call.id);late.store.put('call',{...stale,intent:{...stale.intent,playedAt:Date.now()-61000}});
 await late.say('yes','late');assert.equal(late.store.list('message').length,0);late.session.finish();
});
test('a changed message invalidates the earlier yes until the new readback plays',async()=>{
 const f=fixture();await messageMode(f);await f.audio('readback');await f.mark();await f.say('no');
 await f.audio('correction');await f.mark();
 await f.say('Call after five','revised');await f.say('yes','old');assert.equal(f.store.list('message').length,0);
 await f.audio('next');await f.mark();await f.say('yes','new');assert.equal(f.store.list('message')[0].text,'Call after five');f.session.finish();
});
const openSlot={exact:true,date:'2026-10-23',requested:'15:00',slots:['15:00'],fit:true,saved:false,searchComplete:true};
function proposal(input){return {intent:{id:'proposal',kind:'appointment',payload:input,readback:'Consultation details. Please say yes to book this appointment.'}};}
async function collectVisit(f){const lines=[];for(const text of ['I want to schedule an appointment','Friday','3 pm','123 Oak Street, Camarillo','yes','my home','Pat Example']){await speak(f,text);lines.push(lastLine(f));}return lines;}
test('exact booking is announced only after spoken yes and a verified save',async()=>{
 const f=fixture();const requests=[];const order=[];const original=f.state.transact.bind(f.state);f.state.transact=async fn=>{const result=await original(fn);order.push('saved');return result;};const send=f.session.sendAI.bind(f.session);f.session.sendAI=value=>{if(value.item?.type==='force_message')order.push('asked:'+value.item.content[0].text);return send(value);};
 f.session.schedule=async(_config,id,action,input)=>{requests.push({id,action,input});if(action==='find_appointments')return openSlot;if(action==='prepare_appointment')return proposal(input);if(action==='commit')return {verified:true,date:'2026-10-23',time:'15:00'};throw Error(action);};
 await ready(f);const lines=await collectVisit(f);
 assert.equal(f.store.get('call',f.call.id).schedule.weekday,'friday');assert.equal(f.store.get('call',f.call.id).schedule.phone,'+18055550199');
 assert.equal(lines[1],'What time on Friday, October 23 works for you?');assert.match(lines[2],/I'll check Friday, October 23, 3:00 PM Pacific\. May I please get your address\?/);
 assert.equal(lines.some(line=>/we.?re confirmed|is booked/i.test(line)),false);assert.equal(requests.map(item=>item.action).includes('commit'),false);
 const savedBeforeAsk=order.findIndex(item=>item==='saved'),askedFriday=order.findIndex(item=>item==='asked:What time on Friday, October 23 works for you?');
 assert.ok(savedBeforeAsk>=0&&askedFriday>savedBeforeAsk);
 await speak(f,'yes');assert.equal(requests.at(-1).action,'prepare_appointment');assert.equal(requests.at(-1).input.phone,'+18055550199');assert.equal(requests.at(-1).input.address,'123 Oak Street, Camarillo');
 await f.say('yes','book-yes');assert.deepEqual(requests.map(item=>item.action),['find_appointments','prepare_appointment','commit']);
 assert(f.store.get('call',f.call.id).bookingIntent.confirmedAt);assert.match(lastLine(f),/Absolutely, we're confirmed for Friday, October 23, 3:00 PM Pacific/);assert.equal(f.store.get('call',f.call.id).schedule.awaiting,'done');f.session.finish();
});
test('nearby times and no-fit results are returned to the caller without saving',async()=>{
 const nearby=fixture();nearby.session.schedule=async()=>({exact:false,slots:[],alternatives:[{date:'2035-10-01',time:'10:30',minutesAway:30}],fit:true,saved:false});
 await ready(nearby);await collectVisit(nearby);
 assert.match(lastLine(nearby),/Monday, October 1, 10:30 AM Pacific is open on our calendar/);assert.doesNotMatch(lastLine(nearby),/Friday|we.?re confirmed/);assert.equal(nearby.store.list('message').length,0);nearby.session.finish();
 const none=fixture();none.session.schedule=async()=>({exact:false,slots:[],alternatives:[],fit:false,saved:false});
 await ready(none);await collectVisit(none);
 assert.match(lastLine(none),/No open CRM time fits/);assert.equal(none.store.get('call',none.call.id).schedule.awaiting,'callback');assert.equal(none.store.get('call',none.call.id).booking,undefined);none.session.finish();
});
test('a stale slot can be replanned, and an uncertain save blocks another proposal',async()=>{
 const stale=fixture();stale.session.schedule=async(_c,_id,action,input)=>action==='commit'?{replan:true}:action==='find_appointments'?openSlot:proposal(input);
 await ready(stale);await collectVisit(stale);await speak(stale,'yes');await stale.say('yes','book');
 assert.equal(stale.store.get('call',stale.call.id).bookingIntent,null);assert.match(lastLine(stale),/no longer fits/);
 assert.equal(stale.store.get('call',stale.call.id).schedule.awaiting,'replan');
 await stale.audio('replan');await stale.mark();await speak(stale,'yes');assert.notEqual(stale.store.get('call',stale.call.id).intent?.kind,'appointment');assert.equal(stale.store.get('call',stale.call.id).schedule.awaiting==='replan'||stale.store.get('call',stale.call.id).schedule.awaiting==='callback',true);stale.session.finish();
 const uncertain=fixture();uncertain.session.schedule=async(_c,_id,action,input)=>{if(action==='commit')throw Error('timeout');return action==='find_appointments'?openSlot:proposal(input);};
 await ready(uncertain);await collectVisit(uncertain);await speak(uncertain,'yes');await uncertain.say('yes','book');
 assert(uncertain.store.get('call',uncertain.call.id).bookingAttention);assert(uncertain.store.get('call',uncertain.call.id).bookingIntent.confirmedAt);
 assert.equal(uncertain.store.get('call',uncertain.call.id).schedule.awaiting,'callback');
 await uncertain.audio('uncertain');await uncertain.mark();await speak(uncertain,'yes');assert.equal(uncertain.store.get('call',uncertain.call.id).bookingIntent.id,'proposal');assert.match(lastLine(uncertain),/What would you like the message to say/);assert.equal(uncertain.store.get('call',uncertain.call.id).schedule.purpose,'message');uncertain.session.finish();
});
test('hangup during save does not announce a booking and keeps an unconfirmed draft',async()=>{
 const f=fixture();let release;f.session.schedule=(_c,_id,action,input)=>action==='commit'?new Promise(resolve=>{release=resolve;}):action==='find_appointments'?openSlot:proposal(input);
 await ready(f);await f.state.transact(e=>e.updateDraft(f.call.id,message));await collectVisit(f);await speak(f,'yes');
 const pending=f.say('yes','race');
 for(let i=0;i<20&&!release;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof release,'function');
 await f.session.carrier({event:'stop',streamSid:f.streamSid});release({verified:true,date:'2026-10-23',time:'15:00'});await pending;
 assert.equal(f.store.get('call',f.call.id).phase,'ended');assert.equal(f.ai.sent.some(item=>/we.?re confirmed|is booked/.test(item.item?.content?.[0]?.text||'')),false);
 assert.equal(f.store.list('message')[0].confirmed,false);f.session.finish();
});
test('a side question keeps the saved day, and a blocked caller is asked for a callback number',async()=>{
 const f=fixture();await ready(f);await speak(f,'Friday');await speak(f,'How long is the consultation?');
 assert.equal(f.store.get('call',f.call.id).schedule.weekday,'friday');assert.match(lastLine(f),/^Generally about one hour\. What time on Friday, October 23 works for you\?$/);
 const blocked=fixture();blocked.store.put('call',{...blocked.store.get('call',blocked.call.id),from:'+266696687'});blocked.session.call={...blocked.call,from:'+266696687'};
 await ready(blocked);for(const text of ['Friday at 3 pm','123 Oak Street, Camarillo','yes','home','Pat Example'])await speak(blocked,text);
 assert.equal(blocked.store.get('call',blocked.call.id).schedule.phone,null);assert.equal(lastLine(blocked),'What is the best callback number?');
 await f.carrier({event:'media',streamSid:f.streamSid,media:{payload:'YWJj'}});assert.equal(f.ai.sent.some(item=>item.type==='input_audio_buffer.append'&&item.audio==='YWJj'),true);
 await f.grok({type:'response.function_call_arguments.done',name:'prepare_appointment',call_id:'hack',arguments:JSON.stringify({phone:'+18055550198',confirmed:true})});
 await f.grok({type:'response.done',response:{id:'hack-response',status:'completed'}});
 assert.equal(f.store.get('call',f.call.id).schedule.phone,'+18055550199');assert.equal(f.store.get('call',f.call.id).booking,undefined);f.session.finish();blocked.session.finish();
});
test('wrong account, call, format and reused start cannot attach',async()=>{
 for(const field of ['accountSid','callSid','mediaFormat']){const f=fixture();const start=structuredClone(f.start);start.start[field]=field==='mediaFormat'?{encoding:'bad',sampleRate:8000,channels:1}:'bad';await f.carrier(start);assert.equal(f.session.closed,true);assert.equal(f.store.get('call',f.call.id).mediaStreamSid,undefined);}
 const f=fixture();await f.begin();const other=new GrokMediaSession({socket:new Socket(),call:f.call,state:f.state,worker:f.worker,connect:()=>new Socket(),clock:{setTimeout:()=>1,clearTimeout:()=>{}}});await other.carrier(f.start);assert.equal(other.closed,true);f.session.finish();
});
test('missing audio and the worker deadline fall back without confirmation',async()=>{
 const f=fixture();await f.begin();await f.grok({type:'response.done',response:{id:'silent',status:'completed'}});assert.equal(f.session.closed,true);assert.equal(f.store.get('call',f.call.id).mediaFailed,true);
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
test('a caller correction replaces the address and a fresh spoken yes books the new one',async()=>{
 const f=fixture();const requests=[];
 f.session.schedule=async(_c,_id,action,input)=>{requests.push({action,input});if(action==='find_appointments')return openSlot;if(action==='prepare_appointment')return proposal(input);if(action==='commit')return {verified:true,date:'2026-10-23',time:'15:00'};throw Error(action);};
 await ready(f);await collectVisit(f);await speak(f,'yes');
 assert.equal(requests.at(-1).action,'prepare_appointment');assert.equal(requests.at(-1).input.address,'123 Oak Street, Camarillo');
 await f.say('actually my address is 456 Pine Street, Camarillo','correct');
 assert.equal(requests.filter(item=>item.action==='commit').length,0);
 assert.equal(f.store.get('call',f.call.id).schedule.address,'456 Pine Street, Camarillo');
 assert.equal(f.store.get('call',f.call.id).schedule.addressConfirmed,false);
 assert.equal(f.store.get('call',f.call.id).intent,null);
 await f.audio('address');await f.mark();await f.say('yes','addr');await f.audio('offer');await f.mark();await f.say('yes','offer');
 assert.equal(requests.filter(item=>item.action==='prepare_appointment').at(-1).input.address,'456 Pine Street, Camarillo');
 assert.equal(f.session.stage,'readback');
 await f.say('yes','early');assert.equal(requests.filter(item=>item.action==='commit').length,0);
 await f.audio('fresh');await f.mark();await f.say('yes','fresh-yes');
 assert.equal(requests.filter(item=>item.action==='commit').length,1);f.session.finish();
});
test('a verified booking and a failed prepare do not start another booking',async()=>{
 const booked=fixture();const calls=[];
 booked.session.schedule=async(_c,_id,action,input)=>{calls.push(action);if(action==='find_appointments')return {exact:false,fit:true,saved:false,alternatives:[{date:'2026-10-26',time:'10:00'}]};if(action==='prepare_appointment')return proposal(input);return {verified:true,date:'2026-10-26',time:'10:00'};};
 await ready(booked);await collectVisit(booked);await speak(booked,'yes');await booked.say('yes','book');
 assert.match(lastLine(booked),/Absolutely, we're confirmed for Monday, October 26, 10:00 AM Pacific/);
 await booked.audio('saved');await booked.mark();await booked.say('no','thanks');
 assert.equal(calls.filter(action=>action==='prepare_appointment').length,1);assert.match(lastLine(booked),/Goodbye/);
 const failed=fixture();const tries=[];
 failed.session.schedule=async(_c,_id,action)=>{tries.push(action);if(action==='find_appointments')return openSlot;throw Error('prepare failed');};
 await ready(failed);await collectVisit(failed);await speak(failed,'yes');
 assert.equal(failed.store.get('call',failed.call.id).schedule.awaiting,'callback');assert.match(lastLine(failed),/callback message/);
 await speak(failed,'yes');assert.match(lastLine(failed),/What would you like the message to say/);assert.equal(failed.store.get('call',failed.call.id).schedule.purpose,'message');assert.equal(tries.filter(action=>action==='prepare_appointment').length,1);
 booked.session.finish();failed.session.finish();
});
test('server caller ID is used for a message tool',async()=>{
 const f=fixture();await ready(f);f.session.stage='assist';
 await tool(f,'prepare_message',{name:'Test Caller',callback:'+18055550999',message:'Please call me back'});
 assert.match(lastLine(f),/1 8 0 5 5 5 5 0 1 9 9/);assert.doesNotMatch(lastLine(f),/5 0 9 9 9/);
 const blocked=fixture();await ready(blocked);blocked.store.put('call',{...blocked.store.get('call',blocked.call.id),from:'+266696687'});blocked.session.call={...blocked.call,from:'+266696687'};blocked.session.stage='assist';
 await tool(blocked,'prepare_message',{name:'Test Caller',callback:'+18055550198',message:'Please call me back'},'blocked');
 assert.match(lastLine(blocked),/1 8 0 5 5 5 5 0 1 9 8/);
 f.session.finish();blocked.session.finish();
});
test('a forced question plays from the documented lifecycle when no automatic response arrives',async()=>{
 const only=fixture();await ready(only);await only.grok({type:'input_audio_buffer.speech_stopped'});await only.say('Friday at 3 pm');
 const media=only.socket.sent.filter(item=>item.media?.payload==='YWJj').length;
 const marks=only.socket.sent.filter(item=>item.event==='mark').length;
 await only.grok({type:'response.created',response:{id:'forced-only'}});
 await only.grok({type:'response.output_audio.delta',response_id:'forced-only',delta:'YWJj'});
 await only.grok({type:'response.done',response:{id:'forced-only',status:'completed'}});
 assert.equal(only.session.stage,'result-playback');
 assert.equal(only.session.stray.has('forced-only'),false);
 assert.equal(only.session.prompt.responseId,'forced-only');
 assert.equal(only.socket.sent.filter(item=>item.media?.payload==='YWJj').length,media+1);
 assert.equal(only.socket.sent.filter(item=>item.event==='mark').length,marks+1);
 assert.equal(only.store.get('call',only.call.id).schedule.date,'2026-10-23');
 assert.equal(only.ai.sent.some(item=>item.type==='response.cancel'&&item.response_id==null),true);
 only.session.finish();
});
test('an overlapping automatic response does not take the scripted question in either order',async()=>{
 const ahead=fixture();await ready(ahead);await ahead.grok({type:'input_audio_buffer.speech_stopped'});await ahead.say('Friday at 3 pm');
 await ahead.grok({type:'response.created',response:{id:'auto-ahead'}});
 await ahead.grok({type:'response.output_audio.delta',response_id:'auto-ahead',delta:'QUJD'});
 await ahead.grok({type:'response.done',response:{id:'auto-ahead',status:'cancelled'}});
 assert.equal(ahead.session.stage,'result');assert.equal(ahead.socket.sent.some(item=>item.media?.payload==='QUJD'),false);
 await ahead.grok({type:'response.created',response:{id:'forced-ahead'}});
 await ahead.grok({type:'response.output_audio.delta',response_id:'forced-ahead',delta:'Rk9SQ0U'});
 await ahead.grok({type:'response.done',response:{id:'forced-ahead',status:'completed'}});
 assert.equal(ahead.session.stage,'result-playback');assert.equal(ahead.socket.sent.some(item=>item.media?.payload==='Rk9SQ0U'),true);
 const behind=fixture();await ready(behind);await behind.grok({type:'input_audio_buffer.speech_stopped'});await behind.say('Friday at 3 pm');
 await behind.grok({type:'response.created',response:{id:'forced-behind'}});
 await behind.grok({type:'response.output_audio.delta',response_id:'forced-behind',delta:'QkVISU5E'});
 await behind.grok({type:'response.created',response:{id:'auto-behind'}});
 await behind.grok({type:'response.output_audio.delta',response_id:'auto-behind',delta:'QUJD'});
 await behind.grok({type:'response.done',response:{id:'forced-behind',status:'completed'}});
 assert.equal(behind.session.stage,'result');assert.equal(behind.socket.sent.some(item=>item.media?.payload==='QUJD'),false);
 await behind.grok({type:'response.done',response:{id:'auto-behind',status:'cancelled'}});
 assert.equal(behind.session.stage,'result-playback');assert.equal(behind.socket.sent.some(item=>item.media?.payload==='QkVISU5E'),true);
 await behind.grok({type:'response.created',response:{id:'late-auto'}});
 await behind.grok({type:'response.output_audio.delta',response_id:'late-auto',delta:'TEFURQ'});
 await behind.grok({type:'response.done',response:{id:'late-auto',status:'completed'}});
 assert.equal(behind.session.stage,'result-playback');assert.equal(behind.socket.sent.some(item=>item.media?.payload==='TEFURQ'),false);
 const stale=fixture();await ready(stale);await stale.grok({type:'input_audio_buffer.speech_stopped'});
 await stale.grok({type:'response.created',response:{id:'stale-auto'}});
 assert.equal(stale.ai.sent.some(item=>item.type==='response.cancel'&&item.response_id==='stale-auto'),true);
 await stale.say('Friday at 3 pm');
 await stale.grok({type:'response.output_audio.delta',response_id:'stale-auto',delta:'U1RBTEU'});
 await stale.grok({type:'response.done',response:{id:'stale-auto',status:'completed'}});
 assert.equal(stale.session.stage,'result');assert.equal(stale.socket.sent.some(item=>item.media?.payload==='U1RBTEU'),false);
 await stale.grok({type:'response.created',response:{id:'forced-stale'}});
 await stale.grok({type:'response.output_audio.delta',response_id:'forced-stale',delta:'U1RBTEVT'});
 await stale.grok({type:'response.done',response:{id:'forced-stale',status:'completed'}});
 assert.equal(stale.session.stage,'result-playback');assert.equal(stale.socket.sent.some(item=>item.media?.payload==='U1RBTEVT'),true);
 ahead.session.finish();behind.session.finish();stale.session.finish();
});
test('a completed automatic response does not take the day question in either order',async()=>{
 for(const order of [['auto-choice','forced-choice'],['forced-choice','auto-choice']]){
  const f=fixture();await ready(f);await f.grok({type:'input_audio_buffer.speech_stopped'});await f.say('schedule an appointment');
  assert.equal(f.store.get('call',f.call.id).schedule.purpose,'appointment');
  assert.equal(f.store.get('call',f.call.id).schedule.awaiting,'day');
  assert.match(lastLine(f),/What day works for you/);
  const media=f.socket.sent.filter(item=>item.event==='media').length;
  const marks=f.socket.sent.filter(item=>item.event==='mark').length;
  for(const id of order)await f.grok({type:'response.created',response:{id}});
  await f.grok({type:'response.output_audio.delta',response_id:'forced-choice',delta:'Rk9SQ0U'});
  await f.grok({type:'response.output_audio.delta',response_id:'auto-choice',delta:'QVVUTw'});
  for(const id of order)await f.grok({type:'response.done',response:{id,status:'completed'}});
  assert.equal(f.session.stage,'result');
  assert.equal(f.session.cancelSent,false);
  assert.equal(f.session.pending.length,0);
  assert.equal(f.socket.sent.filter(item=>item.event==='media').length,media);
  assert.equal(f.ai.sent.filter(item=>item.item?.type==='force_message'&&/What day works for you/.test(item.item.content[0].text||'')).length,2);
  await f.grok({type:'response.created',response:{id:'retry-choice'}});
  await f.grok({type:'response.output_audio.delta',response_id:'retry-choice',delta:'REFUUlk'});
  await f.grok({type:'response.done',response:{id:'retry-choice',status:'completed'}});
  assert.equal(f.session.stage,'result-playback');
  assert.equal(f.session.prompt.responseId,'retry-choice');
  assert.equal(f.socket.sent.some(item=>item.media?.payload==='REFUUlk'),true);
  assert.equal(f.socket.sent.some(item=>item.media?.payload==='Rk9SQ0U'||item.media?.payload==='QVVUTw'),false);
  assert.equal(f.socket.sent.filter(item=>item.event==='mark').length,marks+1);
  const trace=JSON.stringify(f.session.trace);
  assert.equal(trace.includes('schedule an appointment'),false);
  assert.equal(trace.includes('+1805'),false);
  assert.equal(trace.includes(f.c.authToken),false);
  assert.match(trace,/"event":"retry"/);
  f.session.finish();
 }
 const stuck=fixture();await ready(stuck);await stuck.grok({type:'input_audio_buffer.speech_stopped'});await stuck.say('schedule an appointment');
 for(const id of ['auto-stuck','forced-stuck'])await stuck.grok({type:'response.created',response:{id}});
 await stuck.grok({type:'response.output_audio.delta',response_id:'forced-stuck',delta:'Rk9SQ0U'});
 for(const id of ['forced-stuck','auto-stuck'])await stuck.grok({type:'response.done',response:{id,status:'completed'}});
 const deadline=stuck.timers.filter(timer=>timer.ms===FORCE_DEADLINE_MS&&!timer.cleared).at(-1);
 await deadline.fn();await stuck.session.chain;
 assert.equal(stuck.session.closed,true);
 assert.equal(stuck.store.get('call',stuck.call.id).mediaFailed,true);
 assert.equal(stuck.socket.sent.some(item=>item.media?.payload==='Rk9SQ0U'),false);
 assert.equal(stuck.store.get('call',stuck.call.id).schedule.awaiting,'day');
 const again=fixture();await ready(again);await again.grok({type:'input_audio_buffer.speech_stopped'});await again.say('schedule an appointment');
 for(const id of ['auto-again','forced-again'])await again.grok({type:'response.created',response:{id}});
 for(const id of ['auto-again','forced-again'])await again.grok({type:'response.done',response:{id,status:'completed'}});
 for(const id of ['auto-second','forced-second'])await again.grok({type:'response.created',response:{id}});
 await again.grok({type:'response.output_audio.delta',response_id:'forced-second',delta:'U0VDT05E'});
 for(const id of ['forced-second','auto-second'])await again.grok({type:'response.done',response:{id,status:'completed'}});
 assert.equal(again.session.closed,true);
 assert.equal(again.store.get('call',again.call.id).mediaFailed,true);
 assert.equal(again.socket.sent.some(item=>item.media?.payload==='U0VDT05E'),false);
});
function appointmentSchedule(f){
 const requests=[];
 f.session.schedule=async(_config,id,action,input)=>{requests.push({id,action,input});if(action==='find_appointments')return openSlot;if(action==='prepare_appointment')return proposal(input);if(action==='commit')return {verified:true,date:'2026-10-23',time:'15:00'};throw Error(action);};
 return requests;
}
function openPlayback(f,ms){return f.timers.filter(timer=>timer.ms===ms&&!timer.cleared).at(-1);}
test('a lost playback mark uses voicemail and a matched long readback cancels its deadline',async()=>{
 const day=fixture();await ready(day);await day.grok({type:'input_audio_buffer.speech_stopped'});await day.say('schedule an appointment');
 assert.equal(day.store.get('call',day.call.id).schedule.awaiting,'day');
 await day.grok({type:'response.created',response:{id:'day-lost'}});
 await day.grok({type:'response.output_audio.delta',response_id:'day-lost',delta:'YWJj'});
 await day.grok({type:'response.done',response:{id:'day-lost',status:'completed'}});
 assert.equal(day.session.stage,'result-playback');
 const dayWait=playbackWaitMs(pcmByteLength('YWJj'));
 assert.equal(dayWait,5001);
 const dayTimer=openPlayback(day,dayWait);
 assert.ok(dayTimer);
 await day.carrier({event:'mark',streamSid:day.streamSid,mark:{name:'stale-mark'}});
 assert.equal(dayTimer.cleared,false);
 assert.equal(day.session.stage,'result-playback');
 assert.equal(day.store.get('call',day.call.id).mediaFailed,undefined);
 assert.notEqual(day.session.stage,'confirm');
 const dayErrors=[];const dayError=console.error;
 console.error=(...args)=>{dayErrors.push(args.map(String).join(' '));dayError(...args);};
 try{await dayTimer.fn();await day.session.chain;}finally{console.error=dayError;}
 assert.equal(day.session.closed,true);
 assert.equal(dayTimer.cleared,true);
 assert.equal(day.store.get('call',day.call.id).mediaFailed,true);
 assert.equal(day.store.get('call',day.call.id).schedule.awaiting,'day');
 assert.equal(day.store.get('call',day.call.id).booking,undefined);
 assert.equal(day.store.get('call',day.call.id).intent,null);
 assert.equal(day.store.list('effect').some(item=>item.type==='fallback'),true);
 assert.notEqual(day.session.stage,'confirm');
 const dayLog=dayErrors.find(line=>line.includes('voice-805-lifecycle'));
 const dayLogged=JSON.parse(dayLog);
 assert.equal(dayLogged.call,day.call.id);
 assert.equal(dayLogged.event,'voice-805-lifecycle');
 assert.equal(dayLog.includes('schedule an appointment'),false);
 assert.equal(dayLog.includes(day.call.from),false);
 assert.equal(dayLog.includes('+1805'),false);
 assert.equal(dayLog.includes(day.c.authToken),false);
 assert.equal(dayLog.includes(day.c.xaiKey),false);
 await dayTimer.fn();await day.session.chain;
 assert.equal(day.store.get('call',day.call.id).booking,undefined);

 const lost=fixture();const lostRequests=appointmentSchedule(lost);
 await ready(lost);await collectVisit(lost);await lost.say('yes');
 assert.equal(lostRequests.at(-1).action,'prepare_appointment');
 assert.equal(lost.session.stage,'readback');
 await lost.audio('readback-lost');
 assert.equal(lost.session.stage,'readback-playback');
 assert.equal(lost.store.get('call',lost.call.id).intent.playedAt,undefined);
 const lostTimer=openPlayback(lost,playbackWaitMs(pcmByteLength('YWJj')));
 assert.ok(lostTimer);
 await lost.carrier({event:'mark',streamSid:lost.streamSid,mark:{name:'stale-readback'}});
 assert.equal(lostTimer.cleared,false);
 assert.equal(lost.session.stage,'readback-playback');
 assert.equal(lost.store.get('call',lost.call.id).mediaFailed,undefined);
 const lostErrors=[];const lostError=console.error;
 console.error=(...args)=>{lostErrors.push(args.map(String).join(' '));lostError(...args);};
 try{await lostTimer.fn();await lost.session.chain;}finally{console.error=lostError;}
 assert.equal(lost.session.closed,true);
 assert.equal(lostTimer.cleared,true);
 assert.equal(lost.store.get('call',lost.call.id).mediaFailed,true);
 assert.equal(lost.store.get('call',lost.call.id).intent,null);
 assert.equal(lost.store.get('call',lost.call.id).booking,undefined);
 assert.equal(lost.store.get('call',lost.call.id).bookingIntent,undefined);
 assert.equal(lostRequests.some(item=>item.action==='commit'),false);
 assert.notEqual(lost.session.stage,'confirm');
 assert.equal(lost.store.list('effect').some(item=>item.type==='fallback'),true);
 const lostLog=JSON.parse(lostErrors.find(line=>line.includes('voice-805-lifecycle')));
 assert.equal(lostLog.call,lost.call.id);
 assert.equal(JSON.stringify(lostLog).includes('Consultation details'),false);
 assert.equal(JSON.stringify(lostLog).includes('Pat Example'),false);
 assert.equal(JSON.stringify(lostLog).includes('123 Oak Street'),false);
 assert.equal(JSON.stringify(lostLog).includes(lost.call.from),false);

 const booked=fixture();const bookedRequests=appointmentSchedule(booked);
 await ready(booked);await collectVisit(booked);await booked.say('yes');
 assert.equal(booked.session.stage,'readback');
 const payload=Buffer.alloc(96000,0x7f).toString('base64');
 assert.equal(pcmByteLength(payload),96000);
 const longWait=playbackWaitMs(96000);
 assert.equal(longWait,17000);
 assert.ok(longWait>FORCE_DEADLINE_MS);
 await booked.grok({type:'response.created',response:{id:'long-readback'}});
 await booked.grok({type:'response.output_audio.delta',response_id:'long-readback',delta:payload});
 await booked.grok({type:'response.done',response:{id:'long-readback',status:'completed'}});
 assert.equal(booked.session.stage,'readback-playback');
 assert.equal(booked.session.pcmBytes,96000);
 const longTimer=openPlayback(booked,longWait);
 assert.ok(longTimer);
 assert.equal(booked.timers.filter(timer=>timer.ms===FORCE_DEADLINE_MS).at(-1).cleared,true);
 await booked.mark();
 assert.equal(longTimer.cleared,true);
 assert.equal(booked.session.stage,'confirm');
 assert.equal(typeof booked.store.get('call',booked.call.id).intent.playedAt,'number');
 assert.equal(bookedRequests.some(item=>item.action==='commit'),false);
 assert.equal(booked.session.closed,false);
 await longTimer.fn();await booked.session.chain;
 assert.equal(booked.session.closed,false);
 assert.equal(booked.session.stage,'confirm');
 assert.equal(booked.store.get('call',booked.call.id).mediaFailed,undefined);
 assert.equal(bookedRequests.some(item=>item.action==='commit'),false);
 booked.session.finish();

 const replaced=fixture();appointmentSchedule(replaced);
 await ready(replaced);await collectVisit(replaced);await replaced.say('yes');await replaced.audio('readback-replaced');
 assert.equal(replaced.session.stage,'readback-playback');
 const replacedTimer=openPlayback(replaced,playbackWaitMs(pcmByteLength('YWJj')));
 assert.ok(replacedTimer);
 await replaced.grok({type:'input_audio_buffer.speech_started'});
 assert.equal(replacedTimer.cleared,true);
 assert.equal(replaced.session.stage,'result');
 assert.equal(replaced.store.get('call',replaced.call.id).intent,null);
 assert.equal(replaced.store.get('call',replaced.call.id).mediaFailed,undefined);
 await replacedTimer.fn();await replaced.session.chain;
 assert.equal(replaced.session.closed,false);
 assert.equal(replaced.store.get('call',replaced.call.id).mediaFailed,undefined);
 assert.equal(replaced.store.get('call',replaced.call.id).booking,undefined);
 replaced.session.finish();
});
test('published voice events deliver the transcript the collector stores',async()=>{
 const spec=await (await fetch('https://docs.x.ai/voice-realtime.ws.json')).json();
 const completed=spec.serverMessages.find(message=>message.type==='conversation.item.input_audio_transcription.completed');
 const added=spec.serverMessages.find(message=>message.type==='conversation.item.added');
 const updated=spec.serverMessages.find(message=>message.type==='conversation.item.input_audio_transcription.updated');
 assert.equal(typeof completed.example.transcript,'string');assert.equal(added.example.item.role,'user');
 assert.match(updated.description,/grok-transcribe/);
 const transcription=spec.clientMessages.find(message=>message.type==='session.update').schema.properties.session.properties.audio.properties.input.properties.transcription;
 assert.deepEqual(Object.keys(transcription.properties).sort(),['keyterms','language_hint']);
 const f=fixture();await ready(f);
 await f.grok({...completed.example,item_id:'msg_friday',transcript:'I want to schedule an appointment'});
 assert.match(lastLine(f),/What day works for you/);
 await f.audio('day');await f.mark();
 await f.grok({...added.example,item:{...added.example.item,id:'msg_added',content:[{type:'input_audio',transcript:'Friday'}]}});
 assert.equal(f.store.get('call',f.call.id).schedule.date,'2026-10-23');
 await f.audio('time');await f.mark();
 const before=f.store.get('call',f.call.id).schedule.awaiting;
 await f.grok({...updated.example,item_id:'msg_partial',transcript:'three'});
 assert.equal(f.store.get('call',f.call.id).schedule.awaiting,before);
 await f.grok({type:'conversation.item.created',item:{id:'msg_old',role:'user',content:[{type:'input_text',text:'Monday'}]}});
 assert.equal(f.store.get('call',f.call.id).schedule.date,'2026-10-23');
 assert.equal(f.ai.sent.some(item=>item.session?.audio?.input?.transcription?.model==='grok-transcribe'),true);
 assert.equal(f.ai.sent.some(item=>item.session?.input_audio_transcription),false);f.session.finish();
});
function checkpoints(lines, callId) {
 return lines.filter(line => line.includes('voice-805-checkpoint') && line.includes(callId)).map(line => JSON.parse(line));
}
test('a saved time turn speaks the address line, and a held commit cannot block fallback', async () => {
 const spoken = fixture();
 await ready(spoken);
 await speak(spoken, 'I want to schedule an appointment');
 await speak(spoken, 'Friday');
 const logs = [];
 const original = console.error;
 console.error = (...args) => { logs.push(args.map(String).join(' ')); original(...args); };
 try { await speak(spoken, '10 a.m.'); }
 finally { console.error = original; }
 assert.match(lastLine(spoken), /May I please get your address/);
 assert.equal(spoken.session.stage, 'collect');
 assert.equal(spoken.store.get('call', spoken.call.id).schedule.awaiting, 'address');
 const saved = checkpoints(logs, spoken.call.id).find(item => item.step === 'saved');
 assert.equal(saved.awaiting, 'address');
 assert.equal(saved.call, spoken.call.id);
 assert.equal(JSON.stringify(saved).includes('10 a'), false);
 assert.equal(JSON.stringify(saved).includes(spoken.call.from), false);
 assert.equal(JSON.stringify(saved).includes('Oak'), false);
 spoken.session.finish();

 const held = fixture();
 await ready(held);
 await speak(held, 'I want to schedule an appointment');
 await speak(held, 'Friday');
 const originalTransact = held.state.transact.bind(held.state);
 let release;
 let heldSave = false;
 held.state.transact = async (fn) => {
  const value = await originalTransact(fn);
  if (!heldSave && held.store.get('call', held.call.id).schedule?.awaiting === 'address') {
   heldSave = true;
   await new Promise(resolve => { release = resolve; });
  }
  return value;
 };
 const pending = held.say('10 a.m.');
 for (let i = 0; i < 20 && !release; i++) await new Promise(resolve => setImmediate(resolve));
 assert.equal(typeof release, 'function');
 assert.equal(held.session.stage, 'collect');
 assert.equal(held.store.get('call', held.call.id).schedule.awaiting, 'address');
 assert.equal(held.ai.sent.some(item => /May I please get your address/.test(item.item?.content?.[0]?.text || '')), false);
 const sessionTimer = held.timers.find(timer => timer.ms === MEDIA_SESSION_MS && !timer.cleared);
 await sessionTimer.fn();
 assert.equal(held.session.closed, true);
 assert.equal(held.store.get('call', held.call.id).mediaFailed, true);
 assert.equal(held.store.list('effect').some(item => item.type === 'fallback'), true);
 assert.equal(held.ai.sent.some(item => /May I please get your address/.test(item.item?.content?.[0]?.text || '')), false);
 release();
 await pending;
 await held.session.chain;
 assert.equal(held.ai.sent.some(item => /May I please get your address/.test(item.item?.content?.[0]?.text || '')), false);
 assert.equal(held.store.get('call', held.call.id).booking, undefined);

 const welcome = fixture();
 welcome.store.put('call', { ...welcome.store.get('call', welcome.call.id), phase: 'offering', deadline: Date.now() + 20000, listeningWelcome: true });
 await welcome.begin();
 assert.equal(welcome.ai.sent.at(-1).item.content[0].text, COMMON_GREETING);
 const interruptible = [...welcome.ai.sent].reverse().find(item => item.item?.type === 'force_message');
 assert.equal(interruptible.item.interruptible, true);
 assert.equal(welcome.session.listening, true);
 await welcome.carrier({ event: 'media', streamSid: welcome.streamSid, media: { payload: 'YWJj' } });
 assert.equal(welcome.ai.sent.some(item => item.type === 'input_audio_buffer.append'), true);
 await welcome.say('I want to schedule an appointment');
 assert.match(lastLine(welcome), /What day works for you/);
 assert.equal(welcome.ai.sent.filter(item => item.item?.content?.[0]?.text === COMMON_GREETING).length, 1);
 assert.equal(welcome.ai.sent.some(item => item.item?.content?.[0]?.text === RECEPTIONIST_OPENING), false);
 assert.equal(STATE_BOUND_MS < MEDIA_SESSION_MS, true);
 welcome.session.finish();

 const quiet = fixture();
 quiet.store.put('call', { ...quiet.store.get('call', quiet.call.id), phase: 'offering', deadline: Date.now() - 1000, listeningWelcome: true });
 await quiet.begin();
 await quiet.audio('welcome');
 assert.equal(quiet.socket.sent.some(item => item.event === 'media' && item.media?.payload === 'YWJj'), true);
 await quiet.mark();
 assert.equal(lastLine(quiet), RECEPTIONIST_OPENING);
 assert.equal(quiet.ai.sent.filter(item => item.item?.content?.[0]?.text === COMMON_GREETING).length, 1);
 assert.equal(quiet.ai.sent.filter(item => item.item?.content?.[0]?.text === RECEPTIONIST_OPENING).length, 1);
 quiet.session.finish();
});
test('a choice after the welcome mark keeps the scheduling question when the offer deadline fires', async () => {
 const f = fixture();
 f.store.put('call', { ...f.store.get('call', f.call.id), phase: 'offering', listeningWelcome: true, greetingPlayed: false, deadline: Date.now() + 5000 });
 await f.begin();
 await f.audio('welcome');
 await f.mark();
 assert.equal(f.session.stage, 'collect');
 assert.equal(f.session.callerChose, false);
 await speak(f, 'I want to schedule an appointment');
 assert.match(lastLine(f), /What day works for you/);
 assert.equal(f.session.callerChose, true);
 await speak(f, 'Friday');
 assert.match(lastLine(f), /What time/);
 f.store.put('call', { ...f.store.get('call', f.call.id), deadline: Date.now() - 1 });
 await f.session.offerWatch();
 assert.match(lastLine(f), /What time/);
 assert.equal(f.ai.sent.filter(item => item.item?.content?.[0]?.text === RECEPTIONIST_OPENING).length, 0);
 await speak(f, '10 a.m.');
 assert.match(lastLine(f), /address/);
 await f.session.offerWatch();
 assert.match(lastLine(f), /address/);
 assert.equal(f.ai.sent.filter(item => item.item?.content?.[0]?.text === COMMON_GREETING).length, 1);
 f.session.finish();
});
test('early scheduling reaches the CRM proposal while the original offer is still ringing', async () => {
 const f = fixture();
 const requests = [];
 f.session.schedule = async (_c, _id, action, input) => {
  const current = f.store.get('call', f.call.id);
  requests.push({ action, phase: current.phase, offer: current.offers[0]?.status, stream: current.mediaStreamSid, input });
  if (action === 'find_appointments') return openSlot;
  if (action === 'prepare_appointment') return proposal(input);
  if (action === 'commit') return { verified: true, date: '2026-10-23', time: '15:00' };
  throw Error(action);
 };
 const offer = { id: '11111111-1111-4111-8111-111111111111', staff: 'mike', purpose: 'initial', status: 'ringing', sid: 'CA' + '8'.repeat(32), expiresAt: Date.now() + 120000 };
 f.store.put('call', { ...f.store.get('call', f.call.id), phase: 'offering', listeningWelcome: true, greetingPlayed: false, deadline: Date.now() + 120000, offers: [offer] });
 await f.begin();
 await f.audio('welcome');
 await f.mark();
 await collectVisit(f);
 await speak(f, 'yes');
 assert.equal(requests.some(item => item.action === 'find_appointments'), true);
 assert.equal(requests.at(-1).action, 'prepare_appointment');
 assert.equal(requests.some(item => item.action === 'commit'), false);
 assert.equal(requests.every(item => item.phase === 'message' && item.offer === 'ringing' && item.stream), true);
 const midway = f.store.get('call', f.call.id);
 assert.equal(midway.phase, 'message');
 assert.equal(midway.owner, null);
 assert.equal(midway.offers[0].status, 'ringing');
 assert.equal(midway.offers[0].id, offer.id);
 f.engine.accept(f.call.id, offer.id, offer.sid, 'human');
 assert.equal(f.store.get('call', f.call.id).phase, 'handoff');
 assert.equal(f.store.get('call', f.call.id).owner, 'mike');
 await f.say('yes', 'after-takeover');
 assert.equal(requests.some(item => item.action === 'commit'), false);
 assert.equal(f.store.get('call', f.call.id).phase, 'handoff');
 assert.equal(f.store.get('call', f.call.id).booking, undefined);
 f.session.finish();
});
test('playback and prompt deadlines close while a state transaction is held', async () => {
 const playback = fixture();
 await ready(playback);
 await playback.say('I want to schedule an appointment');
 assert.equal(playback.session.stage, 'result');
 await playback.audio('held-play');
 assert.equal(playback.session.stage, 'result-playback');
 playback.state.transact = () => new Promise(() => {});
 const playbackTimer = playback.timers.filter(timer => !timer.cleared && timer.ms === playbackWaitMs(3)).at(-1);
 const playbackPending = playbackTimer.fn();
 assert.equal(playback.session.closed, true);
 assert.equal(playback.store.get('call', playback.call.id).booking, undefined);
 playbackPending.catch(() => {});

 const prompt = fixture();
 await ready(prompt);
 await prompt.say('I want to schedule an appointment');
 assert.equal(prompt.session.stage, 'result');
 prompt.state.transact = () => new Promise(() => {});
 const promptTimer = prompt.timers.filter(timer => !timer.cleared && timer.ms === FORCE_DEADLINE_MS).at(-1);
 const promptPending = promptTimer.fn();
 assert.equal(prompt.session.closed, true);
 assert.equal(prompt.ai.sent.filter(item => /What day works for you/.test(item.item?.content?.[0]?.text || '')).length, 1);
 promptPending.catch(() => {});
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
