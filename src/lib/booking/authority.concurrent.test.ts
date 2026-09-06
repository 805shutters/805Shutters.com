import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { bookingDatabaseFixture } from "./database-fixture";
import { candidateVisit } from "./scheduling";
import { eventSignature } from "./travel";
const enabled = process.env.BOOKING_POSTGRES_TEST === "1";
const container = `805-booking-test-${process.pid}`;
const literal = (value: unknown) =>
  `'${(typeof value === "string" ? value : JSON.stringify(value)).replaceAll("'", "''")}'`;
function sql(query: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-tAX",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
function parallelSql(query: string) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        "-tAX",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { encoding: "utf8" },
      (error, stdout, stderr) =>
        error ? reject(new Error(stderr)) : resolve(stdout.trim()),
    );
    child.stdin!.end(query);
  });
}
function request(time: string, revision: string, key = randomUUID()) {
  const event = candidateVisit("2035-10-01", time, "123 Main St", 5);
  const proof = {
    eventId: event.id,
    signature: eventSignature(event),
    checkedAt: new Date().toISOString(),
    previous: null,
    next: null,
  };
  return `select booking_commit(${literal(key)},'hash',${literal(revision)},${literal({ source: "self_booking", status: "booked", name: "Test", phone: "8055550100", meta: {} })},${literal({ customer_name: "Test", phone: "8055550100", address: "123 Main St", product_interest: "shutters", meta: {} })},${literal(event)},${literal([proof])},'[{"kind":"customer_sms","payload":{}}]');`;
}
let started = false;
describe.skipIf(!enabled)("real Postgres concurrent schedule writes", () => {
  beforeAll(async () => {
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-d",
        "--name",
        container,
        "-e",
        "POSTGRES_PASSWORD=isolated-test-only",
        "postgres:16",
      ],
      { stdio: "pipe" },
    );
    started = true;
    for (let i = 0; i < 40; i++) {
      try {
        sql("select 1;");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    sql(bookingDatabaseFixture());
  }, 30000);
  beforeEach(() => {
    sql(
      "truncate booking_outbox,booking_requests,booking_route_protections,crm_quotes,crm_calendar_events,crm_jobs,leads,sales_805_appointments,crm_availability_slots cascade; insert into crm_availability_slots(owner,start_at,end_at,status,source) values('Jessica','2035-10-01 15:00Z','2035-10-02 00:00Z','available','crm_working_ranges');",
    );
  });
  afterAll(() => {
    if (started) execFileSync("docker", ["stop", container], { stdio: "pipe" });
  }, 15000);
  it("serializes different-start overlapping bookings", async () => {
    const revision = sql("select revision from booking_schedule_state;");
    const results = await Promise.allSettled([
      parallelSql(request("10:00", revision)),
      parallelSql(request("10:30", revision)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(sql("select count(*) from leads;")).toBe("1");
    expect(sql("select count(*) from booking_outbox;")).toBe("1");
  });
  it("replays simultaneous identical requests exactly once", async () => {
    const revision = sql("select revision from booking_schedule_state;"),
      key = randomUUID();
    const query = request("10:00", revision, key);
    const results = await Promise.all([parallelSql(query), parallelSql(query)]);
    expect(JSON.parse(results[0]).calendarEventId).toBe(
      JSON.parse(results[1]).calendarEventId,
    );
    expect(sql("select count(*) from booking_requests;")).toBe("1");
  });
  it("rejects a checkout while Jessica closes the month", async () => {
    const revision = sql("select revision from booking_schedule_state;");
    const closing = parallelSql(
      `begin;select booking_publish_ranges('2035-10',${literal(revision)},'[]','test@local.invalid');select pg_sleep(0.3);commit;`,
    );
    // Wait for the closer to hold the row lock, without relying on process startup order.
    for (let i = 0; i < 40; i++) {
      if (
        sql(
          "select count(*) from pg_stat_activity where query like '%pg_sleep(0.3)%' and wait_event='PgSleep';",
        ) !== "0"
      )
        break;
      await new Promise((r) => setTimeout(r, 25));
    }
    await expect(parallelSql(request("10:00", revision))).rejects.toThrow(
      /BOOKING_STALE/,
    );
    await closing;
    expect(sql("select count(*) from leads;")).toBe("0");
  });
  it("serializes the final daily opening", async () => {
    sql(
      "insert into crm_calendar_events(title,start_at,end_at,assigned_to) select 'Other visit','2035-10-01 15:00Z'::timestamptz+make_interval(hours=>n),'2035-10-01 16:00Z'::timestamptz+make_interval(hours=>n),'Mike' from generate_series(0,2) n;",
    );
    const revision = sql("select revision from booking_schedule_state;");
    const results = await Promise.allSettled([
      parallelSql(request("13:00", revision)),
      parallelSql(request("15:00", revision)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const fresh = sql("select revision from booking_schedule_state;");
    await expect(parallelSql(request("16:00", fresh))).rejects.toThrow(
      /BOOKING_FULL/,
    );
  });
});
