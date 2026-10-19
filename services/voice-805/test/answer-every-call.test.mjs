import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotStore, SupabaseState } from '../supabase-store.mjs';
import { SupabaseWorker } from '../supabase-worker.mjs';
import { createSupabaseHandler } from '../supabase-handler.mjs';
import { SimulationProvider, staffDialParams } from '../provider.mjs';
import { hmac } from '../security.mjs';
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
async function offered(f,sid='CA'+'1'.repeat(32)){
 const inbound=await f.handler(carrier(f,'/twilio/inbound',{CallSid:sid,To:f.c.number,From:'+18055550199'}));
 const greeting=await inbound.text();
 const call=await f.state.transact((_e,s)=>s.list('call').find(item=>item.sid===sid));
 const greeted=await f.handler(carrier(f,`/twilio/greeted/${call.id}`,{CallSid:sid,To:f.c.number,From:'+18055550199'}));
 await Promise.all(f.tasks);
 return {greeting,conference:await greeted.text(),call:await f.state.transact((_e,s)=>s.get('call',call.id))};
}
function amd(f,call,offer,answeredBy){return carrier(f,`/twilio/offer/${call.id}/${offer.id}/amd`,{CallSid:offer.sid,To:f.c.staff[offer.staff].destination,From:f.c.number,AnsweredBy:answeredBy});}

test('unsigned carrier requests are rejected',async()=>{
 const f=fixture();
 const response=await f.handler(new Request(f.c.origin+'/twilio/inbound',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'AccountSid='+f.c.accountSid}));
 assert.equal(response.status,401);
});
test('the greeting is spoken before either handset rings, with no keypad',async()=>{
 const f=fixture();const {greeting,conference,call}=await offered(f);
 assert.match(greeting,/Thank you for calling 805 Shutters\. We appreciate you supporting local business\. Let me get you over to one of our team members immediately\./);
 assert.doesNotMatch(greeting,/Gather|Stream|Sip/);assert.match(conference,/Conference/);assert.equal(call.phase,'offering');
 assert.deepEqual(f.provider.operations.filter(item=>item.type==='dial').map(item=>item.staff).sort(),['jessica','mike']);
 const params=staffDialParams(f.c,call,call.offers[0]);
 assert.equal(params.find(([key])=>key==='MachineDetection')[1],'Enable');
 assert.equal(params.find(([key])=>key==='AsyncAmd')[1],'true');
 assert.equal(params.some(([key])=>/digit/i.test(key)),false);
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
