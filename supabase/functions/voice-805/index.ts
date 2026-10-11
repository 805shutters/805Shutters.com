// @ts-nocheck -- Supabase Deno entrypoint; checked separately from the Next.js build.
import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
import { SupabaseState } from '../../../services/voice-805/supabase-store.mjs';
import { TwilioProvider } from '../../../services/voice-805/provider.mjs';
import { SupabaseWorker } from '../../../services/voice-805/supabase-worker.mjs';
import { loadSupabaseConfig } from '../../../services/voice-805/supabase-config.mjs';
import { createSupabaseHandler } from '../../../services/voice-805/supabase-handler.mjs';

const config=loadSupabaseConfig(Deno.env.toObject());
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const state=new SupabaseState(client,config);
const worker=new SupabaseWorker(state,new TwilioProvider(config));
Deno.serve(createSupabaseHandler({state,client,worker,waitUntil:(task:Promise<unknown>)=>EdgeRuntime.waitUntil(task)}));
