import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, expect, it } from "vitest";

const db = new PGlite();
afterAll(() => db.close());

it("repairs the deployed schema without losing quotes, line items or signed contracts", async () => {
  await db.exec(`
    create table sales_quotes(id text primary key, account_id uuid, created_at timestamptz default now(), total_amount numeric, customer_signature text);
    create table sales_quote_line_items(id text primary key, quote_id text references sales_quotes, configuration jsonb);
    create table contracts(id text primary key, quote_id text references sales_quotes, signature text);
    insert into sales_quotes(id,total_amount,customer_signature) values ('draft',246.17,null),('signed',900,'original signature');
    insert into sales_quote_line_items values ('line','draft','{"width":36,"height":48,"color":"P001"}');
    insert into contracts values ('contract','signed','original signature');
  `);
  await expect(db.exec("update sales_quotes set deleted_at=now() where id='draft'"))
    .rejects.toThrow(/deleted_at/);
  const quotesBefore = (await db.query("select * from sales_quotes order by id")).rows;
  const linesBefore = (await db.query("select * from sales_quote_line_items")).rows;
  const contractsBefore = (await db.query("select * from contracts")).rows;
  const migration = readFileSync("supabase/migrations/20261124002718_restore_quote_soft_delete_columns.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration); // Safe when an environment already has the old migration.
  expect((await db.query("select id,account_id,created_at,total_amount,customer_signature from sales_quotes order by id")).rows).toEqual(quotesBefore);
  await db.query("update sales_quotes set deleted_at=now(),deleted_by=$1,deleted_by_user_id=$2 where id='draft'", ["internal@example.test","10000000-0000-4000-8000-000000000001"]);
  expect((await db.query("select id from sales_quotes where deleted_at is null")).rows).toEqual([{id:"signed"}]);
  expect((await db.query("select * from sales_quote_line_items")).rows).toEqual(linesBefore);
  expect((await db.query("select * from contracts")).rows).toEqual(contractsBefore);
  await db.exec("update sales_quotes set deleted_at=null,deleted_by=null,deleted_by_user_id=null where id='draft'");
  expect((await db.query("select count(*)::int as count from sales_quotes where deleted_at is null")).rows).toEqual([{count:2}]);
}, 30000);
