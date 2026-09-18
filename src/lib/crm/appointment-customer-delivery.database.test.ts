import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingDatabaseFixture } from "@/lib/booking/database-fixture";
import { processAppointmentCustomerNotifications } from "./appointment-customer-delivery";
import { buildUnifiedActivityFeed } from "./unified-activity";
import { candidateVisit } from "@/lib/booking/scheduling";
import { eventSignature } from "@/lib/booking/travel";
import { randomUUID } from "node:crypto";

const db = new PGlite();
const reminderNow = new Date("2035-07-12T02:00:00Z"); // July 11, 7 PM Pacific
const start = "2035-07-12T18:00:00Z";
const end = "2035-07-12T19:00:00Z";
const actor = "11111111-1111-4111-8111-111111111111";
// Local-only Postgres adapter runs the REAL queue/claim/audit SQL. All provider
// sends are injected spies; these tests never load credentials or call APIs.
function from(table: string) {
  let mode = "select", value: Record<string, unknown> = {}, countOnly = false, limit = 10000, order = "";
  const clauses: string[] = [], params: unknown[] = [];
  const bind = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const q = {
    select: (_columns?: string, options?: { head?: boolean }) => { countOnly = Boolean(options?.head); return q; },
    eq: (key: string, v: unknown) => { clauses.push(`${key}=${bind(v)}`); return q; },
    neq: (key: string, v: unknown) => { clauses.push(`${key}<>${bind(v)}`); return q; },
    lt: (key: string, v: unknown) => { clauses.push(`${key}<${bind(v)}`); return q; },
    gte: (key: string, v: unknown) => { clauses.push(`${key}>=${bind(v)}`); return q; },
    in: (key: string, values: unknown[]) => { clauses.push(`${key} in (${values.map(bind).join(",")})`); return q; },
    order: (key: string) => { order = ` order by ${key},id`; return q; },
    limit: (n: number) => { limit = n; return q; },
    update: (v: Record<string, unknown>) => { mode = "update"; value = v; return q; },
    upsert: (v: Record<string, unknown>) => { mode = "upsert"; value = v; return q; },
    maybeSingle: async () => { const r = await execute(); return { ...r, data: r.data?.[0] || null }; },
    then: (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) => execute().then(resolve, reject),
  };
  async function execute() {
    try {
      const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
      let sql: string;
      if (mode === "update") sql = `update ${table} set ${Object.entries(value).map(([k,v]) => `${k}=${bind(v)}`).join(",")}${where} returning *`;
      else if (mode === "upsert") sql = `insert into ${table}(${Object.keys(value).join(",")}) values(${Object.values(value).map(bind).join(",")}) on conflict(event_id,kind,channel,dedupe_key) do nothing returning *`;
      else sql = `select * from ${table}${where}${order} limit ${limit}`;
      const r = await db.query(sql, params);
      return { data: JSON.parse(JSON.stringify(r.rows)), count: countOnly ? r.rows.length : null, error: null };
    } catch (error) { return { data: null, count: null, error }; }
  }
  return q;
}
const client = { from, rpc: async (name: string, args: { p_id: string }) => {
  const r = await db.query<{ value: unknown }>(`select ${name}($1) as value`, [args.p_id]);
  return { data: r.rows[0].value, error: null };
} } as unknown as SupabaseClient;
const send = vi.fn(async () => ({ accepted: true, providerId: "fixture-provider-receipt" }));
const run = (kind: "confirmation" | "reminder", overrides = {}) => processAppointmentCustomerNotifications(client, kind, { now: () => reminderNow, send, ...overrides });
const ledger = async () => (await db.query<{ status: string; channel: string; reason: string }>("select * from appointment_customer_notifications order by channel")).rows;

