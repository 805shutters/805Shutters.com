import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { bookingDatabaseFixture } from "./database-fixture";
import { candidateVisit } from "./scheduling";
import { eventSignature } from "./travel";
import type { CrmCalendarEvent } from "@/lib/crm/types";
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
const staffActorId = "11111111-1111-4111-8111-111111111111";
async function protectedPair() {
  await publish();
  const next = candidateVisit(date, "12:00", "Next Test Address", 5);
  await db.query(
    "insert into crm_calendar_events(id,title,start_at,end_at,assigned_to,event_type,location) values($1,'neighbor',$2,$3,'Jessica','sales_consult',$4)",
    [next.id, next.start_at, next.end_at, next.location],
  );
  const event = candidateVisit(date, "10:00", "Current Test Address", 5);
  const proof = {
    eventId: event.id,
    signature: eventSignature(event),
    checkedAt: new Date().toISOString(),
    previous: null,
    next: {
      id: next.id,
      signature: eventSignature(next),
      departureAt: event.end_at,
      seconds: 45 * 60,
    },
  };
  await commit("10:00", randomUUID(), { event, proofs: [proof] });
  return { event, next };
}
function movedProof(
  event: CrmCalendarEvent,
  next: CrmCalendarEvent,
  seconds = 16 * 60,
) {
  return {
    eventId: event.id,
    signature: eventSignature(event),
    checkedAt: new Date().toISOString(),
    previous: null,
    next: {
      id: next.id,
      signature: eventSignature(next),
      departureAt: event.end_at,
      seconds,
    },
  };
}
async function staffReschedule(
  event: CrmCalendarEvent,
  proofs: unknown[],
  override = true,
  actorEmail = "staff@local.invalid",
) {
  return db.query("select booking_calendar_reschedule($1,$2,$3,$4,$5,$6,$7)", [
    (await snapshot()).revision,
    JSON.stringify(event),
    JSON.stringify(proofs),
    override,
    staffActorId,
    actorEmail,
    "staff_reschedule_extra_buffer_override",
  ]);
}
const snapshot = async () =>
  (
    await db.query<{
      snapshot: {
        revision: string;
        events: unknown[];
        slots: unknown[];
        bufferExceptions?: unknown[];
      };
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
    "truncate booking_travel_buffer_exceptions,booking_outbox,booking_requests,booking_route_protections,crm_quotes,crm_calendar_events,crm_jobs,leads,sales_805_appointments,crm_availability_slots cascade;",
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

  it("keeps the staff buffer override explicit and rejects the strict write", async () => {
    const { event, next } = await protectedPair();
    const moved = {
      ...candidateVisit(date, "10:30", String(event.location), 5, event.id),
      status: "rescheduled" as const,
    };
    await expect(
      db.query("select booking_calendar_write($1,'update',$2,$3)", [
        (await snapshot()).revision,
        JSON.stringify(moved),
        JSON.stringify([movedProof(moved, next)]),
      ]),
    ).rejects.toThrow(/BOOKING_TRAVEL/);
    await staffReschedule(moved, [movedProof(moved, next)]);
    expect((await snapshot()).bufferExceptions).toHaveLength(1);
  });

  it("requires proof for an initially unprotected Jessica visit and keeps it unprotected", async () => {
    await publish();
    const current = candidateVisit(date, "10:00", "Current Test Address", 5);
    const next = candidateVisit(date, "12:00", "Next Test Address", 5);
    for (const visit of [current, next]) {
      await db.query(
        "insert into crm_calendar_events(id,title,start_at,end_at,assigned_to,event_type,location,status) values($1,'staff visit',$2,$3,'Jessica','sales_consult',$4,'scheduled')",
        [visit.id, visit.start_at, visit.end_at, visit.location],
      );
    }
    const moved = {
      ...candidateVisit(date, "10:30", String(current.location), 5, current.id),
      status: "rescheduled" as const,
    };

    await expect(staffReschedule(moved, [])).rejects.toThrow(/BOOKING_ROUTE_RECHECK/);
    await expect(
      staffReschedule(moved, [
        {
          eventId: moved.id,
          signature: eventSignature(moved),
          checkedAt: new Date().toISOString(),
          previous: null,
          next: null,
        },
      ]),
    ).rejects.toThrow(/BOOKING_ROUTE_RECHECK/);
    await expect(
      staffReschedule(moved, [movedProof(moved, next, 30 * 60 + 1)]),
    ).rejects.toThrow(/BOOKING_TRAVEL/);
    await staffReschedule(moved, [movedProof(moved, next)]);

    expect(
      (
        await db.query<{ counts: number[] }>(
          "select array[(select count(*)::int from booking_route_protections),(select count(*)::int from booking_travel_buffer_exceptions)] counts",
        )
      ).rows[0].counts,
    ).toEqual([0, 1]);
  });

  it("rejects buffer overrides for non-Jessica assignments and blocks", async () => {
    await publish();
    for (const variant of [
      { assigned_to: "Mike", event_type: "sales_consult" as const },
      { assigned_to: "Jessica", event_type: "block" as const },
    ]) {
      const event = {
        ...candidateVisit(date, "10:00", "Current Test Address", 5),
        ...variant,
      };
      await db.query(
        "insert into crm_calendar_events(id,title,start_at,end_at,assigned_to,event_type,location,status) values($1,'unsupported',$2,$3,$4,$5,$6,'scheduled')",
        [event.id, event.start_at, event.end_at, event.assigned_to, event.event_type, event.location],
      );
      const moved = { ...event, status: "rescheduled" as const };
      await expect(staffReschedule(moved, [])).rejects.toThrow(/BOOKING_OVERRIDE/);
      await db.query("delete from crm_calendar_events where id=$1", [event.id]);
    }
  });

  it("denies override RPC and exception-table writes to anon and authenticated roles", async () => {
    const permissions = await db.query<{
      role_name: string;
      can_execute: boolean;
      can_insert: boolean;
    }>(`
      select role_name,
        has_function_privilege(role_name,'public.booking_calendar_reschedule(text,jsonb,jsonb,boolean,uuid,text,text)','EXECUTE') can_execute,
        has_table_privilege(role_name,'public.booking_travel_buffer_exceptions','INSERT') can_insert
      from (values ('anon'),('authenticated')) roles(role_name)
    `);
    expect(permissions.rows).toEqual([
      { role_name: "anon", can_execute: false, can_insert: false },
      { role_name: "authenticated", can_execute: false, can_insert: false },
    ]);

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(
          db.exec(
            "select booking_calendar_reschedule('0','{}','[]',true,'11111111-1111-4111-8111-111111111111','staff@local.invalid','staff_reschedule_extra_buffer_override')",
          ),
        ).rejects.toThrow(/permission denied/i);
        await expect(
          db.exec(
            "insert into booking_travel_buffer_exceptions(from_event_id) values('forbidden')",
          ),
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await db.exec("reset role");
      }
    }
  });

  it("never overrides actual driving time or appointment overlap", async () => {
    let pair = await protectedPair();
    let moved = {
      ...candidateVisit(date, "10:30", String(pair.event.location), 5, pair.event.id),
      status: "rescheduled" as const,
    };
    await expect(
      staffReschedule(moved, [movedProof(moved, pair.next, 30 * 60 + 1)]),
    ).rejects.toThrow(/BOOKING_TRAVEL/);

    await db.exec(
      "truncate booking_travel_buffer_exceptions,booking_outbox,booking_requests,booking_route_protections,crm_quotes,crm_calendar_events,crm_jobs,leads,sales_805_appointments,crm_availability_slots cascade;",
    );
    pair = await protectedPair();
    moved = {
      ...candidateVisit(date, "11:30", String(pair.event.location), 5, pair.event.id),
      status: "rescheduled" as const,
    };
    await expect(
      staffReschedule(moved, [movedProof(moved, pair.next, 1)]),
    ).rejects.toThrow(/BOOKING_CONFLICT/);
  });

  it("retains an exact approved leg through later route-proof refreshes", async () => {
    const { event, next } = await protectedPair();
    const moved = {
      ...candidateVisit(date, "10:30", String(event.location), 5, event.id),
      status: "rescheduled" as const,
    };
    await staffReschedule(moved, [movedProof(moved, next)]);
    const refreshed = movedProof(moved, next);
    await db.query("select booking_calendar_write($1,'update',$2,$3)", [
      (await snapshot()).revision,
      JSON.stringify({ id: moved.id, meta: { proofRefresh: true } }),
      JSON.stringify([refreshed]),
    ]);
    expect((await snapshot()).bufferExceptions).toHaveLength(1);
  });

  it("permanently invalidates an approved leg when either adjacent signature changes", async () => {
    const { event, next } = await protectedPair();
    const moved = {
      ...candidateVisit(date, "10:30", String(event.location), 5, event.id),
      status: "rescheduled" as const,
    };
    await staffReschedule(moved, [movedProof(moved, next)]);

    const changedNext = candidateVisit(
      date,
      "12:30",
      "Changed Address",
      5,
      next.id,
    );
    await db.query("select booking_calendar_write($1,'update',$2,$3)", [
      (await snapshot()).revision,
      JSON.stringify(changedNext),
      JSON.stringify([movedProof(moved, changedNext)]),
    ]);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from booking_travel_buffer_exceptions",
        )
      ).rows[0].n,
    ).toBe(0);

    const restoredNext = candidateVisit(
      date,
      "12:00",
      String(next.location),
      5,
      next.id,
    );
    await expect(
      db.query("select booking_calendar_write($1,'update',$2,$3)", [
        (await snapshot()).revision,
        JSON.stringify(restoredNext),
        JSON.stringify([movedProof(moved, restoredNext)]),
      ]),
    ).rejects.toThrow(/BOOKING_TRAVEL/);
  });

  it("rejects stale proofs and untrusted override attribution", async () => {
    const { event, next } = await protectedPair();
    const moved = {
      ...candidateVisit(date, "10:30", String(event.location), 5, event.id),
      status: "rescheduled" as const,
    };
    const stale = {
      ...movedProof(moved, next),
      checkedAt: new Date(Date.now() - 180_000).toISOString(),
    };
    await expect(staffReschedule(moved, [stale])).rejects.toThrow(/BOOKING_STALE/);
    await expect(
      staffReschedule(moved, [movedProof(moved, next)], true, ""),
    ).rejects.toThrow(/BOOKING_ACTOR/);
  });

  it("does not let public booking payloads self-authorize buffer exceptions", async () => {
    await publish();
    await commit("10:00", randomUUID(), {
      event: { bufferOverride: true, bufferExceptions: [{ forged: true }] },
    });
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from booking_travel_buffer_exceptions",
        )
      ).rows[0].n,
    ).toBe(0);
  });
});

