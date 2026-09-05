import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { deriveFulfillment, type FulfillmentData } from "./fulfillment";
const db = new PGlite();
const id = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const job = id(1),
  quote = id(2),
  form = id(3),
  line1 = id(4),
  line2 = id(5);
const scope = {
  source_revision: "fixture-v1",
  lines: [
    { id: "opening-1", room: "Living", quantity: 2 },
    { id: "opening-2", room: "Bedroom", quantity: 1 },
  ],
};
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create table crm_jobs(id uuid primary key);create table crm_quotes(id uuid primary key,job_id uuid references crm_jobs);create table crm_quote_bookkeeping_entries(id uuid primary key,job_id uuid references crm_jobs,quote_id uuid references crm_quotes);create table crm_calendar_events(id uuid primary key,job_id uuid,event_type text);create table crm_installer_forms(id uuid primary key,job_id uuid,quote_id uuid,status text,issues jsonb default '[]',signer_name text,signed_at timestamptz,meta jsonb default '{}');`,
  );
  const original = readFileSync(
      "supabase/migrations/20260603010000_expand_805_crm_bookkeeping.sql",
      "utf8",
    ),
    start = original.indexOf(
      "create table if not exists public.crm_accountability_tasks",
    );
  await db.exec(original.slice(start, original.indexOf("\n);", start) + 3));
  await db.exec(
    readFileSync(
      "supabase/migrations/20260905011000_crm_owned_actions_and_report_history.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20260905020000_crm_fulfillment_and_service_visits.sql",
      "utf8",
    ),
  );
  await db.query("insert into crm_jobs values($1)", [job]);
  await db.query("insert into crm_quotes values($1,$2)", [quote, job]);
  await db.query(
    "insert into crm_installer_forms(id,job_id,quote_id,status,meta) values($1,$2,$3,'completed',$4)",
    [form, job, quote, { workflow: { outcome: "completed", revision: 1 } }],
  );
}, 30000);
afterAll(() => db.close());
let request = 100;
const save = (
  kind: string,
  id: string,
  p: Record<string, unknown>,
  rev = 0,
  req?: string,
) =>
  db.query<{ saved: Record<string, unknown> }>(
    "select crm_save_fulfillment($1,$2,$3,$4,$5,$6) as saved",
    [
      kind,
      id,
      rev,
      req || `${id.slice(0, 24)}${String(request++).padStart(12, "0")}`,
      { quote_id: quote, job_id: job, reason: "Synthetic verification", ...p },
      "Mike",
    ],
  );
const linePayload = (opening = "opening-1") => ({
  source_line_id: opening,
  scope,
  quantity: opening === "opening-1" ? 2 : 1,
  vendor_name: opening === "opening-1" ? "Vendor A" : "Vendor B",
  vendor_order_ref: "TEST-PO",
  state: "acknowledged",
  promised_on: "2026-09-07",
});
async function snapshot() {
  const [scopes, lines, movements, visits] = await Promise.all(
    [
      "crm_fulfillment_scopes",
      "crm_fulfillment_lines",
      "crm_product_movements",
      "crm_service_visits",
    ].map((t) =>
      db.query<{ record: Record<string, unknown> }>(
        "select to_jsonb(t) as record from " + t + " t",
      ),
    ),
  );
  return {
    scopes: scopes.rows.map((r) => r.record),
    lines: lines.rows.map((r) => r.record),
    movements: movements.rows.map((r) => r.record),
    visits: visits.rows.map((r) => r.record),
  } as unknown as FulfillmentData;
}
it("keeps partial two-vendor receipts open and preserves changed promises", async () => {
  await save("line", line1, linePayload());
  expect(
    deriveFulfillment(await snapshot(), quote, "2026-09-08").missingScope,
  ).toBe(1);
  await save("line", line2, linePayload("opening-2"));
  await save("movement", id(10), {
    line_id: line1,
    kind: "shipped",
    quantity: 2,
    occurred_on: "2026-09-04",
    evidence: "Carrier receipt",
  });
  expect(
    deriveFulfillment(await snapshot(), quote, "2026-09-08").complete,
  ).toBe(false);
  await save("movement", id(11), {
    line_id: line1,
    kind: "received",
    quantity: 1,
    occurred_on: "2026-09-05",
    evidence: "Warehouse check",
  });
  const partial = deriveFulfillment(await snapshot(), quote, "2026-09-08");
  expect(partial.remaining).toBe(2);
  expect(partial.partiallyReceived).toBe(true);
  await save(
    "line",
    line2,
    { ...linePayload("opening-2"), promised_on: "2026-09-10" },
    1,
  );
  const revised = (await snapshot()).lines.find((l) => l.id === line2)!;
  expect(revised.original_promised_on).toBe("2026-09-07");
  expect(revised.promised_on).toBe("2026-09-10");
  await expect(
    save("line", line2, linePayload("opening-2"), 1),
  ).rejects.toThrow("FULFILLMENT_CONFLICT");
});
it("retains corrections, rejects duplicates, and leaves damaged product outstanding", async () => {
  const p = {
    line_id: line1,
    kind: "received",
    quantity: 1,
    occurred_on: "2026-09-06",
    evidence: "Second shipment received",
  };
  const first = await save("movement", id(12), p, 0, id(120));
  expect((await save("movement", id(12), p, 0, id(120))).rows).toEqual(
    first.rows,
  );
  await save("movement", id(13), {
    line_id: line2,
    kind: "received",
    quantity: 1,
    occurred_on: "2026-09-06",
    evidence: "Vendor B receipt",
  });
  expect(
    deriveFulfillment(await snapshot(), quote, "2026-09-08").complete,
  ).toBe(true);
  await save("movement", id(14), {
    line_id: line1,
    kind: "damaged",
    quantity: 1,
    occurred_on: "2026-09-06",
    evidence: "Damaged panel photograph",
  });
  expect(
    deriveFulfillment(await snapshot(), quote, "2026-09-08").remaining,
  ).toBe(1);
  await save("movement", id(15), {
    ...p,
    quantity: 0,
    kind: "damaged",
    correction_of: id(14),
    evidence: "Inspection correction: packaging damage only",
  });
  expect(
    deriveFulfillment(await snapshot(), quote, "2026-09-08").complete,
  ).toBe(true);
  expect((await snapshot()).movements).toHaveLength(6);
  await expect(
    db.query("delete from crm_product_movements where id=$1", [id(14)]),
  ).rejects.toThrow("append-only");
});
it("links remake and return visit without overwriting the original visit", async () => {
  await save("visit", id(20), {
    owner: "Mike",
    outcome: "complete",
    installer_form_id: form,
    report_revision: 1,
    resolution: "Original work complete",
    affected_line_ids: [line1, line2],
  });
  await save("movement", id(24), {
    line_id: line1,
    kind: "damaged",
    quantity: 1,
    occurred_on: "2026-09-07",
    evidence: "Confirmed damaged opening requiring remake",
  });
  await save("line", id(21), {
    ...linePayload(),
    quantity: 1,
    remake_of: line1,
    vendor_order_ref: "TEST-REMAKE",
  });
  await save("visit", id(22), {
    owner: "Mike",
    outcome: "planned",
    original_visit_id: id(20),
    affected_line_ids: [id(21)],
  });
  let progress = deriveFulfillment(await snapshot(), quote, "2026-09-08");
  expect(progress.complete).toBe(false);
  expect(progress.openVisits).toHaveLength(1);
  expect(progress.remaining).toBe(1);
  await expect(
    save(
      "visit",
      id(22),
      {
        owner: "Mike",
        outcome: "complete",
        affected_line_ids: [id(21)],
        resolution: "No report",
        original_visit_id: id(20),
      },
      1,
    ),
  ).rejects.toThrow("Completed report");
  await save("movement", id(23), {
    line_id: id(21),
    kind: "received",
    quantity: 1,
    occurred_on: "2026-09-07",
    evidence: "Remake physically received",
  });
  await db.query("update crm_installer_forms set meta=$2 where id=$1", [
    form,
    { workflow: { outcome: "completed", revision: 2 } },
  ]);
  await save(
    "visit",
    id(22),
    {
      owner: "Mike",
      outcome: "complete",
      original_visit_id: id(20),
      installer_form_id: form,
      report_revision: 2,
      affected_line_ids: [id(21)],
      resolution: "Return work complete",
    },
    1,
  );
  progress = deriveFulfillment(await snapshot(), quote, "2026-09-08");
  expect(progress.complete).toBe(true);
  expect(progress.openVisits).toHaveLength(0);
  expect((await snapshot()).visits).toHaveLength(2);
});
it("rejects cross-quote movements and leaves no partial audit on failure", async () => {
  const before = (await db.query("select id from crm_business_events")).rows
    .length;
  await expect(
    save("movement", id(30), {
      line_id: id(31),
      kind: "received",
      quantity: 1,
      occurred_on: "2026-09-07",
      evidence: "Unrelated",
    }),
  ).rejects.toThrow("mismatch");
  expect(
    (await db.query("select id from crm_business_events")).rows,
  ).toHaveLength(before);
  expect(
    (
      await db.query(
        "select has_function_privilege('authenticated','crm_save_fulfillment(text,uuid,integer,uuid,jsonb,text)','execute') as allowed",
      )
    ).rows,
  ).toEqual([{ allowed: false }]);
});
