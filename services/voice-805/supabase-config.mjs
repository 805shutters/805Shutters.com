import { loadConfig, e164, validHours, incomingRingStaff } from './config.mjs';
import { COMMON_GREETING } from './caller-context.mjs';
export function loadSupabaseConfig(env) {
  const c=loadConfig(env);
  return {...c, mode:env.VOICE_805_MODE || 'standby', dataset:env.VOICE_805_DATASET || 'pilot',
    pilotAuthorized:env.VOICE_805_PILOT_AUTHORIZED==='true', pilotCallers:JSON.parse(env.VOICE_805_PILOT_CALLERS_JSON || '[]'),
    greeting:COMMON_GREETING, transport:env.VOICE_805_TRANSPORT || 'media', offerSeconds:Number(env.VOICE_805_OFFER_SECONDS || 20),
    sipUri:env.VOICE_805_XAI_SIP_URI || '', toolsKey:env.VOICE_805_TOOLS_KEY || '',
    workerKey:env.VOICE_805_WORKER_KEY || '', workerVerified:env.VOICE_805_WORKER_VERIFIED==='true', agentContractVerified:env.VOICE_805_AGENT_CONTRACT_VERIFIED==='true',
    fallbackGreeting:'Our team could not answer. Please leave a callback message.',
    statusTopics:JSON.parse(env.VOICE_805_STATUS_TOPICS_JSON || '{}')};
}
export function supabaseReadiness(c) {
  const missing=[];
  if(c.mode!=='live')missing.push('Production calling not activated');
  if(!c.liveAuthorized)missing.push('Temporary-number activation');
  if(!c.agentContractVerified)missing.push(c.transport==='media'?'Verified Grok audio, playback and call binding':'Verified xAI greeting, call-token and tool bindings');
  if(!c.workerVerified)missing.push('Verified durable watchdog schedule');
  if(!c.agentReviewed)missing.push(c.transport==='media'?'Reviewed 805 API receptionist prompt':'Reviewed published 805 agent');
  if(!/^AC[0-9a-f]{32}$/i.test(c.accountSid)||!c.authToken)missing.push('Dedicated 805 Twilio credentials');
  if(!e164.test(c.number))missing.push('Temporary 805 test number');
  if(!/^https:\/\/[^?#]+$/.test(c.origin))missing.push('HTTPS function URL');
  if(c.transport==='media'){if(!c.xaiKey)missing.push('Dedicated 805 Grok API key');}
  else if(c.transport!=='sip')missing.push('Supported voice transport');
  else if(!/^sip:\+[1-9]\d{7,14}@sip\.voice\.x\.ai;transport=tls$/.test(c.sipUri))missing.push('805 xAI SIP registration');
  if(c.controlKey.length<32||c.toolsKey.length<32||c.workerKey.length<32)missing.push('Private control/tool/worker keys');
  if(!validHours(c.hours)||!c.holidays)missing.push('Pacific ringing schedule');
  if(!Number.isInteger(c.offerSeconds)||c.offerSeconds<10||c.offerSeconds>60)missing.push('Valid ringing timeout');
  for(const staff of ['mike','jessica'])if(c.staff[staff]?.kind!=='cell'||!e164.test(c.staff[staff]?.destination)||c.staff[staff]?.destination===c.number)missing.push(staff+' cellular destination');
  if(c.staff.mike?.destination===c.staff.jessica?.destination)missing.push('Distinct staff destinations');
  if(!incomingRingStaff(c).length)missing.push('Incoming ring staff');
  const pilotMissing=missing.filter(item=>!['Production calling not activated','Temporary-number activation','Verified Grok audio, playback and call binding'].includes(item));
  if(c.mode==='pilot'){
    if(!c.pilotAuthorized)pilotMissing.push('Authorized handset pilot');
    if(c.dataset!=='pilot'||c.transport!=='media'||c.notificationsApproved)pilotMissing.push('Isolated incoming-only media pilot');
    if(!Array.isArray(c.pilotCallers)||!c.pilotCallers.length||c.pilotCallers.length>2||!c.pilotCallers.every(n=>e164.test(n)&&n!==c.number))pilotMissing.push('Explicit pilot caller allowlist');
  }
  return {mode:c.mode,ready:missing.length===0,pilotReady:c.mode==='pilot'&&pilotMissing.length===0,missing,...(c.mode==='pilot'?{pilotMissing}:{})};
}
export function canOperate(c){const readiness=supabaseReadiness(c);return readiness.ready||readiness.pilotReady;}
