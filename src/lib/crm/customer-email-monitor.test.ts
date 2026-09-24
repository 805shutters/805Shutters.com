import { afterEach, expect, it, vi } from "vitest";
import { customerEmailStatus } from "./customer-email-status";
import { checkCustomerEmailDeliveries, getCustomerEmailMonitor, customerEmailReadiness } from "./customer-email-monitor";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("never labels provider acceptance as delivered",()=>{
 expect(customerEmailStatus({status:'accepted',delivery_status:null,delivery_error:null})).toContain('unconfirmed');
 expect(customerEmailStatus({status:'accepted',delivery_status:'delivered',delivery_error:null})).toBe('Delivered');
 expect(customerEmailStatus({status:'accepted',delivery_status:'bounced',delivery_error:null})).toContain('failed');
 expect(customerEmailStatus({status:'accepted',delivery_status:null,delivery_error:'unavailable'})).toContain('attention');
});
it("retrieves provider delivery evidence with GET, saves delivery separately, and never sends",async()=>{
 vi.stubEnv('RESEND_API_KEY','controlled-test-key');
 const query:Record<string,any>={}; for(const key of ['select','gte','eq','or','order']) query[key]=vi.fn(()=>query);
 query.limit=vi.fn(async()=>({data:[{id:'row',provider_message_id:'provider',delivery_status:null}],error:null}));
 const patch=vi.fn(()=>({eq:()=>({eq:async()=>({error:null})})}));
 const db={from:()=>({...query,update:patch})};
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({id:'provider',last_event:'delivered'}),{status:200}));
 await checkCustomerEmailDeliveries(db as never,'2026-09-24',fetcher as never);
 expect(fetcher).toHaveBeenCalledWith('https://api.resend.com/emails/provider',expect.not.objectContaining({method:'POST'}));
 expect(query.gte).toHaveBeenCalledWith('created_at','2026-09-24');
 expect(patch).toHaveBeenCalledWith(expect.objectContaining({delivery_status:'delivered',delivery_error:null}));
});

it("reports a failed heartbeat even when no email is queued", async () => {
 vi.stubEnv("RESEND_API_KEY", "controlled-test-key");
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({id:"provider",last_event:"delivered"}))));
 const now = Date.now();
 const db = { from: (table: string) => {
   const result = table === "crm_activity_events" ? [{created_at: new Date(now).toISOString(), action: "customer-email.failed"}] : table === "crm_customer_signed_contract_email_outbox" ? [{provider_message_id:"provider", status:"accepted", delivery_status:"delivered", created_at:new Date(now).toISOString()}] : [];
   const query: Record<string, any> = {};
   for (const key of ["select", "eq", "gte", "or", "order", "in"]) query[key] = () => query;
   query.single = async () => ({ data: {enabled_from: new Date(now - 60000).toISOString()}, error: null });
   query.limit = async () => ({data: result, error: null});
   return query;
 }, rpc: async () => ({data: 0, error: null}) };
 expect(await getCustomerEmailMonitor(db as never, now)).toMatchObject({ok: false, stale: false, attention: 0, workerFailed: true});
});

it("distinguishes send-only credentials from invalid credentials without sending", async () => {
 vi.stubEnv("RESEND_API_KEY", "controlled-test-key");
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({name:"restricted_api_key"}), {status:401})));
 const query: Record<string,any> = {};
 for (const key of ["select", "eq", "order"]) query[key]=()=>query;
 query.limit=async()=>({data:[{provider_message_id:"provider"}],error:null});
 expect(await customerEmailReadiness({from:()=>query} as never)).toMatchObject({ok:false,providerReady:false,sendingOnly:true});
});
