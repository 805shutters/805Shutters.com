import {beforeEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {syntheticDraft} from '@/lib/crm/mobile-supplier-test-fixture';
import {buildSupplierSpec} from '@/lib/crm/mobile-supplier-spec';
const h=vi.hoisted(()=>({auth:vi.fn(),submit:vi.fn(),runtime:vi.fn(),load:vi.fn(),available:true}));
vi.mock('@/lib/crm/auth',async importOriginal=>({...await importOriginal<typeof import('@/lib/crm/auth')>(),requireCrmUser:h.auth}));
vi.mock('@/lib/crm/supplier-draft-job-store',()=>({submitSupplierDraftJob:h.submit,loadSupplierDraftJob:h.load,DRAFT_JOB_TABLE:'SYNTHETIC-TABLE'}));
vi.mock('@/lib/crm/supplier-draft-runtime',()=>({recordUnconnectedDraftRuntime:h.runtime}));
vi.mock('@/lib/crm/supplier-draft-availability',async importOriginal=>({...await importOriginal<typeof import('@/lib/crm/supplier-draft-availability')>(),supplierDraftProcessingAvailable:()=>h.available}));
import {GET,PATCH} from './[id]/route';
import {CrmAuthError} from '@/lib/crm/auth';
import {POST} from './route';
const request=(body:unknown)=>new NextRequest('http://localhost/api/crm/mobile/draft-jobs/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();h.available=true;h.auth.mockResolvedValue({user:{id:'SYNTHETIC-OWNER'},supabase:{}});h.submit.mockImplementation(async(_db,owner,_key,spec)=>({job:{id:'SYNTHETIC-JOB',ownerId:owner,spec,state:{phase:'queued'}},replayed:false}));h.runtime.mockResolvedValue({id:'SYNTHETIC-JOB',state:{phase:'blocked'}});});
it('accepts actual UI product family labels and scopes the durable queue to the authenticated user',async()=>{const spec=buildSupplierSpec(syntheticDraft()),r=await POST(request({requestId:'SYNTHETIC-key',spec}));expect(r.status).toBe(202);expect(h.submit).toHaveBeenCalledWith({},'SYNTHETIC-OWNER','SYNTHETIC-key',spec);expect((await r.json()).job.state.phase).toBe('blocked');});
it('retains an idempotent replay and reports 200 without restarting completed work',async()=>{h.submit.mockResolvedValue({job:{id:'SYNTHETIC-JOB',state:{phase:'complete'}},replayed:true});const r=await POST(request({requestId:'SYNTHETIC-key',spec:buildSupplierSpec(syntheticDraft())}));expect(r.status).toBe(200);expect(h.runtime).not.toHaveBeenCalled();});
it('rejects unauthenticated access before any job write',async()=>{h.auth.mockRejectedValue(new CrmAuthError(401,'CRM session is required.'));expect((await POST(request({}))).status).toBe(401);expect(h.submit).not.toHaveBeenCalled();});
it('rejects a manufacturer/product relabel before any job write',async()=>{const spec=buildSupplierSpec(syntheticDraft());spec.lines[0].manufacturer='Onyx';expect((await POST(request({requestId:'SYNTHETIC-key',spec}))).status).toBe(400);expect(h.submit).not.toHaveBeenCalled();});
it('rejects invalid identity and wrong customer field types',async()=>{for(const mutate of [(s:any)=>s.draftId='-'.repeat(36),(s:any)=>s.customer.phone=42,(s:any)=>{s.customer.kind='new';s.customer.jobId=crypto.randomUUID();},(s:any)=>s.lines[0].widthWhole=-1]){const spec=buildSupplierSpec(syntheticDraft());mutate(spec);expect((await POST(request({requestId:'SYNTHETIC-key',spec}))).status).toBe(400);}expect(h.submit).not.toHaveBeenCalled();});
it('rejects filter-control characters in submission identities',async()=>{expect((await POST(request({requestId:'wrong,key()',spec:buildSupplierSpec(syntheticDraft())}))).status).toBe(400);expect(h.submit).not.toHaveBeenCalled();});
it('rejects missing or changed stored customer identity instead of fuzzy relinking',async()=>{const spec=buildSupplierSpec(syntheticDraft());spec.customer={...spec.customer,kind:'existing',jobId:crypto.randomUUID()};const q:any={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:{customer_name:'OTHER CUSTOMER'},error:null})};h.auth.mockResolvedValue({user:{id:'SYNTHETIC-OWNER'},supabase:{from:()=>q}});expect((await POST(request({requestId:'SYNTHETIC-key',spec}))).status).toBe(409);expect(h.submit).not.toHaveBeenCalled();});
it('oversized payloads are rejected before any job write',async()=>{expect((await POST(request({padding:'x'.repeat(1024*1024)}))).status).toBe(413);expect(h.submit).not.toHaveBeenCalled();});

it('design-only rollout blocks submission, progress and resume before database access',async()=>{
 const production=await vi.importActual<typeof import('@/lib/crm/supplier-draft-availability')>('@/lib/crm/supplier-draft-availability');expect(production.supplierDraftProcessingAvailable()).toBe(false);
 h.available=false;const from=vi.fn();h.auth.mockResolvedValue({user:{id:'SYNTHETIC-OWNER'},supabase:{from}});
 const params={params:Promise.resolve({id:'SYNTHETIC-JOB'})};
 for(const response of [await POST(request({requestId:'SYNTHETIC-key',spec:buildSupplierSpec(syntheticDraft())})),await GET(request({}),params),await PATCH(request({action:'resume',expectedRevision:1}),params)]){
  expect(response.status).toBe(503);expect((await response.json()).message).toContain('Supplier costing is not connected yet');
 }
 expect(from).not.toHaveBeenCalled();expect(h.submit).not.toHaveBeenCalled();expect(h.load).not.toHaveBeenCalled();expect(h.runtime).not.toHaveBeenCalled();
});
