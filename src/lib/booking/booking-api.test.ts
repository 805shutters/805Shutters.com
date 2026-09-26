import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { bookingDatabaseFixture } from "./database-fixture";
const state = vi.hoisted(() => ({ client: null as unknown, after: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceClient: () => state.client,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: state.after,
}));
vi.mock("@/lib/crm/auth", async (original) => ({
  ...(await original<typeof import("@/lib/crm/auth")>()),
  requireCrmUser: async () => ({
    supabase: state.client,
    email: "test@local.invalid",
  }),
}));
vi.mock("@/lib/booking/geo", async (original) => ({
  ...(await original<typeof import("./geo")>()),
  geocodeBookingAddress: async (address: string) => ({
    configured: true,
    point: address ? { lat: 34, lng: -119 } : null,
    formattedAddress: address,
  }),
}));
vi.mock("@/lib/booking/travel", async (original) => ({
  ...(await original<typeof import("./travel")>()),
  googleDriveEstimator: () => async () => 15 * 60,
}));
import { POST as requestPOST } from "@/app/api/booking/time-request/route";
import { POST } from "@/app/api/booking/route";
import { GET as publicGET } from "@/app/api/booking/availability/route";
import { GET as staffGET } from "@/app/api/crm/availability/route";
const db = new PGlite();
const client = {
  async rpc(name: string, args: Record<string, unknown>) {
    try {
      if (!/^booking_[a-z_]+$/.test(name)) throw new Error("Unexpected RPC");
      const keys = Object.keys(args);
      const result = await db.query<{ result: unknown }>(
        `select public.${name}(${keys.map((key, i) => `${key}=>$${i + 1}`).join(",")}) result`,
        keys.map((k) =>
          typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k],
        ),
      );
      return { data: result.rows[0].result, error: null };
    } catch (error) {
      return { data: null, error: { message: (error as Error).message } };
    }
  },
  from(name: string) {
    if (name !== "booking_requests")
      throw new Error(`Unexpected direct write/read ${name}`);
    return {
      select() {
        return {
          eq(_column: string, key: string) {
            return {
              async maybeSingle() {
                const result = await db.query(
                  "select request_hash,response from booking_requests where key=$1",
                  [key],
                );
                return { data: result.rows[0] || null, error: null };
              },
            };
          },
        };
      },
    };
  },
};
beforeAll(async () => {
  await db.exec(bookingDatabaseFixture());
  state.client = client;
}, 30000);
beforeEach(async () => {
  await db.exec(
    "truncate booking_outbox,booking_requests,booking_route_protections,crm_quotes,crm_calendar_events,crm_jobs,leads,sales_805_appointments,crm_availability_slots cascade;",
  );
  state.after.mockClear();
  state.client = client;
});
afterAll(() => db.close());
const base = {
  date: "2035-10-01",
  time: "10:00",
  name: "Local Test",
  phone: "8055550100",
  address: "123 Main St",
  windowCount: 5,
};
const submit = async (body: Record<string, unknown>) => {
  const snapshot = (
    await db.query<{ result: { revision: string } }>(
      "select booking_schedule_snapshot('2035-10') result",
    )
  ).rows[0].result;
  return POST(
    new NextRequest("http://localhost/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: snapshot.revision, ...body }),
    }),
  );
};
const publish = () =>
  db.exec(
    "insert into crm_availability_slots(owner,start_at,end_at,status,source) values('Jessica','2035-10-01 15:00Z','2035-10-02 00:00Z','available','crm_working_ranges')",
  );
