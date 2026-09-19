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
  const fallback = { step: "shipped", jobId, records: [{ id: `job-product-${jobId}`, updatedAt: timestamp }] };
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
    await completeProductMilestone(db.client, { ...fallback, records: [{ id: fallback.records[0].id, updatedAt: db.tables.crm_jobs[0].updated_at }] }, actor);
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
    Object.assign(db.tables.crm_quotes[0], { status: "sold", quote_total: 6958.8, created_at: timestamp, updated_at: timestamp, materials_cost: 300 });
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
  it("saves the full invoice once, verifies the green check, and leaves unrelated costs intact", async () => {
    const {db, apply} = setup();
    expect(await apply()).toMatchObject({ addedCogs: 2823.29 });
    expect(db.tables.crm_quotes[0].materials_cost).toBe(3123.29);
    expect(db.tables.crm_customer_products.every(p => p.meta.ordered_at)).toBe(true);
    const writes = db.writes.length;
    expect(await apply()).toMatchObject({ addedCogs: 0 });
    expect(db.writes).toHaveLength(writes);
    expect(db.tables.crm_jobs[0].status).toBe("sold");
  });
  it("recovers after cost saved but one product check failed, without charging twice", async () => {
    const {db, apply} = setup(); db.controls.failId = p2;
    await expect(apply()).rejects.toThrow("Not all products");
    expect(db.tables.crm_quotes[0].materials_cost).toBe(3123.29);
    db.controls.failId = "";
    expect(await apply()).toMatchObject({ addedCogs: 0 });
    expect(db.tables.crm_quotes[0].materials_cost).toBe(3123.29);
    expect(db.tables.crm_customer_products.every(p => p.meta.ordered_at)).toBe(true);
  });
  it("updates the generated job-product used by Benson's live card", async () => {
    const {db, apply, load} = setup(); db.tables.crm_customer_products = [];
    await apply();
    expect(db.tables.crm_quotes[0].materials_cost).toBe(3123.29);
    expect(buildOperationsItems(await load())[0].products[0].ordered).toBe(true);
    expect(await apply()).toMatchObject({ addedCogs: 0 });
    expect(db.tables.crm_quotes[0].materials_cost).toBe(3123.29);
  });
  it("recognizes another email for the same vendor order", async () => {
    const {db, apply} = setup(); await apply();
    const original = db.tables.crm_order_cogs_emails[0];
    db.tables.crm_order_cogs_emails.unshift({ ...original, id: "91111111-1111-4111-8111-111111111111", gmail_message_id: "resent" });
    expect(await apply()).toMatchObject({ addedCogs: 0 });
    expect(db.tables.crm_quotes[0].materials_cost).toBe(3123.29);
  });
  it("repairs the product check for a previously applied aggregate invoice without adding cost", async () => {
    const {db, apply} = setup();
    db.tables.crm_quotes[0].materials_cost = 3123.29;
    db.tables.crm_order_cogs_emails[0].applied_at = timestamp;
    expect(await apply()).toMatchObject({ addedCogs: 0 });
    expect(db.tables.crm_quotes[0].materials_cost).toBe(3123.29);
  });
  it("selects only shutters in a mixed product sale", async () => {
    const {db, apply} = setup(); db.tables.crm_customer_products[1].product_type = "Roller Shades";
    await apply();
    expect(db.tables.crm_customer_products[0].meta.ordered_at).toBeTruthy();
    expect(db.tables.crm_customer_products[1].meta.ordered_at).toBeUndefined();
  });
  it.each(["different sale", "combined products", "existing manual cost", "different amount"])("leaves %s for review", async reason => {
    const {db, apply} = setup();
    if (reason === "different sale") db.tables.crm_order_cogs_emails[0].matched_job_id = entryId;
    if (reason === "combined products") db.tables.crm_customer_products.forEach(p => p.product_type = "Shutters and Roller Shades");
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
