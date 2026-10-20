import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotStore } from '../supabase-store.mjs';
import { Engine } from '../engine.mjs';
import { callerContext } from '../caller-context.mjs';
import { loadSupabaseConfig, supabaseReadiness } from '../supabase-config.mjs';
import { createSupabaseHandler } from '../supabase-handler.mjs';
import { hmac } from '../security.mjs';

function fixture(match='unmatched') {
 const c={...loadSupabaseConfig({}),transport:'media',xaiKey:'fake-test-key',mode:'live',liveAuthorized:true,agentReviewed:true,agentContractVerified:true,workerVerified:true,
  origin:'https://example.supabase.co/functions/v1/voice-805',accountSid:'AC'+'a'.repeat(32),authToken:'t'.repeat(32),number:'+18055550100',
  controlKey:'c'.repeat(32),toolsKey:'k'.repeat(32),workerKey:'w'.repeat(32),hours:Object.fromEntries(Array.from({length:7},(_,i)=>[i,[[0,1440]]])),holidays:{},
  staff:{mike:{kind:'cell',destination:'+18055550101'},jessica:{kind:'cell',destination:'+18055550102'}}};
 const store=new SnapshotStore(), engine=new Engine(store,c);const call=engine.inbound('CA'+'1'.repeat(32),'+18055550199');
 store.put('call',{...call,phase:'message',deadline:Date.now()+300000,context:callerContext({match,first_name:'Alex',statuses:['ordered']})});
 const state={config:c,transact:async fn=>fn(engine,store)};
 const worker={drain:async()=>{}};
 return {c,call,state,store,engine,worker};
}
test('carrier greeting starts both offers and a second greeting callback does not dial again',async()=>{
 const f=fixture('matched');f.store.put('call',{...f.store.get('call',f.call.id),phase:'greeting'});
 const tasks=[];const handler=createSupabaseHandler({state:f.state,client:{rpc:async()=>({data:{match:'matched'}})},worker:f.worker,waitUntil:p=>tasks.push(p)});
 const request=path=>{const p=new URLSearchParams({AccountSid:f.c.accountSid,CallSid:f.call.sid,To:f.c.number,From:f.call.from});const sig=hmac(f.c.authToken,f.c.origin+path+[...p.keys()].sort().map(k=>k+p.get(k)).join(''),'sha1');return new Request(f.c.origin+path,{method:'POST',headers:{'x-twilio-signature':sig,'content-type':'application/x-www-form-urlencoded'},body:p});};
 const response=await handler(request('/twilio/inbound'));assert.equal(response.status,200);const xml=await response.text();assert.match(xml,/<Say>Thank you for calling 805 Shutters\. We appreciate you supporting local business\. Let me get you over to one of our team members immediately\.<\/Say>/);assert(!xml.includes('<Stream'));assert(!xml.includes('Gather'));assert(!xml.includes('<Play>'));
 assert.equal(f.store.get('call',f.call.id).phase,'offering');assert.equal(f.store.get('call',f.call.id).greetingPlayed,false);assert.equal(f.store.list('effect').filter(e=>e.type==='dial').length,2);assert.equal(f.store.list('effect').some(e=>e.type==='ringback'),false);
 const finished=await handler(request('/twilio/greeted/'+f.call.id));assert.equal(finished.status,200);assert.match(await finished.text(),/Conference/);assert.equal(f.store.get('call',f.call.id).greetingPlayed,true);
 assert.equal((await handler(request('/twilio/greeted/'+f.call.id))).status,200);
 assert.equal(f.store.get('call',f.call.id).phase,'offering');assert.equal(f.store.list('effect').filter(e=>e.type==='dial').length,2);await Promise.all(tasks);
});
test('media readiness needs the Grok key, and an invalid transport fails closed',()=>{
 const f=fixture();assert.equal(supabaseReadiness(f.c).ready,true);assert.equal(supabaseReadiness({...f.c,xaiKey:''}).ready,false);assert.equal(supabaseReadiness({...f.c,transport:'invalid'}).ready,false);
});
test('allowlisted pilot can test audio without declaring production ready',()=>{
 const f=fixture();Object.assign(f.c,{mode:'pilot',liveAuthorized:false,agentContractVerified:false,pilotAuthorized:true,pilotCallers:['+18055550199'],dataset:'pilot'});
 const readiness=supabaseReadiness(f.c);assert.equal(readiness.ready,false);assert.equal(readiness.pilotReady,true);
 for(const patch of [{pilotAuthorized:false},{pilotCallers:[]},{pilotCallers:['garbage']},{dataset:'production'},{transport:'sip'},{notificationsApproved:true},{workerVerified:false},{xaiKey:''}])assert.equal(supabaseReadiness({...f.c,...patch}).pilotReady,false);
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
 const playedXml=await played.text();assert.match(playedXml,/<Play>[^<]+\/twilio\/prompts\/unavailable\.wav<\/Play><Hangup\/>/);assert.doesNotMatch(playedXml,/<Say>/);assert.equal(f.store.list('call').length,1);
});
test('pilot carrier allows staff offers but blocks customer callbacks and SMS',async()=>{
 const {TwilioProvider}=await import('../provider.mjs');const f=fixture();Object.assign(f.c,{mode:'pilot',liveAuthorized:false,pilotAuthorized:true});let requests=0;
 const provider=new TwilioProvider(f.c,async()=>{requests++;return new Response(JSON.stringify({sid:'CA'+'4'.repeat(32)}));});
 await provider.dial(f.call,{id:'offer',staff:'mike'});assert.equal(requests,1);
 assert.throws(()=>provider.dialCustomer(f.call),/disabled during pilot/);assert.throws(()=>provider.send({},{}),/disabled during pilot/);assert.equal(requests,1);
});
test('pilot staff controls cannot start a customer callback or send a text',async()=>{
 const f=fixture();Object.assign(f.c,{mode:'pilot',liveAuthorized:false,agentContractVerified:false,pilotAuthorized:true,pilotCallers:['+18055550199'],dataset:'pilot'});
 const handler=createSupabaseHandler({state:f.state,client:{},worker:f.worker});
 for(const action of ['callback','text']){
  const path='/control/messages/abc/'+action,at=String(Date.now()),nonce='pilot-request-'+action,body='{}';
  const response=await handler(new Request(f.c.origin+path,{method:'POST',headers:{'x-805-actor':'mike','x-805-time':at,'x-805-nonce':nonce,'x-805-signature':hmac(f.c.controlKey,`POST\n${path}\n${at}\n${nonce}\nmike\n${body}`)},body}));
  assert.equal(response.status,409);assert.match((await response.json()).error,/Outbound contact is disabled/);
 }
});
