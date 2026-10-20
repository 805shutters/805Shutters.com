import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotStore, SupabaseState } from '../supabase-store.mjs';
import { SupabaseWorker } from '../supabase-worker.mjs';
import { createSupabaseHandler } from '../supabase-handler.mjs';
import { SimulationProvider, TwilioProvider, staffDialParams } from '../provider.mjs';
import { hmac } from '../security.mjs';
import { loadSupabaseConfig } from '../supabase-config.mjs';

const config=()=>({...loadSupabaseConfig({}),mode:'live',liveAuthorized:true,agentReviewed:true,agentContractVerified:true,workerVerified:true,transport:'media',xaiKey:'x'.repeat(20),
 origin:'https://example.supabase.co/functions/v1/voice-805',accountSid:'AC'+'a'.repeat(32),authToken:'t'.repeat(32),number:'+18055550100',
 toolsKey:'t'.repeat(32),controlKey:'c'.repeat(32),workerKey:'w'.repeat(32),offerSeconds:20,
 sipUri:'sip:+18055908050@sip.voice.x.ai;transport=tls',
 hours:Object.fromEntries(Array.from({length:7},(_,i)=>[i,[[0,1440]]])),holidays:{},
 staff:{mike:{kind:'cell',destination:'+18055550101',sms:'+18055550101'},jessica:{kind:'cell',destination:'+18055550102',sms:'+18055550102'}}});
class FakeClient{constructor(){this.row={revision:0,body:{entities:{},events:{},inbound:{}}};this.lookup={match:'unmatched'};}
 from(){return{select:()=>({eq:()=>({single:async()=>({data:structuredClone(this.row)})})})};}
 async rpc(name,p){if(name==='voice_805_caller_context')return{data:this.lookup};if(name!=='voice_805_commit')return{data:{id:'cb-1',call_sid:p.p_call_sid}};await new Promise(r=>setImmediate(r));if(p.p_revision!==this.row.revision)return{data:false};this.row={revision:this.row.revision+1,body:structuredClone(p.p_body)};return{data:true};}}
