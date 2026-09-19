import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { CrmAuthError, requireCrmUser } from '@/lib/crm/auth';
import { recordHubReceipt, updateHubCheck } from '@/lib/crm/payment-hub-mutations';
import { POST } from './route';
vi.mock('@/lib/crm/auth',async original=>({...await original<typeof import('@/lib/crm/auth')>(),requireCrmUser:vi.fn()}));
vi.mock('@/lib/crm/payment-hub-mutations',()=>({recordHubReceipt:vi.fn(),updateHubCheck:vi.fn()}));
const req=(body:object)=>new NextRequest('https://example.test/api/crm/payment-hub/',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>vi.clearAllMocks());
it('rejects anonymous and non-owner requests before recording financial changes',async()=>{
 vi.mocked(requireCrmUser).mockRejectedValue(new CrmAuthError(401,'Login required'));expect((await POST(req({action:'record'}))).status).toBe(401);
 vi.mocked(requireCrmUser).mockResolvedValue({email:'staff@example.com',supabase:{}} as never);expect((await POST(req({action:'check',actor:'805shutters@gmail.com'}))).status).toBe(403);
 expect(recordHubReceipt).not.toHaveBeenCalled();expect(updateHubCheck).not.toHaveBeenCalled();
});
it('uses the authenticated owner as audit actor',async()=>{
 const db={};vi.mocked(requireCrmUser).mockResolvedValue({email:'805shutters@gmail.com',supabase:db} as never);vi.mocked(recordHubReceipt).mockResolvedValue({saved:true,reused:false,id:'receipt'});
 expect((await POST(req({action:'record',actor:'forged'}))).status).toBe(200);expect(recordHubReceipt).toHaveBeenCalledWith(db,expect.anything(),'805shutters@gmail.com');
});
