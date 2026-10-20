import test from 'node:test';
import assert from 'node:assert/strict';
import { GrokMediaSession } from '../grok-media.mjs';
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
 const state={config:c,transact:async fn=>fn(engine,store)};const socket=new Socket(),ai=new Socket();
 let drains=0;const worker={drain:async()=>{drains++;}};
 const timers=[];const clock={setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{}};
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
 assert.match(RECEPTIONIST_PROMPT,/Do not demand an exact clock time/);assert.match(RECEPTIONIST_PROMPT,/one recommendation/);assert.match(RECEPTIONIST_PROMPT,/spoken yes/);assert.match(RECEPTIONIST_PROMPT,/booking is authorized/);
 assert.match(RECEPTIONIST_PROMPT,/currently open published CRM slot/);assert.match(RECEPTIONIST_PROMPT,/Never suggest or book a time that is not open on the CRM calendar/);
 assert.doesNotMatch(RECEPTIONIST_PROMPT,/Thank you for calling 805 Shutters/);
 await f.audio();await f.mark();assert.equal(f.session.stage,'assist');assert.equal(f.store.list('effect').filter(item=>item.type==='dial').length,0);
 const tools=f.ai.sent.at(-1).session.tools;assert.deepEqual(tools.map(t=>t.name),['find_appointments','prepare_appointment','draft_message','prepare_message']);
 assert.equal(tools[0].parameters.required.includes('time'),false);assert.equal(tools[0].parameters.required.includes('city'),true);assert.equal(tools[1].parameters.required.includes('time'),true);f.session.finish();
});
async function ready(f){await f.begin();await f.audio();await f.mark();}
async function tool(f,name,data,id='t1'){await f.grok({type:'response.created',response:{id}});await f.grok({type:'response.function_call_arguments.done',name,call_id:id,arguments:JSON.stringify(data)});await f.grok({type:'response.done',response:{id,status:'completed'}});}
const message={name:'Test Caller',callback:'+18055550199',message:'Please call me back'};
test('message requires played readback and one spoken yes, then verifies the CRM row',async()=>{
 const f=fixture();const saved=[];f.session.saveCrm=async row=>{saved.push(row);return {verified:true,id:'cb-1',call_sid:f.call.sid};};
 await ready(f);await tool(f,'prepare_message',message);
 await f.say('yes');assert.equal(f.store.list('message').length,0);
 await f.audio('readback');await f.say('yes');assert.equal(f.store.list('message').length,0);
 await f.mark();await f.say('yes','yes-1');await f.say('yes','yes-1');await f.say('yes please','yes-2');
 assert.equal(f.store.list('message').length,1);assert.equal(f.store.list('message')[0].confirmed,true);assert.equal(f.store.list('message')[0].crmVerified,true);
 assert.equal(saved.length,1);assert.match(f.ai.sent.at(-1).item.content[0].text,/has been saved/);f.session.finish();
});
test('negative, ambiguous, silence, and a failed CRM verify do not announce a save',async()=>{
 for(const text of ['no','maybe later']){const f=fixture();await ready(f);await tool(f,'prepare_message',message);await f.audio('readback');await f.mark();await f.say(text);assert.equal(f.store.list('message').length,0);assert.equal(f.store.get('call',f.call.id).intent,null);f.session.finish();}
 const silent=fixture();await ready(silent);await tool(silent,'prepare_message',message);await silent.audio('readback');await silent.mark();
 await silent.timers.filter(timer=>timer.ms===12000).at(-1).fn();await silent.session.chain;assert.equal(silent.store.list('message').length,0);silent.session.finish();
 const failed=fixture();failed.session.saveCrm=async()=>({verified:false});await ready(failed);await tool(failed,'prepare_message',message);await failed.audio('readback');await failed.mark();await failed.say('yes');
 assert.equal(failed.store.list('message')[0].crmVerified,undefined);assert.match(failed.ai.sent.at(-1).item.content[0].text,/could not verify/);failed.session.finish();
});
test('model confirmation, foreign stream, interruption, and a late yes cannot save',async()=>{
 const f=fixture();await ready(f);await tool(f,'prepare_message',{...message,confirmed:true});assert.equal(f.store.get('call',f.call.id).intent,undefined);
 await tool(f,'prepare_message',message,'t2');await f.audio('readback');
 await f.grok({type:'input_audio_buffer.speech_started'});await f.mark();assert.equal(f.store.list('message').length,0);assert.equal(f.store.get('call',f.call.id).intent,null);f.session.finish();
 const late=fixture();await ready(late);await tool(late,'prepare_message',message,'t3');await late.audio('again');await late.mark();
 await late.carrier({event:'mark',streamSid:'MZ'+'9'.repeat(32),mark:late.socket.sent.at(-1).mark});
 const stale=late.store.get('call',late.call.id);late.store.put('call',{...stale,intent:{...stale.intent,playedAt:Date.now()-61000}});
 await late.say('yes','late');assert.equal(late.store.list('message').length,0);late.session.finish();
});
test('a changed message invalidates the earlier yes until the new readback plays',async()=>{
 const f=fixture();await ready(f);await tool(f,'prepare_message',message);await f.audio('readback');await f.mark();await f.say('no');
 await f.audio('correction');await f.mark();
 await tool(f,'prepare_message',{...message,message:'Call after five'},'t2');await f.say('yes','old');assert.equal(f.store.list('message').length,0);
 await f.audio('next');await f.mark();await f.say('yes','new');assert.equal(f.store.list('message')[0].text,'Call after five');f.session.finish();
});
test('exact booking is announced only after spoken yes and a verified save',async()=>{
 const f=fixture();const requests=[];f.session.schedule=async(_config,id,action,input)=>{requests.push({id,action,input});return action==='commit'?{verified:true,date:'2035-10-01',time:'10:00'}:{intent:{id:'proposal',kind:'appointment',payload:{date:'2035-10-01',time:'10:00',name:'Test',phone:'+18055550199',address:'123 Test St'},readback:'Consultation details. Please say yes to book this appointment.'}};};
 await ready(f);await tool(f,'find_appointments',{time:'10:00'});await tool(f,'prepare_appointment',{},'t2');
 await f.audio('readback');await f.mark();await f.say('yes');
 assert.deepEqual(requests.map(item=>item.action),['find_appointments','prepare_appointment','commit']);assert(requests.every(item=>item.id===f.call.id));
 assert(f.store.get('call',f.call.id).bookingIntent.confirmedAt);assert.match(f.ai.sent.at(-1).item.content[0].text,/is booked for 2035-10-01 at 10:00/);f.session.finish();
});
test('nearby times and no-fit results are returned to the caller without saving',async()=>{
 const nearby=fixture();nearby.session.schedule=async()=>({exact:false,slots:[],alternatives:[{date:'2035-10-01',time:'10:30',minutesAway:30}],fit:true,saved:false});
 await ready(nearby);await tool(nearby,'find_appointments',{time:'10:00'});
 assert.match(JSON.stringify(nearby.ai.sent),/10:30/);assert.equal(nearby.store.list('message').length,0);nearby.session.finish();
 const none=fixture();none.session.schedule=async()=>({exact:false,slots:[],alternatives:[],fit:false,saved:false});
 await ready(none);await tool(none,'find_appointments',{time:'10:00'},'t9');
 assert.match(JSON.stringify(none.ai.sent),/Take a callback message/);assert.equal(none.store.get('call',none.call.id).booking,undefined);none.session.finish();
});
test('a stale slot can be replanned, and an uncertain save blocks another proposal',async()=>{
 const stale=fixture();let step=0;stale.session.schedule=async(_c,_id,action)=>action==='commit'?{replan:true}:{intent:{id:'p'+step++,kind:'appointment',payload:{},readback:'Please say yes to book this appointment.'}};
 await ready(stale);await tool(stale,'prepare_appointment',{});await stale.audio('readback');await stale.mark();await stale.say('yes');
 assert.equal(stale.store.get('call',stale.call.id).bookingIntent,null);assert.match(stale.ai.sent.at(-1).item.content[0].text,/no longer fits/);
 await stale.audio('replan');await stale.mark();
 await tool(stale,'prepare_appointment',{},'t2');assert.equal(stale.store.get('call',stale.call.id).intent.kind,'appointment');stale.session.finish();
 const uncertain=fixture();uncertain.session.schedule=async(_c,_id,action)=>{if(action==='commit')throw Error('timeout');return {intent:{id:'proposal',kind:'appointment',payload:{},readback:'Please say yes to book this appointment.'}};};
 await ready(uncertain);await tool(uncertain,'prepare_appointment',{});await uncertain.audio('readback');await uncertain.mark();await uncertain.say('yes');
 assert(uncertain.store.get('call',uncertain.call.id).bookingAttention);assert(uncertain.store.get('call',uncertain.call.id).bookingIntent.confirmedAt);
 await tool(uncertain,'prepare_appointment',{},'t2');assert.equal(uncertain.store.get('call',uncertain.call.id).bookingIntent.id,'proposal');uncertain.session.finish();
});
test('hangup during save does not announce a booking and keeps an unconfirmed draft',async()=>{
 const f=fixture();let release;f.session.schedule=(_c,_id,action)=>action==='commit'?new Promise(resolve=>{release=resolve;}):{intent:{id:'proposal',kind:'appointment',payload:{},readback:'Please say yes to book this appointment.'}};
 await ready(f);await tool(f,'draft_message',message);await tool(f,'prepare_appointment',{},'t2');await f.audio('readback');await f.mark();
 const pending=f.say('yes','race');
 for(let i=0;i<20&&!release;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof release,'function');
 await f.session.carrier({event:'stop',streamSid:f.streamSid});release({verified:true,date:'2035-10-01',time:'10:00'});await pending;
 assert.equal(f.store.get('call',f.call.id).phase,'ended');assert.equal(f.ai.sent.some(item=>/is booked/.test(item.item?.content?.[0]?.text||'')),false);
 assert.equal(f.store.list('message')[0].confirmed,false);f.session.finish();
});
test('wrong account, call, format and reused start cannot attach',async()=>{
 for(const field of ['accountSid','callSid','mediaFormat']){const f=fixture();const start=structuredClone(f.start);start.start[field]=field==='mediaFormat'?{encoding:'bad',sampleRate:8000,channels:1}:'bad';await f.carrier(start);assert.equal(f.session.closed,true);assert.equal(f.store.get('call',f.call.id).mediaStreamSid,undefined);}
 const f=fixture();await f.begin();const other=new GrokMediaSession({socket:new Socket(),call:f.call,state:f.state,worker:f.worker,connect:()=>new Socket(),clock:{setTimeout:()=>1,clearTimeout:()=>{}}});await other.carrier(f.start);assert.equal(other.closed,true);f.session.finish();
});
test('missing audio and the worker deadline fall back without confirmation',async()=>{
 const f=fixture();await f.begin();await f.grok({type:'response.done',response:{id:'silent',status:'completed'}});assert.equal(f.session.closed,true);assert.equal(f.store.get('call',f.call.id).mediaFailed,true);
 const g=fixture();await g.begin();await g.timers.find(timer=>timer.ms===110000).fn();await g.session.chain;assert.equal(g.session.closed,true);assert.equal(g.store.list('message').length,0);
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
 const response=await handler(request('/twilio/inbound'));assert.equal(response.status,200);const xml=await response.text();assert.match(xml,/<Say>Thank you for calling 805 Shutters\. We appreciate you supporting local business\. Let me get you over to one of our team members immediately\.<\/Say>/);assert(!xml.includes('<Stream'));assert(!xml.includes('Gather'));assert(!xml.includes('<Play>'));
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
