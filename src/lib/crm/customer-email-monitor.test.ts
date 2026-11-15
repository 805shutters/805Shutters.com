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
   for (const key of ["select", "eq", "gte", "or", "order", "in", "is"]) query[key] = () => query;
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

const oldFailure = {
  id: "failed", kind: "signed_contract", status: "blocked", recipient: "missing",
  created_at: "2026-09-27T22:30:13.477Z", provider_accepted_at: null, delivery_status: null,
  delivery_checked_at: null, delivery_error: null, last_error: "The signed customer contract has no valid customer email.",
  attention_resolved_at: null, attention_resolved_by: null, attention_resolved_note: null,
};
function monitorDb(rows: unknown[]) {
  const filters: unknown[][] = [];
  const db = { filters, from(table: string) {
    let selected = "";
    const query: Record<string, unknown> = {};
    for (const key of ["eq", "gte", "or", "order", "in", "is"]) query[key] = (...args: unknown[]) => {
      if (table === "crm_customer_signed_contract_email_outbox" && selected.includes("attention_resolved_at")) filters.push([key, ...args]);
      return query;
    };
    query.select = (fields: string) => { selected = fields; return query; };
    query.single = async () => ({ data: { enabled_from: "2026-09-24T00:00:00.000Z" }, error: null });
    query.limit = async () => {
      if (table === "crm_activity_events") return { data: [{ created_at: new Date().toISOString(), action: "customer-email.succeeded" }], error: null };
      if (selected === "provider_message_id") return { data: [{ provider_message_id: "provider" }], error: null };
      return { data: rows, error: null };
    };
    return query;
  }, rpc: async () => ({ data: 0, error: null }) };
  return db;
}
it("does not count a resolved attention row, and the health result is ok when every attention row is resolved", async () => {
  vi.stubEnv("RESEND_API_KEY", "controlled-test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "provider", last_event: "delivered" }), { status: 200 })));
  const db = monitorDb([{ ...oldFailure, attention_resolved_at: "2026-11-15T18:00:00.000Z", attention_resolved_by: "805shutters@gmail.com" }]);
  await expect(getCustomerEmailMonitor(db as never)).resolves.toMatchObject({ ok: true, attention: 0, activated: true });
  expect(db.filters).toEqual([
    ["gte", "created_at", "2026-09-24T00:00:00.000Z"],
    ["is", "attention_resolved_at", null],
    ["or", "delivery_status.is.null,delivery_status.not.in.(delivered,opened,clicked),delivery_error.not.is.null"],
    ["order", "created_at", { ascending: false }],
  ]);
});
it("still counts an unresolved failed row", async () => {
  vi.stubEnv("RESEND_API_KEY", "controlled-test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "provider", last_event: "delivered" }), { status: 200 })));
  const db = monitorDb([{ ...oldFailure, status: "accepted", delivery_status: "bounced", last_error: null }]);
  await expect(getCustomerEmailMonitor(db as never)).resolves.toMatchObject({ ok: false, attention: 1 });
  expect(db.filters).toContainEqual(["is", "attention_resolved_at", null]);
  expect(db.filters.filter(([key, column]) => key === "gte" && column === "created_at")).toHaveLength(1);
});
