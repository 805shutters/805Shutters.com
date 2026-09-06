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
  it("fails closed without the database and without a service address", async () => {
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
            "http://localhost/api/booking/availability?month=2035-10&windowCount=5",
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
