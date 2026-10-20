import { beforeEach,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({validate:vi.fn(),snapshot:vi.fn(),check:vi.fn(),availability:vi.fn()}));
vi.mock('@/lib/booking/scheduling',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/booking/scheduling')>(),validateServiceAddress:mocks.validate,readSchedule:mocks.snapshot,checkCandidate:mocks.check}));
vi.mock('@/lib/booking/availability',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/booking/availability')>(),buildBookingAvailability:mocks.availability}));
import { candidateVisit } from '@/lib/booking/scheduling';
import { flexibleDates,incrementalDetourSeconds,parseVisit,prepareVoiceVisit,commitVoiceVisit,slotMatchesWindow,VoiceReplan } from './scheduling';
import { BookingError } from '@/lib/booking/scheduling';
const proof=(event:{id:string;start_at:string;end_at:string},seconds:number,slackMs=60*60*1000)=>({eventId:event.id,signature:[event.id,Date.parse(event.start_at),Date.parse(event.end_at),'jessica','sales_consult','addr'],checkedAt:'2035-10-01T00:00:00.000Z',previous:{id:'neighbor',signature:['neighbor',0,0,'jessica','sales_consult','other'],departureAt:new Date(Date.parse(event.start_at)-seconds*1000-15*60*1000-slackMs).toISOString(),seconds},next:null});
const p={city:'Camarillo',address:'123 Test St',date:'2035-10-01',kind:'residential',windowCount:null,time:'10:00',name:'Test',phone:'+18055550199'};
beforeEach(()=>{vi.clearAllMocks();mocks.validate.mockResolvedValue({formattedAddress:'123 Test St, Camarillo',point:{lat:34,lng:-119}});mocks.snapshot.mockResolvedValue({revision:'1'});mocks.check.mockResolvedValue({reason:null,proofs:[]});mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'10:00',available:true},{time:'10:30',available:true}]}]});});
it('requires city, complete inputs, valid day, commercial count; rejects injected identity/confirmation',()=>{
 for(const patch of [{city:''},{date:'2035-02-30'},{kind:'commercial',windowCount:null},{confirmed:true},{callId:'other'},{phone:'unknown'}])expect(()=>parseVisit({...p,...patch},true)).toThrow();
 expect(parseVisit(p,true).kind).toBe('residential');
});
it('anytime omits a clock time and returns only the travel-approved recommendation',async()=>{
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{id:string;start_at:string;end_at:string})=>Date.parse(event.start_at)===Date.parse('2035-10-01T17:00:00.000Z')?{reason:'travel_conflict',proofs:[]}:{reason:null,proofs:[proof(event,0)]});
 const {time,name,phone,...input}=p;void time;void name;void phone;
 const r=await prepareVoiceVisit({} as any,'call',{...input,window:'anytime'});
 expect(r).toEqual({date:p.date,timezone:'America/Los_Angeles',recommendation:{date:p.date,time:'10:30'},alternatives:[],fit:true,saved:false,searchComplete:true,window:'anytime'});
 expect(r).not.toHaveProperty('requested');
 expect(mocks.validate).toHaveBeenCalledWith('123 Test St, Camarillo');
 expect(JSON.stringify(r)).not.toMatch(/neighbor|seconds|signature/);
});
it('ambiguous address, unavailable travel and stale calendar never produce a proposal',async()=>{
 mocks.validate.mockRejectedValueOnce(Error('ambiguous'));await expect(prepareVoiceVisit({} as any,'call',p,true)).rejects.toThrow();
 mocks.check.mockResolvedValueOnce({reason:'missing_information'});await expect(prepareVoiceVisit({} as any,'call',p,true)).rejects.toThrow();
 mocks.snapshot.mockResolvedValueOnce({revision:'1'}).mockResolvedValueOnce({revision:'2'});
 const {time,name,phone,...input}=p;void time;void name;void phone;await expect(prepareVoiceVisit({} as any,'call',input)).rejects.toThrow(/Calendar changed/);
});
it('proposal uses CRM duration policy and never saves',async()=>{
 const db={rpc:vi.fn()};const r=await prepareVoiceVisit(db as any,'call',p,true);
 expect(r.intent?.readback).toContain('60 minutes');expect(r.intent?.readback).toMatch(/say yes/i);expect(r.intent?.readback).not.toMatch(/press 1/i);expect(db.rpc).not.toHaveBeenCalled();
 await prepareVoiceVisit(db as any,'call',{...p,kind:'commercial',windowCount:25},true);
 expect(mocks.check.mock.calls.at(-1)?.[1].end_at).toBe('2035-10-01T20:00:00.000Z');
});
it('commit requires persisted caller confirmation, never model consent',async()=>{
 await expect(commitVoiceVisit({} as any,'call',{confirmed:true})).rejects.toThrow(/confirmation/);
});
it('a later slot with less proved travel outranks the first open slot',async()=>{
 mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'08:00',available:true},{time:'15:00',available:true}]}]});
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{id:string;start_at:string;end_at:string})=>{
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(event.start_at));
  return {reason:null,proofs:[proof(event,time==='08:00'?4000:30)]};
 });
 const {time,name,phone,...input}=p;void time;void name;void phone;
 const r=await prepareVoiceVisit({} as any,'call',input);
 expect(r.recommendation).toEqual({date:p.date,time:'15:00'});
 expect(r.alternatives).toEqual([{date:p.date,time:'08:00'}]);
 expect(r.searchComplete).toBe(true);
});
it('morning and an explicit window exclude slots outside the caller constraint',async()=>{
 mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'08:30',available:true},{time:'10:00',available:true},{time:'11:00',available:true},{time:'15:00',available:true}]}]});
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{id:string;start_at:string;end_at:string})=>({reason:null,proofs:[proof(event,0)]}));
 const {time,name,phone,...input}=p;void time;void name;void phone;
 const morning=await prepareVoiceVisit({} as any,'call',{...input,window:'morning'});
 expect(morning.recommendation?.time).toBe('08:30');
 expect(morning.alternatives?.map(slot=>slot.time)).toEqual(['10:00','11:00']);
 const checked=mocks.check.mock.calls.map(call=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(call[1].start_at)));
 expect(checked).not.toContain('15:00');
 const windowed=await prepareVoiceVisit({} as any,'call',{...input,window:'09:00-11:00'});
 expect(windowed.recommendation).toEqual({date:p.date,time:'10:00'});
 expect(windowed.alternatives).toEqual([]);
});
it('missing travel proof or a past date produces no booking offer',async()=>{
 mocks.check.mockResolvedValue({reason:'missing_information',proofs:[]});
 const {time,name,phone,...input}=p;void time;void name;void phone;
 const unverified=await prepareVoiceVisit({} as any,'call',input);
 expect(unverified).toMatchObject({recommendation:null,alternatives:[],fit:false,saved:false,searchComplete:true});
 const stopped=await prepareVoiceVisit({} as any,'call',input,false,{now:new Date('2035-10-01T18:00:00Z'),budgetMs:0});
 expect(stopped.searchComplete).toBe(false);expect(stopped.recommendation).toBeNull();
 await expect(prepareVoiceVisit({} as any,'call',{...input,date:'2020-01-01'})).rejects.toThrow(/passed/);
 expect(flexibleDates({weekday:'friday'},new Date('2026-10-20T18:00:00Z'))[0]).toBe('2026-10-23');
 expect(()=>flexibleDates({date:'2026-10-20',weekday:'friday'},new Date('2026-10-20T18:00:00Z'))).toThrow(/weekday/);
 expect(slotMatchesWindow('11:30','morning')).toBe(true);expect(slotMatchesWindow('12:00','morning')).toBe(false);
});
it('does not report booked until the attributed calendar row and both staff notices exist',async()=>{
 const expected=candidateVisit(p.date,'10:00',p.address,null,'evt',60);
 const event={...expected,job_id:'job',status:'scheduled',notes:'Booked via agent on the 805 phone line.',meta:{bookedVia:'agent',bookingSource:'805_phone'}};
 const notices=[{kind:'agent_staff_sms_jessica',status:'pending'},{kind:'agent_staff_sms_mike',status:'pending'}];
 const client=(row:typeof event|null,queued:typeof notices|null)=>({
  from(table:string){const api={select(){return api;},eq(){return api;},single:async()=>({data:table==='crm_calendar_events'?row:null,error:row?null:{message:'missing'}}),maybeSingle:async()=>({data:null,error:null}),then(resolve:(value:unknown)=>void){resolve({data:table==='booking_outbox'?queued:[],error:null});}};return api;},
  rpc:vi.fn().mockResolvedValue({data:{calendarEventId:'evt',jobId:'job',leadId:'lead'},error:null}),
 });
 const call={phase:'message',bookingIntent:{id:'intent',kind:'appointment',confirmedAt:1,payload:p}};
 const saved=await commitVoiceVisit(client(event,notices) as any,'call',call);
 expect(saved).toMatchObject({verified:true,staffNotice:'queued',calendarEventId:'evt'});
 await expect(commitVoiceVisit(client(event,notices.slice(0,1)) as any,'call',call)).rejects.toThrow(/Staff notice/);
 await expect(commitVoiceVisit(client({...event,notes:'Website booking'},notices) as any,'call',call)).rejects.toThrow(/could not be verified/);
});
it('requested time that is open is an exact match',async()=>{
 const {name,phone,...input}=p;void name;void phone;
 const r=await prepareVoiceVisit({} as any,'call',input);
 expect(r.exact).toBe(true);expect(r.slots).toEqual(['10:00']);expect(r.fit).toBe(true);expect(r.saved).toBe(false);
});
it('unavailable requested time returns nearby alternatives and does not save',async()=>{
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{start_at:string})=>event.start_at.includes('T17:00:00')?{reason:'travel_conflict'}:{reason:null});
 mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'10:00',available:true},{time:'10:30',available:true},{time:'15:00',available:true}]},{date:'2035-10-02',slots:[{time:'10:00',available:true}]}]});
 const {name,phone,...input}=p;void name;void phone;
 const r=await prepareVoiceVisit({} as any,'call',input);
 expect(r.exact).toBe(false);expect(r.slots).toEqual([]);expect(r.fit).toBe(true);expect(r.saved).toBe(false);
 expect(r.alternatives?.[0]).toMatchObject({date:p.date,time:'10:30'});
 expect(r.alternatives?.some(slot=>slot.time==='15:00')).toBe(false);
});
it('no nearby open time is a no-fit result and never a proposal',async()=>{
 mocks.check.mockResolvedValue({reason:'travel_conflict'});
 const {name,phone,...input}=p;void name;void phone;
 const r=await prepareVoiceVisit({} as any,'call',input);
 expect(r).toMatchObject({exact:false,slots:[],alternatives:[],fit:false,saved:false,next:'No open CRM time fits. Take a callback message so staff can see whether they can accommodate.'});
});
const pacific=(iso:string)=>({date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso)),time:new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso))});
function leg(id:string,location:string,seconds:number,departureAt:string,startMs:number){return {id,signature:[id,startMs,startMs+3600000,'jessica','sales_consult',location] as [string,number,number,string,string,string],departureAt,seconds};}
function bothProof(event:{id:string;start_at:string;end_at:string},prevSeconds:number,nextSeconds:number,from:string,to:string){
 const start=Date.parse(event.start_at),end=Date.parse(event.end_at);
 return {eventId:event.id,signature:[event.id,start,end,'jessica','sales_consult','visit'] as [string,number,number,string,string,string],checkedAt:'2035-10-01T00:00:00.000Z',previous:leg('prev',from,prevSeconds,new Date(start-prevSeconds*1000-15*60*1000).toISOString(),start-7200000),next:leg('next',to,nextSeconds,new Date(end).toISOString(),end+3600000)};
}
it('ranks actual incremental detour after subtracting the previous-to-next baseline',async()=>{
 const sample=bothProof({id:'e',start_at:'2035-10-01T15:00:00.000Z',end_at:'2035-10-01T16:00:00.000Z'},400,400,'far-prev','far-next');
 expect(incrementalDetourSeconds(sample,790)).toBe(10);
 expect(incrementalDetourSeconds(sample,1790)).toBe(-990);
 expect(incrementalDetourSeconds(sample,null)).toBeNull();
 expect(incrementalDetourSeconds({...sample,next:null},null)).toBe(400);
 const baselines:Record<string,number|null>={'long-prev':100,'short-prev':1795,'unproved-prev':null};
 const drive=vi.fn(async(from:string,to:string)=>`${from.replace('prev','next')}`===to?baselines[from]??null:null);
 mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'08:00',available:true},{time:'11:00',available:true},{time:'15:00',available:true}]}]});
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{id:string;start_at:string;end_at:string})=>{
  const time=pacific(event.start_at).time;
  if(time==='08:00')return {reason:null,proofs:[bothProof(event,400,400,'long-prev','long-next')]};
  if(time==='15:00')return {reason:null,proofs:[bothProof(event,900,900,'short-prev','short-next')]};
  return {reason:null,proofs:[bothProof(event,1,1,'unproved-prev','unproved-next')]};
 });
 const {time,name,phone,...input}=p;void time;void name;void phone;
 const r=await prepareVoiceVisit({} as any,'call',input,false,{drive});
 expect(r.recommendation).toEqual({date:p.date,time:'15:00'});
 expect(r.alternatives).toEqual([{date:p.date,time:'08:00'}]);
 expect(drive.mock.calls.map(call=>call[0]).sort()).toEqual(['long-prev','short-prev','unproved-prev']);
 expect(JSON.stringify(r)).not.toMatch(/long-prev|seconds|signature/);
});
it('bounds geocoding, in-flight route checks, baseline drives, and the revision read',async()=>{
 const {time,name,phone,...flex}=p;void time;void name;void phone;
 const now=new Date('2035-10-01T18:00:00Z');
 mocks.validate.mockImplementation(()=>new Promise(()=>{}));
 const geocodeStarted=Date.now();
 const geocode=await prepareVoiceVisit({} as any,'call',flex,false,{now,budgetMs:200});
 expect(Date.now()-geocodeStarted).toBeLessThan(2000);
 expect(geocode).toMatchObject({recommendation:null,fit:false,searchComplete:false,next:'No open CRM time fits. Take a callback message so staff can see whether they can accommodate.'});
 expect(mocks.snapshot).not.toHaveBeenCalled();expect(mocks.check).not.toHaveBeenCalled();
 mocks.validate.mockResolvedValue({formattedAddress:'123 Test St, Camarillo',point:{lat:34,lng:-119}});
 mocks.snapshot.mockImplementation(()=>new Promise(()=>{}));
 const snapshot=await prepareVoiceVisit({} as any,'call',flex,false,{now,budgetMs:200});
 expect(snapshot.searchComplete).toBe(false);expect(snapshot.recommendation).toBeNull();expect(mocks.check).not.toHaveBeenCalled();
 mocks.snapshot.mockResolvedValue({revision:'1'});
 mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'10:00',available:true},{time:'11:00',available:true}]}]});
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{id:string;start_at:string;end_at:string})=>pacific(event.start_at).time==='11:00'?new Promise(()=>{}):{reason:null,proofs:[proof(event,40)]});
 const partialStarted=Date.now();
 const partial=await prepareVoiceVisit({} as any,'call',flex,false,{now,budgetMs:200});
 expect(Date.now()-partialStarted).toBeLessThan(2000);
 expect(partial.recommendation).toEqual({date:p.date,time:'10:00'});
 expect(partial.searchComplete).toBe(false);expect(partial.fit).toBe(true);expect(partial).not.toHaveProperty('next');
 expect(mocks.check).toHaveBeenCalledTimes(2);
 const drive=vi.fn((from:string)=>from==='slow'?new Promise<number|null>(()=>{}):Promise.resolve(0));
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{id:string;start_at:string;end_at:string})=>pacific(event.start_at).time==='11:00'?{reason:null,proofs:[bothProof(event,50,50,'slow','slow-next')]}:{reason:null,proofs:[proof(event,25)]});
 const baseline=await prepareVoiceVisit({} as any,'call',flex,false,{now,budgetMs:200,drive});
 expect(baseline.recommendation).toEqual({date:p.date,time:'10:00'});
 expect(baseline.searchComplete).toBe(false);
 let reads=0,proved=false;
 mocks.snapshot.mockImplementation(()=>++reads===1?Promise.resolve({revision:'1'}):new Promise(()=>{}));
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{id:string;start_at:string;end_at:string})=>{proved=true;return {reason:null,proofs:[proof(event,20)]};});
 const stale=await prepareVoiceVisit({} as any,'call',{...flex,time:'10:00'},false,{now,budgetMs:200});
 expect(proved).toBe(true);expect(reads).toBe(2);
 expect(stale).toMatchObject({exact:false,slots:[],alternatives:[],fit:false,searchComplete:false});
 mocks.snapshot.mockResolvedValue({revision:'1'});
 mocks.check.mockImplementation(()=>new Promise(()=>{}));
 const specific=await prepareVoiceVisit({} as any,'call',{...flex,time:'10:00'},false,{now,budgetMs:200});
 expect(specific).toMatchObject({exact:false,fit:false,searchComplete:false,slots:[],alternatives:[]});
 expect(specific.next).toMatch(/Take a callback message/);
});
it('keeps a verified requested time when a later nearby check is still in flight',async()=>{
 mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'10:00',available:true},{time:'10:30',available:true}]}]});
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{start_at:string})=>pacific(event.start_at).time==='10:30'?new Promise(()=>{}):{reason:null});
 const {name,phone,...input}=p;void name;void phone;
 const started=Date.now();
 const r=await prepareVoiceVisit({} as any,'call',input,false,{now:new Date('2035-10-01T18:00:00Z'),budgetMs:200});
 expect(Date.now()-started).toBeLessThan(2000);
 expect(r.exact).toBe(true);expect(r.slots).toEqual(['10:00']);expect(r.searchComplete).toBe(false);expect(r.fit).toBe(true);
});
it('resolves Friday at 3pm on the next Pacific Friday and keeps the weekday and window',async()=>{
 const fields={city:'Camarillo',address:'123 Test St',kind:'residential' as const,windowCount:null};
 expect(parseVisit({...fields,weekday:'Friday',time:'15:00'})).toMatchObject({weekday:'friday',time:'15:00'});
 expect(parseVisit({...fields,weekday:'Friday',time:'15:00'})).not.toHaveProperty('date');
 expect(()=>parseVisit({...fields,date:'2026-10-20',weekday:'friday'})).toThrow(/weekday/);
 expect(()=>parseVisit({...fields,date:'2026-10-20',weekday:'friday',time:'15:00'})).toThrow(/weekday/);
 expect(()=>parseVisit({...p,date:'2026-10-20',weekday:'friday'},true)).toThrow(/weekday/);
 expect(()=>parseVisit({...fields,date:'2035-10-01',time:'15:00',window:'morning'})).toThrow(/window/);
 mocks.availability.mockReturnValue({days:[{date:'2026-10-22',slots:[{time:'15:00',available:true}]},{date:'2026-10-23',slots:[{time:'10:00',available:true},{time:'15:00',available:true}]}]});
 mocks.check.mockResolvedValue({reason:null});
 const friday=await prepareVoiceVisit({} as any,'call',{...fields,weekday:'friday',time:'15:00'},false,{now:new Date('2026-10-20T18:00:00Z')});
 expect(friday).toMatchObject({date:'2026-10-23',requested:'15:00',exact:true,slots:['15:00'],fit:true,searchComplete:true});
 expect(mocks.check.mock.calls.map(call=>pacific(call[1].start_at))).toEqual([{date:'2026-10-23',time:'15:00'}]);
 mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'10:00',available:true},{time:'11:30',available:true},{time:'12:00',available:true}]}]});
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{start_at:string})=>pacific(event.start_at).time==='10:00'?{reason:'travel_conflict'}:{reason:null});
 const {name,phone,...input}=p;void name;void phone;
 const morning=await prepareVoiceVisit({} as any,'call',{...input,time:'10:00',window:'morning'});
 expect(morning.exact).toBe(false);
 expect(morning.alternatives).toEqual([{date:p.date,time:'11:30',minutesAway:90}]);
 expect(mocks.check.mock.calls.map(call=>pacific(call[1].start_at).time)).not.toContain('12:00');
 mocks.check.mockClear();
 mocks.availability.mockReturnValue({days:[{date:'2026-10-22',slots:[{time:'09:00',available:true}]},{date:'2026-10-23',slots:[{time:'09:00',available:true},{time:'15:00',available:true}]}]});
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{id:string;start_at:string;end_at:string})=>({reason:null,proofs:[proof(event,0)]}));
 const flexible=await prepareVoiceVisit({} as any,'call',{...fields,weekday:'friday',window:'morning'},false,{now:new Date('2026-10-20T18:00:00Z')});
 expect(flexible.recommendation).toEqual({date:'2026-10-23',time:'09:00'});
 expect(flexible.alternatives).toEqual([]);
 expect(mocks.check.mock.calls.map(call=>pacific(call[1].start_at))).toEqual([{date:'2026-10-23',time:'09:00'}]);
});
it('refuses a closed CRM slot on find, prepare, and commit',async()=>{
 const closed='That time is not an open CRM slot. Offer a callback so staff can see whether they can accommodate it.';
 const {name,phone,time,...flex}=p;void name;void phone;void time;
 mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'10:00',available:false}]}]});
 const found=await prepareVoiceVisit({} as any,'call',flex);
 expect(found).toMatchObject({recommendation:null,fit:false,searchComplete:true,next:'No open CRM time fits. Take a callback message so staff can see whether they can accommodate.'});
 expect(mocks.check).not.toHaveBeenCalled();
 const specific=await prepareVoiceVisit({} as any,'call',{...flex,time:'10:00'});
 expect(specific).toMatchObject({exact:false,fit:false,slots:[],searchComplete:true});
 expect(mocks.check).not.toHaveBeenCalled();
 mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'10:00',available:false},{time:'10:30',available:true}]}]});
 mocks.check.mockImplementation(async(_snapshot:unknown,event:{id:string;start_at:string;end_at:string})=>({reason:null,proofs:[proof(event,0)]}));
 const nearby=await prepareVoiceVisit({} as any,'call',flex);
 expect(nearby.recommendation).toEqual({date:p.date,time:'10:30'});
 expect(mocks.check.mock.calls.map(call=>pacific(call[1].start_at).time)).toEqual(['10:30']);
 mocks.check.mockClear();
 mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'10:00',available:false}]}]});
 await expect(prepareVoiceVisit({} as any,'call',p,true)).rejects.toThrow(closed);
 expect(mocks.check).not.toHaveBeenCalled();
 const rpc=vi.fn();
 const db={from(){const api={select(){return api;},eq(){return api;},maybeSingle:async()=>({data:null,error:null})};return api;},rpc};
 const call={phase:'message',bookingIntent:{id:'intent',kind:'appointment',confirmedAt:1,payload:p}};
 await expect(commitVoiceVisit(db as any,'call',call)).rejects.toSatisfy((error:unknown)=>error instanceof BookingError&&!(error instanceof VoiceReplan)&&(error as BookingError).status===409&&(error as Error).message===closed);
 expect(rpc).not.toHaveBeenCalled();expect(mocks.check).not.toHaveBeenCalled();
});