async function adminReschedule(event: CrmCalendarEvent, time: string, newDate = date) {
  const previous = (await db.query<{ e: unknown }>("select to_jsonb(e) e from crm_calendar_events e where id=$1", [event.id])).rows[0].e;
  const moved = candidateVisit(newDate, time, String(event.location), 5, event.id);
  return db.query("select booking_admin_reschedule($1,$2,$3,$4,$5,$6,$7)", [
    event.id, JSON.stringify(previous), moved.start_at, moved.end_at, '{}', staffActorId, 'staff@local.invalid',
  ]);
}

describe("authenticated manual rescheduling", () => {
  it.each(['10:30', '11:30', '12:00', '04:00'])("allows drive conflicts, overlaps, and closed hours at %s", async time => {
    const { event } = await protectedPair();
    await adminReschedule(event, time);
    const saved = (await db.query<{ start_at: string; meta: Record<string, unknown> }>("select start_at,meta from crm_calendar_events where id=$1", [event.id])).rows[0];
    expect(new Date(saved.start_at).toISOString()).toBe(candidateVisit(date, time, '', 5).start_at);
    expect(saved.meta).toMatchObject({ adminScheduleOverride: { actorUserId: staffActorId, reason: 'staff_manual_reschedule' } });
    // A later metadata save must not undo or reject the authorized overlap.
    await db.query("update crm_calendar_events set notes='Staff note after move' where id=$1", [event.id]);
    await db.exec("select booking_private.validate_protections()");
  });

  it("allows a staff neighbor to overlap a protected public appointment", async () => {
    const { event, next } = await protectedPair();
    await adminReschedule(next, '10:30');
    expect((await db.query("select * from booking_admin_schedule_overrides where event_id=$1", [event.id])).rows).toHaveLength(1);
    // Public submission cannot reuse the exception for another overlapping visit.
    await expect(commit('10:30')).rejects.toThrow(/BOOKING_CONFLICT/);
  });

  it("supports repeat and cross-month moves without published hours or Google", async () => {
    const { event } = await protectedPair();
    await adminReschedule(event, '11:30');
    await adminReschedule(event, '05:00', '2035-11-01');
    await adminReschedule(event, '12:00');
    await db.exec("select booking_private.validate_protections()");
  });

  it("does not let changed public itineraries reuse an admin exception", async () => {
    const { event } = await protectedPair();
    await adminReschedule(event, '12:00');
    await expect(commit('09:00')).rejects.toThrow(/BOOKING_/);
    await expect(db.query("update crm_calendar_events set location='Changed address' where id=$1", [event.id])).rejects.toThrow(/BOOKING_/);
  });

  it("allows a missing-address visit beyond the public daily appointment limit", async () => {
    await protectedPair();
    // Four visits on the protected day is still valid; the fifth starts elsewhere.
    for (const [day, time] of [[date, '08:00'], [date, '15:00'], ['2035-10-02', '09:00']]) {
      const visit = candidateVisit(day, time, '', 5);
      await db.query("insert into crm_calendar_events(id,title,start_at,end_at,assigned_to,event_type,location) values($1,'staff',$2,$3,'Mike','sales_consult',null)", [visit.id, visit.start_at, visit.end_at]);
      if (day !== date) await adminReschedule(visit, '10:00');
    }
    await db.exec("select booking_private.validate_protections()");
    await expect(commit('14:00')).rejects.toThrow(/BOOKING_FULL/);
  });

  it("retains public booking on unaffected days", async () => {
    const { event } = await protectedPair();
    await adminReschedule(event, '12:00');
    await publish([
      { start_at: '2035-10-01T15:00:00Z', end_at: '2035-10-02T00:00:00Z' },
      { start_at: '2035-10-02T15:00:00Z', end_at: '2035-10-03T00:00:00Z' },
    ]);
    const fresh = candidateVisit('2035-10-02', '10:00', 'Test address', 5);
    await commit('10:00', randomUUID(), { event: fresh });
  });

  it("rejects stale edits, invalid attribution, and public access", async () => {
    const { event } = await protectedPair();
    const previous = (await db.query<{ e: unknown }>("select to_jsonb(e) e from crm_calendar_events e where id=$1", [event.id])).rows[0].e;
    await adminReschedule(event, '12:00');
    const args = [event.id, JSON.stringify(previous), event.start_at, event.end_at, '{}', staffActorId, 'staff@local.invalid'];
    await expect(db.query("select booking_admin_reschedule($1,$2,$3,$4,$5,$6,$7)", args)).rejects.toThrow(/BOOKING_STALE/);
    args[5] = null as unknown as string;
    await expect(db.query("select booking_admin_reschedule($1,$2,$3,$4,$5,$6,$7)", args)).rejects.toThrow(/BOOKING_ACTOR/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query("select booking_admin_reschedule($1,$2,$3,$4,$5,$6,$7)", args)).rejects.toThrow(/permission denied/);
        await expect(db.exec("insert into booking_admin_schedule_overrides(event_id) values(gen_random_uuid())")).rejects.toThrow(/permission denied/);
      } finally { await db.exec('reset role'); }
    }
  });
});


