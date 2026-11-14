import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { bookingDatabaseFixture } from "@/lib/booking/database-fixture";
import { candidateVisit } from "@/lib/booking/scheduling";
import { eventSignature } from "@/lib/booking/travel";

const db = new PGlite();
const date = "2035-10-01";

type OutboxRow = {
  id: string;
  kind: string;
  status: string;
  booking_key: string | null;
  calendar_event_id: string | null;
  payload: {
    sync?: string;
    action?: string;
    syncToken?: string;
    marker?: string;
    calendarEventId?: string;
    googleCalendarEventIds?: Record<string, string>;
    windowCount?: number;
  };
};

beforeAll(async () => {
  await db.exec(bookingDatabaseFixture());
}, 30000);

beforeEach(async () => {
  await db.exec("truncate booking_manual_travel_waivers,booking_manual_override_log,booking_travel_buffer_exceptions,booking_outbox,booking_requests,booking_route_protections,crm_quotes,crm_calendar_events,crm_jobs,leads,sales_805_appointments,crm_availability_slots cascade;");
});

afterAll(() => db.close());

async function addEvent(fields: {
  title: string;
  eventType: string;
  assignedTo: string;
  start?: string;
  end?: string;
  meta?: Record<string, unknown>;
}) {
  const id = randomUUID();
  await db.query(
    "insert into crm_calendar_events(id,title,event_type,status,assigned_to,start_at,end_at,meta) values ($1,$2,$3,'scheduled',$4,$5,$6,$7::jsonb)",
    [id, fields.title, fields.eventType, fields.assignedTo, fields.start ?? "2035-10-01 18:00Z", fields.end ?? "2035-10-01 19:00Z", JSON.stringify(fields.meta ?? {})],
  );
  return id;
}

async function outbox() {
  return (await db.query<OutboxRow>("select id, kind, status, booking_key, calendar_event_id, payload from booking_outbox order by kind, id")).rows;
}

