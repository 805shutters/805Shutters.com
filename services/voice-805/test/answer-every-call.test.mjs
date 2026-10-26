import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotStore, SupabaseState } from '../supabase-store.mjs';
import { SupabaseWorker } from '../supabase-worker.mjs';
import { createSupabaseHandler } from '../supabase-handler.mjs';
import { SimulationProvider, TwilioProvider, staffDialParams } from '../provider.mjs';
import { hmac } from '../security.mjs';
import { promptDigest, promptPublicPath } from '../prompts.mjs';
import { loadSupabaseConfig } from '../supabase-config.mjs';

const config=()=>({...loadSupabaseConfig({}),mode:'live',liveAuthorized:true,agentReviewed:true,agentContractVerified:true,workerVerified:true,transport:'media',xaiKey:'x'.repeat(20),
 origin:'https://example.supabase.co/functions/v1/voice-805',accountSid:'AC'+'a'.repeat(32),authToken:'t'.repeat(32),number:'+18055550100',
 toolsKey:'t'.repeat(32),controlKey:'c'.repeat(32),workerKey:'w'.repeat(32),offerSeconds:20,
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
test('both handsets ring while the welcome plays, with no keypad or customer ring tone',async()=>{
 const f=fixture();const {greeting,conference,call,atAnswer}=await offered(f);
 assert.match(greeting,/<Connect><Stream /);
 assert.doesNotMatch(greeting,/<Say>|<Play>|Gather|Sip|ringback/);
 assert.equal(atAnswer.phase,'offering');assert.equal(atAnswer.greetingPlayed,false);assert.equal(call.listeningWelcome,true);
 assert.deepEqual(atAnswer.dials,['jessica','mike']);assert.equal(atAnswer.parentMoves,0);
 assert.ok(call.deadline-call.createdAt<=21000);assert.ok(call.deadline-call.createdAt>=20000);
 assert.match(conference,/Conference/);assert.match(conference,/\/twilio\/wait/);assert.doesNotMatch(conference,/ringback/);
 assert.equal(call.phase,'offering');assert.equal(call.greetingPlayed,true);
 assert.deepEqual(f.provider.operations.filter(item=>item.type==='dial').map(item=>item.staff).sort(),['jessica','mike']);
 const params=staffDialParams(f.c,call,call.offers[0]);
 assert.equal(params.find(([key])=>key==='MachineDetection')[1],'Enable');
 assert.equal(params.find(([key])=>key==='AsyncAmd')[1],'true');
 assert.equal(params.some(([key])=>/digit/i.test(key)),false);
});
test('a human answer during the welcome connects the caller without a ring tone',async()=>{
 const f=fixture();const sid='CA'+'c'.repeat(32);
 const inbound=await f.handler(carrier(f,'/twilio/inbound',{CallSid:sid,To:f.c.number,From:'+18055550199'}));
 const xml=await inbound.text();
 assert.match(xml,/<Connect><Stream /);assert.doesNotMatch(xml,/<Say>|<Play>|Gather|ringback/);
 await Promise.all(f.tasks);
 const call=await callAfter(f,sid);
 assert.equal(call.phase,'offering');assert.equal(call.greetingPlayed,false);assert.equal(call.listeningWelcome,true);
 const mike=call.offers.find(item=>item.staff==='mike');
 assert.match(await (await f.handler(amd(f,call,mike,'human'))).text(),/<Pause/);
 await Promise.all(f.tasks);
 const next=await callAfter(f,sid);
 assert.equal(next.owner,'mike');assert.equal(next.phase,'handoff');assert.equal(next.greetingPlayed,false);assert.equal(next.answeredAt,undefined);
 assert.equal(f.provider.operations.filter(item=>item.type==='route'&&item.sid===sid).length,1);
 assert.equal(f.provider.operations.some(item=>item.type==='ringback'||item.type==='connect-agent'),false);
 assert.equal(next.offers.find(item=>item.staff==='jessica').status,'canceled');
 const wait=await f.handler(carrier(f,'/twilio/wait',{CallSid:sid,To:f.c.number,From:'+18055550199'}));
 const waitXml=await wait.text();
 assert.match(waitXml,/<Pause length="40"\/>/);assert.doesNotMatch(waitXml,/<Play>|<Say>|ringback/);
});
test('no answer leaves the listening stream and does not restart the welcome',async()=>{
 const f=fixture();const sid='CA'+'7'.repeat(32);
 const inbound=await f.handler(carrier(f,'/twilio/inbound',{CallSid:sid,To:f.c.number,From:'+18055550199'}));
 const xml=await inbound.text();
 assert.match(xml,/<Connect><Stream /);assert.doesNotMatch(xml,/Thank you for calling|<Say>|<Play>|ringback/);
 await Promise.all(f.tasks);
 await f.state.transact(e=>e.tick(Date.now()+20000));await f.worker.drain();
 const call=await callAfter(f,sid);
 assert.equal(call.phase,'message');assert.equal(call.owner,null);assert.equal(call.greetingPlayed,false);assert.equal(call.listeningWelcome,true);
 assert.equal(f.provider.operations.filter(item=>item.type==='connect-agent').length,0);
 assert.equal(f.provider.operations.some(item=>item.type==='ringback'||(item.type==='route'&&item.sid===sid)),false);
 const continued=await f.handler(carrier(f,`/twilio/continue/${call.id}`,{CallSid:sid,To:f.c.number,From:'+18055550199'}));
 const continuedXml=await continued.text();
 assert.doesNotMatch(continuedXml,/<Record|After the tone/);assert.match(continuedXml,/no recording was made/);assert.match(continuedXml,/call back to leave a message or schedule an appointment/);
 assert.doesNotMatch(continuedXml,/Thank you for calling|<Connect>/);
});
test('cached greeting audio stays available while the welcome is a listening stream',async()=>{
 const f=fixture();const wav=sampleWav();f.c.promptAudio={greeting:wav,unavailable:wav,voicemail:wav};
 const {greeting,atAnswer}=await offered(f,'CA'+'a'.repeat(32));
 const greetingPath=promptPublicPath('greeting');
 assert.match(greeting,/<Connect><Stream /);
 assert.doesNotMatch(greeting,/<Say>|<Play>|Gather|Sip|ringback/);
 assert.deepEqual(atAnswer.dials,['jessica','mike']);assert.equal(atAnswer.parentMoves,0);
 const audio=await f.handler(new Request(f.c.origin+greetingPath));
 assert.equal(audio.status,200);assert.equal(audio.headers.get('content-type'),'audio/wav');
 assert.equal(audio.headers.get('cache-control'),'public, max-age=86400');
 assert.equal((await audio.arrayBuffer()).byteLength,wav.byteLength);
 const stale=promptPublicPath('greeting','Thank you for calling 805 Shutters. We appreciate you supporting local business.');
 assert.notEqual(stale,greetingPath);
 assert.equal((await f.handler(new Request(f.c.origin+stale))).status,404);
 assert.equal((await f.handler(new Request(f.c.origin+greetingPath+'?v=1'))).status,400);
 assert.equal((await f.handler(new Request(f.c.origin+'/twilio/prompts/greeting.wav'))).status,200);
 assert.equal((await f.handler(new Request(f.c.origin+'/twilio/prompts/greeting.wav'))).headers.get('cache-control'),'no-store');
 assert.equal((await f.handler(new Request(f.c.origin+greetingPath,{method:'POST'}))).status,405);
 assert.equal(promptDigest('greeting'),greetingPath.match(/greeting-([0-9a-f]{16})/)[1]);
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
 assert.match(xml,/<Connect><Stream url="wss:\/\/example\.supabase\.co\/functions\/v1\/voice-805\/twilio\/media\//);
 assert.doesNotMatch(xml,/Conference|<Say>/);
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
 assert.equal(call.phase,'message');assert.equal(call.owner,null);assert.equal(machines.provider.operations.some(item=>item.type==='connect-agent'),false);
 assert.equal(machines.provider.operations.some(item=>item.type==='ringback'),false);
 assert.ok(call.deadline-Date.now()<=300000);assert.ok(call.deadline-Date.now()>=290000);
 const quiet=fixture();const second=await offered(quiet,'CA'+'9'.repeat(32));
 await quiet.state.transact(e=>e.tick(Date.now()+20000));await quiet.worker.drain();
 call=await quiet.state.transact((_e,s)=>s.get('call',second.call.id));
 assert.equal(call.phase,'message');assert.equal(call.answeredAt,undefined);assert.equal(quiet.provider.operations.filter(item=>item.type==='connect-agent').length,0);
 assert.equal(quiet.provider.operations.some(item=>item.type==='ringback'||(item.type==='route'&&item.sid===second.call.sid)),false);
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
const geographic = "Account not authorized to call +18055550101. Geographic permission required.";
function reject21215() {
 return new Response(JSON.stringify({ code: 21215, message: geographic, status: 400 }), { status: 400 });
}
function useTwilio(f, fetcher) { f.worker.provider = new TwilioProvider(f.c, fetcher); }
async function callAfter(f, sid) {
 return f.state.transact((_e, s) => s.list('call').find(item => item.sid === sid));
}
test('both 21215 rejects during the greeting finish the greeting before Grok', async () => {
 const f = fixture();
 const bodies = [];
 useTwilio(f, async (_url, options) => { bodies.push(String(options.body)); return reject21215(); });
 const sid = 'CA' + 'd'.repeat(32);
 const inbound = await f.handler(carrier(f, '/twilio/inbound', { CallSid: sid, To: f.c.number, From: '+18055550199' }));
 const greeting = await inbound.text();
 assert.match(greeting, /<Connect><Stream /);
 assert.doesNotMatch(greeting, /<Say>|<Play>|Conference|Pause|ringback/);
 await Promise.all(f.tasks);
 const call = await callAfter(f, sid);
 assert.equal(call.phase, 'message');
 assert.equal(call.greetingPlayed, false);
 assert.equal(call.offers.every(item => item.status === 'no-answer' && !item.sid && item.error === `Twilio 21215: ${geographic}`), true);
 const effects = await f.state.transact((_e, s) => s.list('effect'));
 assert.equal(effects.filter(item => item.type === 'dial').every(item => item.status === 'failed' && item.error === `Twilio 21215: ${geographic}`), true);
 assert.equal(effects.filter(item => item.type === 'connect-agent').length, 0);
 assert.equal(bodies.length, 2);
 const greeted = await f.handler(carrier(f, `/twilio/greeted/${call.id}`, { CallSid: sid, To: f.c.number, From: '+18055550199' }));
 const xml = await greeted.text();
 await Promise.all(f.tasks);
 assert.match(xml, /<Connect><Stream url="wss:\/\/example\.supabase\.co\/functions\/v1\/voice-805\/twilio\/media\//);
 assert.doesNotMatch(xml, /Conference|<Say>|<Pause>/);
 const after = await callAfter(f, sid);
 assert.equal(after.greetingPlayed, true);
 assert.equal(after.phase, 'message');
 assert.equal((await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'connect-agent'))).length, 0);
});
test('both 21215 rejects after the welcome stay on the listening stream', async () => {
 const f = fixture();
 let release;
 const gate = new Promise(resolve => { release = resolve; });
 useTwilio(f, async () => { await gate; return reject21215(); });
 const sid = 'CA' + 'e'.repeat(32);
 assert.equal((await f.handler(carrier(f, '/twilio/inbound', { CallSid: sid, To: f.c.number, From: '+18055550199' }))).status, 200);
 const early = await callAfter(f, sid);
 const greeted = await f.handler(carrier(f, `/twilio/greeted/${early.id}`, { CallSid: sid, To: f.c.number, From: '+18055550199' }));
 assert.match(await greeted.text(), /Conference/);
 release();
 await Promise.all(f.tasks);
 const call = await callAfter(f, sid);
 assert.equal(call.greetingPlayed, true);
 assert.equal(call.phase, 'message');
 assert.equal(call.offers.every(item => item.status === 'no-answer' && item.error.startsWith('Twilio 21215:')), true);
 const connects = await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'connect-agent'));
 assert.equal(connects.length, 0);
 await f.worker.drain();
 assert.equal((await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'connect-agent'))).length, 0);
 assert.equal((await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'route'))).length, 0);
});
test('one 21215 reject leaves the other offer free to ring and answer', async () => {
 const f = fixture();
 useTwilio(f, async (_url, options) => {
  const to = new URLSearchParams(String(options.body)).get('To');
  if (to === f.c.staff.mike.destination) return reject21215();
  return new Response(JSON.stringify({ sid: 'CA' + '5'.repeat(32) }), { status: 201 });
 });
 const sid = 'CA' + 'f'.repeat(32);
 assert.equal((await f.handler(carrier(f, '/twilio/inbound', { CallSid: sid, To: f.c.number, From: '+18055550199' }))).status, 200);
 await Promise.all(f.tasks);
 let call = await callAfter(f, sid);
 const mike = call.offers.find(item => item.staff === 'mike');
 const jessica = call.offers.find(item => item.staff === 'jessica');
 assert.equal(mike.status, 'no-answer');
 assert.equal(mike.sid, null);
 assert.equal(mike.error, `Twilio 21215: ${geographic}`);
 assert.equal(jessica.status, 'ringing');
 assert.equal(jessica.sid, 'CA' + '5'.repeat(32));
 assert.equal(call.phase, 'offering');
 assert.equal((await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'connect-agent'))).length, 0);
 const answered = await f.handler(amd(f, call, jessica, 'human'));
 assert.match(await answered.text(), /<Pause/);
 await Promise.all(f.tasks);
 call = await callAfter(f, sid);
 assert.equal(call.phase, 'handoff');
 assert.equal(call.owner, 'jessica');
 const rejected = call.offers.find(item => item.staff === 'mike');
 assert.equal(rejected.status, 'canceled');
 assert.equal(rejected.error, `Twilio 21215: ${geographic}`);
 assert.equal(rejected.sid, null);
 assert.equal((await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'route'))).length, 1);
 assert.equal((await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'connect-agent'))).length, 0);
});
test('uncertain dial submissions are not retried or treated as no-answer', async () => {
 const f = fixture();
 let attempts = 0;
 useTwilio(f, async () => { attempts += 1; throw new Error('socket hang up'); });
 const sid = 'CA' + '6'.repeat(32);
 assert.equal((await f.handler(carrier(f, '/twilio/inbound', { CallSid: sid, To: f.c.number, From: '+18055550199' }))).status, 200);
 await Promise.all(f.tasks);
 const call = await callAfter(f, sid);
 assert.equal(attempts, 2);
 assert.equal(call.phase, 'offering');
 assert.equal(call.offers.every(item => item.status === 'pending' && !item.sid && !item.error), true);
 const effects = await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'dial'));
 assert.equal(effects.every(item => item.status === 'uncertain' && item.error === 'Carrier outcome unknown; reconcile before retry.'), true);
 await f.worker.drain();
 assert.equal(attempts, 2);
 assert.equal((await callAfter(f, sid)).phase, 'offering');
});
test('a bound staff SID wins a 21215 race and a late SID does not transfer twice', async () => {
 const raced = fixture();
 useTwilio(raced, async (_url, options) => {
  const target = new URL(new URLSearchParams(String(options.body)).get('Url'));
  const parts = target.pathname.split('/');
  const offerId = parts.at(-1);
  const callId = parts.at(-2);
  await raced.state.transact(e => e.bind(callId, offerId, 'CA' + '7'.repeat(32)));
  return reject21215();
 });
 const sid = 'CA' + '8'.repeat(32);
 assert.equal((await raced.handler(carrier(raced, '/twilio/inbound', { CallSid: sid, To: raced.c.number, From: '+18055550199' }))).status, 200);
 await Promise.all(raced.tasks);
 const racedCall = await callAfter(raced, sid);
 assert.equal(racedCall.phase, 'offering');
 assert.equal(racedCall.offers.every(item => item.status === 'ringing' && item.sid === 'CA' + '7'.repeat(32) && !item.error), true);
 const racedEffects = await raced.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'dial'));
 assert.equal(racedEffects.every(item => item.status === 'done' && item.reconciled === 'signed callback bound call SID'), true);
 assert.equal((await raced.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'connect-agent' || item.type === 'route'))).length, 0);
 const late = fixture();
 useTwilio(late, async () => reject21215());
 const lateSid = 'CA' + '9'.repeat(32);
 assert.equal((await late.handler(carrier(late, '/twilio/inbound', { CallSid: lateSid, To: late.c.number, From: '+18055550199' }))).status, 200);
 await Promise.all(late.tasks);
 const lateCall = await callAfter(late, lateSid);
 assert.equal(lateCall.phase, 'message');
 await late.state.transact(e => e.bind(lateCall.id, lateCall.offers[0].id, 'CA' + '4'.repeat(32)));
 const revived = await callAfter(late, lateSid);
 assert.equal(revived.phase, 'message');
 assert.equal(revived.offers[0].status, 'no-answer');
 assert.equal(revived.offers[0].sid, 'CA' + '4'.repeat(32));
 const lateEffects = await late.state.transact((_e, s) => s.list('effect'));
 assert.equal(lateEffects.filter(item => item.type === 'hangup' && item.data.sid === 'CA' + '4'.repeat(32)).length, 1);
 assert.equal(lateEffects.filter(item => item.type === 'connect-agent').length, 0);
 assert.equal(lateEffects.filter(item => item.type === 'route').length, 0);
});
test('conference ringback is an audible tone without a spoken line', async () => {
 const f = fixture();
 const tone = await f.handler(new Request(f.c.origin + '/twilio/ringback.wav'));
 assert.equal(tone.status, 200);
 assert.equal(tone.headers.get('content-type'), 'audio/wav');
 const bytes = new Uint8Array(await tone.arrayBuffer());
 assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF');
 assert.equal(bytes[22], 1);
 const spoken = bytes.subarray(44, 44 + 160).some(value => value !== 0);
 const quiet = bytes.subarray(bytes.length - 160).every(value => value === 0);
 assert.equal(spoken, true);
 assert.equal(quiet, true);
 const ring = await f.handler(carrier(f, '/twilio/ringback', { CallSid: 'CA' + '1'.repeat(32), To: f.c.number, From: '+18055550199' }));
 const xml = await ring.text();
 assert.match(xml, /<Play loop="0">https:\/\/example\.supabase\.co\/functions\/v1\/voice-805\/twilio\/ringback\.wav<\/Play>/);
 assert.doesNotMatch(xml, /<Say>|<Pause>|hold/);
});
test('a failed media attach records the stream error and does not replay the greeting', async () => {
 const f = fixture();
 const { greeting, call } = await offered(f, 'CA' + 'b'.repeat(32));
 assert.match(greeting, /<Connect><Stream /);
 assert.doesNotMatch(greeting, /<Say>|<Play>|ringback/);
 await f.state.transact(e => e.tick(Date.now() + 20000));
 await f.worker.drain();
 const before = await callAfter(f, 'CA' + 'b'.repeat(32));
 assert.equal(before.phase, 'message');
 assert.equal(before.greetingPlayed, true);
 const dials = (await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'dial'))).length;
 const connects = (await f.state.transact((_e, s) => s.list('effect').filter(item => item.type === 'connect-agent'))).length;
 assert.equal(connects, 0);
 const agent = await f.handler(carrier(f, `/twilio/agent/${call.id}`, { CallSid: before.sid, To: f.c.number, From: '+18055550199' }));
 const agentXml = await agent.text();
 const streamUrl = `wss://example.supabase.co/functions/v1/voice-805/twilio/media/${call.id}`;
 assert.match(agentXml, new RegExp(`<Stream url="${streamUrl}" statusCallback="https://example\\.supabase\\.co/functions/v1/voice-805/twilio/stream/${call.id}" statusCallbackMethod="POST" />`));
 assert.doesNotMatch(agentXml, /Thank you for calling|Gather|<Say>/);
 const continued = await f.handler(carrier(f, `/twilio/continue/${call.id}`, { CallSid: before.sid, To: f.c.number, From: '+18055550199' }));
 const continuedXml = await continued.text();
 assert.doesNotMatch(continuedXml, /<Record|After the tone/);
 assert.match(continuedXml, /no recording was made/);
 assert.match(continuedXml, /call back to leave a message or schedule an appointment/);
 assert.doesNotMatch(continuedXml, /Thank you for calling|Would you like|greeting\.wav|<Connect>/);
 assert.equal((await callAfter(f, before.sid)).streamError, 'Media stream did not attach');
 const streamSid = 'MZ' + '3'.repeat(32);
 const official = (fields) => carrier(f, `/twilio/stream/${call.id}`, { CallSid: before.sid, AccountSid: f.c.accountSid, StreamSid: streamSid, StreamName: streamSid, Timestamp: '2026-10-20T02:27:36Z', ...fields });
 const started = await f.handler(official({ StreamEvent: 'stream-started' }));
 assert.equal(started.status, 200);
 const startedCall = await callAfter(f, before.sid);
 assert.equal(startedCall.lastStreamEvent, 'stream-started');
 assert.equal(startedCall.streamError, 'Media stream did not attach');
 const secret = `Bearer ${'s'.repeat(40)}`;
 const stream = await f.handler(official({ StreamEvent: 'stream-error', StreamError: `Handshake Error 31920 ${secret}`, Timestamp: '2026-10-20T02:27:37Z' }));
 assert.equal(stream.status, 200);
 const recorded = await callAfter(f, before.sid);
 assert.equal(recorded.mediaFailed, true);
 assert.equal(recorded.mediaStreamSid, undefined);
 assert.equal(recorded.lastStreamEvent, 'stream-error');
 assert.match(recorded.streamError, /Handshake Error 31920/);
 assert.equal(recorded.streamError.includes(secret), false);
 assert.equal(recorded.streamError.includes('s'.repeat(40)), false);
 const duplicate = await f.handler(official({ StreamEvent: 'stream-error', StreamError: 'a different later error', Timestamp: '2026-10-20T02:27:38Z' }));
 assert.equal(duplicate.status, 200);
 const deduped = await callAfter(f, before.sid);
 assert.equal(deduped.revision, recorded.revision);
 assert.equal(deduped.streamError, recorded.streamError);
 const unsigned = await f.handler(new Request(f.c.origin + `/twilio/stream/${call.id}`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'StreamEvent=stream-error',
 }));
 assert.equal(unsigned.status, 401);
 await f.handler(carrier(f, `/twilio/continue/${call.id}`, { CallSid: before.sid, To: f.c.number, From: '+18055550199', SequenceNumber: '2' }));
 await f.worker.drain();
 const after = await callAfter(f, before.sid);
 assert.equal(after.phase, 'message');
 assert.equal(after.mediaFailed, true);
 const effects = await f.state.transact((_e, s) => s.list('effect'));
 assert.equal(effects.filter(item => item.type === 'dial').length, dials);
 assert.equal(effects.filter(item => item.type === 'connect-agent').length, connects);
 assert.equal(effects.filter(item => item.type === 'route').length, 0);
});
