import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { payableFixtureRow } from '../../../../../../e2e/fixtures/payables-data';
const mocks = vi.hoisted(()=>({ auth:vi.fn(), load:vi.fn(), audit:vi.fn() }));
vi.mock('@/lib/crm/auth',async importOriginal=>({ ...await importOriginal<typeof import('@/lib/crm/auth')>(), requireCrmUser:mocks.auth }));
vi.mock('@/lib/crm/backend',async importOriginal=>({ ...await importOriginal<typeof import('@/lib/crm/backend')>(), loadCrmDashboardData:mocks.load, recordCrmActivity:mocks.audit }));
import { PATCH } from './route';

describe('payable readiness correction',()=>{
  let writes:Array<{table:string,payload:unknown}>;
  let filters:Array<[string,unknown]>;
  let race:boolean;
  let current:{id:string,meta:Record<string,unknown>,updated_at:string};
  beforeEach(()=>{
    vi.clearAllMocks(); writes=[];filters=[];race=false;
    current={id:'row-1',meta:{preserved:'contract info'},updated_at:'2026-09-18T00:00:00Z'};
    const supabase={from:(table:string)=>{
      const query={select:()=>query,eq:(column:string,value:unknown)=>{filters.push([column,value]);return query;},single:async()=>({data:current,error:null}),update:(payload:unknown)=>{writes.push({table,payload});return query;},maybeSingle:async()=>({data:race?null:current,error:null})};return query;
    }};
    mocks.auth.mockResolvedValue({supabase,email:'805shutters@gmail.com',user:{id:'staff-1'}});
    mocks.load.mockResolvedValue({bookkeepingRows:[payableFixtureRow()]});
  });
  const request=(overrides:Record<string,unknown>={})=>new NextRequest('http://localhost/api/crm/payables/readiness',{method:'PATCH',body:JSON.stringify({source:'manual',id:'row-1',ready:true,reason:'Payment reconciled',expected_revision:null,...overrides})});
  it('writes only merged readiness metadata to the exact source record',async()=>{
    const response=await PATCH(request());expect(response.status).toBe(200);
    expect(writes).toEqual([{table:'crm_quote_bookkeeping_entries',payload:{meta:{preserved:'contract info',ownerPayableReadiness:{ready:true,reason:'Payment reconciled',updatedAt:expect.any(String),updatedBy:'805shutters@gmail.com'}}}}]);
    expect(filters).toContainEqual(['id','row-1']);expect(filters).toContainEqual(['updated_at',current.updated_at]);
    expect(mocks.audit).toHaveBeenCalledOnce();expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it('records a Ken-only correction with audit context without changing owner readiness',async()=>{
    current.meta.ownerPayableReadiness={ready:false,reason:'Owner hold',updatedAt:'older'};
    expect((await PATCH(request({person:'ken',expected_revision:'older'}))).status).toBe(200);
    expect(writes[0]).toMatchObject({payload:{meta:{ownerPayableReadiness:{ready:false},kenPayableReadiness:{ready:true,reason:'Payment reconciled'}}}});
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(),expect.anything(),expect.objectContaining({metadata:{person:'ken'}}));
  });
  it('rejects a stale revision without writing',async()=>{
    current.meta.ownerPayableReadiness={ready:false,updatedAt:'newer'};
    expect((await PATCH(request())).status).toBe(409);expect(writes).toHaveLength(0);
  });
  it('reports a concurrent change instead of claiming success',async()=>{
    race=true;expect((await PATCH(request())).status).toBe(409);expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('rejects non-admin edits and invalid corrections',async()=>{
    expect((await PATCH(request({reason:''}))).status).toBe(400);expect(writes).toHaveLength(0);
    const auth=await mocks.auth();mocks.auth.mockResolvedValue({...auth,email:'jessica@805shutters.com'});
    expect((await PATCH(request())).status).toBe(403);expect(writes).toHaveLength(0);
  });
  it('never updates another source or unknown job',async()=>{
    expect((await PATCH(request({id:'missing'}))).status).toBe(404);expect(writes).toHaveLength(0);
  });
});