describe("crm calendar google sync trigger", () => {
  it("is deferred, not executable by public roles, and queues future block and install rows", async () => {
    const privileges = await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(
      "select has_function_privilege('anon','booking_private.enqueue_google_calendar_sync()','execute') anon, has_function_privilege('authenticated','booking_private.enqueue_google_calendar_sync()','execute') authenticated, has_function_privilege('service_role','booking_private.enqueue_google_calendar_sync()','execute') service_role",
    );
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });
    const trigger = await db.query<{ deferrable: boolean; deferred: boolean }>(
      "select t.tgdeferrable deferrable, t.tginitdeferred deferred from pg_trigger t join pg_class c on c.oid=t.tgrelid where t.tgname='crm_calendar_events_google_sync' and c.relname='crm_calendar_events'",
    );
    expect(trigger.rows[0]).toEqual({ deferrable: true, deferred: true });

    const blockId = await addEvent({ title: "Shop block", eventType: "block", assignedTo: "Eddie Hurtado" });
    const installId = await addEvent({ title: "Oak install", eventType: "install", assignedTo: "Jessica" });
    const rows = await outbox();
    expect(rows.map((row) => row.calendar_event_id).sort()).toEqual([blockId, installId].sort());
    expect(rows.every((row) => row.kind === "google_calendar" && row.status === "pending" && row.payload.sync === "reconcile" && row.payload.action === "upsert" && row.booking_key === null)).toBe(true);
  });

  it("keeps one outbox row across reschedule, reassignment, and cancellation", async () => {
    const id = await addEvent({ title: "Measure", eventType: "measure", assignedTo: "Mike" });
    const first = (await outbox())[0];
    await db.query("update crm_calendar_events set start_at='2035-10-02 18:00Z', end_at='2035-10-02 20:00Z' where id=$1", [id]);
    await db.query("update crm_calendar_events set assigned_to='Eddie Hurtado' where id=$1", [id]);
    const moved = await outbox();
    expect(moved).toHaveLength(1);
    expect(moved[0].id).toBe(first.id);
    expect(moved[0].status).toBe("pending");
    expect(moved[0].payload.action).toBe("upsert");
    expect(moved[0].payload.syncToken).not.toBe(first.payload.syncToken);

    await db.query("update crm_calendar_events set status='canceled' where id=$1", [id]);
    const canceled = await outbox();
    expect(canceled).toHaveLength(1);
    expect(canceled[0].id).toBe(first.id);
    expect(canceled[0].payload.action).toBe("delete");
  });

  it("does not requeue a meta-only id write, then includes that id when the visit itself changes", async () => {
    const id = await addEvent({ title: "Hold", eventType: "block", assignedTo: "Unassigned" });
    const queued = (await outbox())[0];
    await db.query("update booking_outbox set status='sent' where id=$1", [queued.id]);
    await db.query(
      "update crm_calendar_events set meta=meta||$2::jsonb where id=$1",
      [id, JSON.stringify({ googleCalendarEventIds: { "805@805shutters.com": "evt-805" }, dayBeforeReminderSentAt: "2035-10-01" })],
    );
    expect((await outbox())[0]).toMatchObject({ status: "sent", payload: { syncToken: queued.payload.syncToken } });
    await db.query("update crm_calendar_events set title='Hold renamed' where id=$1", [id]);
    const again = (await outbox())[0];
    expect(again.status).toBe("pending");
    expect(again.payload.googleCalendarEventIds).toEqual({ "805@805shutters.com": "evt-805" });
    expect(again.payload.syncToken).not.toBe(queued.payload.syncToken);
  });

  it("leaves a past row alone and records a delete with the stored Google ids", async () => {
    const pastId = await addEvent({ title: "Old block", eventType: "block", assignedTo: "Mike", start: "2020-01-02 18:00Z", end: "2020-01-02 19:00Z" });
    expect(await outbox()).toHaveLength(0);
    await db.query("update crm_calendar_events set title='Still old' where id=$1", [pastId]);
    expect(await outbox()).toHaveLength(0);

    const id = await addEvent({
      title: "Future install",
      eventType: "install",
      assignedTo: "Jessica",
      meta: { googleCalendarEventIds: { "805@805shutters.com": "evt-805", "jessica@805shutters.com": "evt-jessica" } },
    });
    await db.query("delete from crm_calendar_events where id=$1", [id]);
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0].calendar_event_id).toBe(id);
    expect(rows[0].payload.action).toBe("delete");
    expect(rows[0].payload.googleCalendarEventIds).toEqual({
      "805@805shutters.com": "evt-805",
      "jessica@805shutters.com": "evt-jessica",
    });
  });

  it("updates the booking effect instead of inserting a second google row", async () => {
    const before = (await db.query<{ snapshot: { revision: string } }>("select public.booking_schedule_snapshot('2035-10') snapshot")).rows[0].snapshot.revision;
    await db.query("select public.booking_publish_ranges($1,$2,$3,$4)", [
      "2035-10",
      before,
      JSON.stringify([{ start_at: "2035-10-01T15:00:00Z", end_at: "2035-10-02T00:00:00Z" }]),
      "test@local.invalid",
    ]);
    const revision = (await db.query<{ snapshot: { revision: string } }>("select public.booking_schedule_snapshot('2035-10') snapshot")).rows[0].snapshot.revision;
    const event = candidateVisit(date, "10:00", "123 Main St", 5);
    const proof = { eventId: event.id, signature: eventSignature(event), checkedAt: new Date().toISOString(), previous: null, next: null };
    await db.query("select public.booking_commit($1,$2,$3,$4,$5,$6,$7,$8)", [
      randomUUID(),
      "hash",
      revision,
      JSON.stringify({ source: "self_booking", status: "booked", name: "Test Customer", phone: "8055550100", meta: {} }),
      JSON.stringify({ customer_name: "Test Customer", phone: "8055550100", address: "123 Main St", product_interest: "shutters", meta: {} }),
      JSON.stringify(event),
      JSON.stringify([proof]),
      JSON.stringify([
        { kind: "google_calendar", payload: { marker: "kept", windowCount: 5 } },
        { kind: "customer_sms", payload: { windowCount: 5 } },
      ]),
    ]);
    const rows = await outbox();
    const google = rows.filter((row) => row.kind === "google_calendar");
    expect(google).toHaveLength(1);
    expect(google[0].calendar_event_id).toBe(event.id);
    expect(google[0].booking_key).toBeTruthy();
    expect(google[0].payload).toMatchObject({ sync: "reconcile", action: "upsert", marker: "kept", windowCount: 5, calendarEventId: event.id });
    expect(rows.filter((row) => row.kind === "customer_sms")).toHaveLength(1);
  });
});
