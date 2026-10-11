import { loadConfig, e164, validHours } from './config.mjs';
import { COMMON_GREETING } from './caller-context.mjs';
export function loadSupabaseConfig(env) {
  const c=loadConfig(env);
  return {...c, mode:env.VOICE_805_MODE || 'standby', dataset:env.VOICE_805_DATASET || 'pilot',
    greeting:COMMON_GREETING, offerSeconds:Number(env.VOICE_805_OFFER_SECONDS || 25),
    sipUri:env.VOICE_805_XAI_SIP_URI || '', toolsKey:env.VOICE_805_TOOLS_KEY || '',
    workerKey:env.VOICE_805_WORKER_KEY || '', workerVerified:env.VOICE_805_WORKER_VERIFIED==='true', agentContractVerified:env.VOICE_805_AGENT_CONTRACT_VERIFIED==='true',
    fallbackGreeting:'Our team could not answer. Please leave a callback message.',
    statusTopics:JSON.parse(env.VOICE_805_STATUS_TOPICS_JSON || '{}')};
}
export function supabaseReadiness(c) {
  const missing=[];
  if(c.mode!=='live')missing.push('Calling disabled (standby)');
  if(!c.liveAuthorized)missing.push('Temporary-number activation');
  if(!c.agentContractVerified)missing.push('Verified xAI greeting, call-token and tool bindings');
  if(!c.workerVerified)missing.push('Verified durable watchdog schedule');
  if(!c.agentReviewed)missing.push('Reviewed published 805 agent');
  if(!/^AC[0-9a-f]{32}$/i.test(c.accountSid)||!c.authToken)missing.push('Dedicated 805 Twilio credentials');
  if(!e164.test(c.number))missing.push('Temporary 805 test number');
  if(!/^https:\/\/[^?#]+$/.test(c.origin))missing.push('HTTPS function URL');
  if(!/^sip:\+[1-9]\d{7,14}@sip\.voice\.x\.ai;transport=tls$/.test(c.sipUri))missing.push('805 xAI SIP registration');
  if(c.controlKey.length<32||c.toolsKey.length<32||c.workerKey.length<32)missing.push('Private control/tool/worker keys');
  if(!validHours(c.hours)||!c.holidays)missing.push('Pacific ringing schedule');
  if(!Number.isInteger(c.offerSeconds)||c.offerSeconds<10||c.offerSeconds>60)missing.push('Valid ringing timeout');
  for(const staff of ['mike','jessica'])if(c.staff[staff]?.kind!=='cell'||!e164.test(c.staff[staff]?.destination)||c.staff[staff]?.destination===c.number)missing.push(staff+' cellular destination');
  if(c.staff.mike?.destination===c.staff.jessica?.destination)missing.push('Distinct staff destinations');
  return {mode:c.mode,ready:missing.length===0,missing};
}
