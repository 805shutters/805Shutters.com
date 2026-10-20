import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { bookingDatabaseFixture } from '@/lib/booking/database-fixture';
import { candidateVisit } from '@/lib/booking/scheduling';
import { eventSignature } from '@/lib/booking/travel';
const db=new PGlite();
const date='2035-10-01',month='2035-10';
beforeAll(async()=>{
 const phone=readFileSync('supabase/migrations/20261011014441_voice_805_supabase_call_center.sql','utf8').split('create function public.voice_805_normalize_phone')[0];
 await db.exec(bookingDatabaseFixture()+phone+readFileSync('supabase/migrations/20261019230000_voice_805_confirmed_booking.sql','utf8')+readFileSync('supabase/migrations/20261020035500_voice_805_agent_staff_notice.sql','utf8'));
},30000);
beforeEach(async()=>{
 await db.exec("truncate booking_travel_buffer_exceptions,booking_outbox,booking_requests,booking_route_protections,crm_quotes,crm_calendar_events,crm_jobs,leads,sales_805_appointments,crm_availability_slots cascade; update voice_805_state set body='{\"entities\":{\"call\":{}},\"events\":{},\"inbound\":{}}',revision=0;");
 const snap=await snapshot();
 await db.query('select booking_publish_ranges($1,$2,$3,$4)',[month,snap.revision,JSON.stringify([{start_at:'2035-10-01T15:00:00Z',end_at:'2035-10-02T00:00:00Z'}]),'test@local.invalid']);
});
afterAll(()=>db.close());
async function snapshot(){return (await db.query<{s:{revision:string}}>('select booking_schedule_snapshot($1) s',[month])).rows[0].s;}
async function fixture(patch:Record<string,unknown>={},dataset='production'){
 const id=randomUUID(),intentId=randomUUID();const payload={name:'Test Caller',phone:'+18055550199',city:'Camarillo',address:'123 Test Street, Camarillo',date,time:'10:00',kind:'residential',windowCount:null};
 const event={...candidateVisit(date,'10:00',payload.address,null,id,60),meta:{windowCount:null,bookingDurationPolicy:'residential_fixed_60_v1'}};
 const call={id,phase:'message',mediaStreamSid:'MZ'+'1'.repeat(32),bookingIntent:{id:intentId,kind:'appointment',payload,playedAt:Date.now()-1000,confirmedAt:Date.now()},...patch};
 await db.query("update voice_805_state set body=jsonb_set(body,array['entities','call',$1],$2::jsonb) where id=$3",[id,JSON.stringify(call),dataset]);
 const args=[id,intentId,JSON.stringify(payload),'hash-'+id,(await snapshot()).revision,JSON.stringify({source:'self_booking',status:'booked',name:payload.name,phone:payload.phone,meta:{address:payload.address,appointmentDate:date,appointmentTime:'10:00'}}),JSON.stringify({customer_name:payload.name,phone:payload.phone,address:payload.address,product_interest:'',meta:{}}),JSON.stringify(event),JSON.stringify([{eventId:id,signature:eventSignature(event),checkedAt:new Date().toISOString(),previous:null,next:null}])];
 return {id,intentId,args,call};
}
const commit=(args:unknown[])=>db.query<{result:Record<string,unknown>}>('select voice_805_book_confirmed($1,$2,$3,$4,$5,$6,$7,$8,$9) result',args);
it('atomic booking saves one CRM appointment, attributes it to the agent, and queues one staff text per recipient',async()=>{
 const f=await fixture();const first=await commit(f.args);const replay=await commit(f.args);
 expect(replay.rows[0].result.calendarEventId).toBe(first.rows[0].result.calendarEventId);
 expect((await db.query<{n:number}>('select count(*)::int n from crm_calendar_events')).rows[0].n).toBe(1);
 const event=(await db.query<{notes:string;meta:{bookedVia:string;bookingSource:string}}>('select notes,meta from crm_calendar_events')).rows[0];
 expect(event.notes).toContain('via agent');expect(event.meta).toMatchObject({bookedVia:'agent',bookingSource:'805_phone'});
 const notices=(await db.query<{kind:string;status:string;payload:{recipient:string;bookedVia:string}}>('select kind,status,payload from booking_outbox order by kind')).rows;
 expect(notices.map(row=>[row.kind,row.status,row.payload.recipient,row.payload.bookedVia])).toEqual([['agent_staff_sms_jessica','pending','Jessica','agent'],['agent_staff_sms_mike','pending','Mike','agent']]);
 expect((await db.query<{n:number}>("select count(*)::int n from booking_outbox where kind in ('customer_sms','customer_email')")).rows[0].n).toBe(0);
 const state=(await db.query<{body:any,revision:number}>("select body,revision from voice_805_state where id='production'")).rows[0];
 expect(state.body.entities.call[f.id].booking.verified).toBe(true);expect(Number(state.revision)).toBe(1);
 const stale=await db.query<{accepted:boolean}>("select voice_805_commit('production',0,'{}') accepted");expect(stale.rows[0].accepted).toBe(false);
});
it('hangup before booking, missing confirmation, pilot data and altered intent cannot book',async()=>{
 for(const patch of [{phase:'ended'},{bookingIntent:null},{mediaStreamSid:null}]){const f=await fixture(patch);await expect(commit(f.args)).rejects.toThrow(/BOOKING_/);}
 const pilot=await fixture({},'pilot');await expect(commit(pilot.args)).rejects.toThrow(/BOOKING_CONFIRMATION_REQUIRED/);
 const changed=await fixture();changed.args[2]=JSON.stringify({...changed.call.bookingIntent.payload,time:'12:00'});await expect(commit(changed.args)).rejects.toThrow(/BOOKING_CONFIRMATION_REQUIRED/);
 expect((await db.query<{n:number}>('select count(*)::int n from leads')).rows[0].n).toBe(0);
});
it('unplayed or expired confirmation is rejected',async()=>{
 for(const playedAt of [null,Date.now()-120000]){
  const f=await fixture();await db.query("update voice_805_state set body=jsonb_set(body,array['entities','call',$1,'bookingIntent','playedAt'],$2::jsonb) where id='production'",[f.id,JSON.stringify(playedAt)]);await expect(commit(f.args)).rejects.toThrow(/BOOKING_CONFIRMATION_REQUIRED/);
 }
});
it('two callers cannot take the same slot; no losing partial CRM records',async()=>{
 const a=await fixture(),b=await fixture();const results=await Promise.allSettled([commit(a.args),commit(b.args)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 expect((await db.query<{n:number}>('select count(*)::int n from leads')).rows[0].n).toBe(1);
});
it('booking replay after hangup returns the committed record, changed hash is rejected',async()=>{
 const f=await fixture();await commit(f.args);await db.query("update voice_805_state set body=jsonb_set(body,array['entities','call',$1,'phase'],'\"ended\"') where id='production'",[f.id]);
 expect((await commit(f.args)).rows[0].result.replayed).toBe(true);
 f.args[3]='different';await expect(commit(f.args)).rejects.toThrow(/BOOKING_KEY_REUSED/);
});
it('public and authenticated roles cannot execute phone booking',async()=>{
 const r=await db.query<{anon:boolean,authenticated:boolean}>("select has_function_privilege('anon','public.voice_805_book_confirmed(uuid,uuid,jsonb,text,text,jsonb,jsonb,jsonb,jsonb)','EXECUTE') anon,has_function_privilege('authenticated','public.voice_805_book_confirmed(uuid,uuid,jsonb,text,text,jsonb,jsonb,jsonb,jsonb)','EXECUTE') authenticated");expect(r.rows[0]).toEqual({anon:false,authenticated:false});
});
