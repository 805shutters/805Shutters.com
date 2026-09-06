import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { bookingDatabaseFixture } from "./database-fixture";
import { candidateVisit } from "./scheduling";
import { eventSignature } from "./travel";
const db = new PGlite();
const date = "2035-10-01",
  month = date.slice(0, 7);
const lead = {
  source: "self_booking",
  status: "booked",
  name: "Test Customer",
  phone: "8055550100",
  meta: {},
};
const job = {
  customer_name: "Test Customer",
  phone: "8055550100",
  address: "123 Main St",
  product_interest: "shutters",
  meta: {},
};
const snapshot = async () =>
  (
    await db.query<{
      snapshot: { revision: string; events: unknown[]; slots: unknown[] };
    }>("select public.booking_schedule_snapshot($1) snapshot", [month])
  ).rows[0].snapshot;
async function publish(
  ranges = [
    { start_at: "2035-10-01T15:00:00Z", end_at: "2035-10-02T00:00:00Z" },
  ],
) {
  return db.query("select public.booking_publish_ranges($1,$2,$3,$4)", [
    month,
    (await snapshot()).revision,
    JSON.stringify(ranges),
    "test@local.invalid",
  ]);
}
async function commit(
  time = "10:00",
  key = randomUUID(),
  extra: {
    revision?: string;
    hash?: string;
    event?: Record<string, unknown>;
    proofs?: unknown[];
  } = {},
) {
  const event = {
    ...candidateVisit(date, time, "123 Main St", 5),
    ...extra.event,
  };
  const proof = {
    eventId: event.id,
    signature: eventSignature(event),
    checkedAt: new Date().toISOString(),
    previous: null,
    next: null,
  };
  return db.query<{ result: Record<string, unknown> }>(
    "select public.booking_commit($1,$2,$3,$4,$5,$6,$7,$8) result",
    [
      key,
      extra.hash || "test-hash",
      extra.revision || (await snapshot()).revision,
      JSON.stringify(lead),
      JSON.stringify(job),
      JSON.stringify(event),
      JSON.stringify(extra.proofs || [proof]),
      JSON.stringify([{ kind: "customer_sms", payload: {} }]),
    ],
  );
}
beforeAll(async () => {
  const sql = bookingDatabaseFixture();
  try {
    await db.exec(sql);
  } catch (e) {
    const pos = Number((e as { position?: string }).position);
    console.error(
      "SQL error context",
      sql.slice(pos - 160, pos + 160),
      (e as { internalQuery?: string }).internalQuery,
    );
    throw e;
  }
}, 30000);
beforeEach(async () => {
  await db.exec(
    "truncate booking_outbox,booking_requests,booking_route_protections,crm_quotes,crm_calendar_events,crm_jobs,leads,sales_805_appointments,crm_availability_slots cascade;",
  );
});
afterAll(() => db.close());
describe("booking database authority", () => {
  it("rejects public callers for all privileged RPCs", async () => {
    const rows = await db.query<{
      name: string;
      anon: boolean;
      authenticated: boolean;
    }>(
      "select p.proname name,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'booking_%'",
    );
    expect(rows.rows.length).toBeGreaterThan(4);
    expect(rows.rows.every((r) => !r.anon && !r.authenticated)).toBe(true);
  });
  it("rejects an empty month without leaving any records", async () => {
    await expect(commit()).rejects.toThrow(/BOOKING_CLOSED/);
    const rows = await db.query<{ count: number }>(
      "select count(*)::int count from leads",
    );
    expect(rows.rows[0].count).toBe(0);
  });
  it("atomically saves lead, job, event, draft and queued effect", async () => {
    await publish();
    const result = await commit();
    expect(result.rows[0].result.assignedTo).toBe("Jessica");
    const rows = await db.query<{ counts: number[] }>(
      "select array[(select count(*)::int from leads),(select count(*)::int from crm_jobs),(select count(*)::int from crm_calendar_events),(select count(*)::int from crm_quotes),(select count(*)::int from booking_outbox)] counts",
    );
    expect(rows.rows[0].counts).toEqual([1, 1, 1, 1, 1]);
  });
  it("replays a request once and rejects changed payloads", async () => {
    await publish();
    const key = randomUUID();
    const first = await commit("10:00", key);
    const second = await commit("10:00", key);
    expect(second.rows[0].result.calendarEventId).toBe(
      first.rows[0].result.calendarEventId,
    );
    await expect(commit("10:00", key, { hash: "different" })).rejects.toThrow(
      /BOOKING_KEY_REUSED/,
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from booking_outbox",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("rejects stale calendar revisions after closing hours", async () => {
    await publish();
    const revision = (await snapshot()).revision;
    await publish([]);
    await expect(commit("10:00", randomUUID(), { revision })).rejects.toThrow(
      /BOOKING_STALE/,
    );
  });
  it("rejects overlapping bookings with different start times and rolls back all inserts", async () => {
    await publish();
    await commit();
    await expect(commit("10:30")).rejects.toThrow(/BOOKING_CONFLICT/);
    expect(
      (await db.query<{ n: number }>("select count(*)::int n from leads"))
        .rows[0].n,
    ).toBe(1);
  });
  it("rejects back-to-back insertion without route proofs for changed neighbors", async () => {
    await publish();
    await commit();
    await expect(commit("11:00")).rejects.toThrow(/BOOKING_ROUTE_RECHECK/);
  });
  it("protects confirmed visits from direct staff and legacy writes", async () => {
    await publish();
    await commit();
    await expect(
      db.exec(
        "insert into crm_calendar_events(title,start_at,end_at,assigned_to) values('conflict','2035-10-01 17:30Z','2035-10-01 18:30Z','Jessica')",
      ),
    ).rejects.toThrow(/BOOKING_CONFLICT/);
    await expect(
      db.exec(
        "insert into sales_805_appointments(customer_name,customer_address,appointment_date,start_time,end_time,assigned_to) values('legacy','123 Main St','2035-10-01','10:30','11:30','Jessica')",
      ),
    ).rejects.toThrow(/BOOKING_CONFLICT/);
  });
  it("permits metadata-only updates and closing hours without canceling confirmed visits", async () => {
    await publish();
    const eventId = (await commit()).rows[0].result.calendarEventId;
    await db.query(
      'update crm_calendar_events set meta=meta||\'{"staffNote":"test"}\'::jsonb where id=$1',
      [eventId],
    );
    await publish([]);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from crm_calendar_events where id=$1",
          [eventId],
        )
      ).rows[0].status,
    ).toBe("scheduled");
  });
  it("deduplicates provenance mirrors and preserves same-time distinct events", async () => {
    await db.exec(
      "insert into sales_805_appointments(customer_name,customer_address,appointment_date,start_time,end_time,assigned_to) values('legacy','123 Main St','2035-10-01','10:00','11:00','Jessica')",
    );
    expect((await snapshot()).events).toHaveLength(1);
    await db.exec(
      "insert into crm_calendar_events(title,start_at,end_at,assigned_to) values('different','2035-10-01 17:00Z','2035-10-01 18:00Z','Mike')",
    );
    expect((await snapshot()).events).toHaveLength(2);
  });
  it("reads overlap across the month boundary", async () => {
    await db.exec(
      "insert into crm_calendar_events(title,start_at,end_at,event_type) values('overnight','2035-10-01 06:00Z','2035-10-01 09:00Z','block')",
    );
    expect((await snapshot()).events).toHaveLength(1);
  });
  it("enforces duration and owner on the server", async () => {
    await publish();
    await expect(
      commit("10:00", randomUUID(), { event: { assigned_to: "Mike" } }),
    ).rejects.toThrow(/Invalid public booking/);
    await expect(
      commit("10:00", randomUUID(), { event: { end_at: "2035-10-01 17:30Z" } }),
    ).rejects.toThrow(/Invalid public booking/);
  });
  it("claims each queued effect once", async () => {
    await publish();
    await commit();
    const id = (await db.query<{ id: string }>("select id from booking_outbox"))
      .rows[0].id;
    expect(
      (
        await db.query<{ result: unknown }>(
          "select booking_claim_effect($1) result",
          [id],
        )
      ).rows[0].result,
    ).toBeTruthy();
    expect(
      (
        await db.query<{ result: unknown }>(
          "select booking_claim_effect($1) result",
          [id],
        )
      ).rows[0].result,
    ).toBeNull();
  });
  it("validates both database driving legs and the extra fifteen minutes", async () => {
    await publish();
    const previous = candidateVisit(date, "08:00", "Previous Test Address", 5);
    const next = candidateVisit(date, "12:00", "Next Test Address", 5);
    for (const e of [previous, next])
      await db.query(
        "insert into crm_calendar_events(id,title,start_at,end_at,assigned_to,event_type,location) values($1,'neighbor',$2,$3,'Jessica','sales_consult',$4)",
        [e.id, e.start_at, e.end_at, e.location],
      );
    const event = candidateVisit(date, "10:00", "123 Main St", 5);
    const proof = {
      eventId: event.id,
      signature: eventSignature(event),
      checkedAt: new Date().toISOString(),
      previous: {
        id: previous.id,
        signature: eventSignature(previous),
        departureAt: previous.end_at,
        seconds: 45 * 60,
      },
      next: {
        id: next.id,
        signature: eventSignature(next),
        departureAt: event.end_at,
        seconds: 45 * 60,
      },
    };
    await expect(
      commit("10:00", randomUUID(), {
        event,
        proofs: [{ ...proof, next: { ...proof.next, seconds: 45 * 60 + 1 } }],
      }),
    ).rejects.toThrow(/BOOKING_TRAVEL/);
    expect(
      (await db.query<{ n: number }>("select count(*)::int n from leads"))
        .rows[0].n,
    ).toBe(0);
    await commit("10:00", randomUUID(), { event, proofs: [proof] });
    await expect(
      db.exec(
        "insert into crm_calendar_events(title,start_at,end_at,event_type) values('travel block','2035-10-01 16:15Z','2035-10-01 16:30Z','block')",
      ),
    ).rejects.toThrow(/BOOKING_TRAVEL/);
  });
  it("rolls back every record when a later quote insert fails", async () => {
    await publish();
    await db.exec(
      "create function public.test_quote_failure() returns trigger language plpgsql as $$begin raise exception 'test quote failure';end$$;create trigger test_quote_failure before insert on crm_quotes for each row execute function public.test_quote_failure();",
    );
    try {
      await expect(commit()).rejects.toThrow(/test quote failure/);
      const rows = await db.query<{ counts: number[] }>(
        "select array[(select count(*)::int from leads),(select count(*)::int from crm_jobs),(select count(*)::int from crm_calendar_events),(select count(*)::int from booking_outbox),(select count(*)::int from booking_requests)] counts",
      );
      expect(rows.rows[0].counts).toEqual([0, 0, 0, 0, 0]);
    } finally {
      await db.exec(
        "drop trigger test_quote_failure on crm_quotes;drop function public.test_quote_failure();",
      );
    }
  });
  it("blocks legacy public writers after activation", async () => {
    await expect(
      db.exec(
        `insert into crm_calendar_events(title,start_at,end_at,assigned_to,meta) values('old writer','2035-10-01 17:00Z','2035-10-01 18:00Z','Jessica','{"bookingSource":"website"}')`,
      ),
    ).rejects.toThrow(/BOOKING_UNGUARDED/);
  });
  it("moves old openings and fallback activity hours to drafts without publishing", async () => {
    const isolated = new PGlite();
    try {
      await isolated.exec(
        bookingDatabaseFixture(`
        insert into crm_availability_slots(owner,start_at,end_at,status) values('Jessica','2035-10-01 15:00Z','2035-10-01 16:00Z','available');
        create table public.crm_activity_events(id uuid default gen_random_uuid(),created_at timestamptz default now(),actor_email text,entity_type text,action text,metadata jsonb,after_data jsonb);
        insert into crm_activity_events(entity_type,action,metadata,after_data) values('system','availability_slot_open','{"owner":"Jessica"}','{"start_at":"2035-10-01T17:00:00Z","end_at":"2035-10-01T18:00:00Z"}');
      `),
      );
      const rows = await isolated.query<{ status: string }>(
        "select status from crm_availability_slots",
      );
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows.every((r) => r.status === "draft")).toBe(true);
    } finally {
      await isolated.close();
    }
  });
  it("requires published coverage when staff moves a protected public visit", async () => {
    await publish();
    const id = (await commit()).rows[0].result.calendarEventId;
    await publish([]);
    const moved = candidateVisit(date, "12:00", "123 Main St", 5, String(id));
    await expect(
      db.query("select booking_calendar_write($1,'update',$2,$3)", [
        (await snapshot()).revision,
        JSON.stringify(moved),
        JSON.stringify([
          {
            eventId: id,
            signature: eventSignature(moved),
            checkedAt: new Date().toISOString(),
            previous: null,
            next: null,
          },
        ]),
      ]),
    ).rejects.toThrow(/BOOKING_CLOSED/);
  });
});
