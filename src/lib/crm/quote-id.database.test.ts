import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, expect, it } from "vitest";

const db = new PGlite({ extensions: { pgcrypto } });
afterAll(() => db.close());

it("allocates unique IDs with pgcrypto outside public while preserving authorization and history", async () => {
  await db.exec(`
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create function auth.role() returns text language sql as $$
      select current_setting('request.jwt.claim.role', true)
    $$;
    create function public.is_805_crm_user() returns boolean language sql as $$ select false $$;
    create table public.sales_quotes(quote_number text);
    create table public.crm_quotes(quote_number text);
    create table public.crm_issued_quote_ids(quote_number text primary key, source text);
    insert into public.sales_quotes values ('805-0598');
    insert into public.crm_quotes values ('805-0001');
    select set_config('request.jwt.claim.role', 'service_role', false);
  `);
  const original = readFileSync("supabase/migrations/20261114200000_new_quote_ids_and_side_marks.sql", "utf8");
  await db.exec(original.slice(
    original.indexOf("create or replace function public.allocate_805_quote_id("),
    original.indexOf("create or replace function public.claim_805_quote_id("),
  ));
  await expect(db.query("select public.allocate_805_quote_id('regression')"))
    .rejects.toThrow(/gen_random_bytes\(integer\) does not exist/);

  await db.exec(readFileSync("supabase/migrations/20261124001422_qualify_quote_id_random_bytes.sql", "utf8"));
  const { rows } = await db.query<{ id: string }>(
    "select public.allocate_805_quote_id('regression') as id from generate_series(1,100)",
  );
  expect(new Set(rows.map(row => row.id)).size).toBe(100);
  for (const row of rows) expect(row.id).toMatch(/^805-[ABCDEFGHJKMNPQRSTUVWXYZ123456789]{3}$/);
  expect((await db.query("select * from public.sales_quotes")).rows).toEqual([{ quote_number: "805-0598" }]);
  expect((await db.query("select * from public.crm_quotes")).rows).toEqual([{ quote_number: "805-0001" }]);
  await expect(db.query("select public.allocate_805_quote_id(repeat('x',81))"))
    .rejects.toThrow(/source is too long/);
  await db.exec("select set_config('request.jwt.claim.role', 'anon', false)");
  await expect(db.query("select public.allocate_805_quote_id('unauthorized')"))
    .rejects.toThrow(/authentication is required/);
}, 30000);
