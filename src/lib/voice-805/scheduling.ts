import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BookingError, candidateVisit, checkCandidate, readSchedule, scheduleError, validateServiceAddress, type ScheduleSnapshot } from '@/lib/booking/scheduling';
import { bookingDurationForWindowCount, bookingSlotDurationMinutes, buildBookingAvailability, losAngelesDateString } from '@/lib/booking/availability';
import { googleDriveEstimator, travelBufferMinutes, type RouteProof } from '@/lib/booking/travel';

export class VoiceReplan extends BookingError { constructor(){super(409,'That time no longer fits. Choose another time or a callback.');} }
const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
export type VoiceWeekday = typeof WEEKDAYS[number];
export type VoiceVisit = { city:string; address:string; date?:string; kind:'residential'|'commercial'; windowCount:number|null; time?:string; window?:string; weekday?:VoiceWeekday; name?:string; phone?:string };
const clock=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m;};
function validDate(value:unknown):value is string { return typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value; }
function validWindow(value:unknown):value is string {
 if(value==='anytime'||value==='morning'||value==='afternoon')return true;
 if(typeof value!=='string')return false;
 const match=value.match(/^(\d{2}:(?:00|30))-(\d{2}:(?:00|30))$/);
 return Boolean(match&&clock(match[1])<clock(match[2]));
}
export function parseVisit(input: unknown, complete=false):VoiceVisit {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new BookingError(400,'Visit details required.');
 const p=input as Record<string,unknown>;
 const keys=['city','address','date','kind','windowCount','time','window','weekday',...(complete?['name','phone']:[])];
 if(Object.keys(p).some(k=>!keys.includes(k))||typeof p.city!=='string'||!p.city.trim()||p.city.length>120||typeof p.address!=='string'||!p.address.trim()||p.address.length>512||!['residential','commercial'].includes(String(p.kind)))throw new BookingError(400,'City, full address, date and consultation type required.');
 const count=p.windowCount;
 if((count!==null&&(!Number.isInteger(count)||Number(count)<1||Number(count)>10000))||(p.kind==='commercial'&&count===null))throw new BookingError(400,'Approximate window count required for commercial appointments.');
 if('time' in p && p.time!=null && (typeof p.time!=='string'||!/^\d{2}:(00|30)$/.test(p.time)))throw new BookingError(400,'Choose a time on the hour or half hour.');
 if('window' in p && p.window!=null && !validWindow(p.window))throw new BookingError(400,'Use anytime, morning, afternoon, or an hour or half-hour window.');
 if('weekday' in p && p.weekday!=null && (typeof p.weekday!=='string'||!WEEKDAYS.includes(p.weekday.toLowerCase() as VoiceWeekday)))throw new BookingError(400,'Name a weekday from Sunday through Saturday.');
 const date=p.date==null||p.date===''?undefined:p.date;
 if(date!==undefined&&!validDate(date))throw new BookingError(400,'City, full address, date and consultation type required.');
 if((complete||p.time)&&!date)throw new BookingError(400,'City, full address, date and consultation type required.');
 if(!complete&&!date&&typeof p.weekday!=='string')throw new BookingError(400,'A date or weekday is required.');
 if(complete&&(typeof p.time!=='string'||typeof p.name!=='string'||!p.name.trim()||p.name.length>120||typeof p.phone!=='string'||!/^\+[1-9]\d{7,14}$/.test(p.phone)))throw new BookingError(400,'Choose a returned time and provide name and callback number.');
 return {city:p.city.trim(),address:p.address.trim(),...(date?{date}:{}),kind:p.kind as VoiceVisit['kind'],windowCount:count as number|null,...(typeof p.time==='string'?{time:p.time}:{}),...(typeof p.window==='string'?{window:p.window}:{}),...(typeof p.weekday==='string'?{weekday:p.weekday.toLowerCase() as VoiceWeekday}:{}),...(complete?{name:(p.name as string).trim(),phone:p.phone as string}:{})};
}
const duration=(p:VoiceVisit)=>p.kind==='residential'?bookingSlotDurationMinutes:bookingDurationForWindowCount(p.windowCount);
const dayNumber=(date:string)=>Math.round(Date.parse(date+'T00:00:00Z')/86400000);
function weekdayName(date:string){const [y,m,d]=date.split('-').map(Number);return WEEKDAYS[new Date(Date.UTC(y,m-1,d)).getUTCDay()];}
function shiftDate(date:string,days:number){const [y,m,d]=date.split('-').map(Number);return losAngelesDateString(new Date(Date.UTC(y,m-1,d+days,20)));}
/** Weekday-only requests resolve in Pacific time, from today through the next 28 days. An explicit date is kept and must not be past or on another weekday. */
export function flexibleDates(input:{date?:string;weekday?:string},now:Date){
 const today=losAngelesDateString(now);
 if(input.date){
  if(input.date<today)throw new BookingError(400,'That date has already passed.');
  if(input.weekday&&weekdayName(input.date)!==input.weekday)throw new BookingError(400,'That date is not the requested weekday.');
  return [input.date];
 }
 if(!input.weekday)throw new BookingError(400,'A date or weekday is required.');
 const dates:string[]=[];
 for(let offset=0;offset<28;offset++){const date=shiftDate(today,offset);if(weekdayName(date)===input.weekday)dates.push(date);}
 return dates;
}
export function slotMatchesWindow(time:string,window?:string){
 if(!window||window==='anytime')return true;
 const start=clock(time);
 if(window==='morning')return start<12*60;
 if(window==='afternoon')return start>=12*60;
 const [from,to]=window.split('-');
 return start>=clock(from)&&start<clock(to);
}
export type FlexibleCandidate={date:string;time:string;startAt:string;proof:RouteProof};
/**
 * Rank verified flexible slots. Lower incremental drive wins: the candidate's own
 * previous.seconds plus next.seconds (a missing side is zero because that leg was
 * proved absent). Equal travel then prefers the tighter proved gap after the
 * existing 15-minute buffer. Remaining ties are earlier date, then earlier time.
 * No business weights and no buffer change. Unverified travel never reaches this list.
 */
