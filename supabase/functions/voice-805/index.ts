// @ts-nocheck -- Supabase Deno entrypoint; checked separately from the Next.js build.
import WebSocket from 'npm:ws@8.22.0';
import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
import { GrokMediaSession } from '../../../services/voice-805/grok-media.mjs';
import { SupabaseState } from '../../../services/voice-805/supabase-store.mjs';
import { TwilioProvider } from '../../../services/voice-805/provider.mjs';
import { SupabaseWorker } from '../../../services/voice-805/supabase-worker.mjs';
import { loadSupabaseConfig } from '../../../services/voice-805/supabase-config.mjs';
import { attachMediaSocket, callbackFields, createSupabaseHandler } from '../../../services/voice-805/supabase-handler.mjs';
import { saveCallback } from '../../../services/voice-805/callbacks.mjs';
import { createSupabasePromptStore, warmPrompts, REALTIME_URL } from '../../../services/voice-805/prompts.mjs';

const config=loadSupabaseConfig(Deno.env.toObject());
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(8000)})}});
const state=new SupabaseState(client,config);
const worker=new SupabaseWorker(state,new TwilioProvider(config));
const prompts=createSupabasePromptStore(client);
const waitUntil=(task:Promise<unknown>)=>EdgeRuntime.waitUntil(task);
waitUntil(warmPrompts(config,prompts));
const upgradeMedia=(request:Request,gate:{load:()=>Promise<Record<string,unknown>|null>,eligible:(call:Record<string,unknown>|null)=>boolean})=>{
 const {socket,response}=Deno.upgradeWebSocket(request);
 const done=attachMediaSocket(socket,{
  load:gate.load,
  eligible:gate.eligible,
  start(call){
   const session=new GrokMediaSession({socket,call,state,worker,
    connect:()=>new WebSocket(REALTIME_URL,{headers:{Authorization:`Bearer ${config.xaiKey}`},handshakeTimeout:8000,maxPayload:1048576}),
    saveCrm:async(message:Record<string,string>)=>{
     const current=await state.transact((_e,s)=>s.get('call',call.id));
     const source=current||call;
     const row=await saveCallback(client,callbackFields({get:()=>''},message.text||'',source,{name:message.name,callback:message.callback,message:message.text,transcript:message.text,customerId:message.customerId||source.customerId||null}));
     if(!row?.id||row.call_sid!==call.sid)throw new Error('Callback save was not verified');
     return {verified:true,id:row.id,call_sid:row.call_sid};
    }});
   EdgeRuntime.waitUntil(session.done);
  },
 });
 EdgeRuntime.waitUntil(done);
 return response;
};
Deno.serve(createSupabaseHandler({state,client,worker,upgradeMedia,prompts,waitUntil}));
