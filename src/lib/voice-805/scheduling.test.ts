import { beforeEach,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({validate:vi.fn(),snapshot:vi.fn(),check:vi.fn(),availability:vi.fn()}));
vi.mock('@/lib/booking/scheduling',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/booking/scheduling')>(),validateServiceAddress:mocks.validate,readSchedule:mocks.snapshot,checkCandidate:mocks.check}));
vi.mock('@/lib/booking/availability',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/booking/availability')>(),buildBookingAvailability:mocks.availability}));
import { candidateVisit } from '@/lib/booking/scheduling';
import { flexibleDates,parseVisit,prepareVoiceVisit,commitVoiceVisit,slotMatchesWindow } from './scheduling';
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
 expect(r).toMatchObject({exact:false,slots:[],alternatives:[],fit:false,saved:false});
});
