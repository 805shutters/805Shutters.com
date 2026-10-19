import { beforeEach,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({validate:vi.fn(),snapshot:vi.fn(),check:vi.fn(),availability:vi.fn()}));
vi.mock('@/lib/booking/scheduling',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/booking/scheduling')>(),validateServiceAddress:mocks.validate,readSchedule:mocks.snapshot,checkCandidate:mocks.check}));
vi.mock('@/lib/booking/availability',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/booking/availability')>(),buildBookingAvailability:mocks.availability}));
import { parseVisit,prepareVoiceVisit,commitVoiceVisit } from './scheduling';
const p={city:'Camarillo',address:'123 Test St',date:'2035-10-01',kind:'residential',windowCount:null,time:'10:00',name:'Test',phone:'+18055550199'};
beforeEach(()=>{vi.clearAllMocks();mocks.validate.mockResolvedValue({formattedAddress:'123 Test St, Camarillo',point:{lat:34,lng:-119}});mocks.snapshot.mockResolvedValue({revision:'1'});mocks.check.mockResolvedValue({reason:null,proofs:[]});mocks.availability.mockReturnValue({days:[{date:p.date,slots:[{time:'10:00',available:true},{time:'10:30',available:true}]}]});});
it('requires city, complete inputs, valid day, commercial count; rejects injected identity/confirmation',()=>{
 for(const patch of [{city:''},{date:'2035-02-30'},{kind:'commercial',windowCount:null},{confirmed:true},{callId:'other'},{phone:'unknown'}])expect(()=>parseVisit({...p,...patch},true)).toThrow();
 expect(parseVisit(p,true).kind).toBe('residential');
});
it('availability returns only travel-approved slots without other calendar records',async()=>{
 mocks.check.mockResolvedValueOnce({reason:'travel_conflict'}).mockResolvedValueOnce({reason:null});
 const {time,name,phone,...input}=p;void time;void name;void phone;
 const r=await prepareVoiceVisit({} as any,'call',input);expect(r).toEqual({date:p.date,timezone:'America/Los_Angeles',slots:['10:30'],saved:false});
 expect(mocks.validate).toHaveBeenCalledWith('123 Test St, Camarillo');
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
