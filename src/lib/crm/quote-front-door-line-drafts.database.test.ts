import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const migration = readFileSync("supabase/migrations/20261122013000_quote_front_door_line_drafts.sql", "utf8");

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.crm_customers (id uuid primary key);
    create table public.crm_jobs (id uuid primary key);
    create function public.set_updated_at() returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end $$;
    create function public.is_805_crm_user() returns boolean language sql stable as $$ select true $$;
  `);
  await db.exec(migration);
});

afterAll(() => db.close());

describe("quote line draft table", () => {
  it("stores a draft and rejects a sent status", async () => {
    const inserted = await db.query<{ id: string; status: string }>(`
      insert into public.crm_quote_front_door_line_drafts
        (customer_name, manufacturer, category, spec, read_back, status)
      values ('Jane Smith', 'Norman', 'roller', '{"lines":[]}'::jsonb, 'Norman roller\nDraft only.', 'draft')
      returning id::text, status
    `);
    expect(inserted.rows[0]).toMatchObject({ status: "draft" });
    await expect(db.query(`
      insert into public.crm_quote_front_door_line_drafts
        (customer_name, manufacturer, category, spec, read_back, status)
      values ('Jane Smith', 'Norman', 'roller', '{}'::jsonb, 'Norman roller', 'sent')
    `)).rejects.toThrow(/draft/i);
    await expect(db.query(
      "update public.crm_quote_front_door_line_drafts set status = 'sent' where id = $1",
      [inserted.rows[0].id],
    )).rejects.toThrow(/draft/i);
  });

  it("lets the service role insert a draft and does not let it update or delete", async () => {
    await db.exec("set role service_role");
    const inserted = await db.query<{ id: string }>(`
      insert into public.crm_quote_front_door_line_drafts
        (customer_name, manufacturer, category, spec, read_back)
      values ('New Person', 'Norman', 'roller', '{}'::jsonb, 'Draft only.')
      returning id::text
    `);
    expect(inserted.rows[0]?.id).toBeTruthy();
    await expect(db.query("update public.crm_quote_front_door_line_drafts set customer_name = 'Changed'")).rejects.toThrow(/permission denied/i);
    await expect(db.query("delete from public.crm_quote_front_door_line_drafts")).rejects.toThrow(/permission denied/i);
    await db.exec("reset role");
    await db.exec("set role anon");
    await expect(db.query("select id from public.crm_quote_front_door_line_drafts")).rejects.toThrow(/permission denied/i);
    await db.exec("reset role");
  });
});