describe("shared public / CRM booking APIs", () => {
  it("fails closed without the database and still requires an address for commercial availability", async () => {
    state.client = null;
    expect(
      (
        await publicGET(
          new NextRequest(
            "http://localhost/api/booking/availability?month=2035-10&address=123%20Main&windowCount=5",
          ),
        )
      ).status,
    ).toBe(503);
    state.client = client;
    expect(
      (
        await publicGET(
          new NextRequest(
            "http://localhost/api/booking/availability?month=2035-10&windowCount=5&variant=commercial",
          ),
        )
      ).status,
    ).toBe(400);
  });
  it("returns zero available starts for an empty October", async () => {
    const response = await publicGET(
      new NextRequest(
        "http://localhost/api/booking/availability?month=2035-10&address=123%20Main&windowCount=5",
      ),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(
      body.days
        .flatMap((d: { slots: unknown[] }) => d.slots)
        .filter((s: { available: boolean }) => s.available),
    ).toHaveLength(0);
  });
  it("matches public and staff slots, with private reasons only in the CRM preview", async () => {
    await publish();
    const q = "month=2035-10&address=123%20Main&windowCount=5";
    const publicBody = await (
      await publicGET(
        new NextRequest(`http://localhost/api/booking/availability?${q}`),
      )
    ).json();
    const staffBody = await (
      await staffGET(
        new NextRequest(
          `http://localhost/api/crm/availability?${q}&preview=true`,
        ),
      )
    ).json();
    expect(publicBody.days).toEqual(
      staffBody.days.map((d: { slots: Array<Record<string, unknown>> }) => ({
        ...d,
        slots: d.slots.map(({ reason, ...s }) => s),
      })),
    );
    expect(JSON.stringify(publicBody)).not.toContain('"reason"');
    expect(publicBody.revision).toBe(staffBody.revision);
  });
  it("saves once, queues effects after commit, and preserves the result on retry", async () => {
    await publish();
    const key = randomUUID();
    const first = await submit({ ...base, idempotencyKey: key });
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.assignedTo).toBe("Jessica");
    expect(state.after).toHaveBeenCalledTimes(1);
    const retry = await submit({ ...base, idempotencyKey: key });
    expect(retry.status).toBe(200);
    expect((await retry.json()).calendarEventId).toBe(body.calendarEventId);
    expect(state.after).toHaveBeenCalledTimes(1);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from booking_outbox",
        )
      ).rows[0].n,
    ).toBe(8);
  });
  it("opens a one-hour residential calendar without collecting any details", async () => {
    await publish();
    const response = await publicGET(new NextRequest("http://localhost/api/booking/availability?month=2035-10"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.addressChecked).toBe(false);
    expect(result.appointmentDurationMinutes).toBe(60);
    expect(result.days.some((day: { available: boolean }) => day.available)).toBe(true);
    const checked = await publicGET(new NextRequest("http://localhost/api/booking/availability?month=2035-10&address=123%20Main&windowCount=31"));
    expect(await checked.json()).toMatchObject({ addressChecked: true, appointmentDurationMinutes: 60 });
  });
  it.each([undefined, null, "", 31, 500])("books a fixed hour with optional count %s across all records and outbox effects", async count => {
    await publish();
    const response = await submit({ ...base, windowCount: count, variant: "standard", idempotencyKey: randomUUID() });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.notificationsQueued).toBe(true);
    expect(result).not.toHaveProperty("smsConfirmationSent");
    const savedCount = count || null;
    const events = await db.query<{ minutes: number; meta: Record<string, unknown> }>("select extract(epoch from (end_at-start_at))/60 as minutes,meta from crm_calendar_events");
    expect(Number(events.rows[0].minutes)).toBe(60);
    expect(events.rows[0].meta).toMatchObject({ windowCount: savedCount, bookingDurationPolicy: "residential_fixed_60_v1", appointmentDurationMinutes: 60 });
    const jobs = await db.query<{ minutes: number; meta: Record<string, unknown> }>("select extract(epoch from (appointment_end-appointment_start))/60 as minutes,meta from crm_jobs");
    expect(Number(jobs.rows[0].minutes)).toBe(60);
    expect(jobs.rows[0].meta.windowCount).toBe(savedCount);
    const leads = await db.query<{ meta: Record<string, unknown> }>("select meta from leads");
    expect(leads.rows[0].meta.windowCount).toBe(savedCount);
    const effects = await db.query<{ payload: Record<string, unknown> }>("select payload from booking_outbox");
    expect(effects.rows).toHaveLength(8);
    for (const { payload } of effects.rows) {
      expect(payload.windowCount).toBe(savedCount);
      expect(payload.appointmentDurationMinutes).toBe(60);
      expect(Date.parse(String(payload.endAt)) - Date.parse(String(payload.startAt))).toBe(3600000);
    }
    // after() is intercepted: no messages, webhooks, or external calendar writes occur.
    expect(state.after).toHaveBeenCalledTimes(1);
  });
  it("preserves commercial window-count duration and requires a count", async () => {
    await publish();
    expect((await submit({ ...base, variant: "commercial", windowCount: null, idempotencyKey: randomUUID() })).status).toBe(400);
    expect((await submit({ ...base, variant: "commercial", windowCount: 31, idempotencyKey: randomUUID() })).status).toBe(200);
    const events = await db.query<{ minutes: number; meta: Record<string, unknown> }>("select extract(epoch from (end_at-start_at))/60 as minutes,meta from crm_calendar_events");
    expect(Number(events.rows[0].minutes)).toBe(180);
    expect(events.rows[0].meta).not.toHaveProperty("bookingDurationPolicy");
  });
  it("never commits without the required address even when calendar openings are visible", async () => {
    await publish();
    expect((await submit({ ...base, address: "", windowCount: null, idempotencyKey: randomUUID() })).status).toBe(400);
    expect(state.after).not.toHaveBeenCalled();
  });
  it("rejects a stale time without writes or messages", async () => {
    const response = await submit({ ...base, idempotencyKey: randomUUID() });
    expect(response.status).toBe(409);
    expect(state.after).not.toHaveBeenCalled();
    expect(
      (await db.query<{ n: number }>("select count(*)::int n from leads"))
        .rows[0].n,
    ).toBe(0);
  });
  it("rejects malformed dates, durations and request keys", async () => {
    for (const changed of [
      { date: "2035-02-30" },
      { time: "10:15" },
      { windowCount: 0 },
      { windowCount: "garbage" },
      { windowCount: 1.5 },
      { variant: "unknown" },
      { idempotencyKey: "bad" },
    ])
      expect(
        (await submit({ ...base, idempotencyKey: randomUUID(), ...changed }))
          .status,
      ).toBe(400);
  });
  it("rejects an outdated revision even if the requested hour is still open", async () => {
    await publish();
    const response = await submit({
      ...base,
      idempotencyKey: randomUUID(),
      revision: "outdated",
    });
    expect(response.status).toBe(409);
    expect(state.after).not.toHaveBeenCalled();
    expect(
      (await db.query<{ n: number }>("select count(*)::int n from leads"))
        .rows[0].n,
    ).toBe(0);
  });
});

