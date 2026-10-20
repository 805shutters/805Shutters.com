import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BookingError, candidateVisit, checkCandidate, readSchedule, scheduleError, validateServiceAddress, type ScheduleSnapshot } from '@/lib/booking/scheduling';
import { bookingDurationForWindowCount, bookingSlotDurationMinutes, buildBookingAvailability, losAngelesDateString } from '@/lib/booking/availability';
import { googleDriveEstimator, travelBufferMinutes, type DriveEstimator, type RouteProof } from '@/lib/booking/travel';

export class VoiceReplan extends BookingError { constructor(){super(409,'That time no longer fits. Choose another time or a callback.');} }
const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
export type VoiceWeekday = typeof WEEKDAYS[number];
export type VoiceVisit = { city:string; address:string; date?:string; kind:'residential'|'commercial'; windowCount:number|null; time?:string; window?:string; weekday?:VoiceWeekday; name?:string; phone?:string };
const clock=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m;};
const CALLBACK='No open CRM time fits. Take a callback message so staff can see whether they can accommodate.';
const CLOSED='That time is not an open CRM slot. Offer a callback so staff can see whether they can accommodate it.';
function weekdayName(date:string){const [y,m,d]=date.split('-').map(Number);return WEEKDAYS[new Date(Date.UTC(y,m-1,d)).getUTCDay()];}
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
 if(complete&&!date)throw new BookingError(400,'City, full address, date and consultation type required.');
 if(!complete&&!date&&typeof p.weekday!=='string')throw new BookingError(400,'A date or weekday is required.');
 if(date&&typeof p.weekday==='string'&&weekdayName(date)!==p.weekday.toLowerCase())throw new BookingError(400,'That date is not the requested weekday.');
 if(typeof p.time==='string'&&typeof p.window==='string'&&p.window!=='anytime'&&!slotMatchesWindow(p.time,p.window))throw new BookingError(400,'That time is outside the requested window.');
 if(complete&&(typeof p.time!=='string'||typeof p.name!=='string'||!p.name.trim()||p.name.length>120||typeof p.phone!=='string'||!/^\+[1-9]\d{7,14}$/.test(p.phone)))throw new BookingError(400,'Choose a returned time and provide name and callback number.');
 return {city:p.city.trim(),address:p.address.trim(),...(date?{date}:{}),kind:p.kind as VoiceVisit['kind'],windowCount:count as number|null,...(typeof p.time==='string'?{time:p.time}:{}),...(typeof p.window==='string'?{window:p.window}:{}),...(typeof p.weekday==='string'?{weekday:p.weekday.toLowerCase() as VoiceWeekday}:{}),...(complete?{name:(p.name as string).trim(),phone:p.phone as string}:{})};
}
const duration=(p:VoiceVisit)=>p.kind==='residential'?bookingSlotDurationMinutes:bookingDurationForWindowCount(p.windowCount);
const dayNumber=(date:string)=>Math.round(Date.parse(date+'T00:00:00Z')/86400000);
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
export type FlexibleCandidate={date:string;time:string;startAt:string;proof:RouteProof;detour:number};
/**
 * Inserting a visit removes the direct previous-to-next leg and adds the two new legs.
 * Incremental detour is those new seconds minus that baseline. A missing side removes
 * nothing, so its baseline is zero. Both neighbors with an unproved baseline return null
 * and must not be ranked. Equal detour then prefers the tighter proved gap after the
 * existing 15-minute buffer, then earlier date, then earlier time.
 */
