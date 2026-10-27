import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseState } from '../supabase-store.mjs';
import { SupabaseWorker } from '../supabase-worker.mjs';
import { createSupabaseHandler } from '../supabase-handler.mjs';
import { loadSupabaseConfig } from '../supabase-config.mjs';
import { SimulationProvider, TwilioProvider, staffDialParams } from '../provider.mjs';
import { hmac } from '../security.mjs';

class Client {
  row = {revision:0,body:{entities:{},events:{},inbound:{}}};
  from(){return {select:()=>({eq:()=>({single:async()=>({data:structuredClone(this.row)})})})};}
  async rpc(name,p){
    if(name==='voice_805_caller_context')return {data:{match:'unmatched'}};
    await new Promise(r=>setImmediate(r));
    if(p.p_revision!==this.row.revision)return {data:false};
    this.row={revision:this.row.revision+1,body:structuredClone(p.p_body)};return {data:true};
  }
}
function request(f,path,fields){
  const p=new URLSearchParams({AccountSid:f.c.accountSid,...fields});
  const sig=hmac(f.c.authToken,f.c.origin+path+[...new Set(p.keys())].sort().map(k=>k+p.get(k)).join(''),'sha1');
  return new Request(f.c.origin+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':sig},body:p});
}
async function setup(){
  const c={...loadSupabaseConfig({}),mode:'live',liveAuthorized:true,agentReviewed:true,agentContractVerified:true,workerVerified:true,
    origin:'https://example.supabase.co/functions/v1/voice-805',accountSid:'AC'+'a'.repeat(32),authToken:'t'.repeat(32),number:'+18055550100',
    xaiKey:'x'.repeat(20),toolsKey:'t'.repeat(32),controlKey:'c'.repeat(32),workerKey:'w'.repeat(32),hours:Object.fromEntries(Array.from({length:7},(_,i)=>[i,[[0,1440]]])),holidays:{},
    staff:{mike:{kind:'cell',destination:'+18055550101'},jessica:{kind:'cell',destination:'+18055550102'}}};
  const client=new Client(),state=new SupabaseState(client,c),provider=new SimulationProvider(),tasks=[];
  const worker=new SupabaseWorker(state,provider);const handler=createSupabaseHandler({state,client,worker,waitUntil:p=>tasks.push(p)});
  const f={c,state,provider,worker,handler,tasks};
  const resp=await handler(request(f,'/twilio/inbound',{CallSid:'CA'+'1'.repeat(32),To:c.number,From:'+18055550199'}));
  assert.equal(resp.status,200);assert.doesNotMatch(await resp.text(),/Gather|Press 1/);
  await drain(f);f.call=await state.transact((_e,s)=>s.list('call')[0]);return f;
}
async function drain(f){await Promise.all(f.tasks.splice(0));}
const read=f=>f.state.transact((_e,s)=>s.get('call',f.call.id));
const fields=(f,o,extra={})=>({CallSid:o.sid,To:f.c.staff[o.staff].destination,From:f.c.number,CallStatus:'in-progress',...extra});
const path=(f,o,suffix='')=>`/twilio/offer/${f.call.id}/${o.id}${suffix}`;
async function answer(f,o){const r=await f.handler(request(f,path(f,o),fields(f,o)));assert.equal(r.status,200);await drain(f);return r.text();}
async function press(f,o,digit='1'){const r=await f.handler(request(f,path(f,o,'/accept'),fields(f,o,{Digits:digit})));await drain(f);return {status:r.status,xml:await r.text()};}

test('new staff calls ring for 40 seconds without AMD and play a staff-only acceptance prompt',async()=>{
  const f=await setup(),o=f.call.offers[0],p=new URLSearchParams(staffDialParams(f.c,f.call,o));
  assert.equal(o.acceptance,'dtmf');assert.equal(p.get('Timeout'),'40');
  assert.equal(p.has('MachineDetection'),false);assert.equal(p.has('AsyncAmdStatusCallback'),false);
  assert.match(await answer(f,o),/<Gather input="dtmf" numDigits="1"/);
  const current=await read(f);assert.equal(current.owner,null);assert.equal(current.ai,true);
  assert.equal(current.offers[0].expiresAt-current.offers[0].answeredAt,20000);
});
for(const staff of ['mike','jessica'])test(`${staff} presses 1: direct staff conference and exactly one caller redirect, human only after joins`,async()=>{
  const f=await setup(),o=f.call.offers.find(o=>o.staff===staff),other=f.call.offers.find(o=>o.staff!==staff);
  await answer(f,o);const requests=[];
  f.worker.provider=new TwilioProvider(f.c,async(url,init)=>{requests.push({url,p:new URLSearchParams(init.body)});return new Response('{}');});
  for(let i=0;i<2;i++){const r=await press(f,o);assert.equal(r.status,200);assert.match(r.xml,new RegExp(`>805-${f.call.id}-main</Conference>`));assert.doesNotMatch(r.xml,/<Pause|<Stream|muted="true"/);}
  const routes=requests.filter(x=>x.p.has('Twiml'));assert.equal(routes.length,1);assert.ok(routes[0].url.endsWith(`/Calls/${f.call.sid}.json`));
  assert.equal(requests.filter(x=>x.url.endsWith(`/Calls/${other.sid}.json`)&&x.p.get('Status')==='completed').length,1);
  let current=await read(f);assert.equal(current.owner,staff);assert.equal(current.phase,'handoff');
  for(const sid of [o.sid,f.call.sid]){
    const r=await f.handler(request(f,`/twilio/conference/${f.call.id}/main`,{CallSid:sid,FriendlyName:`805-${f.call.id}-main`,ConferenceSid:'CF'+'2'.repeat(32),StatusCallbackEvent:'participant-join'}));assert.equal(r.status,200);await drain(f);
  }
  current=await read(f);assert.equal(current.phase,'human');assert.equal(current.ai,false);assert.equal(current.callerJoined,true);assert.equal(current.ownerJoined,true);
});
test('a pickup at 35 seconds receives its own confirmation window; duplicate answer does not extend it',async()=>{
  const f=await setup(),o=f.call.offers[0],t=f.call.createdAt+35000;
  await f.state.transact(e=>e.staffAnswered(f.call.id,o.id,o.sid,t));
  await f.state.transact(e=>e.staffAnswered(f.call.id,o.id,o.sid,t+10000));
  let c=await read(f);assert.equal(c.offers[0].expiresAt,t+20000);
  await f.state.transact(e=>e.confirmStaff(f.call.id,o.id,o.sid,'1',t+10000));
  c=await read(f);assert.equal(c.owner,o.staff);assert.equal(c.phase,'handoff');
});
test('voicemail/no key and wrong keys cannot take the caller; the other staff can still accept',async()=>{
  const f=await setup(),[a,b]=f.call.offers;
  await answer(f,a);await answer(f,b);
  assert.match((await press(f,a,'9')).xml,/<Gather/);assert.equal((await read(f)).owner,null);
  assert.match((await press(f,a,'')).xml,/<Hangup/);assert.equal((await read(f)).owner,null);
  assert.match((await press(f,b)).xml,/<Conference/);assert.equal((await read(f)).owner,b.staff);
});
test('simultaneous staff confirmations choose one owner and one customer redirect',async()=>{
  const f=await setup();for(const o of f.call.offers)await answer(f,o);
  const results=await Promise.all(f.call.offers.map(o=>press(f,o)));
  assert.equal(results.filter(r=>r.xml.includes('<Conference')).length,1);
  assert.equal(f.provider.operations.filter(x=>x.type==='route'&&x.sid===f.call.sid).length,1);
  assert.equal((await read(f)).offers.filter(o=>o.status==='accepted').length,1);
});
test('unsigned, wrong-account, wrong-destination, unbound and pre-answer confirmations cannot connect',async()=>{
  const f=await setup(),o=f.call.offers[0],p=path(f,o,'/accept');
  const bad=request(f,p,fields(f,o,{Digits:'1'}));bad.headers.set('x-twilio-signature','invalid');assert.equal((await f.handler(bad)).status,401);
  for(const [extra,status] of [[{AccountSid:'AC'+'b'.repeat(32)},401],[{To:'+18055550999'},409],[{From:'+18055550999'},409],[{CallSid:f.call.sid},409]])assert.equal((await f.handler(request(f,p,fields(f,o,{Digits:'1',...extra})))).status,status);
  assert.match((await press(f,o)).xml,/<Hangup/);assert.equal((await read(f)).owner,null);
});
test('late AMD cannot accept or cancel new offers; expired and ended confirmations cannot revive calls',async()=>{
  for(const condition of ['expired','ended','canceled']){
    const f=await setup(),o=f.call.offers[0];await answer(f,o);
    for(const AnsweredBy of ['human','machine_start','unknown']){await f.handler(request(f,path(f,o,'/amd'),{CallSid:o.sid,AnsweredBy}));await drain(f);}
    assert.equal((await read(f)).offers[0].status,'ringing');
    await f.state.transact((_e,s)=>{const c=s.get('call',f.call.id);if(condition==='expired')c.offers[0].expiresAt=Date.now()-1;else if(condition==='ended')c.phase='ended';else c.offers[0].status='canceled';s.put('call',c);});
    assert.match((await press(f,o)).xml,/<Hangup/);assert.equal((await read(f)).owner,null);
    assert.equal(f.provider.operations.some(x=>x.type==='route'),false);
  }
});

test('both handsets decline without taking the caller; message fallback remains available',async()=>{
  const f=await setup();
  for(const o of f.call.offers){await answer(f,o);assert.match((await press(f,o,'')).xml,/<Hangup/);}
  const c=await read(f);assert.equal(c.phase,'message');assert.equal(c.owner,null);
  assert.equal(f.provider.operations.some(x=>x.type==='route'),false);
});
test('consult and staff-initiated callback use the correct room after Press 1',async()=>{
  const f=await setup(),o=f.call.offers[0];await answer(f,o);await press(f,o);
  await f.state.transact(e=>{e.joined(f.call.id,f.call.sid,'main','CFmain','caller-joined');e.joined(f.call.id,o.sid,'main','CFmain','owner-joined');});
  let c=await read(f);assert.equal(c.phase,'human');
  await f.state.transact(e=>e.command(c.id,c.owner,c.revision,'consult',crypto.randomUUID()));await f.worker.drain();
  c=await read(f);const target=c.offers.find(x=>x.purpose==='consult');assert.ok(target);
  await answer(f,target);assert.match((await press(f,target)).xml,new RegExp(`>805-${c.id}-consult</Conference>`));
  await f.state.transact(e=>e.ended(c.id,c.sid,'test-end'));await f.worker.drain();
  const messageId=crypto.randomUUID();
  await f.state.transact((_e,s)=>s.put('message',{id:messageId,callId:c.id,callback:'+18055550199',confirmed:true}));
  f.call=await f.state.transact(e=>e.callback(messageId,'mike',crypto.randomUUID()));await f.worker.drain();f.call=await read(f);
  const callback=f.call.offers[0];await answer(f,callback);
  assert.match((await press(f,callback)).xml,new RegExp(`>805-${f.call.id}-main</Conference>`));
  assert.equal((await read(f)).phase,'callback-connecting');
});
