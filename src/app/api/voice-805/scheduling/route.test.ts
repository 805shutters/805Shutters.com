import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { createHmac,randomUUID } from 'node:crypto';
const mock=vi.hoisted(()=>({client:vi.fn(),prepare:vi.fn(),commit:vi.fn()}));
vi.mock('@/lib/supabase-server',()=>({getSupabaseServiceClient:mock.client}));
vi.mock('@/lib/voice-805/scheduling',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/voice-805/scheduling')>(),prepareVoiceVisit:mock.prepare,commitVoiceVisit:mock.commit}));
vi.mock('@/lib/booking/delivery',()=>({processBookingOutbox:vi.fn(async()=>({processed:0}))}));
import { POST } from './route';
const callId='11111111-1111-4111-8111-111111111111',key='test-key-'.repeat(8);
let call:any;
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://evuxqsaucmvgyuvjpqlo.supabase.co');vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('VOICE_805_TOOLS_KEY',key);vi.stubEnv('VOICE_805_BOOKING_AUTHORIZED','true');
 call={id:callId,phase:'message',mediaStreamSid:'MZ'+'1'.repeat(32)};
 mock.client.mockReturnValue({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{body:{entities:{call:{[callId]:call}}}}})})})})});
 mock.prepare.mockResolvedValue({slots:['10:00'],saved:false});mock.commit.mockResolvedValue({verified:true});
});
afterEach(()=>vi.unstubAllEnvs());
function request(action='find_appointments',dataset='production',patch:Record<string,string>={}){
 const raw=JSON.stringify({callId,dataset,action,input:{city:'Camarillo'}}),at=String(Date.now()),nonce=randomUUID();
 return new Request('https://www.805shutters.com/api/voice-805/scheduling',{method:'POST',headers:{'content-type':'application/json','x-805-time':at,'x-805-nonce':nonce,'x-805-signature':createHmac('sha256',key).update(`${at}\n${nonce}\n${raw}`).digest('base64'),...patch},body:raw});
}
it('rejects wrong database and preview before any CRM access',async()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://mts.invalid');expect((await POST(request())).status).toBe(503);expect(mock.client).not.toHaveBeenCalled();
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://evuxqsaucmvgyuvjpqlo.supabase.co');vi.stubEnv('VERCEL_ENV','preview');expect((await POST(request())).status).toBe(503);expect(mock.client).not.toHaveBeenCalled();
});
it('rejects unsigned, altered and expired requests before any CRM access',async()=>{
 for(const headers of [{'x-805-signature':'bad'},{'x-805-signature':'x'.repeat(44)},{'x-805-time':'1'}] as Record<string,string>[])expect((await POST(request('commit','production',headers))).status).toBe(401);
 expect(mock.client).not.toHaveBeenCalled();
});
it('accepts signed bound availability and only sends caller input to scheduler',async()=>{
 expect((await POST(request())).status).toBe(200);expect(mock.prepare.mock.calls[0].slice(1)).toEqual([callId,{city:'Camarillo'},false]);
});
it('pilot can inspect slots but cannot prepare or commit actual bookings',async()=>{
 expect((await POST(request('find_appointments','pilot'))).status).toBe(200);
 for(const action of ['prepare_appointment','commit'])expect((await POST(request(action,'pilot'))).status).toBe(503);expect(mock.commit).not.toHaveBeenCalled();
});
it('commit is gated by explicit activation and uses persisted call state',async()=>{
 vi.stubEnv('VOICE_805_BOOKING_AUTHORIZED','false');expect((await POST(request('commit'))).status).toBe(503);
 vi.stubEnv('VOICE_805_BOOKING_AUTHORIZED','true');expect((await POST(request('commit'))).status).toBe(200);expect(mock.commit.mock.calls[0].slice(1)).toEqual([callId,call]);
});
it('ended, missing stream, prior confirmation and uncertain outcome block new proposals',async()=>{
 for(const patch of [{phase:'ended'},{mediaStreamSid:null},{bookingIntent:{confirmedAt:1}},{bookingAttention:'uncertain'}]){
  call={id:callId,phase:'message',mediaStreamSid:'MZtest',...patch};expect((await POST(request('prepare_appointment'))).status).toBe(409);
 }
 expect(mock.prepare).not.toHaveBeenCalled();
});