export function rankFlexibleCandidates(candidates:FlexibleCandidate[]){
 const bufferMs=travelBufferMinutes*60*1000;
 const travel=(proof:RouteProof)=>(proof.previous?.seconds??0)+(proof.next?.seconds??0);
 const slack=(candidate:FlexibleCandidate)=>{
  let total=0,sides=0;
  if(candidate.proof.previous){total+=Date.parse(candidate.startAt)-(Date.parse(candidate.proof.previous.departureAt)+candidate.proof.previous.seconds*1000)-bufferMs;sides++;}
  if(candidate.proof.next){total+=candidate.proof.next.signature[1]-(Date.parse(candidate.proof.next.departureAt)+candidate.proof.next.seconds*1000)-bufferMs;sides++;}
  return sides?total:Number.POSITIVE_INFINITY;
 };
 return [...candidates].sort((a,b)=>travel(a.proof)-travel(b.proof)||slack(a)-slack(b)||a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
}
const FLEX_BUDGET_MS=12_000;
const FLEX_CONCURRENCY=4;
const AGENT_NOTICE_KINDS=['agent_staff_sms_jessica','agent_staff_sms_mike'] as const;
export async function prepareVoiceVisit(db:SupabaseClient,callId:string,input:unknown,complete=false,options:{now?:Date;budgetMs?:number}={}) {
 const p=parseVisit(input,complete);
 // Full address, including the caller supplied city, must geocode unambiguously.
 const resolved=await validateServiceAddress(`${p.address}, ${p.city}`);
 const address=resolved.formattedAddress||`${p.address}, ${p.city}`;
 const now=options.now??new Date();
 const drive=googleDriveEstimator(now);
 const event=(time:string,date:string)=>candidateVisit(date,time,address,p.windowCount,callId,duration(p));
 if(!complete){
  if(p.time){
   const snapshot=await readSchedule(db,p.date!.slice(0,7));
   const days=buildBookingAvailability(p.date!.slice(0,7),snapshot.events,snapshot.slots,{now,appointmentDurationMinutes:duration(p)}).days;
   const pool:{date:string;time:string;rank:number}[]=[];
   for(const day of days){
    const gap=Math.abs(dayNumber(day.date)-dayNumber(p.date!));
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
    approved.push({date:slot.date,time:slot.time,minutesAway:Math.abs(dayNumber(slot.date)-dayNumber(p.date!))*24*60+Math.abs(clock(slot.time)-clock(p.time))});
   }
   if((await readSchedule(db,p.date!.slice(0,7))).revision!==snapshot.revision)throw new BookingError(409,'Calendar changed. Check again.');
   const exact=approved.some(slot=>slot.date===p.date&&slot.time===p.time);
   const alternatives=approved.filter(slot=>!(slot.date===p.date&&slot.time===p.time)).sort((a,b)=>a.minutesAway-b.minutesAway||a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).slice(0,3);
   return {date:p.date,timezone:'America/Los_Angeles',requested:p.time,exact,slots:exact?[p.time]:[],alternatives,fit:exact||alternatives.length>0,saved:false};
  }
  const dates=flexibleDates({date:p.date,weekday:p.weekday},now);
  const months=[...new Set(dates.map(date=>date.slice(0,7)))];
  const snapshots:{month:string;snapshot:ScheduleSnapshot}[]=[];
  for(const month of months)snapshots.push({month,snapshot:await readSchedule(db,month)});
  const days=snapshots.flatMap(item=>buildBookingAvailability(item.month,item.snapshot.events||[],item.snapshot.slots||[],{now,appointmentDurationMinutes:duration(p)}).days);
  const eligible:{date:string;time:string}[]=[];
  for(const date of dates)for(const slot of days.find(day=>day.date===date)?.slots||[])if(slot.available&&slotMatchesWindow(slot.time,p.window))eligible.push({date,time:slot.time});
  // One shared estimator caches identical legs. Concurrency is 4. New checks stop at 12s so the 20s tool timeout can still finish in-flight routes; an unfinished set is the best verified subset, not a claimed global optimum. Travel without a proof is omitted.
  const budget=options.budgetMs??FLEX_BUDGET_MS,started=Date.now();
  const verified:FlexibleCandidate[]=[];
  let cursor=0,startedCount=0;
  await Promise.all(Array.from({length:Math.min(FLEX_CONCURRENCY,eligible.length)},async()=>{
   for(;;){
    if(Date.now()-started>=budget)return;
    const index=cursor++;
    if(index>=eligible.length)return;
    startedCount++;
    const slot=eligible[index];
    const snapshot=snapshots.find(item=>item.month===slot.date.slice(0,7))!.snapshot;
    const built=event(slot.time,slot.date);
    const checked=await checkCandidate(snapshot,built,drive,now);
    const proof=checked.proofs?.find(item=>item.eventId===built.id)??null;
    if(checked.reason||!proof)continue;
    verified.push({date:slot.date,time:slot.time,startAt:built.start_at,proof});
   }
  }));
  for(const item of snapshots)if((await readSchedule(db,item.month)).revision!==item.snapshot.revision)throw new BookingError(409,'Calendar changed. Check again.');
  const ranked=rankFlexibleCandidates(verified);
  const recommendation=ranked[0]?{date:ranked[0].date,time:ranked[0].time}:null;
  return {date:recommendation?.date||dates[0],timezone:'America/Los_Angeles',recommendation,alternatives:ranked.slice(1,3).map(({date,time})=>({date,time})),fit:Boolean(recommendation),saved:false,searchComplete:startedCount===eligible.length,window:p.window||'anytime'};
 }
 const checked=await checkCandidate(await readSchedule(db,p.date!.slice(0,7)),event(p.time!,p.date!),drive,now);
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
  return verifyBooking(db,prior.data.response,p,callId);
 }
 if(call.phase!=='message')throw new BookingError(409,'Call is no longer active.');
 const resolved=await validateServiceAddress(p.address!);
 const snapshot=await readSchedule(db,p.date!.slice(0,7));
 const now=new Date();
 const meta={windowCount:p.windowCount,appointmentDurationMinutes:duration(p),bookingGeo:resolved.point,bookingAuthority:'jessica_v1',bookingSource:'805_phone',bookedVia:'agent',voiceCallId:callId,...(p.kind==='residential'?{bookingDurationPolicy:'residential_fixed_60_v1'}:{})};
 // Use exactly the address/time read back. A later geocoder response cannot change consent.
 const visit={...candidateVisit(p.date!,p.time!,p.address!,p.windowCount,callId,duration(p)),title:`${p.name} consultation`,notes:'Booked via agent on the 805 phone line.',meta};
 const checked=await checkCandidate(snapshot,visit,googleDriveEstimator(now),now);
 if(checked.reason)throw new VoiceReplan();
 const lead={source:'self_booking',status:'booked',name:p.name,phone:p.phone,interest:'',notes:'Booked by 805 phone receptionist after the caller said yes to the readback.',page_path:'/phone',meta:{...meta,address:p.address,appointmentDate:p.date,appointmentTime:p.time}};
 const job={customer_name:p.name,phone:p.phone,address:p.address,product_interest:'',next_action:'Review phone booking and prepare consultation',meta};
 const {data,error}=await db.rpc('voice_805_book_confirmed',{p_call_id:callId,p_intent_id:intent.id,p_payload:intent.payload,p_hash:hash,p_revision:snapshot.revision,p_lead:lead,p_job:job,p_event:visit,p_proofs:checked.proofs});
 if(error){if(/BOOKING_(STALE|CLOSED|FULL|CONFLICT|TRAVEL)/.test(error.message||''))throw new VoiceReplan();scheduleError(error);}
 return verifyBooking(db,data,p,callId);
}
async function verifyBooking(db:SupabaseClient,result:Record<string,any>,p:VoiceVisit,callId:string) {
 if(!result?.calendarEventId||!result?.jobId||!result?.leadId)throw new BookingError(503,'Incomplete booking result.');
 const {data,error}=await db.from('crm_calendar_events').select('id,job_id,start_at,end_at,location,status,notes,meta').eq('id',result.calendarEventId).single();
 const expected=candidateVisit(p.date!,p.time!,p.address!,p.windowCount,result.calendarEventId,duration(p));
 const attributed=data?.meta?.bookedVia==='agent'&&data?.meta?.bookingSource==='805_phone'&&String(data?.notes||'').toLowerCase().includes('via agent');
 if(error||!data||data.job_id!==result.jobId||Date.parse(data.start_at)!==Date.parse(expected.start_at)||Date.parse(data.end_at)!==Date.parse(expected.end_at)||data.location!==p.address||data.status!=='scheduled'||!attributed)throw new BookingError(503,'Saved appointment could not be verified.');
 const notices=await db.from('booking_outbox').select('kind,status,payload').eq('booking_key',callId);
 const rows=(notices.data||[]) as {kind:string;status:string;payload?:{noticePhase?:string}}[];
 if(notices.error||AGENT_NOTICE_KINDS.some(kind=>!rows.some(row=>row.kind===kind)))throw new BookingError(503,'Staff notice was not saved with the appointment.');
 const mine=AGENT_NOTICE_KINDS.map(kind=>rows.find(row=>row.kind===kind)!);
 const statuses=mine.map(row=>row.status);
 // Persistence is enough to say booked. pending is queued; sent is provider acceptance; delivered requires that carrier status.
 const staffNotice=statuses.some(status=>status==='failed'||status==='uncertain'||status==='skipped')?'needs_reconciliation':statuses.every(status=>status==='sent')?(mine.every(row=>row.payload?.noticePhase==='delivered')?'delivered':'sent'):statuses.some(status=>status==='processing')?'sending':'queued';
 return {verified:true,date:p.date,time:p.time,timezone:'America/Los_Angeles',calendarEventId:data.id,staffNotice};
}
