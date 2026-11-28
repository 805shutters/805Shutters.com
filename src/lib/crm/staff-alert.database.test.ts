import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create function public.set_updated_at()
    returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;
  `);
  await db.exec(readFileSync("supabase/migrations/20261128223000_crm_staff_alerts.sql", "utf8"));
});

afterAll(() => db.close());

it("claims a due held alert once and keeps a future alert", async () => {
  await db.exec(`
    insert into public.crm_staff_alerts
      (status, customer, job_number, missing, from_bot, event_type, dedupe_key, deliver_at)
    values
      ('held', 'Ada', '805-100', array['color'], 'quote-bot', 'payment', 'due-key', now() - interval '1 minute'),
      ('held', 'Ada', '805-200', array['width'], 'quote-bot', 'payment', 'later-key', now() + interval '1 day');
  `);
  const first = await db.query<{ id: string; claim_token: string | null }>("select id, claim_token from claim_due_crm_staff_alerts(10)");
  expect(first.rows).toHaveLength(1);
  expect(first.rows[0]?.claim_token).toBeTruthy();
  const second = await db.query("select id from claim_due_crm_staff_alerts(10)");
  expect(second.rows).toEqual([]);
  const later = await db.query<{ claim_token: string | null }>("select claim_token from crm_staff_alerts where dedupe_key = 'later-key'");
  expect(later.rows[0]?.claim_token).toBeNull();
});

it("keeps the table service-role only with forced row level security", async () => {
  const access = await db.query<{
    anon_read: boolean;
    anon_claim: boolean;
    service_insert: boolean;
    service_claim: boolean;
    rls: boolean;
    forced: boolean;
  }>(`
    select
      has_table_privilege('anon', 'public.crm_staff_alerts', 'select') as anon_read,
      has_function_privilege('anon', 'public.claim_due_crm_staff_alerts(integer)', 'execute') as anon_claim,
      has_table_privilege('service_role', 'public.crm_staff_alerts', 'insert') as service_insert,
      has_function_privilege('service_role', 'public.claim_due_crm_staff_alerts(integer)', 'execute') as service_claim,
      relrowsecurity as rls,
      relforcerowsecurity as forced
    from pg_class
    where oid = 'public.crm_staff_alerts'::regclass
  `);
  expect(access.rows).toEqual([{
    anon_read: false,
    anon_claim: false,
    service_insert: true,
    service_claim: true,
    rls: true,
    forced: true,
  }]);
});