const requestTime = async (overrides: Record<string, unknown> = {}, headers = {}) => {
  const revision = (await db.query<{ revision: string }>("select revision::text from booking_schedule_state")).rows[0].revision;
  return requestPOST(new NextRequest("http://localhost/api/booking/time-request/", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ ...base, time: "18:00", windowCount: null, idempotencyKey: randomUUID(), revision, ...overrides }),
  }));
};
describe("pending consultation time requests", () => {
  it("offers 8 AM–6 PM request starts outside published hours, with conflicts gray", async () => {
    await db.exec("insert into crm_calendar_events(title,assigned_to,start_at,end_at) values('Busy','Jessica','2035-10-01 16:00Z','2035-10-01 17:00Z')");
    const response = await publicGET(new NextRequest("http://localhost/api/booking/availability?month=2035-10&mode=request"));
    const body = await response.json();
    expect(body.mode).toBe("request");
    expect(body.addressChecked).toBe(false);
    const day = body.days[0];
    expect(day.slots).toHaveLength(21);
    expect(day.slots[0]).toMatchObject({ time: "08:00", available: true });
    expect(day.slots.at(-1)).toMatchObject({ time: "18:00", available: true });
    expect(day.slots.find((s: {time:string}) => s.time === "09:00").available).toBe(false);
    expect(day.slots.find((s: {time:string}) => s.time === "08:30").available).toBe(false);
    expect(day.slots[0]).not.toHaveProperty("reason");
  });
  it("saves an unknown-count pending request atomically, with owner-only notification and no appointment", async () => {
    const key = randomUUID();
    const response = await requestTime({ idempotencyKey: key, notes: "Gate code 1234", productTypes: ["Shutters"] });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.status).toBe("pending");
    const retry = await requestTime({ idempotencyKey: key, notes: "Gate code 1234", productTypes: ["Shutters"], revision: "obsolete" });
    expect(await retry.json()).toEqual(result);
    const job = (await db.query("select status,sales_owner,appointment_start,appointment_end,meta from crm_jobs")).rows[0];
    expect(job).toMatchObject({ status: "follow_up", sales_owner: "Mike", appointment_start: null, appointment_end: null,
      meta: { requestStatus: "pending", windowCount: null, notes: "Gate code 1234", appointmentDurationMinutes: 60 } });
    const counts = (await db.query("select (select count(*) from leads)::int leads,(select count(*) from crm_calendar_events)::int events,(select count(*) from crm_quotes)::int quotes,(select count(*) from booking_outbox)::int effects")).rows[0];
    expect(counts).toEqual({ leads: 1, events: 0, quotes: 0, effects: 1 });
    const outbox = (await db.query<{kind:string;payload:{startAt:string}}>("select kind,payload from booking_outbox")).rows[0];
    expect(outbox).toMatchObject({ kind: "owner_time_request_sms", payload: { notes: "Gate code 1234" } });
    expect(new Date((outbox.payload as { startAt:string }).startAt).toISOString()).toBe("2035-10-02T01:00:00.000Z");
    expect((await requestTime({ idempotencyKey: key, notes: "Changed" })).status).toBe(409);
  });
  it("rejects changed schedules and occupied requests without partial records", async () => {
    expect((await requestTime({ revision: "old" })).status).toBe(409);
    await db.exec("insert into crm_calendar_events(title,assigned_to,start_at,end_at) values('Busy','Jessica','2035-10-02 01:00Z','2035-10-02 02:00Z')");
    expect((await requestTime()).status).toBe(409);
    expect((await db.query<{n:number}>("select count(*)::int n from leads")).rows[0].n).toBe(0);
  });
  it("preserves normal commercial rules and rejects malformed/foreign-origin submissions", async () => {
    expect((await requestTime({ variant: "commercial" })).status).toBe(400);
    expect((await publicGET(new NextRequest("http://localhost/api/booking/availability?month=2035-10&mode=request&variant=commercial"))).status).toBe(400);
    for (const overrides of [{time:"18:30"},{time:"07:30"},{date:"2035-02-30"},{phone:"nope"},{email:"nope"},{windowCount:-1}])
      expect((await requestTime(overrides)).status).toBe(400);
    expect((await requestTime({}, { origin: "https://foreign.invalid" })).status).toBe(403);
  });
  it("fails before saving if production SMS configuration is missing", async () => {
    vi.stubEnv("BOOKING_DELIVERY_ENABLED", "true");
    vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", undefined);
    try {
      expect((await requestTime()).status).toBe(503);
      expect((await db.query<{n:number}>("select count(*)::int n from leads")).rows[0].n).toBe(0);
    } finally { vi.unstubAllEnvs(); }
  });
  it("bounds repeated owner alerts while permitting replay", async () => {
    const key = randomUUID();
    expect((await requestTime({ idempotencyKey: key })).status).toBe(200);
    expect((await requestTime({ time: "17:30" })).status).toBe(200);
    expect((await requestTime({ time: "17:00" })).status).toBe(200);
    expect((await requestTime({ time: "16:30" })).status).toBe(429);
    expect((await requestTime({ idempotencyKey: key })).status).toBe(200);
  });
});
