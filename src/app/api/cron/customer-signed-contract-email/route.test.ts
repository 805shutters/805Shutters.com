import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/supabase-server',()=>({getSupabaseServiceClient:()=>({})}));
vi.mock('@/lib/crm/customer-signed-contract-email',()=>({processCustomerSignedContractEmailOutbox:vi.fn(async()=>({processed:0,errors:[]}))}));
vi.mock('@/lib/crm/customer-email-monitor',()=>({customerEmailActivation:vi.fn(async()=>null),getCustomerEmailMonitor:vi.fn(async()=>({ok:false,activated:false})),checkCustomerEmailDeliveries:vi.fn()}));
vi.mock('@/lib/crm/integration-health',()=>({observeIntegration:vi.fn(async(_db,_name,run)=>run())}));
import { processCustomerSignedContractEmailOutbox } from '@/lib/crm/customer-signed-contract-email';
import { GET } from './route';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CRON_SECRET','worker');vi.stubEnv('APPOINTMENT_REMINDER_CRON_SECRET','watchdog');});
it('rejects missing authorization',async()=>{expect((await GET(new NextRequest('https://example.com/api/cron/customer-signed-contract-email/'))).status).toBe(401)});
it('watchdog key can inspect health but cannot run sending',async()=>{
 const headers={authorization:'Bearer watchdog'};
 expect((await GET(new NextRequest('https://example.com/?check=health',{headers}))).status).toBe(503);
 expect((await GET(new NextRequest('https://example.com/',{headers}))).status).toBe(401);
 expect(processCustomerSignedContractEmailOutbox).not.toHaveBeenCalled();
});
it('holds all sending until activation',async()=>{
 expect((await GET(new NextRequest('https://example.com/',{headers:{authorization:'Bearer worker'}}))).status).toBe(503);
 expect(processCustomerSignedContractEmailOutbox).not.toHaveBeenCalled();
});