async function adminCreate(time: string, extra: Record<string, unknown> = {}) {
  const event = { ...candidateVisit(date, time, "", 5), title: "Manual staff visit", meta: {}, ...extra };
  return (await db.query<{ saved: CrmCalendarEvent }>("select booking_admin_create($1,$2,$3) saved", [JSON.stringify(event), staffActorId, 'staff@local.invalid'])).rows[0].saved;
}

describe("authenticated manual appointment creation", () => {
  it.each(['10:30', '11:30', '12:00', '04:00'])("creates through overlap, drive conflicts, missing address and closed hours at %s", async time => {
    const { event } = await protectedPair();
    const saved = await adminCreate(time);
    expect(new Date(saved.start_at).toISOString()).toBe(candidateVisit(date, time, '', 5).start_at);
    expect(saved.meta).toMatchObject({ adminScheduleOverride: { actorUserId: staffActorId, reason: 'staff_manual_create' } });
    expect((await db.query("select * from booking_admin_schedule_overrides where event_id=$1", [event.id])).rows).toHaveLength(1);
    await db.query("update crm_calendar_events set notes='Staff note' where id=$1", [saved.id]);
    await db.exec("select booking_private.validate_protections()");
  });

  it("allows repeated creation beyond public capacity and keeps public submissions strict", async () => {
    await protectedPair();
    await adminCreate('10:30');
    await adminCreate('10:30');
    await adminCreate('10:30', { assigned_to: 'Mike' });
    await expect(commit('14:00')).rejects.toThrow(/BOOKING_FULL/);
  });

  it("does not authorize a later public itinerary or a forged metadata override", async () => {
    await protectedPair();
    await adminCreate('11:30');
    await expect(commit('09:00', randomUUID(), { event: { meta: { windowCount: 5, adminScheduleOverride: { reason: 'staff_manual_create' } } } })).rejects.toThrow(/BOOKING_/);
  });

  it("supports manual visits on existing public jobs", async () => {
    const { event } = await protectedPair();
    const jobId = (await db.query<{ job_id: string }>("select job_id from crm_calendar_events where id=$1", [event.id])).rows[0].job_id;
    const saved = await adminCreate('10:30', { job_id: jobId });
    expect((await db.query("select * from booking_admin_schedule_overrides where event_id=$1", [saved.id])).rows).toHaveLength(1);
    await db.exec("select booking_private.validate_protections()");
  });

  it("retains public booking on unaffected days", async () => {
    await protectedPair();
    await adminCreate('10:30');
    await publish([{ start_at: '2035-10-02T15:00:00Z', end_at: '2035-10-03T00:00:00Z' }]);
    await commit('10:00', randomUUID(), { event: candidateVisit('2035-10-02', '10:00', 'Test address', 5) });
  });

  it("rejects missing attribution, invalid ranges, and public access", async () => {
    const event = { ...candidateVisit(date, '10:00', '', 5), title: 'Staff' };
    await expect(db.query("select booking_admin_create($1,null,$2)", [JSON.stringify(event), 'staff@local.invalid'])).rejects.toThrow(/BOOKING_ACTOR/);
    await expect(adminCreate('10:00', { end_at: event.start_at })).rejects.toThrow(/Invalid appointment time range/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try { await expect(adminCreate('10:00')).rejects.toThrow(/permission denied/); }
      finally { await db.exec('reset role'); }
    }
  });
});
