import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/supabase-server',()=>({getSupabaseServiceClient:()=>({})}));
vi.mock('@/lib/crm/customer-signed-contract-email',()=>({processCustomerSignedContractEmailOutbox:vi.fn(async()=>({processed:0,errors:[]}))}));
vi.mock('@/lib/crm/internal-signed-contract-copy',()=>({processInternalSignedContractCopyOutbox:vi.fn(async()=>({processed:0,errors:[]}))}));
vi.mock('@/lib/crm/customer-email-monitor',()=>({customerEmailActivation:vi.fn(async()=>null),getCustomerEmailMonitor:vi.fn(async()=>({ok:false,activated:false})),checkCustomerEmailDeliveries:vi.fn()}));
vi.mock('@/lib/crm/integration-health',()=>({observeIntegration:vi.fn(async(_db,_name,run)=>run())}));
import { processCustomerSignedContractEmailOutbox } from '@/lib/crm/customer-signed-contract-email';
import { processInternalSignedContractCopyOutbox } from '@/lib/crm/internal-signed-contract-copy';
import { customerEmailActivation, getCustomerEmailMonitor } from '@/lib/crm/customer-email-monitor';
import { GET } from './route';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CRON_SECRET','worker');vi.stubEnv('APPOINTMENT_REMINDER_CRON_SECRET','watchdog');});
it('rejects missing authorization',async()=>{
 expect((await GET(new NextRequest('https://example.com/api/cron/customer-signed-contract-email/'))).status).toBe(401);
 expect(processInternalSignedContractCopyOutbox).not.toHaveBeenCalled();
});
it('watchdog key can inspect health but cannot run sending',async()=>{
 const headers={authorization:'Bearer watchdog'};
 expect((await GET(new NextRequest('https://example.com/?check=health',{headers}))).status).toBe(503);
 expect((await GET(new NextRequest('https://example.com/',{headers}))).status).toBe(401);
 expect(processCustomerSignedContractEmailOutbox).not.toHaveBeenCalled();
 expect(processInternalSignedContractCopyOutbox).not.toHaveBeenCalled();
});
it('holds all sending until activation',async()=>{
 expect((await GET(new NextRequest('https://example.com/',{headers:{authorization:'Bearer worker'}}))).status).toBe(503);
 expect(processCustomerSignedContractEmailOutbox).not.toHaveBeenCalled();
 expect(processInternalSignedContractCopyOutbox).not.toHaveBeenCalled();
});
it('keeps the customer email result when the internal copy fails',async()=>{
 vi.mocked(customerEmailActivation).mockResolvedValueOnce('2026-11-15T00:00:00.000Z');
 vi.mocked(getCustomerEmailMonitor).mockResolvedValueOnce({ok:true} as never);
 vi.mocked(processCustomerSignedContractEmailOutbox).mockResolvedValueOnce({processed:1,errors:[]} as never);
 vi.mocked(processInternalSignedContractCopyOutbox).mockResolvedValueOnce({processed:0,errors:['copy failed']});
 const response=await GET(new NextRequest('https://example.com/',{headers:{authorization:'Bearer worker'}}));
 expect(response.status).toBe(200);
 expect(processCustomerSignedContractEmailOutbox).toHaveBeenCalledTimes(1);
 expect(processCustomerSignedContractEmailOutbox).toHaveBeenCalledWith(expect.anything(),{limit:10,deadlineMs:180_000});
 expect(await response.json()).toMatchObject({errorCount:0,internalCopyErrorCount:1,processed:1});
});
it('keeps the customer email result when the internal copy throws',async()=>{
 vi.mocked(customerEmailActivation).mockResolvedValueOnce('2026-11-15T00:00:00.000Z');
 vi.mocked(getCustomerEmailMonitor).mockResolvedValueOnce({ok:true} as never);
 vi.mocked(processCustomerSignedContractEmailOutbox).mockResolvedValueOnce({processed:1,errors:[]} as never);
 vi.mocked(processInternalSignedContractCopyOutbox).mockRejectedValueOnce(new Error('copy exploded'));
 const response=await GET(new NextRequest('https://example.com/',{headers:{authorization:'Bearer worker'}}));
 expect(response.status).toBe(200);
 expect(processCustomerSignedContractEmailOutbox).toHaveBeenCalledTimes(1);
 expect((await response.json()).internalCopyErrorCount).toBe(1);
});
it('still reports a customer email failure',async()=>{
 vi.mocked(customerEmailActivation).mockResolvedValueOnce('2026-11-15T00:00:00.000Z');
 vi.mocked(getCustomerEmailMonitor).mockResolvedValueOnce({ok:true} as never);
 vi.mocked(processCustomerSignedContractEmailOutbox).mockResolvedValueOnce({processed:0,errors:['customer failed']} as never);
 const response=await GET(new NextRequest('https://example.com/',{headers:{authorization:'Bearer worker'}}));
 expect(response.status).toBe(503);
 expect(processCustomerSignedContractEmailOutbox).toHaveBeenCalledTimes(1);
 expect((await response.json()).errorCount).toBe(1);
});
