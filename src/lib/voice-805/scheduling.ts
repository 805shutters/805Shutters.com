import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BookingError, candidateVisit, checkCandidate, readSchedule, scheduleError, validateServiceAddress } from '@/lib/booking/scheduling';
import { bookingDurationForWindowCount, bookingSlotDurationMinutes, buildBookingAvailability } from '@/lib/booking/availability';
import { googleDriveEstimator } from '@/lib/booking/travel';

export class VoiceReplan extends BookingError { constructor(){super(409,'That time no longer fits. Choose another time or a callback.');} }
export type VoiceVisit = { city:string; address:string; date:string; kind:'residential'|'commercial'; windowCount:number|null; time?:string; name?:string; phone?:string };
export function parseVisit(input: unknown, complete=false):VoiceVisit {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new BookingError(400,'Visit details required.');
 const p=input as Record<string,unknown>;
 const keys=['city','address','date','kind','windowCount','time',...(complete?['name','phone']:[])];
 if(Object.keys(p).some(k=>!keys.includes(k))||typeof p.city!=='string'||!p.city.trim()||p.city.length>120||typeof p.address!=='string'||!p.address.trim()||p.address.length>512||typeof p.date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(p.date)||new Date(p.date+'T12:00:00Z').toISOString().slice(0,10)!==p.date||!['residential','commercial'].includes(String(p.kind)))throw new BookingError(400,'City, full address, date and consultation type required.');
 const count=p.windowCount;
 if((count!==null&&(!Number.isInteger(count)||Number(count)<1||Number(count)>10000))||(p.kind==='commercial'&&count===null))throw new BookingError(400,'Approximate window count required for commercial appointments.');
 if('time' in p && (typeof p.time!=='string'||!/^\d{2}:(00|30)$/.test(p.time)))throw new BookingError(400,'Choose a time on the hour or half hour.');
 if(complete&&(typeof p.time!=='string'||typeof p.name!=='string'||!p.name.trim()||p.name.length>120||typeof p.phone!=='string'||!/^\+[1-9]\d{7,14}$/.test(p.phone)))throw new BookingError(400,'Choose a returned time and provide name and callback number.');
 return {...p,city:p.city.trim(),address:p.address.trim()} as VoiceVisit;
}
const duration=(p:VoiceVisit)=>p.kind==='residential'?bookingSlotDurationMinutes:bookingDurationForWindowCount(p.windowCount);
const clock=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m;};
const dayNumber=(date:string)=>Math.round(Date.parse(date+'T00:00:00Z')/86400000);
export async function slotsForPreferredTime(db:SupabaseClient, preferred:unknown) {
 const text=typeof preferred==='string'?preferred.trim():'';
 const match=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(00|30)$/.exec(text);
 if(!match)throw new BookingError(400,'preferred_time must be Pacific YYYY-MM-DD HH:mm on the hour or half hour.');
 const date=match[1], time=`${match[2]}:${match[3]}`;
 if(new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new BookingError(400,'preferred_time must be a real date.');
 const snapshot=await readSchedule(db,date.slice(0,7));
 const days=buildBookingAvailability(date.slice(0,7),snapshot.events,snapshot.slots,{now:new Date(),appointmentDurationMinutes:bookingSlotDurationMinutes}).days;
 const pool:{date:string;time:string;minutesAway:number}[]=[];
 for(const day of days){
  const gap=Math.abs(dayNumber(day.date)-dayNumber(date));
  if(gap>3)continue;
  for(const slot of day.slots||[]){
   if(!slot.available)continue;
   const delta=Math.abs(clock(slot.time)-clock(time));
   if(delta>(gap===0?180:60))continue;
   pool.push({date:day.date,time:slot.time,minutesAway:gap*24*60+delta});
  }
 }
 pool.sort((a,b)=>a.minutesAway-b.minutesAway||a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
 const exact=pool.some(slot=>slot.date===date&&slot.time===time);
 const alternatives=pool.filter(slot=>!(slot.date===date&&slot.time===time)).slice(0,3);
 return {date,timezone:'America/Los_Angeles',requested:time,exact,slots:exact?[time]:[],alternatives,fit:exact||alternatives.length>0,saved:false};
}
export async function prepareVoiceVisit(db:SupabaseClient,callId:string,input:unknown,complete=false) {
 const p=parseVisit(input,complete);
 // Full address, including the caller supplied city, must geocode unambiguously.
 const resolved=await validateServiceAddress(`${p.address}, ${p.city}`);
 const address=resolved.formattedAddress||`${p.address}, ${p.city}`;
 const snapshot=await readSchedule(db,p.date.slice(0,7));
 const now=new Date(),drive=googleDriveEstimator(now);
 const event=(time:string,date=p.date)=>candidateVisit(date,time,address,p.windowCount,callId,duration(p));
 if(!complete){
  const days=buildBookingAvailability(p.date.slice(0,7),snapshot.events,snapshot.slots,{now,appointmentDurationMinutes:duration(p)}).days;
  if(!p.time){
   const slots:string[]=[];
   for(const slot of days.find(d=>d.date===p.date)?.slots||[]){
    if(slot.available&&!(await checkCandidate(snapshot,event(slot.time),drive,now)).reason)slots.push(slot.time);
    if(slots.length===3)break;
   }
   if((await readSchedule(db,p.date.slice(0,7))).revision!==snapshot.revision)throw new BookingError(409,'Calendar changed. Check again.');
   return {date:p.date,timezone:'America/Los_Angeles',slots,saved:false};
  }
  const pool:{date:string;time:string;rank:number}[]=[];
  for(const day of days){
   const gap=Math.abs(dayNumber(day.date)-dayNumber(p.date));
   if(gap>3)continue;
   for(const slot of day.slots||[]){
    if(!slot.available)continue;
    const delta=Math.abs(clock(slot.time)-clock(p.time));
    if(delta>(gap===0?180:60))continue;
    pool.push({date:day.date,time:slot.time,rank:gap*24*60+delta});
   }
  }
  pool.sort((a,b)=>a.rank-b.rank||a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  const approved:{date:string;time:string;minutesAway:number}[]=[];
  for(const slot of pool.slice(0,12)){
   if((await checkCandidate(snapshot,event(slot.time,slot.date),drive,now)).reason)continue;
   approved.push({date:slot.date,time:slot.time,minutesAway:Math.abs(dayNumber(slot.date)-dayNumber(p.date))*24*60+Math.abs(clock(slot.time)-clock(p.time))});
  }
  if((await readSchedule(db,p.date.slice(0,7))).revision!==snapshot.revision)throw new BookingError(409,'Calendar changed. Check again.');
  const exact=approved.some(slot=>slot.date===p.date&&slot.time===p.time);
  const alternatives=approved.filter(slot=>!(slot.date===p.date&&slot.time===p.time)).sort((a,b)=>a.minutesAway-b.minutesAway||a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).slice(0,3);
  return {date:p.date,timezone:'America/Los_Angeles',requested:p.time,exact,slots:exact?[p.time]:[],alternatives,fit:exact||alternatives.length>0,saved:false};
 }
 const checked=await checkCandidate(snapshot,event(p.time!),drive,now);
 if(checked.reason)throw new BookingError(409,'That appointment cannot safely fit. Offer another time or a callback.');
 const payload={...p,address,city:p.city};
 const readback=`Consultation for ${p.name}, at ${address}, on ${p.date} at ${p.time} Pacific time, for ${duration(p)} minutes. Callback number ${p.phone!.split('').join(' ')}. Please say yes to book this appointment, or say what you want changed.`;
 return {intent:{id:randomUUID(),kind:'appointment',payload,readback},saved:false};
}
export async function commitVoiceVisit(db:SupabaseClient,callId:string,call:Record<string,any>) {
 const intent=call.bookingIntent;
 if(!intent?.confirmedAt||intent.kind!=='appointment')throw new BookingError(409,'Caller confirmation is required.');
 const p=parseVisit(intent.payload,true);
 const hash=createHash('sha256').update(JSON.stringify(intent.payload)).digest('hex');
 // Read an earlier committed result before revalidating changed calendars or a hung-up call.
 const prior=await db.from('booking_requests').select('request_hash,response').eq('key',callId).maybeSingle();
 if(prior.error)throw new BookingError(503,'Could not verify previous booking.');
 if(prior.data){
  if(prior.data.request_hash!==hash)throw new BookingError(409,'This call already has a different booking.');
  return verifyBooking(db,prior.data.response,p);
 }
 if(call.phase!=='message')throw new BookingError(409,'Call is no longer active.');
 const resolved=await validateServiceAddress(p.address);
 const snapshot=await readSchedule(db,p.date.slice(0,7));
 const now=new Date();
 const meta={windowCount:p.windowCount,appointmentDurationMinutes:duration(p),bookingGeo:resolved.point,bookingAuthority:'jessica_v1',bookingSource:'805_phone',voiceCallId:callId,...(p.kind==='residential'?{bookingDurationPolicy:'residential_fixed_60_v1'}:{})};
 // Use exactly the address/time read back. A later geocoder response cannot change consent.
 const event={...candidateVisit(p.date,p.time!,p.address,p.windowCount,callId,duration(p)),title:`${p.name} consultation`,meta};
 const checked=await checkCandidate(snapshot,event,googleDriveEstimator(now),now);
 if(checked.reason)throw new VoiceReplan();
 const lead={source:'self_booking',status:'booked',name:p.name,phone:p.phone,interest:'',notes:'Booked by 805 phone receptionist after the caller said yes to the readback.',page_path:'/phone',meta:{...meta,address:p.address,appointmentDate:p.date,appointmentTime:p.time}};
 const job={customer_name:p.name,phone:p.phone,address:p.address,product_interest:'',next_action:'Review phone booking and prepare consultation',meta};
 const {data,error}=await db.rpc('voice_805_book_confirmed',{p_call_id:callId,p_intent_id:intent.id,p_payload:intent.payload,p_hash:hash,p_revision:snapshot.revision,p_lead:lead,p_job:job,p_event:event,p_proofs:checked.proofs});
 if(error){if(/BOOKING_(STALE|CLOSED|FULL|CONFLICT|TRAVEL)/.test(error.message||''))throw new VoiceReplan();scheduleError(error);}
 return verifyBooking(db,data,p);
}
async function verifyBooking(db:SupabaseClient,result:Record<string,any>,p:VoiceVisit) {
 if(!result?.calendarEventId||!result?.jobId||!result?.leadId)throw new BookingError(503,'Incomplete booking result.');
 const {data,error}=await db.from('crm_calendar_events').select('id,job_id,start_at,end_at,location,status').eq('id',result.calendarEventId).single();
 const expected=candidateVisit(p.date,p.time!,p.address,p.windowCount,result.calendarEventId,duration(p));
 if(error||!data||data.job_id!==result.jobId||Date.parse(data.start_at)!==Date.parse(expected.start_at)||Date.parse(data.end_at)!==Date.parse(expected.end_at)||data.location!==p.address||data.status!=='scheduled')throw new BookingError(503,'Saved appointment could not be verified.');
 return {verified:true,date:p.date,time:p.time,timezone:'America/Los_Angeles',calendarEventId:data.id};
}