beforeAll(async () => {
  await db.exec(bookingDatabaseFixture());
  const activitySql = readFileSync("supabase/migrations/20260605000000_harden_805_crm_backend.sql", "utf8");
  await db.exec("create schema auth; create table auth.users(id uuid primary key);");
  await db.exec(activitySql.slice(0, activitySql.indexOf("\n);" ) + 3));
  await db.exec(readFileSync("supabase/migrations/20260912233000_customer_appointment_notifications.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("truncate crm_calendar_events,crm_jobs,leads,crm_activity_events,booking_requests,crm_availability_slots cascade;");
  vi.stubEnv("APPOINTMENT_CUSTOMER_SENDS_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://evuxqsaucmvgyuvjpqlo.supabase.co");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No live network allowed in fixtures"); }));
  send.mockClear();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
afterAll(async () => { await db.close(); });

async function appointment(options: { phone?: string; email?: string; publicBooking?: boolean; type?: string; start?: string; jobless?: boolean } = {}) {
  const job = (await db.query<{ id: string }>("insert into crm_jobs(customer_name,phone,email) values('Local Fixture',$1,$2) returning id", [options.phone ?? "8055550100", options.email ?? "fixture@example.invalid"])).rows[0];
  const event = { title: "Local Fixture consultation", job_id: options.jobless ? null : job.id, start_at: options.start || start, end_at: options.start ? new Date(Date.parse(options.start)+3600000).toISOString() : end, event_type: options.type || "sales_consult", status: "scheduled", assigned_to: "Jessica" };
  if (options.publicBooking) {
    const visit = candidateVisit("2035-07-12", "11:00", "Local Fixture Address", 5);
    const revision = async () => String((await db.query<{ revision: number }>("select revision from booking_schedule_state")).rows[0].revision);
    await db.query("select booking_publish_ranges($1,$2,$3,$4)", ["2035-07",await revision(),[{start_at: "2035-07-12T15:00:00Z",end_at: "2035-07-13T00:00:00Z"}],"staff@example.invalid"]);
    await db.query("select booking_commit($1,$2,$3,$4,$5,$6,$7,$8)", [randomUUID(),"fixture",await revision(),
      {source:"self_booking",status:"booked",name:"Local Fixture",phone:"8055550100",meta:{}},
      {customer_name:"Local Fixture",phone:"8055550100",email:"fixture@example.invalid",product_interest:"shutters",meta:{}},
      visit,[{eventId:visit.id,signature:eventSignature(visit),checkedAt:new Date().toISOString(),previous:null,next:null}],
      [{kind:"customer_sms",payload:{}},{kind:"customer_email",payload:{}}]]);
    return visit.id;
  }
  return (await db.query<{ e: { id: string } }>("select booking_admin_create($1,$2,'staff@example.invalid') e", [event, actor])).rows[0].e.id;
}

it("manual override save atomically queues SMS and email, and parallel workers send each once", async () => {
  await appointment();
  expect((await ledger()).map(r => r.status)).toEqual(["pending", "pending"]);
  await Promise.all([run("confirmation"), run("confirmation")]);
  await run("confirmation");
  expect(send).toHaveBeenCalledTimes(2);
  expect((await ledger()).map(r => r.status)).toEqual(["accepted", "accepted"]);
  expect(send.mock.calls[0]).toBeDefined();
});

it("does not duplicate the public booking confirmation path", async () => {
  await appointment({ publicBooking: true });
  expect(await ledger()).toHaveLength(0);
  expect((await db.query("select * from booking_outbox")).rows).toHaveLength(2);
  await run("confirmation");
  expect(send).not.toHaveBeenCalled();
});

it.each(["block", "measure"])("does not confirm a %s as a consultation", async type => {
  await appointment({ type }); expect(await ledger()).toHaveLength(0);
});

it("skips missing mobile with a reason and still accepts email", async () => {
  await appointment({ phone: "" }); await run("confirmation");
  expect(send).toHaveBeenCalledTimes(1);
  expect(await ledger()).toEqual([expect.objectContaining({ channel: "email", status: "accepted" }), expect.objectContaining({ channel: "sms", status: "skipped", reason: "Missing or ambiguous customer mobile" })]);
});

it("does not guess between two phone numbers", async () => {
  await appointment({ phone: "8055550100 / 8055550101" }); await run("confirmation");
  expect(send).toHaveBeenCalledTimes(1); expect((await ledger())[1].status).toBe("skipped");
});

it("records missing both contacts as staff-visible failures, not success", async () => {
  await appointment({ phone: "", email: "" });
  expect((await run("confirmation")).status).toBe("failed");
  expect(send).not.toHaveBeenCalled();
  const activity = (await db.query("select * from crm_activity_events where action='appointment_notification.failed'")).rows;
  const feed = buildUnifiedActivityFeed({ activityEvents: activity, payments: [], signedContracts: [], jobs: [], quotes: [], rows: [], customers: [] } as unknown as Parameters<typeof buildUnifiedActivityFeed>[0]);
  expect(feed).toHaveLength(2);
  expect(feed[0].description).toContain("staff follow-up required");
  expect(feed[0].customerName).toBe("Local Fixture");
});

it("does not send from previews or while approval is absent", async () => {
  await appointment(); vi.stubEnv("APPOINTMENT_CUSTOMER_SENDS_ENABLED", "false");
  expect((await run("confirmation")).status).toBe("paused");
  vi.stubEnv("APPOINTMENT_CUSTOMER_SENDS_ENABLED", "true"); vi.stubEnv("VERCEL_ENV", "preview");
  expect((await run("confirmation")).status).toBe("paused"); expect(send).not.toHaveBeenCalled();
});

it("dry-run reads counts without claims, mutations, or sends", async () => {
  await appointment(); const before = await ledger();
  expect((await run("confirmation", { dryRun: true })).planned).toBe(2);
  expect((await run("reminder", { dryRun: true })).planned).toBe(1);
  expect(await ledger()).toEqual(before); expect(send).not.toHaveBeenCalled();
});

it("reminds public and manual appointments once per Pacific appointment date", async () => {
  await appointment({ publicBooking: true }); const id = await appointment();
  expect((await run("reminder")).accepted).toBe(2);
  await run("reminder");
  const previous = (await db.query<{ previous: unknown }>("select to_jsonb(e) as previous from crm_calendar_events e where id=$1", [id])).rows[0].previous;
  await db.query("select booking_admin_reschedule($1,$2,$3,$4,$5,$6,$7)", [id,previous,"2035-07-12T19:00:00Z","2035-07-12T20:00:00Z",{},actor,"staff@example.invalid"]);
  await run("reminder"); expect(send).toHaveBeenCalledTimes(2);
});

it("honors a receipt from the old reminder worker", async () => {
  const id = await appointment();
  await db.query("update crm_calendar_events set meta=meta || $1 where id=$2", [{dayBeforeReminderSentAt: reminderNow.toISOString(), dayBeforeReminderAppointmentStart: start},id]);
  expect((await run("reminder")).accepted).toBe(0); expect(send).not.toHaveBeenCalled();
});

it.each(["2035-07-12T01:59:59Z", "2035-07-12T03:00:00Z", "2035-07-12T06:45:46Z", "2035-07-12T07:22:06Z"])("skips a late/early start at %s without touching the queue", async at => {
  await appointment(); const before = await ledger();
  expect((await run("reminder", { now: () => new Date(at) })).status).toBe("outside_window");
  expect(await ledger()).toEqual(before); expect(send).not.toHaveBeenCalled();
});

it("rechecks the hour immediately before sending after slow DB reads", async () => {
  await appointment(); let ticks = 0;
  const now = () => { ticks++; return new Date(ticks >= 6 ? "2035-07-12T03:00:00Z" : reminderNow); };
  await run("reminder", { now }); expect(send).not.toHaveBeenCalled();
});

it("never replays an uncertain provider call", async () => {
  await appointment();
  const interrupted = vi.fn(async () => { throw new Error("provider connection lost"); });
  expect((await run("confirmation", { send: interrupted })).status).toBe("failed");
  await run("confirmation"); expect(send).not.toHaveBeenCalled();
  expect((await ledger()).every(r => r.status === "uncertain")).toBe(true);
});

it("missing provider IDs are failures even if the provider wrapper says accepted", async () => {
  await appointment();
  expect((await run("confirmation", { send: async () => ({ accepted: true }) })).status).toBe("failed");
});

it("skips canceled or moved confirmations", async () => {
  const id = await appointment();
  await db.query("update crm_calendar_events set status='canceled' where id=$1", [id]);
  await run("confirmation"); expect(send).not.toHaveBeenCalled();
});

it("rolls back appointment and queue together on a failed save", async () => {
  await db.exec("begin"); await appointment(); await db.exec("rollback");
  expect(await ledger()).toHaveLength(0);
});
