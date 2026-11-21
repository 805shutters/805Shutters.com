import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const jobId = "11111111-1111-4111-8111-111111111111";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    mts_job_number: "MTS-88",
    scheduled_install_date: "2026-12-02",
    install_status: "scheduled",
    open_issues: "Latch is loose",
    charge_amount: 450,
    charge_basis: "estimated",
    record_references: { contract_number: "805-1044", mts_invoice_number: "INV-19" },
    match_basis: "contract_number",
    match_status: "verified",
    ...overrides,
  };
}

async function save(body: Record<string, unknown>, actor = "805 Financial") {
  return db.query<{ link: Record<string, unknown> }>(
    "select crm_upsert_job_mts_install_link($1::uuid, $2::jsonb, $3, null) as link",
    [jobId, JSON.stringify(body), actor]
  );
}

beforeAll(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create table public.crm_jobs (
      id uuid primary key,
      customer_name text not null default 'Synthetic',
      phone text not null default '8055550100'
    );
    create table public.crm_activity_events (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      actor_auth_user_id uuid,
      actor_email text,
      entity_type text not null,
      entity_id uuid,
      action text not null,
      before_data jsonb,
      after_data jsonb,
      metadata jsonb not null default '{}'::jsonb
    );
  `);
  await db.exec(readFileSync("supabase/migrations/20261115040000_crm_job_mts_install_links.sql", "utf8"));
  await db.query("insert into public.crm_jobs (id) values ($1)", [jobId]);
}, 30000);

afterAll(async () => {
  await db.close();
});

describe.sequential("crm_job_mts_install_links", () => {
it("upserts one MTS install summary per job and records each edit", async () => {
  const first = await save(payload());
  expect(first.rows[0].link).toMatchObject({
    mts_job_number: "MTS-88",
    install_status: "scheduled",
    charge_basis: "estimated",
    verified_by: "805 Financial",
    open_issues: ["Latch is loose"],
  });
  expect(first.rows[0].link.verified_completion_date).toBeNull();
  expect(typeof first.rows[0].link.last_verified_at).toBe("string");

  await save(payload({
    install_status: "complete",
    verified_completion_date: "2026-12-09",
    charge_amount: 500,
    charge_basis: "invoiced",
    open_issues: ["Need a return trip"],
    match_status: "ambiguous",
  }));

  const rows = await db.query<{
    n: number;
    install_status: string;
    charge_amount: string;
    charge_basis: string;
    verified_completion_date: string;
    match_status: string;
    verified_by: string;
  }>(`
    select count(*)::int as n, max(install_status) as install_status,
      max(charge_amount)::text as charge_amount, max(charge_basis) as charge_basis,
      max(verified_completion_date)::text as verified_completion_date,
      max(match_status) as match_status, max(verified_by) as verified_by
    from public.crm_job_mts_install_links
  `);
  expect(rows.rows[0]).toMatchObject({
    n: 1,
    install_status: "complete",
    charge_amount: "500.00",
    charge_basis: "invoiced",
    verified_completion_date: "2026-12-09",
    match_status: "ambiguous",
    verified_by: "805 Financial",
  });

  const activity = await db.query<{ n: number }>(
    "select count(*)::int as n from public.crm_activity_events where entity_type = 'job' and entity_id = $1 and action = 'mts_install_link.upsert'",
    [jobId]
  );
  expect(activity.rows[0].n).toBe(2);
}, 30000);

it("rejects customer, payroll, and invalid charge fields without adding a row", async () => {
  const before = await db.query<{ n: number; install_status: string | null }>(
    "select count(*)::int as n, max(install_status) as install_status from public.crm_job_mts_install_links"
  );
  await expect(save(payload({ customer_phone: "8055550100" }))).rejects.toThrow(/customer_phone/);
  await expect(save(payload({ installer_pay: 80 }))).rejects.toThrow(/installer_pay/);
  await expect(save(payload({ charge_basis: "payroll" }))).rejects.toThrow(/estimated or invoiced/);
  await expect(save(payload({ charge_amount: 450, charge_basis: null }))).rejects.toThrow(/estimated or invoiced/);
  await expect(save({
    ...payload(),
    record_references: { contract_number: "805-1044", customer_phone: "8055550100" },
  })).rejects.toThrow(/customer_phone/);
  await expect(db.query(
    "insert into public.crm_job_mts_install_links (job_id, installer_pay) values ($1, 80)",
    [jobId]
  )).rejects.toThrow(/installer_pay/);

  const after = await db.query<{ n: number; install_status: string | null }>(
    "select count(*)::int as n, max(install_status) as install_status from public.crm_job_mts_install_links"
  );
  expect(after.rows[0]).toEqual(before.rows[0]);
  expect(after.rows[0].n).toBe(1);
  const columns = await db.query<{ column_name: string }>(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_job_mts_install_links'
  `);
  const names = columns.rows.map((row) => row.column_name);
  expect(names).not.toEqual(expect.arrayContaining([
    "customer_phone", "customer_name", "customer_email", "installer_pay", "contractor_pay", "payroll", "labor_cost",
  ]));
}, 30000);
});