function fixture(){const c=config(),client=new FakeClient(),state=new SupabaseState(client,c),provider=new SimulationProvider(),worker=new SupabaseWorker(state,provider),tasks=[];return{c,state,provider,worker,tasks,handler:createSupabaseHandler({state,client,worker,waitUntil:p=>tasks.push(p)})};}
function carrier(f,path,fields){const p=new URLSearchParams({AccountSid:f.c.accountSid,...fields});const payload=f.c.origin+path+[...new Set(p.keys())].sort().map(k=>k+p.get(k)).join('');return new Request(f.c.origin+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':hmac(f.c.authToken,payload,'sha1')},body:p});}
const sampleWav=()=>Uint8Array.from([0x52,0x49,0x46,0x46,0x24,0x00,0x00,0x00,0x57,0x41,0x56,0x45,0x66,0x6d,0x74,0x20,0x10,0x00,0x00,0x00,0x07,0x00,0x01,0x00,0x40,0x1f,0x00,0x00,0x40,0x1f,0x00,0x00,0x01,0x00,0x08,0x00,0x64,0x61,0x74,0x61,0x00,0x00,0x00,0x00]);
async function offered(f,sid='CA'+'1'.repeat(32)){
 const inbound=await f.handler(carrier(f,'/twilio/inbound',{CallSid:sid,To:f.c.number,From:'+18055550199'}));
 const greeting=await inbound.text();
 await Promise.all(f.tasks);
 const ringing=await f.state.transact((_e,s)=>s.list('call').find(item=>item.sid===sid));
 const atAnswer={phase:ringing.phase,greetingPlayed:ringing.greetingPlayed,dials:f.provider.operations.filter(item=>item.type==='dial').map(item=>item.staff).sort(),parentMoves:f.provider.operations.filter(item=>item.type==='ringback'||item.type==='connect-agent'||(item.type==='route'&&item.sid===ringing.sid)).length};
 const greeted=await f.handler(carrier(f,`/twilio/greeted/${ringing.id}`,{CallSid:sid,To:f.c.number,From:'+18055550199'}));
 await Promise.all(f.tasks);
 return {greeting,conference:await greeted.text(),call:await f.state.transact((_e,s)=>s.get('call',ringing.id)),atAnswer};
}
function amd(f,call,offer,answeredBy){return carrier(f,`/twilio/offer/${call.id}/${offer.id}/amd`,{CallSid:offer.sid,To:f.c.staff[offer.staff].destination,From:f.c.number,AnsweredBy:answeredBy});}

test('unsigned carrier requests are rejected',async()=>{
 const f=fixture();
 const response=await f.handler(new Request(f.c.origin+'/twilio/inbound',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'AccountSid='+f.c.accountSid}));
 assert.equal(response.status,401);
});
test('both handsets ring while the greeting plays, with no keypad',async()=>{
 const f=fixture();const {greeting,conference,call,atAnswer}=await offered(f);
 assert.match(greeting,/Thank you for calling 805 Shutters\. We appreciate you supporting local business\. Let me get you over to one of our team members immediately\./);
 assert.match(greeting,/<Say>/);assert.doesNotMatch(greeting,/Gather|Stream|Sip|<Play>/);
 assert.equal(atAnswer.phase,'offering');assert.equal(atAnswer.greetingPlayed,false);
 assert.deepEqual(atAnswer.dials,['jessica','mike']);assert.equal(atAnswer.parentMoves,0);
 assert.ok(call.deadline-call.createdAt<=21000);assert.ok(call.deadline-call.createdAt>=20000);
 assert.match(conference,/Conference/);assert.equal(call.phase,'offering');assert.equal(call.greetingPlayed,true);
 assert.deepEqual(f.provider.operations.filter(item=>item.type==='dial').map(item=>item.staff).sort(),['jessica','mike']);
 const params=staffDialParams(f.c,call,call.offers[0]);
 assert.equal(params.find(([key])=>key==='MachineDetection')[1],'Enable');
 assert.equal(params.find(([key])=>key==='AsyncAmd')[1],'true');
 assert.equal(params.some(([key])=>/digit/i.test(key)),false);
});
test('cached Grok audio is played for the greeting and the offer window is unchanged',async()=>{
 const f=fixture();const wav=sampleWav();f.c.promptAudio={greeting:wav,unavailable:wav,voicemail:wav};
 const {greeting,atAnswer}=await offered(f,'CA'+'a'.repeat(32));
 assert.match(greeting,/<Play>https:\/\/example\.supabase\.co\/functions\/v1\/voice-805\/twilio\/prompts\/greeting\.wav<\/Play>/);
 assert.doesNotMatch(greeting,/<Say>|Gather|Stream|Sip/);
 assert.deepEqual(atAnswer.dials,['jessica','mike']);assert.equal(atAnswer.parentMoves,0);
 const audio=await f.handler(new Request(f.c.origin+'/twilio/prompts/greeting.wav'));
 assert.equal(audio.status,200);assert.equal(audio.headers.get('content-type'),'audio/wav');
 assert.equal(audio.headers.get('cache-control'),'public, max-age=86400');
 assert.equal((await audio.arrayBuffer()).byteLength,wav.byteLength);
 assert.equal((await f.handler(new Request(f.c.origin+'/twilio/prompts/greeting.wav',{method:'POST'}))).status,405);
});
test('an offer timeout during the greeting does not cut the caller off',async()=>{
 const f=fixture();const sid='CA'+'b'.repeat(32);
 assert.equal((await f.handler(carrier(f,'/twilio/inbound',{CallSid:sid,To:f.c.number,From:'+18055550199'}))).status,200);
 await Promise.all(f.tasks);
 await f.state.transact(e=>e.tick(Date.now()+20000));await f.worker.drain();
 const mid=await f.state.transact((_e,s)=>s.list('call').find(item=>item.sid===sid));
 assert.equal(mid.phase,'message');assert.equal(mid.greetingPlayed,false);assert.equal(mid.owner,null);
 assert.equal(f.provider.operations.filter(item=>item.type==='connect-agent').length,0);
 assert.equal(f.provider.operations.some(item=>item.type==='route'&&item.sid===sid),false);
 const greeted=await f.handler(carrier(f,`/twilio/greeted/${mid.id}`,{CallSid:sid,To:f.c.number,From:'+18055550199'}));
 const xml=await greeted.text();await Promise.all(f.tasks);
 assert.match(xml,/<Dial action="https:\/\/example\.supabase\.co\/functions\/v1\/voice-805\/twilio\/continue\/[^"]+" method="POST" timeout="30"><Sip>sip:\+18055908050@sip\.voice\.x\.ai;transport=tls\?X-805-Call-Id=[0-9a-f-]{36}<\/Sip><\/Dial>/);
 assert.doesNotMatch(xml,/Stream|Conference|<Say>|<Record/);
 assert.equal(f.provider.operations.filter(item=>item.type==='connect-agent').length,0);
 assert.equal(f.provider.operations.some(item=>item.type==='route'&&item.sid===sid),false);
});
test('Mike answering bridges him and cancels Jessica',async()=>{
 const f=fixture();const {call}=await offered(f);const mike=call.offers.find(o=>o.staff==='mike'),jessica=call.offers.find(o=>o.staff==='jessica');
 const response=await f.handler(amd(f,call,mike,'human'));assert.match(await response.text(),/<Pause/);await Promise.all(f.tasks);
 const next=await f.state.transact((_e,s)=>s.get('call',call.id));
 assert.equal(next.owner,'mike');assert.equal(next.phase,'handoff');assert.equal(next.offers.find(o=>o.staff==='jessica').status,'canceled');
 assert.equal(f.provider.operations.some(item=>item.type==='hangup'&&item.sid===jessica.sid),true);
});
test('Jessica answering bridges her and cancels Mike',async()=>{
 const f=fixture();const {call}=await offered(f,'CA'+'2'.repeat(32));const mike=call.offers.find(o=>o.staff==='mike'),jessica=call.offers.find(o=>o.staff==='jessica');
 assert.match(await (await f.handler(amd(f,call,jessica,'human'))).text(),/<Pause/);await Promise.all(f.tasks);
 const next=await f.state.transact((_e,s)=>s.get('call',call.id));
 assert.equal(next.owner,'jessica');assert.equal(next.offers.find(o=>o.staff==='mike').status,'canceled');assert.equal(next.offers.find(o=>o.id===jessica.id).status,'accepted');
});
test('personal voicemail and other machine results are not an answer',async()=>{
 for(const [index,answeredBy] of ['machine_start','machine_end_beep','machine_end_silence','fax','unknown'].entries()){
  const f=fixture();const {call}=await offered(f,'CA'+String(index+3).repeat(32));const mike=call.offers.find(o=>o.staff==='mike');
  const body=await (await f.handler(amd(f,call,mike,answeredBy))).text();assert.match(body,/<Hangup\/>/);assert.doesNotMatch(body,/Gather/);
  const next=await f.state.transact((_e,s)=>s.get('call',call.id));
  assert.equal(next.owner,null);assert.equal(next.offers.find(o=>o.staff==='mike').status,'no-answer');assert.notEqual(next.phase,'human');
 }
});
test('both machine answers and a 20 second timeout each return the caller to the receptionist',async()=>{
 const machines=fixture();const first=await offered(machines,'CA'+'8'.repeat(32));
 for(const offer of first.call.offers)assert.match(await (await machines.handler(amd(machines,first.call,offer,'machine_start'))).text(),/<Hangup\/>/);
 await Promise.all(machines.tasks);
 let call=await machines.state.transact((_e,s)=>s.get('call',first.call.id));
 assert.equal(call.phase,'message');assert.equal(call.owner,null);assert.equal(machines.provider.operations.some(item=>item.type==='connect-agent'),true);
 const quiet=fixture();const second=await offered(quiet,'CA'+'9'.repeat(32));
 await quiet.state.transact(e=>e.tick(Date.now()+20000));await quiet.worker.drain();
 call=await quiet.state.transact((_e,s)=>s.get('call',second.call.id));
 assert.equal(call.phase,'message');assert.equal(call.answeredAt,undefined);assert.equal(quiet.provider.operations.filter(item=>item.type==='connect-agent').length,1);
});
function assertCallsApiBody(body, c) {
 const parsed = new URLSearchParams(body);
 assert.deepEqual(parsed.getAll('StatusCallbackEvent'), ['initiated', 'ringing', 'answered', 'completed']);
 assert.equal(body.includes(','), false);
 assert.equal(/\s/.test(body), false);
 for (const key of ['Twiml', 'waitUrl', 'Conference', 'ApplicationSid', 'IfMachine']) assert.equal(parsed.has(key), false);
 for (const key of ['Url', 'StatusCallback', 'AsyncAmdStatusCallback']) {
  const url = new URL(parsed.get(key));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.search, '');
 }
 assert.equal(parsed.get('From'), c.number);
 assert.match(parsed.get('From'), /^\+1\d{10}$/);
 assert.match(parsed.get('To'), /^\+1\d{10}$/);
 assert.notEqual(parsed.get('To'), parsed.get('From'));
 assert.equal(parsed.get('MachineDetection'), 'Enable');
 assert.equal(parsed.get('AsyncAmd'), 'true');
 assert.equal(parsed.get('AsyncAmdStatusCallbackMethod'), 'POST');
 const amd = Number(parsed.get('MachineDetectionTimeout'));
 const timeout = Number(parsed.get('Timeout'));
 assert.equal(Number.isInteger(amd) && amd >= 3 && amd <= 59, true);
 assert.equal(Number.isInteger(timeout) && timeout >= 10 && timeout <= 600, true);
 assert.equal(amd < timeout, true);
}
test('staff dial matches the Calls API and a Twilio 400 keeps the code and message', async () => {
 const f = fixture();
 const bodies = [];
 f.worker.provider = new TwilioProvider(f.c, async (url, options) => {
  bodies.push(String(options.body));
  assert.match(String(url), /\/Calls\.json$/);
  assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  return new Response(JSON.stringify({ code: 21626, message: "Invalid 'StatusCallbackEvent'", status: 400 }), { status: 400 });
 });
 const sid = 'CA' + 'c'.repeat(32);
 assert.equal((await f.handler(carrier(f, '/twilio/inbound', { CallSid: sid, To: f.c.number, From: '+18055550199' }))).status, 200);
 await Promise.all(f.tasks);
 const call = await f.state.transact((_e, s) => s.list('call').find(item => item.sid === sid));
 const effects = await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'dial'));
 assert.equal(bodies.length, 2);
 for (const body of bodies) assertCallsApiBody(body, f.c);
 assert.equal(effects.length, 2);
 assert.equal(effects.every(item => item.status === 'failed' && item.error === "Twilio 21626: Invalid 'StatusCallbackEvent'"), true);
 assert.equal(call.offers.every(item => !item.sid), true);
 const plain = new TwilioProvider(f.c, async () => new Response('nope', { status: 400 }));
 const offer = call.offers[0];
 await assert.rejects(() => plain.dial(call, offer), { message: 'Twilio HTTP 400' });
 const params = staffDialParams(f.c, call, offer);
 assertCallsApiBody(new URLSearchParams(params).toString(), f.c);
});
