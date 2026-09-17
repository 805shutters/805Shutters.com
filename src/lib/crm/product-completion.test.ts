import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrmAuthError, requireCrmUser } from "./auth";
import { completeProductMilestone, parseProductCompletion } from "./product-completion";
import { POST } from "@/app/api/crm/operations/product-completion/route";

vi.mock("@/lib/crm/auth", async original => ({ ...await original<typeof import("./auth")>(), requireCrmUser: vi.fn() }));
const ids = [1,2,3,4,5].map(n => `${n}1111111-1111-4111-8111-111111111111`);
const [p1,p2,quoteId,jobId,entryId] = ids;
const timestamp = "2026-09-16T12:00:00.000Z";
const actor = { email: "staff@example.test", userId: jobId };
const input = { step: "ordered", quoteId, records: [{id:p1,updatedAt:timestamp},{id:p2,updatedAt:timestamp}] };
type Row = Record<string, any>;
function database() {
  const tables: Record<string, Row[]> = {
    crm_customer_products: [p1,p2].map(id => ({id,updated_at:timestamp,quote_id:quoteId,job_id:jobId,bookkeeping_entry_id:null,product_type:"Shutters",status:"pending",meta:{keep:true}})),
    crm_quotes: [{id:quoteId,job_id:jobId,meta:{}}],
    crm_jobs: [{id:jobId,meta:{}}],
    crm_quote_bookkeeping_entries: [{id:entryId,quote_id:quoteId,job_id:jobId,meta:{}}],
  };
  const writes: {table:string;patch:Row}[] = [];
  const controls = { failRead:false, failId:"" };
  const from = (table:string) => {
    const filters: [string,unknown][] = []; let patch:Row|null=null;
    const query = {
      select:()=>query,
      eq:(key:string,value:unknown)=>{filters.push([key,value]);return query;},
      in:async(key:string,values:unknown[])=>({data:structuredClone(tables[table].filter(row=>values.includes(row[key]))),error:controls.failRead?{message:"failed"}:null}),
      update:(value:Row)=>{patch=value;return query;},
      maybeSingle:async()=>{
        const found = tables[table].find(row=>filters.every(([key,value])=>row[key]===value));
        if(!found || (patch && found.id===controls.failId))return {data:null,error:null};
        if(patch){writes.push({table,patch});Object.assign(found,patch,{updated_at:"2026-09-17T12:00:00.000Z"});}
        return {data:structuredClone(found),error:null};
      }
    };return query;
  };
  return {client:{from} as unknown as SupabaseClient,tables,writes,controls};
}
beforeEach(()=>{ vi.mocked(requireCrmUser).mockReset(); });
describe("staff product completion",()=>{
  it.each([null,{}, {...input,step:"paid"},{...input,records:[]},{...input,quoteId:undefined},{...input,records:[input.records[0],input.records[0]]},{...input,records:[{id:p1,updatedAt:"bad"}]}])("rejects invalid targets %j",value=>expect(()=>parseProductCompletion(value)).toThrow(CrmAuthError));
  it.each(["ordered","shipped"])("records only %s for every product in the group, preserving status and other metadata",async step=>{
    const db=database();await completeProductMilestone(db.client,{...input,step},actor);
    expect(db.writes).toHaveLength(2);
    expect(db.writes.every(write=>write.table==="crm_customer_products" && Object.keys(write.patch).join()==="meta")).toBe(true);
    for(const product of db.tables.crm_customer_products){
      expect(product.status).toBe("pending");expect(product.meta).toMatchObject({keep:true,workflow_checks:{[step]:{by:actor.email,user_id:actor.userId,source:"staff_job_status"}}});
      expect(product.meta[`${step}_at`]).toEqual(expect.any(String));expect(product.meta[step==="ordered"?"shipped_at":"ordered_at"]).toBeUndefined();
    }
  });
  it("does not write twice when retried with a stale snapshot after success",async()=>{
    const db=database();await completeProductMilestone(db.client,input,actor);await completeProductMilestone(db.client,input,actor);expect(db.writes).toHaveLength(2);
  });
  it.each(["stale","different quote","different type","deleted","missing","entry precedence"])("rejects %s before any write",async reason=>{
    const db=database(),product=db.tables.crm_customer_products[1];
    if(reason==="stale")product.updated_at="2026-09-17";
    if(reason==="different quote")product.quote_id=jobId;
    if(reason==="different type")product.product_type="Blinds";
    if(reason==="deleted")product.meta.deleted_at=timestamp;
    if(reason==="missing")db.tables.crm_customer_products.pop();
    if(reason==="entry precedence")product.bookkeeping_entry_id=entryId;
    await expect(completeProductMilestone(db.client,input,actor)).rejects.toBeInstanceOf(CrmAuthError);expect(db.writes).toHaveLength(0);
  });
  it.each(["direct","quote","ledger"])("enforces the technical-measure guard through %s links",async link=>{
    const db=database();db.tables.crm_jobs[0].meta={measure_needed:{status:"needed",form_status:"awaiting_signature"}};
    if(link!=="direct")for(const product of db.tables.crm_customer_products)product.job_id=null;
    if(link==="ledger")for(const product of db.tables.crm_customer_products){product.quote_id=null;product.bookkeeping_entry_id=entryId;}
    await expect(completeProductMilestone(db.client,{...input,bookkeepingEntryId:link==="ledger"?entryId:undefined},actor)).rejects.toThrow("technical measure");expect(db.writes).toHaveLength(0);
  });
  it("reports partial write failures and retries only unfinished records",async()=>{
    const db=database();db.controls.failId=p2;
    await expect(completeProductMilestone(db.client,input,actor)).rejects.toThrow("Not all products");expect(db.writes).toHaveLength(1);
    db.controls.failId="";await completeProductMilestone(db.client,input,actor);expect(db.writes).toHaveLength(2);
  });
  it("fails safely when product loading fails",async()=>{const db=database();db.controls.failRead=true;await expect(completeProductMilestone(db.client,input,actor)).rejects.toMatchObject({status:502});expect(db.writes).toHaveLength(0);});
  it.each([401,403])("honors authentication/read-only denial %s without a write",async status=>{
    vi.mocked(requireCrmUser).mockImplementation(async () => { throw new CrmAuthError(status,"Access denied"); });
    const response=await POST(new NextRequest("http://localhost/api/crm/operations/product-completion",{method:"POST",body:JSON.stringify(input)}));expect(response.status).toBe(status);
  });
  it("rejects malformed JSON with 400",async()=>{
    const db=database();vi.mocked(requireCrmUser).mockResolvedValue({supabase:db.client,email:actor.email,user:{id:actor.userId}} as never);
    const response=await POST(new NextRequest("http://localhost/api/crm/operations/product-completion",{method:"POST",body:"{"}));expect(response.status).toBe(400);expect(db.writes).toHaveLength(0);
  });
});
