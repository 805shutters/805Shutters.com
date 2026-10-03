import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),single:vi.fn(),eq:vi.fn()}));
vi.mock('@/lib/crm/auth',()=>({
 requireCrmUser:mocks.auth,
 CrmAuthError:class extends Error{constructor(public status:number,message:string){super(message)}},
 crmAuthErrorResponse:(e:{status?:number;message:string})=>NextResponse.json({message:e.message},{status:e.status||500}),
}));
import { POST } from './route';
const body={schedule:'in_house_three_month_v1',revision:7,requestId:'11111111-1111-4111-8111-111111111111'};
beforeEach(()=>{vi.clearAllMocks();mocks.eq.mockReturnValue({single:mocks.single});mocks.auth.mockResolvedValue({user:{id:'actor'},supabase:{rpc:mocks.rpc,from:()=>({select:()=>({eq:mocks.eq})})}});mocks.rpc.mockResolvedValue({data:'quote',error:null});mocks.single.mockResolvedValue({data:{id:'quote',quote_v2_revision:8},error:null});});
async function save(payload=body){return POST(new NextRequest('https://example.invalid/api',{method:'POST',body:JSON.stringify(payload)}),{params:Promise.resolve({id:'quote'})});}
it('returns the exact persisted revision required by the subsequent send',async()=>{const r=await save();expect(await r.json()).toEqual({quoteId:'quote',revision:8});expect(mocks.eq).toHaveBeenCalledWith('id','quote');expect(mocks.rpc).toHaveBeenCalledWith('save_in_house_quote_schedule',expect.objectContaining({p_revision:7,p_actor:'actor',p_schedule:body.schedule}));});
it('fails closed if another edit followed this saved request',async()=>{mocks.single.mockResolvedValue({data:{id:'quote',quote_v2_revision:9},error:null});expect((await save()).status).toBe(409);});
it('returns a separate editable revision for review rather than changing the sent source',async()=>{mocks.rpc.mockResolvedValue({data:'new-revision',error:null});mocks.single.mockResolvedValue({data:{id:'new-revision',quote_v2_revision:2},error:null});expect(await (await save()).json()).toEqual({quoteId:'new-revision',revision:2});});
it('rejects invalid terms before calling the database',async()=>{expect((await save({...body,schedule:'charge-every-month'})).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();});
it('does not confirm an unverifiable save',async()=>{mocks.single.mockResolvedValue({data:null,error:{message:'read failed'}});expect((await save()).status).toBe(409);});
