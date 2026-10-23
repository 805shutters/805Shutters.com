import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table crm_jobs(id text primary key,customer_name text,status text);
    create table crm_quotes(id text primary key,job_id text,customer_printed_name text,status text);
    create table crm_customers(id text primary key,display_name text,latest_status text);
    create table crm_customer_contracts(id text primary key,customer_id text,status text);
    grant select,insert,update on crm_jobs,crm_quotes,crm_customers,crm_customer_contracts to authenticated;
  `);
  await db.exec(readFileSync("supabase/migrations/20261023230144_google_contacts_sync.sql", "utf8"));
}, 30000);
afterAll(() => db.close());

it("queues a sale atomically without exposing credentials or the queue to CRM browser roles", async () => {
  await db.exec("set role authenticated; insert into crm_jobs values ('j1','Test Customer','lead'); update crm_jobs set status='sold' where id='j1'; reset role;");
  expect((await db.query("select customer_key,status from crm_google_contacts_sync")).rows).toEqual([{ customer_key: "test customer", status: "pending" }]);
  expect((await db.query("select has_table_privilege('authenticated','crm_google_contacts_connection','select') as tokens,has_table_privilege('authenticated','crm_google_contacts_sync','insert') as queue")).rows).toEqual([{ tokens: false, queue: false }]);
  await db.exec("set role authenticated");
  await expect(db.query("select * from crm_google_contacts_connection")).rejects.toThrow(/permission denied/);
  await db.exec("reset role");
});

it("captures quote and contract sales and keeps a later edit pending", async () => {
  await db.exec("set role authenticated; insert into crm_quotes values ('q1','j1',null,'sold'); insert into crm_customers values ('c1','Contract Customer','lead'); insert into crm_customer_contracts values ('ct1','c1','sold'); reset role;");
  expect((await db.query("select customer_key from crm_google_contacts_sync order by customer_key")).rows).toEqual([{ customer_key: "contract customer" }, { customer_key: "test customer" }]);
  await db.exec("update crm_google_contacts_sync set status='synced',source_refs=array['customer:c1'] where customer_key='contract customer'; set role authenticated; update crm_customers set latest_status='installed' where id='c1'; reset role;");
  expect((await db.query("select status from crm_google_contacts_sync where customer_key='contract customer'")).rows).toEqual([{ status: "pending" }]);
});

it("grants only the service worker access to a single expiring writer lease", async () => {
  await db.exec("insert into crm_google_contacts_connection(account_email,google_subject,encrypted_refresh_token,connected_by) values ('805@805shutters.com','test-subject','encrypted-test-only','00000000-0000-0000-0000-000000000001'); set role service_role;");
  expect((await db.query("select crm_google_contacts_lock('00000000-0000-0000-0000-000000000002') as locked")).rows).toEqual([{ locked: true }]);
  expect((await db.query("select crm_google_contacts_lock('00000000-0000-0000-0000-000000000003') as locked")).rows).toEqual([{ locked: false }]);
  await db.exec("reset role");
  expect((await db.query("select has_function_privilege('authenticated','crm_google_contacts_lock(uuid)','execute') as allowed")).rows).toEqual([{ allowed: false }]);
});
