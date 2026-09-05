import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const id = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const form = id(1),
  quote = id(2),
  job = id(3),
  customer = id(4),
  actor = id(5),
  contract = id(6);
const lines = [
  { id: id(11), current_values: { product_id: "faux_wood" }, baseline: {} },
  {
    id: id(12),
    current_values: { product_id: "norman_shutters" },
    baseline: {},
  },
];
const groups = [
  {
    key: "norman:faux_wood",
    label: "Faux Wood Blinds",
    manufacturer: "Norman",
    lineIds: [id(11)],
  },
  {
    key: "norman:woodlore",
    label: "Shutters",
    manufacturer: "Norman",
    lineIds: [id(12)],
  },
];
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
 create table crm_quotes(id uuid primary key,job_id uuid,status text,ordered_at timestamptz,updated_at timestamptz default now(),meta jsonb default '{}');
 create table crm_technical_measure_forms(id uuid primary key,quote_id uuid,job_id uuid,customer_id uuid,contract_id uuid,status text,meta jsonb default '{}');
 create table crm_technical_measure_lines(id uuid primary key,form_id uuid,quote_line_item_id uuid,current_values jsonb,baseline jsonb);
 create table crm_customer_contracts(id uuid primary key,quote_id uuid,job_id uuid,customer_id uuid,meta jsonb default '{}');
 create table sales_quotes(id uuid primary key,status text,ordered_at timestamptz,account_id uuid default '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb');
 create table sales_quote_line_items(id uuid primary key,quote_id uuid);
 create table crm_activity_events(id uuid default gen_random_uuid(),actor_auth_user_id uuid,actor_email text,entity_type text,entity_id uuid,action text,after_data jsonb,metadata jsonb,created_at timestamptz default now());`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20260905145514_technical_measure_product_ordering.sql",
      "utf8",
    ),
  );
}, 30000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec(
    "truncate crm_quotes,crm_technical_measure_forms,crm_technical_measure_lines,crm_customer_contracts,sales_quotes,sales_quote_line_items,crm_activity_events;",
  );
  await db.query(
    "insert into crm_quotes(id,job_id,status) values($1,$2,'sold')",
    [quote, job],
  );
  await db.query(
    "insert into crm_technical_measure_forms(id,quote_id,job_id,customer_id,contract_id,status) values($1,$2,$3,$4,$5,'draft')",
    [form, quote, job, customer, contract],
  );
  await db.query(
    "insert into crm_customer_contracts(id,quote_id,job_id,customer_id) values($1,$2,$3,$4)",
    [contract, quote, job, customer],
  );
  for (const l of lines)
    await db.query(
      "insert into crm_technical_measure_lines values($1,$2,$1,$3,$4)",
      [l.id, form, l.current_values, l.baseline],
    );
});
const save = (
  key = groups[0].key,
  snapshot: unknown = lines,
  groupInput: unknown = groups,
) =>
  db.query<{ saved: any }>(
    "select crm_mark_measure_product_ordered($1,$2,$3,$4,$5,$6) as saved",
    [form, key, groupInput, snapshot, "staff@example.com", actor],
  );
async function record(table: string) {
  return (await db.query<any>(`select * from ${table} limit 1`)).rows[0];
}
it("keeps a partial draft open, records contract progress, and archives on the last product", async () => {
  await save();
  expect((await record("crm_quotes")).status).toBe("sold");
  expect((await record("crm_quotes")).meta.measure_order_progress.label).toBe(
    "Partially ordered · 1 of 2",
  );
  expect(
    (await record("crm_customer_contracts")).meta.measure_order_progress
      .orderedCount,
  ).toBe(1);
  expect(
    (await record("crm_technical_measure_forms")).meta.archived_at,
  ).toBeUndefined();
  await save(groups[1].key);
  expect((await record("crm_quotes")).status).toBe("ordered");
  expect((await record("crm_technical_measure_forms")).status).toBe("draft");
  expect(
    (await record("crm_technical_measure_forms")).meta.archive_reason,
  ).toBe("all_products_ordered");
  const count = (
    await db.query<any>("select count(*) from crm_activity_events")
  ).rows[0].count;
  await save(groups[1].key);
  expect(
    (await db.query<any>("select count(*) from crm_activity_events")).rows[0]
      .count,
  ).toBe(count);
});
it("archives a single-product measure", async () => {
  await db.query("delete from crm_technical_measure_lines where id=$1", [
    id(12),
  ]);
  await save(groups[0].key, [lines[0]], [groups[0]]);
  expect(
    (await record("crm_technical_measure_forms")).meta.archived_at,
  ).toBeTruthy();
});
it("rolls back every write when activity persistence fails", async () => {
  await db.exec(
    "alter table crm_activity_events add constraint fail_test check (action <> 'technical_measure.product_ordered')",
  );
  await expect(save()).rejects.toThrow();
  expect((await record("crm_quotes")).meta).toEqual({});
  expect((await record("crm_customer_contracts")).meta).toEqual({});
  await db.exec("alter table crm_activity_events drop constraint fail_test");
});
it("rejects foreign products, stale openings, incomplete coverage and mismatched customers", async () => {
  await expect(save("foreign")).rejects.toThrow("ORDER_PRODUCT_MISMATCH");
  await expect(
    save(groups[0].key, [{ ...lines[0], current_values: {} }, lines[1]]),
  ).rejects.toThrow("MEASURE_CHANGED");
  await expect(save(groups[0].key, lines, [groups[0]])).rejects.toThrow(
    "ORDER_PRODUCT_MISMATCH",
  );
  await db.query("update crm_customer_contracts set customer_id=$1", [id(100)]);
  await expect(save()).rejects.toThrow("ORDER_CONTRACT_MISMATCH");
});
it("preserves later lifecycle status and order date", async () => {
  await db.exec(
    "update crm_quotes set status='installed',ordered_at='2026-08-01'",
  );
  await save();
  expect((await record("crm_quotes")).status).toBe("installed");
  expect(
    new Date((await record("crm_quotes")).ordered_at).toISOString(),
  ).toContain("2026-08-01");
});
it("serializes independently requested product updates without losing progress", async () => {
  await Promise.all([save(), save(groups[1].key)]);
  expect(
    (await record("crm_quotes")).meta.measure_order_progress.orderedCount,
  ).toBe(2);
  expect(
    (await record("crm_technical_measure_forms")).meta.archived_at,
  ).toBeTruthy();
});
it("synchronizes only explicitly linked sales lines, retaining confirmation history", async () => {
  await db.query("update crm_quotes set meta=$1", [{ mts_quote_id: id(20) }]);
  await db.query(
    "insert into sales_quotes(id,status,ordered_at) values($1,'sold',null)",
    [id(20)],
  );
  for (const l of lines)
    await db.query("insert into sales_quote_line_items values($1,$2)", [
      l.id,
      id(20),
    ]);
  await db.query(
    "insert into crm_activity_events(entity_type,entity_id,action,after_data) values('quote',$1,'sales_quote_line.confirmed',$2)",
    [id(12), { orderedAt: "2026-08-01", manufacturerOrderRef: "EXISTING" }],
  );
  await save();
  expect((await record("sales_quotes")).status).toBe("ordered");
  expect(
    (
      await db.query<any>(
        "select after_data from crm_activity_events where action='sales_quote_line.confirmed'",
      )
    ).rows[0].after_data.manufacturerOrderRef,
  ).toBe("EXISTING");
  expect(
    (
      await db.query<any>(
        "select count(*) from crm_activity_events where action='sales_quote_line.ordered'",
      )
    ).rows[0].count,
  ).toBe(1);
});
it("denies public invocation", async () => {
  const permission = await db.query<any>(
    "select has_function_privilege('authenticated','crm_mark_measure_product_ordered(uuid,text,jsonb,jsonb,text,uuid)','execute') as allowed",
  );
  expect(permission.rows[0].allowed).toBe(false);
});
