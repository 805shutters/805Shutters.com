import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("./sold-installer-delivery", () => ({ ensureSoldQuoteInstallerDelivery: vi.fn(async () => null) }));
import { deleteCrmCustomerFile } from "./backend";
import { customerFileDeletePayload } from "./customer-file-deletion";
import type { CrmCustomerFile } from "./types";

const db = new PGlite();
const job = "229371b6-23c7-4d8a-8d82-74c5740db2f8";
const quote = "d3ebcb7d-ac13-45f0-a579-5c4f198a3edd";
const savedProduct = "10000000-0000-4000-8000-000000000001";
const savedContract = "10000000-0000-4000-8000-000000000002";
const actor = { email: "test@example.com" };
const tables = ["crm_customers", "crm_jobs", "crm_quotes", "crm_quote_bookkeeping_entries", "crm_customer_products", "crm_customer_contracts", "sales_quotes"];
// Execute the actual handler against PostgreSQL UUID columns, including its reads,
// tombstones and audit insert. The old string-only mock missed synthetic row IDs.
const supabase = { from(table: string) {
  let columns = "*", where = "true", values: unknown[] = [], patch: Record<string, unknown> | undefined;
  const query = {
    select(value = "*") { columns = value; return query; },
    in(column: string, ids: string[]) { where = `${column} = ANY($1::uuid[])`; values = [ids]; return query; },
    eq(column: string, id: string) { where = `${column} = $1::uuid`; values = [id]; return query; },
    update(value: Record<string, unknown>) { patch = value; return query; },
    async insert(value: unknown) { await db.query("insert into crm_activity_events(payload) values($1)", [JSON.stringify(value)]); return { error: null }; },
    async then(resolve: (result: unknown) => unknown) {
      try {
        const result = patch
          ? await db.query(`update ${table} set meta = $2::jsonb where ${where}`, [...values, JSON.stringify(patch.meta)])
          : await db.query(`select ${columns} from ${table} where ${where}`, values);
        return resolve({ data: result.rows, error: null });
      } catch (error) { return resolve({ data: null, error }); }
    }
  };
  return query;
} } as unknown as Parameters<typeof deleteCrmCustomerFile>[0];
beforeAll(async () => {
  for (const table of tables) await db.exec(`create table ${table}(id uuid primary key, job_id uuid, quote_id uuid, customer_id uuid, bookkeeping_entry_id uuid, status text, meta jsonb default '{}');`);
  await db.exec("create table crm_activity_events(payload jsonb)");
  await db.query("insert into crm_jobs(id,status) values($1,'quoted')", [job]);
  await db.query("insert into crm_quotes(id,job_id,status) values($1,$2,'sent')", [quote, job]);
  await db.query("insert into crm_customer_products(id,job_id,status) values($1,$2,'quoted')", [savedProduct,job]);
  await db.query("insert into crm_customer_contracts(id,quote_id,status) values($1,$2,'draft')", [savedContract,quote]);
}, 30000);
afterAll(() => db.close());

it("omits display rows from new requests while preserving their saved parent IDs", () => {
  const payload = customerFileDeletePayload({ customerName: "Sample", customer: null, jobs: [{id:job}], quotes: [{id:quote}], bookkeepingRows: [], products: [{id:`job-product-${job}`},{id:savedProduct}], contracts: [{id:`row-contract-${quote}`},{id:savedContract}] } as unknown as CrmCustomerFile);
  expect(payload).toMatchObject({jobIds:[job],quoteIds:[quote],productIds:[savedProduct],contractIds:[savedContract]});
});
it("reproduces the PostgreSQL error and deletes an unsold file from an older client without losing audit history", async () => {
  await expect(db.query("select * from crm_customer_products where id=$1", [`job-product-${job}`])).rejects.toMatchObject({code:"22P02"});
  const payload = { jobIds:[job], quoteIds:[quote], productIds:[`job-product-${job}`], contractIds:[`row-contract-${quote}`] };
  const result = await deleteCrmCustomerFile(supabase,"sample-file",payload,actor);
  expect(result).toMatchObject({deleted:true,count:4});
  for (const table of ["crm_jobs","crm_quotes","crm_customer_products","crm_customer_contracts"]) {
    const reread = await db.query<{meta:Record<string,unknown>}>(`select meta from ${table}`);
    expect(reread.rows[0].meta).toMatchObject({deleted_by:actor.email,delete_source:"customer_file_delete"});
    expect(reread.rows[0].meta.deleted_at).toBeTruthy();
  }
  expect((await db.query("select * from crm_activity_events")).rows).toHaveLength(1);
});
it("still rejects a newly sold job sent with a display-only product", async () => {
  await db.query("update crm_quotes set status='sold',meta='{}' where id=$1", [quote]);
  await expect(deleteCrmCustomerFile(supabase,"sample-file",{ jobIds:[job], quoteIds:[quote], productIds:[`job-product-${job}`] },actor)).rejects.toMatchObject({status:409});
  expect((await db.query<{meta:unknown}>("select meta from crm_quotes where id=$1",[quote])).rows[0].meta).toEqual({});
  expect((await db.query("select * from crm_activity_events")).rows).toHaveLength(1);
});
it("rejects display rows whose parent was omitted instead of guessing a deletion scope", async () => {
  await expect(deleteCrmCustomerFile(supabase,"sample-file",{quoteIds:[quote],productIds:[`job-product-${job}`]},actor)).rejects.toMatchObject({status:400});
});