export function incrementalDetourSeconds(proof:RouteProof,baseline:number|null){
 const added=(proof.previous?.seconds??0)+(proof.next?.seconds??0);
 if(proof.previous&&proof.next){
  if(baseline==null||!Number.isFinite(baseline)||baseline<0)return null;
  return added-baseline;
 }
 return added;
}
export function rankFlexibleCandidates(candidates:FlexibleCandidate[]){
 const bufferMs=travelBufferMinutes*60*1000;
 const slack=(candidate:FlexibleCandidate)=>{
  let total=0,sides=0;
  if(candidate.proof.previous){total+=Date.parse(candidate.startAt)-(Date.parse(candidate.proof.previous.departureAt)+candidate.proof.previous.seconds*1000)-bufferMs;sides++;}
  if(candidate.proof.next){total+=candidate.proof.next.signature[1]-(Date.parse(candidate.proof.next.departureAt)+candidate.proof.next.seconds*1000)-bufferMs;sides++;}
  return sides?total:Number.POSITIVE_INFINITY;
 };
 return [...candidates].sort((a,b)=>a.detour-b.detour||slack(a)-slack(b)||a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
}
const FIND_BUDGET_MS=15_000;
const FLEX_CONCURRENCY=4;
const TIMEOUT='timeout' as const;
function untilDeadline<T>(work:Promise<T>,deadline:number):Promise<T|typeof TIMEOUT>{
 const left=deadline-Date.now();
 let settled=false;
 let status:'pending'|'value'|'error'='pending';
 let value=undefined as T;
 let reason:unknown;
 const tracked=work.then(next=>{status='value';value=next;return next;},error=>{status='error';reason=error;if(settled)return undefined as never;throw error;});
 // A result that is already fulfilled still counts. A call that has not returned does not get extra time.
 if(left<=0){settled=true;return Promise.resolve().then(()=>status==='value'?value:status==='error'?Promise.reject(reason):TIMEOUT);}
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{settled=true;resolve(TIMEOUT);},left);
  tracked.then(next=>{if(settled)return;settled=true;clearTimeout(timer);resolve(next);},error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
 });
}
function unfinished(p:VoiceVisit,date?:string){
 const anchor=date||p.date;
 if(p.time)return {date:anchor,timezone:'America/Los_Angeles',requested:p.time,exact:false,slots:[],alternatives:[],fit:false,saved:false,searchComplete:false,next:CALLBACK};
 return {date:anchor,timezone:'America/Los_Angeles',recommendation:null,alternatives:[],fit:false,saved:false,searchComplete:false,window:p.window||'anytime',next:CALLBACK};
}
async function baselineSeconds(proof:RouteProof,drive:DriveEstimator,deadline:number){
 if(!proof.previous||!proof.next)return 0;
 const from=proof.previous.signature[5],to=proof.next.signature[5];
 const departure=new Date(proof.previous.departureAt);
 if(!from||!to||!Number.isFinite(departure.getTime()))return null;
 const seconds=await untilDeadline(drive(from,to,departure),deadline);
 return seconds===TIMEOUT?TIMEOUT:seconds;
}
function publishedOpen(days:{date:string;slots?:{time:string;available:boolean}[]}[],date:string,time:string){
 return Boolean(days.find(day=>day.date===date)?.slots?.some(slot=>slot.time===time&&slot.available));
}
const AGENT_NOTICE_KINDS=['agent_staff_sms_jessica','agent_staff_sms_mike'] as const;
async function loadSnapshots(db:SupabaseClient,months:string[],deadline:number){
 const snapshots:{month:string;snapshot:ScheduleSnapshot}[]=[];
 for(const month of months){
  const snapshot=await untilDeadline(readSchedule(db,month),deadline);
  if(snapshot===TIMEOUT)return TIMEOUT;
  snapshots.push({month,snapshot});
 }
 return snapshots;
}
async function revisionsHeld(db:SupabaseClient,snapshots:{month:string;snapshot:ScheduleSnapshot}[],deadline:number){
 for(const item of snapshots){
  const next=await untilDeadline(readSchedule(db,item.month),deadline);
  if(next===TIMEOUT)return TIMEOUT;
  if(next.revision!==item.snapshot.revision)return 'changed' as const;
 }
 return true;
}
type PreparedVoiceVisit={date?:string;timezone?:string;requested?:string;exact?:boolean;slots?:string[];alternatives?:{date:string;time:string;minutesAway?:number}[];fit?:boolean;saved:boolean;searchComplete?:boolean;recommendation?:{date:string;time:string}|null;window?:string;next?:string;intent?:{id:string;kind:string;payload:VoiceVisit;readback:string}};
export async function prepareVoiceVisit(db:SupabaseClient,callId:string,input:unknown,complete=false,options:{now?:Date;budgetMs?:number;drive?:DriveEstimator}={}):Promise<PreparedVoiceVisit> {
 const p=parseVisit(input,complete);
 const now=options.now??new Date();
 if(!complete){
  // The whole find, including geocoding, snapshots, in-flight routes, and the revision re-read, must finish inside the voice tool's 20s limit.
  const budget=options.budgetMs??FIND_BUDGET_MS;
  const deadline=Date.now()+budget;
  if(deadline<=Date.now())return unfinished(p);
  // Route calls stop before the find deadline so the revision re-read still runs inside it.
  const checksUntil=deadline-Math.min(2_000,Math.floor(budget/4));
  const drive=options.drive??googleDriveEstimator(now);
  const geocoded=await untilDeadline(validateServiceAddress(`${p.address}, ${p.city}`),deadline);
  if(geocoded===TIMEOUT)return unfinished(p);
  const address=geocoded.formattedAddress||`${p.address}, ${p.city}`;
  const dates=flexibleDates({date:p.date,weekday:p.weekday},now);
  const anchor=p.date??dates[0];
  const event=(time:string,date:string)=>candidateVisit(date,time,address,p.windowCount,callId,duration(p));
  const months=p.time&&!p.weekday?[anchor.slice(0,7)]:[...new Set(dates.map(date=>date.slice(0,7)))];
  const snapshots=await loadSnapshots(db,months,deadline);
  if(snapshots===TIMEOUT)return unfinished(p,anchor);
  const days=snapshots.flatMap(item=>buildBookingAvailability(item.month,item.snapshot.events||[],item.snapshot.slots||[],{now,appointmentDurationMinutes:duration(p)}).days);
  const seen=new Set<string>();
  if(p.time){
   const allowed=p.weekday?new Set(dates):null;
   const pool:{date:string;time:string;rank:number}[]=[];
   for(const day of days){
    if(seen.has(day.date))continue;seen.add(day.date);
    if(allowed&&!allowed.has(day.date))continue;
    const gap=Math.abs(dayNumber(day.date)-dayNumber(anchor));
    if(gap>3)continue;
    for(const slot of day.slots||[]){
     if(!slot.available||!slotMatchesWindow(slot.time,p.window))continue;
     const delta=Math.abs(clock(slot.time)-clock(p.time));
     if(delta>(gap===0?180:60))continue;
     pool.push({date:day.date,time:slot.time,rank:gap*24*60+delta});
    }
   }
   pool.sort((a,b)=>a.rank-b.rank||a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
   const approved:{date:string;time:string;minutesAway:number}[]=[];
   let searchComplete=true;
   for(const slot of pool.slice(0,12)){
    const snapshot=snapshots.find(item=>item.month===slot.date.slice(0,7))!.snapshot;
    const checked=await untilDeadline(checkCandidate(snapshot,event(slot.time,slot.date),drive,now),checksUntil);
    if(checked===TIMEOUT){searchComplete=false;break;}
    if(checked.reason)continue;
    approved.push({date:slot.date,time:slot.time,minutesAway:Math.abs(dayNumber(slot.date)-dayNumber(anchor))*24*60+Math.abs(clock(slot.time)-clock(p.time))});
   }
   const revision=await revisionsHeld(db,snapshots,deadline);
   if(revision===TIMEOUT)return unfinished(p,anchor);
   if(revision==='changed')throw new BookingError(409,'Calendar changed. Check again.');
   const exact=approved.some(slot=>slot.date===anchor&&slot.time===p.time);
   const alternatives=approved.filter(slot=>!(slot.date===anchor&&slot.time===p.time)).sort((a,b)=>a.minutesAway-b.minutesAway||a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).slice(0,3);
   const fit=exact||alternatives.length>0;
   return {date:anchor,timezone:'America/Los_Angeles',requested:p.time,exact,slots:exact?[p.time]:[],alternatives,fit,saved:false,searchComplete,...(fit?{}:{next:CALLBACK})};
  }
  const eligible:{date:string;time:string}[]=[];
  for(const date of dates)for(const slot of days.find(day=>day.date===date)?.slots||[])if(slot.available&&slotMatchesWindow(slot.time,p.window)&&!seen.has(`${date} ${slot.time}`)){seen.add(`${date} ${slot.time}`);eligible.push({date,time:slot.time});}
  const verified:FlexibleCandidate[]=[];
  let cursor=0,startedCount=0,acceptResults=true,truncated=false;
  const workers=Array.from({length:Math.min(FLEX_CONCURRENCY,eligible.length)},async()=>{
   for(;;){
    if(!acceptResults||checksUntil<=Date.now()){truncated=true;return;}
    const index=cursor++;
    if(index>=eligible.length)return;
    startedCount++;
    const slot=eligible[index];
    const snapshot=snapshots.find(item=>item.month===slot.date.slice(0,7))!.snapshot;
    const built=event(slot.time,slot.date);
    const checked=await untilDeadline(checkCandidate(snapshot,built,drive,now),checksUntil);
    if(checked===TIMEOUT||!acceptResults){truncated=true;return;}
    const proof=checked.proofs?.find(item=>item.eventId===built.id)??null;
    if(checked.reason||!proof)continue;
    const baseline=await baselineSeconds(proof,drive,checksUntil);
    if(baseline===TIMEOUT||!acceptResults){truncated=true;return;}
    const detour=incrementalDetourSeconds(proof,baseline);
    if(detour==null)continue;
    if(!acceptResults)return;
    verified.push({date:slot.date,time:slot.time,startAt:built.start_at,proof,detour});
   }
  });
  // Stop waiting for route calls when the find deadline arrives. Later results are ignored.
  const workersFinished=await untilDeadline(Promise.all(workers),checksUntil);
  if(workersFinished===TIMEOUT)acceptResults=false;
  const ranked=rankFlexibleCandidates(verified.slice());
  const revision=await revisionsHeld(db,snapshots,deadline);
  if(revision===TIMEOUT)return unfinished(p,dates[0]);
  if(revision==='changed')throw new BookingError(409,'Calendar changed. Check again.');
  const recommendation=ranked[0]?{date:ranked[0].date,time:ranked[0].time}:null;
  const searchComplete=workersFinished!==TIMEOUT&&!truncated&&startedCount===eligible.length;
  return {date:recommendation?.date||dates[0],timezone:'America/Los_Angeles',recommendation,alternatives:ranked.slice(1,3).map(({date,time})=>({date,time})),fit:Boolean(recommendation),saved:false,searchComplete,window:p.window||'anytime',...(recommendation?{}:{next:CALLBACK})};
 }
 const resolved=await validateServiceAddress(`${p.address}, ${p.city}`);
 const address=resolved.formattedAddress||`${p.address}, ${p.city}`;
 const drive=options.drive??googleDriveEstimator(now);
 const snapshot=await readSchedule(db,p.date!.slice(0,7));
 const days=buildBookingAvailability(p.date!.slice(0,7),snapshot.events||[],snapshot.slots||[],{now,appointmentDurationMinutes:duration(p)}).days;
 if(!publishedOpen(days,p.date!,p.time!))throw new BookingError(409,CLOSED);
 const checked=await checkCandidate(snapshot,candidateVisit(p.date!,p.time!,address,p.windowCount,callId,duration(p)),drive,now);
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
 const days=buildBookingAvailability(p.date!.slice(0,7),snapshot.events||[],snapshot.slots||[],{now,appointmentDurationMinutes:duration(p)}).days;
 if(!publishedOpen(days,p.date!,p.time!))throw new BookingError(409,CLOSED);
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
