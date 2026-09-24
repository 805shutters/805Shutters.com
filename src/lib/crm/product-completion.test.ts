import { applyOrderEmailProduct, orderEmailRequestId } from "./apply-order-email-product";
import { saveProductOrderCost } from "./save-product-order-cost";
import { productOrderCosts } from "./product-order-cost";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrmAuthError, requireCrmUser } from "./auth";
import { completeProductMilestone, parseProductCompletion } from "./product-completion";
import { buildCustomerFiles } from "./customer-files";
import { buildOperationsItems } from "./operations-overview";
import type { CrmBookkeepingRow, CrmDashboardData, CrmJob } from "./types";
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
    crm_customer_contracts: [],
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
      then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:structuredClone((tables[table] || []).filter(row=>filters.every(([key,value])=>row[key]===value))),error:controls.failRead?{message:"failed"}:null}).then(resolve),
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
  it.each(["ordered", "shipped"])("accepts verified quote and cost links for %s",async step=>{
    const db=database();for(const product of db.tables.crm_customer_products)product.bookkeeping_entry_id=entryId;
    await completeProductMilestone(db.client,{...input,step},actor);expect(db.writes).toHaveLength(2);
  });
  it("does not write twice when retried with a stale snapshot after success",async()=>{
    const db=database();await completeProductMilestone(db.client,input,actor);await completeProductMilestone(db.client,input,actor);expect(db.writes).toHaveLength(2);
  });
  it.each(["stale","different quote","different type","deleted","missing","conflicting entry"])("rejects %s before any write",async reason=>{
    const db=database(),product=db.tables.crm_customer_products[1];
    if(reason==="stale")product.updated_at="2026-09-17";
    if(reason==="different quote")product.quote_id=jobId;
    if(reason==="different type")product.product_type="Blinds";
    if(reason==="deleted")product.meta.deleted_at=timestamp;
    if(reason==="missing")db.tables.crm_customer_products.pop();
    if(reason==="conflicting entry"){product.bookkeeping_entry_id=entryId;db.tables.crm_quote_bookkeeping_entries[0].quote_id=p1;}
    await expect(completeProductMilestone(db.client,input,actor)).rejects.toBeInstanceOf(CrmAuthError);expect(db.writes).toHaveLength(0);
  });
  it.each(["direct","quote","ledger"])("records an already placed order through %s links without changing outstanding prerequisites",async link=>{
    const db=database();db.tables.crm_jobs[0].meta={measure_needed:{status:"needed",form_status:"awaiting_signature"}};
    if(link!=="direct")for(const product of db.tables.crm_customer_products)product.job_id=null;
    if(link==="ledger")for(const product of db.tables.crm_customer_products){product.quote_id=null;product.bookkeeping_entry_id=entryId;}
    await completeProductMilestone(db.client,{...input,bookkeepingEntryId:link==="ledger"?entryId:undefined},actor);
    expect(db.writes).toHaveLength(2);
    expect(db.tables.crm_jobs[0].meta.measure_needed).toEqual({status:"needed",form_status:"awaiting_signature"});
    expect(db.tables.crm_customer_products.every(p=>p.meta.ordered_at)).toBe(true);
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


describe("job-derived product completion", () => {
  const fallback = { step: "shipped", jobId, records: [{ id: `job-product-${jobId}`, updatedAt: timestamp, productType: "roller shades" }] };
  function overview(db: ReturnType<typeof database>) {
    const jobs = structuredClone(db.tables.crm_jobs) as CrmJob[];
    const customerFiles = buildCustomerFiles({ jobs, quotes: [], bookkeepingRows: [], customers: [], products: [], contracts: [] });
    return buildOperationsItems({ jobs, customerFiles, quotes: [], customerProducts: [], bookkeepingRows: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData)[0];
  }
  function setup() {
    const db = database();
    Object.assign(db.tables.crm_jobs[0], { customer_name: "Sample customer", status: "sold", created_at: timestamp, updated_at: timestamp, product_interest: "roller shades, shutters", meta: { keep: true } });
    return db;
  }
  it.each(["ordered", "shipped"])("persists %s for a generated row and rebuilds its green check after reload", async step => {
    const db = setup();
    expect(overview(db).products[0]).toMatchObject({ ordered: false, shipped: false });
    await completeProductMilestone(db.client, { ...fallback, step }, actor);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].table).toBe("crm_jobs");
    expect(db.tables.crm_jobs[0].meta.keep).toBe(true);
    expect(db.tables.crm_jobs[0].status).toBe("sold");
    expect(overview(db).products[0]).toMatchObject({ [step]: true, [step === "ordered" ? "shipped" : "ordered"]: false });
    await completeProductMilestone(db.client, { ...fallback, step }, actor);
    expect(db.writes).toHaveLength(1);
    expect(overview(db).products[1]).toMatchObject({ ordered: false, shipped: false });
    db.tables.crm_jobs[0].product_interest = "Blinds";
    expect(overview(db).products[0]).toMatchObject({ ordered: false, shipped: false });
  });
  it.each(["needed", "draft", "awaiting_signature"])("records manual order with a %s measure and retains its reminder", async state => {
    const db = setup();
    const measure = { status: "needed", form_status: state };
    db.tables.crm_jobs[0].meta.measure_needed = measure;
    db.tables.crm_jobs[0].deposit_paid = 0;
    await completeProductMilestone(db.client, { ...fallback, step: "ordered" }, actor);
    expect(overview(db).products[0]).toMatchObject({ ordered: true, shipped: false });
    expect(db.tables.crm_jobs[0].meta.measure_needed).toEqual(measure);
    expect(db.tables.crm_jobs[0].deposit_paid).toBe(0);
    expect(db.tables.crm_jobs[0].status).toBe("sold");
  });
  it("keeps independently saved order and shipment checks", async () => {
    const db = setup();
    await completeProductMilestone(db.client, { ...fallback, step: "ordered" }, actor);
    await completeProductMilestone(db.client, { ...fallback, records: [{ ...fallback.records[0], updatedAt: db.tables.crm_jobs[0].updated_at }] }, actor);
    expect(overview(db).products[0]).toMatchObject({ ordered: true, shipped: true });
  });
  it.each(["stale", "deleted", "missing", "write conflict"])("rejects %s without painting or saving a check", async reason => {
    const db = setup();
    if (reason === "stale") db.tables.crm_jobs[0].updated_at = "2026-09-18";
    if (reason === "deleted") db.tables.crm_jobs[0].meta.deleted_at = timestamp;
    if (reason === "missing") db.tables.crm_jobs = [];
    if (reason === "write conflict") db.controls.failId = jobId;
    await expect(completeProductMilestone(db.client, { ...fallback, step: "shipped" }, actor)).rejects.toBeInstanceOf(CrmAuthError);
    expect(db.writes).toHaveLength(0);
  });
  it("rejects mismatched and mixed synthetic targets", () => {
    expect(() => parseProductCompletion({ ...fallback, jobId: quoteId })).toThrow();
    expect(() => parseProductCompletion({ ...fallback, records: [...fallback.records, input.records[0]] })).toThrow();
  });
});

describe("productless whole-job completion", () => {
  const quoteFallback = { step: "ordered", quoteId, jobId, records: [{ id: `whole-job-quote-${quoteId}`, updatedAt: timestamp }] };
  const ledgerFallback = { step: "shipped", bookkeepingEntryId: entryId, jobId, records: [{ id: `whole-job-bookkeeping-${entryId}`, updatedAt: timestamp }] };

  function setup() {
    const db = database();
    Object.assign(db.tables.crm_quotes[0], { updated_at: timestamp, customer_name: "Quote customer", status: "sold", sold_at: timestamp, created_at: timestamp, meta: { keep: true } });
    Object.assign(db.tables.crm_jobs[0], { updated_at: timestamp, created_at: timestamp, customer_name: "Job customer", status: "sold", product_interest: null });
    Object.assign(db.tables.crm_quote_bookkeeping_entries[0], { updated_at: timestamp, meta: { keep: true } });
    db.tables.crm_customer_products = [];
    return db;
  }

  function quoteOverview(db: ReturnType<typeof database>) {
    return buildOperationsItems({ jobs: [], customerFiles: [], quotes: structuredClone(db.tables.crm_quotes), customerProducts: [], bookkeepingRows: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData);
  }

  function ledgerOverview(db: ReturnType<typeof database>) {
    const parent = db.tables.crm_quote_bookkeeping_entries[0];
    const row = { id: parent.id, costRecordId: parent.id, costRecordUpdatedAt: parent.updated_at, meta: structuredClone(parent.meta), costMeta: structuredClone(parent.meta), source: "manual", quoteId: null, jobId: parent.job_id, customerName: "Ledger customer", soldDate: timestamp, total: 0, depositDue: 0, depositPaid: 0, balancePaid: 0, paidTotal: 0, creditIn: 0, creditOut: 0, cogs: 0, balance: 0, kenCut: 0, kenCutOverride: null, advertisingReserve: 0, mikeProfit: 0 } as unknown as CrmBookkeepingRow;
    return buildOperationsItems({ jobs: [], customerFiles: [], quotes: [], customerProducts: [], bookkeepingRows: [row], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData)[0];
  }

  it("does not invent a product type for a productless job", () => {
    const db = setup();
    const files = buildCustomerFiles({ jobs: structuredClone(db.tables.crm_jobs) as CrmJob[], quotes: [], bookkeepingRows: [], customers: [], products: [], contracts: [] });
    expect(files.flatMap(file => file.products)).toEqual([]);
  });

  it.each(["ordered", "shipped"])("persists a quote-only %s fallback and rebuilds only that circle after reload", async step => {
    const db = setup();
    db.tables.crm_quotes.push({ ...structuredClone(db.tables.crm_quotes[0]), id: p1, customer_name: "Sibling quote", meta: {}, job_id: jobId });
    expect(quoteOverview(db).map(item => item.wholeJob)).toMatchObject([{ ordered: false, shipped: false }, { ordered: false, shipped: false }]);
    await completeProductMilestone(db.client, { ...quoteFallback, step }, actor);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].table).toBe("crm_quotes");
    const reloaded = quoteOverview(db);
    expect(reloaded.find(item => item.source.quote?.id === quoteId)?.wholeJob).toMatchObject({ [step]: true, [step === "ordered" ? "shipped" : "ordered"]: false });
    expect(reloaded.find(item => item.source.quote?.id === p1)?.wholeJob).toMatchObject({ ordered: false, shipped: false });
  });

  it("persists independent ordered and shipped checks on an exact standalone ledger parent and rebuilds both circles", async () => {
    const db = setup();
    await completeProductMilestone(db.client, { ...ledgerFallback, step: "ordered" }, actor);
    await completeProductMilestone(db.client, { ...ledgerFallback, records: [{ ...ledgerFallback.records[0], updatedAt: db.tables.crm_quote_bookkeeping_entries[0].updated_at }] }, actor);
    expect(db.tables.crm_quote_bookkeeping_entries[0].meta.whole_job_workflow_checks).toMatchObject({ ordered: { by: actor.email }, shipped: { by: actor.email } });
    expect(db.tables.crm_quotes[0].meta.whole_job_workflow_checks).toBeUndefined();
    expect(ledgerOverview(db).wholeJob).toMatchObject({ ordered: true, shipped: true });
  });

  it("rejects an inferred quote ID for a standalone ledger row whose stored quote link is null", async () => {
    const db = setup();
    db.tables.crm_quote_bookkeeping_entries[0].quote_id = null;
    await expect(completeProductMilestone(db.client, { ...ledgerFallback, quoteId }, actor)).rejects.toMatchObject({ status: 409 });
    expect(db.writes).toHaveLength(0);
  });

  it.each(["missing", "stale", "wrong parent", "deleted"])("rejects a %s whole-job parent without a write", async reason => {
    const db = setup();
    const body: any = structuredClone(quoteFallback);
    if (reason === "missing") db.tables.crm_quotes = [];
    if (reason === "stale") body.records[0].updatedAt = "2026-09-15T12:00:00.000Z";
    if (reason === "wrong parent") body.quoteId = p1;
    if (reason === "deleted") db.tables.crm_quotes[0].meta.deleted_at = timestamp;
    await expect(completeProductMilestone(db.client, body, actor)).rejects.toBeInstanceOf(CrmAuthError);
    expect(db.writes).toHaveLength(0);
  });
});

describe('product invoice costs',()=>{
  const invoice={amount:1200,reference:'INV-123',includedInCogs:false,expectedUpdatedAt:timestamp,requestId:'61111111-1111-4111-8111-111111111111'};
  function setupCost(){const db=database();Object.assign(db.tables.crm_quotes[0],{updated_at:timestamp,materials_cost:300});return db;}
  it('saves one amount for a product group and does not add it again on retry',async()=>{
    const db=setupCost();await saveProductOrderCost(db.client,{...input,invoice},actor);
    expect(db.tables.crm_quotes[0].materials_cost).toBe(1500);expect(db.tables.crm_customer_products.every(p=>p.meta.ordered_at)).toBe(true);
    await saveProductOrderCost(db.client,{...input,invoice},actor);expect(db.tables.crm_quotes[0].materials_cost).toBe(1500);
    expect(Object.values(productOrderCosts(db.tables.crm_quotes[0].meta))).toMatchObject([{amount:1200,reference:'INV-123',records:[p1,p2]}]);
  });
  it('reallocates a shared invoice without changing its total, siblings, or audit history',async()=>{
    const db=setupCost();
    db.tables.crm_customer_products=[{...db.tables.crm_customer_products[0],product_type:'Roller Shades, Shutters',status:'ordered'}];
    const parent=db.tables.crm_quotes[0];parent.materials_cost=1780.28;
    parent.meta={product_order_costs:{[p1]:{amount:1780.28,reference:'ORIGINAL',records:[p1],requestId:'old'}}};
    const records=[{id:p1,updatedAt:timestamp,productType:'roller shades'}];
    const body={...input,records,invoice:{...invoice,amount:700,includedInCogs:true}};
    await expect(saveProductOrderCost(db.client,{...body,invoice:{...body.invoice,includedInCogs:false}},actor)).rejects.toThrow('Allocate the existing');
    expect(db.writes).toHaveLength(0);
    await saveProductOrderCost(db.client,body,actor);
    await saveProductOrderCost(db.client,body,actor);
    expect(parent.materials_cost).toBe(1780.28);
    expect(Object.values(productOrderCosts(parent.meta)).map(cost=>cost.amount)).toEqual([700]);
    expect(parent.meta.product_order_costs[p1]).toMatchObject({amount:1780.28,supersededAt:expect.any(String)});
    expect(db.tables.crm_customer_products[0].meta.product_type_workflow.shutters).toBeUndefined();
    const second={...input,records:[{id:p1,updatedAt:db.tables.crm_customer_products[0].updated_at,productType:'shutters'}],invoice:{...invoice,amount:1080.28,includedInCogs:true,expectedUpdatedAt:parent.updated_at,requestId:'71111111-1111-4111-8111-111111111111'}};
    await saveProductOrderCost(db.client,second,actor);
    expect(parent.materials_cost).toBe(1780.28);
    expect(Object.values(productOrderCosts(parent.meta)).reduce((total,cost)=>total+cost.amount,0)).toBe(1780.28);
    expect(parent.meta.product_order_cost_history).toHaveLength(2);
    expect(db.tables.crm_customer_products[0].meta.product_type_workflow['roller shades'].ordered_at).toBeTruthy();
    expect(db.tables.crm_customer_products[0].meta.product_type_workflow.shutters.ordered_at).toBeTruthy();
  });
  it.each([true,false])('reconciles only an evidenced shared email invoice (linked=%s)',async linked=>{
    const db=setupCost();db.tables.crm_customer_products=[{...db.tables.crm_customer_products[0],product_type:'Shutters, Roller Shades'}];
    const parent=db.tables.crm_quotes[0],emailId='81111111-1111-4111-8111-111111111111';
    parent.materials_cost=1780.28;parent.meta={product_order_costs:{[p1]:{amount:1780.28,reference:'ORIGINAL',emailId:linked?emailId:null,records:[p1]}}};
    db.tables.crm_order_cogs_emails=[{id:emailId,matched_quote_id:quoteId,match_status:'matched',applied_at:null,extracted_order_amount:1780.28,gmail_message_id:'sample-shared'}];
    const body={...input,records:[{...input.records[0],productType:'shutters'}],invoice:{...invoice,amount:1080.28,emailId,includedInCogs:true}};
    if(linked){await saveProductOrderCost(db.client,body,actor);expect(parent.materials_cost).toBe(1780.28);expect(Object.values(productOrderCosts(parent.meta))).toMatchObject([{amount:1080.28,emailId}]);}
    else {await expect(saveProductOrderCost(db.client,body,actor)).rejects.toThrow('not linked to this email');expect(db.writes).toHaveLength(0);}
  });
  it('records different manufacturers independently and rejects a cross-manufacturer request',async()=>{
    const db=setupCost();db.tables.crm_customer_products[0].supplier='Norman';db.tables.crm_customer_products[1].supplier='Onyx';
    await expect(saveProductOrderCost(db.client,{...input,invoice},actor)).rejects.toThrow('product group changed');
    expect(db.writes).toHaveLength(0);
    await saveProductOrderCost(db.client,{...input,records:[input.records[0]],invoice},actor);
    expect(db.tables.crm_customer_products[0].meta.ordered_at).toBeTruthy();
    expect(db.tables.crm_customer_products[1].meta.ordered_at).toBeUndefined();
    const parent=db.tables.crm_quotes[0];
    await saveProductOrderCost(db.client,{...input,records:[input.records[1]],invoice:{...invoice,amount:700,expectedUpdatedAt:parent.updated_at,requestId:'71111111-1111-4111-8111-111111111111'}},actor);
    expect(parent.materials_cost).toBe(2200);
    expect(productOrderCosts(parent.meta)[p1].amount).toBe(1200);
    expect(productOrderCosts(parent.meta)[p2].amount).toBe(700);
  });
  it.each([undefined,'blinds'])('rejects an absent or wrong mixed-product scope (%s) before saving money',async productType=>{
    const db=setupCost();db.tables.crm_customer_products[0].product_type='Shutters, Roller Shades';
    await expect(saveProductOrderCost(db.client,{...input,records:[{...input.records[0],productType}],invoice},actor)).rejects.toThrow();
    expect(db.writes).toHaveLength(0);
  });
  it('scopes shipment evidence to one part of a combined record and persists on reload',async()=>{
    const db=setupCost();db.tables.crm_customer_products=[{...db.tables.crm_customer_products[0],product_type:'Shutters, Roller Shades',status:'shipped',meta:{keep:true}}];
    const target={...input,step:'shipped',records:[{...input.records[0],productType:'roller shades'}]};
    await completeProductMilestone(db.client,target,actor);await completeProductMilestone(db.client,target,actor);
    expect(db.writes).toHaveLength(1);
    const row=db.tables.crm_customer_products[0];
    expect(row.meta.product_type_workflow['roller shades'].shipped_at).toBeTruthy();
    expect(row.meta.product_type_workflow.shutters).toBeUndefined();
    expect(row.status).toBe('shipped');expect(row.meta.keep).toBe(true);
  });
  it('records an explicit zero-dollar invoice and completes the order',async()=>{
    const db=setupCost();await saveProductOrderCost(db.client,{...input,invoice:{...invoice,amount:0,reference:'NO CHARGE'}},actor);
    expect(db.tables.crm_quotes[0].materials_cost).toBe(300);
    expect(Object.values(productOrderCosts(db.tables.crm_quotes[0].meta))).toMatchObject([{amount:0,reference:'NO CHARGE'}]);
    expect(db.tables.crm_customer_products.every(p=>p.meta.ordered_at)).toBe(true);
  });
  it('can retry the same invoice request after a compare-and-set failure',async()=>{
    const db=setupCost();db.controls.failId=quoteId;
    await expect(saveProductOrderCost(db.client,{...input,invoice},actor)).rejects.toThrow('job changed');
    expect(db.tables.crm_quotes[0].materials_cost).toBe(300);
    db.controls.failId='';
    await saveProductOrderCost(db.client,{...input,invoice},actor);
    expect(db.tables.crm_quotes[0].materials_cost).toBe(1500);
  });
  it('rolls up and retries a productless whole-job invoice without double counting',async()=>{
    const db=setupCost();db.tables.crm_customer_products=[];db.tables.crm_quotes[0].meta={keep:true};
    const fallback={step:'ordered',quoteId,jobId,records:[{id:`whole-job-quote-${quoteId}`,updatedAt:timestamp}]};
    await saveProductOrderCost(db.client,{...fallback,invoice},actor);
    expect(db.tables.crm_quotes[0].materials_cost).toBe(1500);
    expect(db.tables.crm_quotes[0].meta.whole_job_workflow_checks.ordered).toMatchObject({by:actor.email});
    await saveProductOrderCost(db.client,{...fallback,invoice},actor);
    expect(db.tables.crm_quotes[0].materials_cost).toBe(1500);
    expect(Object.values(productOrderCosts(db.tables.crm_quotes[0].meta))).toMatchObject([{amount:1200,records:[`whole-job-quote-${quoteId}`]}]);
  });
  it('updates existing invoice by the difference and keeps unrelated COGS',async()=>{
    const db=setupCost();await saveProductOrderCost(db.client,{...input,invoice},actor);
    await saveProductOrderCost(db.client,{...input,records:db.tables.crm_customer_products.map(p=>({id:p.id,updatedAt:p.updated_at})),invoice:{...invoice,amount:1400,expectedUpdatedAt:db.tables.crm_quotes[0].updated_at,requestId:'71111111-1111-4111-8111-111111111111'}},actor);
    expect(db.tables.crm_quotes[0].materials_cost).toBe(1700);
  });
  it('allocates a previously recorded cost without adding to the total',async()=>{
    const db=setupCost();await saveProductOrderCost(db.client,{...input,invoice:{...invoice,amount:200,includedInCogs:true}},actor);expect(db.tables.crm_quotes[0].materials_cost).toBe(300);
  });
  it.each(['stale','wrong product','over allocation','invalid amount','foreign financial parent'])('rejects %s without any changes',async reason=>{
    const db=setupCost();const body:any={...input,invoice:{...invoice}};
    if(reason==='stale')body.invoice.expectedUpdatedAt='2025-01-01';
    if(reason==='wrong product')db.tables.crm_customer_products[1].quote_id=entryId;
    if(reason==='over allocation')body.invoice.includedInCogs=true;
    if(reason==='invalid amount')body.invoice.amount=NaN;
    if(reason==='foreign financial parent'){body.costEntryId=entryId;db.tables.crm_quote_bookkeeping_entries[0].quote_id=jobId;}
    await expect(saveProductOrderCost(db.client,body,actor)).rejects.toBeInstanceOf(CrmAuthError);expect(db.writes).toHaveLength(0);
  });
  it.each([true,false])('uses a matched email once, already applied=%s',async applied=>{
    const db=setupCost();const emailId='81111111-1111-4111-8111-111111111111';db.tables.crm_order_cogs_emails=[{id:emailId,matched_quote_id:quoteId,match_status:'matched',applied_at:applied?timestamp:null,extracted_order_amount:250,gmail_message_id:'gmail1'}];
    await saveProductOrderCost(db.client,{...input,invoice:{...invoice,amount:200,emailId}},actor);
    expect(db.tables.crm_quotes[0].materials_cost).toBe(applied?300:550);expect(db.tables.crm_quotes[0].meta.orderCogsMessageIds).toContain('gmail1');
    await saveProductOrderCost(db.client,{...input,invoice:{...invoice,amount:200,emailId}},actor);expect(db.tables.crm_quotes[0].materials_cost).toBe(applied?300:550);
  });
  it('does not offer a skipped duplicate invoice for a second allocation',async()=>{
    const db=setupCost();const emailId='81111111-1111-4111-8111-111111111111';db.tables.crm_order_cogs_emails=[{id:emailId,matched_quote_id:quoteId,match_status:'skipped',applied_at:null,extracted_order_amount:250,gmail_message_id:'duplicate',raw:{duplicateApplied:true}}];
    await expect(saveProductOrderCost(db.client,{...input,invoice:{...invoice,amount:200,emailId}},actor)).rejects.toThrow('exact sale');expect(db.writes).toHaveLength(0);
  });
  it('rejects invoice email belonging to another customer',async()=>{
    const db=setupCost();const emailId='81111111-1111-4111-8111-111111111111';db.tables.crm_order_cogs_emails=[{id:emailId,matched_quote_id:jobId,match_status:'matched',applied_at:timestamp,extracted_order_amount:250,gmail_message_id:'gmail1'}];
    await expect(saveProductOrderCost(db.client,{...input,invoice:{...invoice,amount:200,emailId}},actor)).rejects.toThrow('exact sale');expect(db.writes).toHaveLength(0);
  });
});


describe("automatic order email uses the same product invoice workflow", () => {
  const emailId = "81111111-1111-4111-8111-111111111111";
  function setup() {
    const db = database();
    Object.assign(db.tables.crm_jobs[0], { customer_name: "Phillip Benson", status: "sold", created_at: timestamp, updated_at: timestamp, product_interest: "Shutters" });
    Object.assign(db.tables.crm_quotes[0], { status: "sold", quote_total: 6958.8, created_at: timestamp, updated_at: timestamp, materials_cost: 0 });
    db.tables.crm_order_cogs_emails = [{ id: emailId, mailbox_email: "805shutters@gmail.com", gmail_message_id: "gmail-benson", matched_quote_id: quoteId, matched_job_id: jobId, match_status: "matched", extracted_order_number: "52609191394", extracted_order_amount: 2823.29, raw: {} }];
    const load = async () => {
      const jobs = structuredClone(db.tables.crm_jobs);
      const quotes = structuredClone(db.tables.crm_quotes);
      const customerProducts = structuredClone(db.tables.crm_customer_products);
      const customerFiles = buildCustomerFiles({ jobs, quotes, bookkeepingRows: [], customers: [], products: customerProducts, contracts: [] } as never);
      return { jobs, quotes, customerFiles, customerProducts, bookkeepingRows: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData;
    };
    const apply = () => applyOrderEmailProduct(db.client, db.tables.crm_order_cogs_emails[0] as never, "Onyx", actor, load);
    return { db, load, apply };
  }
  it("saves the full invoice once and verifies the green check", async () => {
    const {db, apply} = setup();
    expect(await apply()).toMatchObject({ addedCogs: 2823.29 });
    expect(db.tables.crm_quotes[0].materials_cost).toBe(2823.29);
    expect(db.tables.crm_customer_products.every(p => p.meta.ordered_at)).toBe(true);
    const writes = db.writes.length;
    expect(await apply()).toMatchObject({ addedCogs: 0 });
    expect(db.writes).toHaveLength(writes);
    expect(db.tables.crm_jobs[0].status).toBe("sold");
  });
  it("holds an invoice when historical COGS has no allocation or invoice identity", async () => {
    const {db, apply} = setup();
    db.tables.crm_quotes[0].materials_cost = 786.19;
    await expect(apply()).rejects.toThrow("Existing unassigned COGS");
    expect(db.writes).toHaveLength(0);
    expect(db.tables.crm_quotes[0].materials_cost).toBe(786.19);
  });
  it("permits new cost when all earlier COGS has a separate invoice allocation", async () => {
    const {db, apply} = setup();
    db.tables.crm_quotes[0].materials_cost = 300;
    db.tables.crm_quotes[0].meta.product_order_costs = { unrelated: { amount:300, reference:"separate-invoice", emailId:null, records:["unrelated"], at:timestamp, by:actor.email, requestId:emailId } };
    expect(await apply()).toMatchObject({addedCogs:2823.29});
    expect(db.tables.crm_quotes[0].materials_cost).toBe(3123.29);
  });
  it("recovers after cost saved but one product check failed, without charging twice", async () => {
    const {db, apply} = setup(); db.controls.failId = p2;
    await expect(apply()).rejects.toThrow("Not all products");
    expect(db.tables.crm_quotes[0].materials_cost).toBe(2823.29);
    db.controls.failId = "";
    expect(await apply()).toMatchObject({ addedCogs: 0 });
    expect(db.tables.crm_quotes[0].materials_cost).toBe(2823.29);
    expect(db.tables.crm_customer_products.every(p => p.meta.ordered_at)).toBe(true);
  });
  it("updates the generated job-product used by Benson's live card", async () => {
    const {db, apply, load} = setup(); db.tables.crm_customer_products = [];
    await apply();
    expect(db.tables.crm_quotes[0].materials_cost).toBe(2823.29);
    expect(buildOperationsItems(await load())[0].products[0].ordered).toBe(true);
    expect(await apply()).toMatchObject({ addedCogs: 0 });
    expect(db.tables.crm_quotes[0].materials_cost).toBe(2823.29);
  });
  it.each([['Onyx', 'Norman'], ['Norman', 'Norman']])("holds unlabelled shutters with conflicting contract suppliers %s/%s", async (first, second) => {
    const {db, apply} = setup(); db.tables.crm_customer_products = [];
    db.tables.crm_quotes[0].lineItems = [first, second].map((supplier, index) => ({
      id: `line-${index}`, quantity: 1, notes: 'Shutters', selected_design_id: `design-${index}`,
      designs: [{id:`design-${index}`, product_id:'norman_shutters', price_breakdown:{optionsJson:{catalog_manufacturer:supplier}}}]
    }));
    await expect(apply()).rejects.toThrow('contract supplier');
    expect(db.writes).toHaveLength(0);
  });
  it("uses selected imported supplier evidence instead of the legacy product id or unselected alternative", async () => {
    const {db, apply} = setup(); db.tables.crm_customer_products = [];
    db.tables.crm_quotes[0].lineItems = [{id:'line', quantity:1, notes:'Shutters', selected_design_id:'chosen', designs:[
      {id:'chosen',product_id:'norman_shutters',price_breakdown:{details:[{label:'Supplier',value:'Onyx'}]}},
      {id:'other',product_id:'norman_shutters',price_breakdown:{optionsJson:{catalog_manufacturer:'Norman'}}}
    ]}];
    expect(await apply()).toMatchObject({addedCogs:2823.29});
  });
  it("recognizes a forwarded copy in the business mailbox without charging the invoice again", async () => {
    const {db, apply} = setup(); await apply();
    const original = db.tables.crm_order_cogs_emails[0];
    db.tables.crm_order_cogs_emails.unshift({ ...original, id: "91111111-1111-4111-8111-111111111111", gmail_message_id: "resent", mailbox_email: "805@805shutters.com" });
    expect(await apply()).toMatchObject({ addedCogs: 0 });
    expect(db.tables.crm_quotes[0].materials_cost).toBe(2823.29);
  });
  it("repairs the product check for a previously applied aggregate invoice without adding cost", async () => {
    const {db, apply} = setup();
    db.tables.crm_quotes[0].materials_cost = 2823.29;
    db.tables.crm_order_cogs_emails[0].applied_at = timestamp;
    expect(await apply()).toMatchObject({ addedCogs: 0 });
    expect(db.tables.crm_quotes[0].materials_cost).toBe(2823.29);
  });
  it("selects only shutters in a mixed product sale", async () => {
    const {db, apply} = setup(); db.tables.crm_customer_products[1].product_type = "Roller Shades";
    await apply();
    expect(db.tables.crm_customer_products[0].meta.ordered_at).toBeTruthy();
    expect(db.tables.crm_customer_products[1].meta.ordered_at).toBeUndefined();
  });
  it.each(["different sale", "combined products", "different manufacturer", "existing manual cost", "different amount"])("leaves %s for review", async reason => {
    const {db, apply} = setup();
    if (reason === "different sale") db.tables.crm_order_cogs_emails[0].matched_job_id = entryId;
    if (reason === "combined products") db.tables.crm_customer_products.forEach(p => p.product_type = "Shutters and Roller Shades");
    if (reason === "different manufacturer") db.tables.crm_customer_products.forEach(p => p.supplier = "Norman");
    if (reason === "existing manual cost" || reason === "different amount") {
      await apply();
      const cost = Object.values(db.tables.crm_quotes[0].meta.product_order_costs)[0] as Row;
      if (reason === "existing manual cost") cost.emailId = null;
      else db.tables.crm_order_cogs_emails[0].extracted_order_amount = 100;
    }
    const writes = db.writes.length;
    await expect(apply()).rejects.toMatchObject({ status: 409 });
    expect(db.writes).toHaveLength(writes);
  });
  it("uses stable invoice identities across retries and distinct identities across sales", () => {
    const id = orderEmailRequestId("805shutters@gmail.com", "Onyx", "52609191394", quoteId);
    expect(orderEmailRequestId("805SHUTTERS@gmail.com", "ONYX", "52609191394", quoteId)).toBe(id);
    expect(orderEmailRequestId("805shutters@gmail.com", "Onyx", "52609191394", entryId)).not.toBe(id);
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
  });
});

describe("confirmed shipment dates", () => {
  const shipment = { shippedOn: "2026-09-10", mailbox: "805@805shutters.com", messageId: "1a0b8ca64c60954b", orderReference: "8880985478" };
  it("saves a manual shipment without details and accepts official email details afterward", async () => {
    const db = database();
    await completeProductMilestone(db.client, { ...input, step: "shipped" }, actor);
    const manualAt = db.tables.crm_customer_products[0].meta.shipped_at;
    expect(manualAt).toEqual(expect.any(String));
    expect(db.tables.crm_customer_products[0].meta.shipping_confirmation).toBeUndefined();
    expect(db.tables.crm_customer_products[0].meta.workflow_checks.shipped.source).toBe("staff_job_status");
    const records = db.tables.crm_customer_products.map(p => ({ id: p.id, updatedAt: p.updated_at }));
    await completeProductMilestone(db.client, { ...input, records, step: "shipped", shipment }, actor);
    expect(db.tables.crm_customer_products[0].meta).toMatchObject({ shipped_at: manualAt, shipping_confirmation: shipment });
    expect(db.tables.crm_customer_products[0].meta.ordered_at).toBeUndefined();
  });
  it("stores actual dispatch separately from processing time and retries without rewriting", async () => {
    const db = database();
    const request = { ...input, step: "shipped", shipment };
    await completeProductMilestone(db.client, request, actor);
    expect(db.tables.crm_customer_products[0].meta.shipping_confirmation).toMatchObject(shipment);
    expect(db.tables.crm_customer_products[0].meta.shipped_at).not.toBe(shipment.shippedOn);
    await completeProductMilestone(db.client, request, actor);
    expect(db.writes).toHaveLength(2);
  });
  it("backfills dated evidence without changing existing completion timestamps or other milestones", async () => {
    const db = database();
    db.tables.crm_customer_products.forEach(p => { p.meta.shipped_at = timestamp; p.meta.installed_at = timestamp; });
    await completeProductMilestone(db.client, { ...input, step: "shipped", shipment }, actor);
    expect(db.tables.crm_customer_products[0].meta).toMatchObject({ shipped_at: timestamp, installed_at: timestamp, shipping_confirmation: shipment });
  });
  it("updates only explicitly selected products in a partial shipment", async () => {
    const db = database();
    await completeProductMilestone(db.client, { ...input, step: "shipped", shipment, records: [input.records[0]] }, actor);
    expect(db.writes).toHaveLength(1);
    expect(db.tables.crm_customer_products[1].meta.shipped_at).toBeUndefined();
  });
  it.each(["stale", "conflict"])("rejects %s evidence before any product is changed", async reason => {
    const db = database();
    if (reason === "stale") db.tables.crm_customer_products[1].updated_at = "2026-09-18";
    else db.tables.crm_customer_products[1].meta.shipping_confirmation = { ...shipment, shippedOn: "2026-09-09" };
    await expect(completeProductMilestone(db.client, { ...input, step: "shipped", shipment }, actor)).rejects.toMatchObject({ status: 409 });
    expect(db.writes).toHaveLength(0);
  });
  it('preserves an undated vendor notice, retries idempotently, and later adds an explicit date',async()=>{
    const db=database();const undated={...shipment,shippedOn:null,notifiedOn:'2026-09-19',trackingNumber:'TRACK123'};
    const body={...input,step:'shipped',shipment:undated};
    await completeProductMilestone(db.client,body,actor);
    await completeProductMilestone(db.client,body,actor);
    expect(db.writes).toHaveLength(2);
    expect(db.tables.crm_customer_products[0].meta.shipping_confirmation).toMatchObject(undated);
    await completeProductMilestone(db.client,{...body,records:db.tables.crm_customer_products.map(p=>({id:p.id,updatedAt:p.updated_at})),shipment:{...undated,shippedOn:'2026-09-18'}},actor);
    expect(db.tables.crm_customer_products[0].meta.shipping_confirmation.shippedOn).toBe('2026-09-18');
  });
  it.each([{ shippedOn: "2026-02-30" }, { shippedOn: "2099-01-01" }, { mailbox: "wrong@example.test" }, { messageId: "" }, { orderReference: "" }])("rejects invalid source/date %j", override => {
    expect(() => parseProductCompletion({ ...input, step: "shipped", shipment: { ...shipment, ...override } })).toThrow();
  });
  it("rejects shipment evidence on generated product or whole-job records", () => {
    expect(() => parseProductCompletion({ step: "shipped", jobId, records: [{ id: `job-product-${jobId}`, updatedAt: timestamp }], shipment })).toThrow();
  });
});


describe("signed products without customer-product rows", () => {
  function setup() {
    const db = database();
    db.tables.crm_customer_products = [];
    Object.assign(db.tables.crm_quotes[0], { status: "sold", sold_at: timestamp, updated_at: timestamp, created_at: timestamp, quote_total: 3893.94, materials_cost: 2261.70,
      lineItems: [{ id: "shutters-line", product_type: "Shutters", quantity: 8 }, { id: "shade-line", product_type: "Roller Shades", quantity: 1 }],
      meta: { keep: true, whole_job_workflow_checks: { ordered: { at: timestamp }, shipped: { at: timestamp } } }
    });
    return db;
  }
  function overview(db: ReturnType<typeof database>) {
    return buildOperationsItems({ jobs: [], quotes: structuredClone(db.tables.crm_quotes), customerFiles: [], customerProducts: [], bookkeepingRows: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData)[0];
  }
  const records = (db: ReturnType<typeof database>, type: string) => [{ id: `whole-job-quote-${quoteId}`, updatedAt: db.tables.crm_quotes[0].updated_at, productType: type }];
  const shipment = { shippedOn: "2026-09-10", mailbox: "805@805shutters.com", messageId: "evidence12345", orderReference: "SHADE-ORDER" };
  it("shows both signed types and keeps whole-job checks out of each product", () => {
    expect(overview(setup()).products).toMatchObject([
      { name: "Shutters", quantity: 8, ordered: false, shipped: false },
      { name: "Roller Shades", quantity: 1, ordered: false, shipped: false }
    ]);
  });
  it("saves separate invoices and reloads each check without doubling existing COGS", async () => {
    const db = setup();
    const save = (type: string, amount: number, requestId: string) => saveProductOrderCost(db.client, { step: "ordered", quoteId, jobId, records: records(db,type),
      invoice: { amount, reference: type, includedInCogs: true, requestId, expectedUpdatedAt: db.tables.crm_quotes[0].updated_at } }, actor);
    await save("shutters", 2000, p1);
    expect(overview(db).products.map(p => p.ordered)).toEqual([true,false]);
    await save("roller shades", 261.70, p2);
    await save("roller shades", 261.70, p2);
    expect(overview(db).products.map(p => p.ordered)).toEqual([true,true]);
    expect(db.tables.crm_quotes[0].materials_cost).toBe(2261.70);
    expect(Object.values(productOrderCosts(db.tables.crm_quotes[0].meta)).map(cost => cost.amount)).toEqual([2000,261.70]);
    expect(db.tables.crm_quotes[0].meta.product_order_cost_history).toHaveLength(2);
    expect(db.tables.crm_quotes[0].meta.keep).toBe(true);
  });
  it("persists a shipment date only for the selected signed type and rejects conflicting evidence", async () => {
    const db=setup();
    const body={step:"shipped",quoteId,jobId,records:records(db,"roller shades"),shipment};
    await completeProductMilestone(db.client,body,actor);
    await completeProductMilestone(db.client,body,actor);
    expect(db.writes).toHaveLength(1);
    expect(overview(db).products).toMatchObject([{shipped:false,shipments:[]},{shipped:true,shipments:[shipment]}]);
    await expect(completeProductMilestone(db.client,{...body,shipment:{...shipment,shippedOn:"2026-09-11"}},actor)).rejects.toThrow("different shipment");
  });
  it.each(["unknown product","unsold","deleted quote","stale","wrong job","load failed"])("rejects %s before changing money or status",async reason=>{
    const db=setup(); const target=records(db,"shutters");
    if(reason==="unknown product")target[0].productType="Blinds".toLowerCase();
    if(reason==="unsold")Object.assign(db.tables.crm_quotes[0],{status:"sent",sold_at:null});
    if(reason==="deleted quote")db.tables.crm_quotes[0].meta.deleted_at=timestamp;
    if(reason==="stale")target[0].updatedAt="2026-01-01T00:00:00Z";
    if(reason==="load failed")db.controls.failRead=true;
    await expect(saveProductOrderCost(db.client,{step:"ordered",quoteId,jobId:reason==="wrong job"?p1:jobId,records:target,
      invoice:{amount:2000,reference:"test",includedInCogs:true,requestId:p1,expectedUpdatedAt:timestamp}},actor)).rejects.toBeInstanceOf(CrmAuthError);
    expect(db.writes).toHaveLength(0);
  });
  it("validates against the signed snapshot before changed quote lines",async()=>{
    const db=setup();
    db.tables.crm_customer_contracts=[{id:p1,quote_id:quoteId,signed_at:timestamp,meta:{contract_snapshot:{schema:"805_signed_quote_contract_v1",signedAt:timestamp,lines:[{lineItemId:"s",productName:"Shutters",quantity:8}]}}}];
    await expect(completeProductMilestone(db.client,{step:"shipped",quoteId,jobId,records:records(db,"roller shades"),shipment},actor)).rejects.toThrow("not in the signed sale");
    expect(db.writes).toHaveLength(0);
  });
});
