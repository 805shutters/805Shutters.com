import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const job = "10000000-0000-4000-8000-000000000001",
  quote = "10000000-0000-4000-8000-000000000002",
  form = "10000000-0000-4000-8000-000000000003",
  task = "10000000-0000-4000-8000-000000000004",
  request = "10000000-0000-4000-8000-000000000005";
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create table crm_jobs(id uuid primary key);create table crm_quotes(id uuid primary key,job_id uuid references crm_jobs);create table crm_quote_bookkeeping_entries(id uuid primary key,job_id uuid references crm_jobs,quote_id uuid references crm_quotes);`,
  );
  const tasks = readFileSync(
    "supabase/migrations/20260603010000_expand_805_crm_bookkeeping.sql",
    "utf8",
  );
  const start = tasks.indexOf(
    "create table if not exists public.crm_accountability_tasks",
  );
  await db.exec(tasks.slice(start, tasks.indexOf("\n);", start) + 3));
  await db.exec(
    `create table crm_installer_forms(id uuid primary key,job_id uuid references crm_jobs,quote_id uuid not null references crm_quotes,status text,issues jsonb default '[]',signer_name text,signed_at timestamptz,meta jsonb default '{}');`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20260905011000_crm_owned_actions_and_report_history.sql",
      "utf8",
    ),
  );
  await db.query("insert into crm_jobs values($1)", [job]);
  await db.query("insert into crm_quotes values($1,$2)", [quote, job]);
  await db.query(
    "insert into crm_installer_forms(id,job_id,quote_id,status) values($1,$2,$3,'sent')",
    [form, job, quote],
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
const payload = {
  job_id: job,
  quote_id: quote,
  title: "Arrange visit",
  owner: "Mike",
  status: "open",
  due_on: "2026-09-07",
  change_reason: "Create action",
};
const save = (rev: number, req: string, p: Record<string, unknown> = payload) =>
  db.query<{ action: Record<string, unknown> }>(
    "select crm_save_owned_action($1,$2,$3,$4,$5) as action",
    [task, rev, req, p, "Mike"],
  );
describe("owned-action and report transactions", () => {
  it("atomically records a task and audit event; repeats return the original result", async () => {
    const first = await save(0, request);
    const retry = await save(0, request);
    expect(retry.rows).toEqual(first.rows);
    expect(first.rows[0].action.revision).toBe(1);
    expect(
      (
        await db.query(
          "select id from crm_business_events where request_id=$1",
          [request],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      save(0, request, { ...payload, title: "Different" }),
    ).rejects.toThrow("different change");
  });
  it("rejects stale edits while attributing changed dates", async () => {
    await save(1, "20000000-0000-4000-8000-000000000001", {
      ...payload,
      due_on: "2026-09-09",
      change_reason: "Vendor delay",
    });
    await expect(
      save(1, "20000000-0000-4000-8000-000000000002"),
    ).rejects.toThrow("ACTION_CONFLICT");
    const events = await db.query<{
      before_data: Record<string, unknown>;
      after_data: Record<string, unknown>;
    }>(
      "select before_data,after_data from crm_business_events where source_id=$1 order by source_revision desc",
      [task],
    );
    expect(events.rows[0].before_data.due_on).toBe("2026-09-07");
    expect(events.rows[0].after_data.due_on).toBe("2026-09-09");
  });
  it("retains more than 20 report revisions and one owned open service action", async () => {
    for (let revision = 1; revision <= 25; revision++) {
      await db.query(
        "update crm_installer_forms set status='partially_installed',signer_name='Fixture Installer',signed_at=now(),issues=$2,meta=$3 where id=$1",
        [
          form,
          [
            {
              lineId: "opening-1",
              notInstalled: true,
              details: "Missing product",
            },
          ],
          { workflow: { revision, outcome: "partially_completed" } },
        ],
      );
    }
    expect(
      (
        await db.query(
          "select id from crm_installer_report_revisions where form_id=$1",
          [form],
        )
      ).rows,
    ).toHaveLength(25);
    const actions = await db.query<{ owner: string; status: string }>(
      "select owner,status from crm_accountability_tasks where meta->>'source_key'=$1",
      ["installer:" + form],
    );
    expect(actions.rows).toEqual([{ owner: "Mike", status: "open" }]);
    await db.query(
      "update crm_installer_forms set issues='[]',status='completed',meta=$2 where id=$1",
      [form, { workflow: { revision: 26, outcome: "completed" } }],
    );
    expect(
      (
        await db.query(
          "select status from crm_accountability_tasks where meta->>'source_key'=$1",
          ["installer:" + form],
        )
      ).rows,
    ).toEqual([{ status: "open" }]);
  });
  it("rejects history overwrites and conflicting report revisions", async () => {
    await expect(
      db.query("delete from crm_installer_report_revisions where form_id=$1", [
        form,
      ]),
    ).rejects.toThrow("append-only");
    await expect(
      db.query("update crm_installer_forms set issues=$2 where id=$1", [
        form,
        [{ notInstalled: true }],
      ]),
    ).rejects.toThrow("REPORT_CONFLICT");
    expect(
      (
        await db.query(
          "select id from crm_installer_report_revisions where form_id=$1",
          [form],
        )
      ).rows,
    ).toHaveLength(26);
  });
  it("does not expose the mutation RPC or history writes to direct browser roles", async () => {
    const result = await db.query<{ execute: boolean; write: boolean }>(
      "select has_function_privilege('authenticated','crm_save_owned_action(uuid,integer,uuid,jsonb,text)','execute') as execute,has_table_privilege('authenticated','crm_business_events','insert') as write",
    );
    expect(result.rows).toEqual([{ execute: false, write: false }]);
  });
});
