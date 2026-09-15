import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/weekly-sales/route";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { loadWeeklySalesSmsReport, runWeeklySalesSms, weeklySalesCutoff } from "@/lib/crm/weekly-sales-sms";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: vi.fn() }));

type Row = Record<string, unknown>;
function database(quotes: Row[] = []) {
  const events = new Map<string, Row>();
  let failTable = "";
  const tables: Record<string, Row[]> = { crm_quotes: quotes };
  const client = { from(table: string) {
    let operation = "read", payload: Row = {}, filterId = "";
    const result = () => {
      if (table === failTable) return { data: null, error: { message: "database unavailable" } };
      if (table !== "crm_activity_events") return { data: tables[table] || [], error: null };
      if (operation === "insert") {
        const id = String(payload.id);
        if (events.has(id)) return { data: null, error: { code: "23505" } };
        events.set(id, payload);
      } else if (operation === "update") events.set(filterId, { ...events.get(filterId), ...payload });
      return { data: events.get(filterId) || null, error: null };
    };
    const query = {
      select() { return query; }, order() { return query; },
      insert(row: Row) { operation = "insert"; payload = row; return query; },
      update(row: Row) { operation = "update"; payload = row; return query; },
      eq(_key: string, value: string) { filterId = value; return query; },
      single() { return Promise.resolve(result()); },
      range(from: number, to: number) { const value = result(); return Promise.resolve({ ...value, data: value.error ? null : (value.data as Row[]).slice(from, to + 1) }); },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve); },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { client, events, fail: (table: string) => { failTable = table; } };
}

const now = new Date("2026-09-21T00:00:00Z");
function quote(id: string, signedAt: string | null, total = 100.25): Row {
  return { id, job_id: `job-${id}`, quote_number: id, customer_name: "Example", created_at: "2026-08-01T00:00:00Z",
    signed_at: signedAt, quote_total: total, meta: {} };
}

beforeEach(() => {
  vi.stubEnv("JESSICA_805_SALES_SMS_NUMBER", "8055550101");
  vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "8055550102");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "test-account");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token");
  vi.stubEnv("TWILIO_FROM_PHONE", "+18055550100");
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("weekly sales SMS", () => {
  it.each([
    ["2026-09-21T00:00:00Z", "2026-09-21T00:00:00.000Z"],
    ["2026-09-21T00:59:59Z", "2026-09-21T00:00:00.000Z"],
    ["2026-09-21T01:00:00Z", null],
    ["2026-09-20T23:59:59Z", null],
    ["2026-09-20T00:00:00Z", null],
    ["2026-03-09T00:00:00Z", "2026-03-09T00:00:00.000Z"],
    ["2026-03-09T01:00:00Z", null],
    ["2026-11-02T00:00:00Z", null],
    ["2026-11-02T01:00:00Z", "2026-11-02T01:00:00.000Z"],
    ["2027-01-04T01:00:00Z", "2027-01-04T01:00:00.000Z"],
  ])("uses Sunday 5 PM Pacific at %s", (input, expected) => {
    expect(weeklySalesCutoff(new Date(input))?.toISOString() || null).toBe(expected);
  });

  it("uses this week's original signing evidence and the fixed 5 PM cutoff", async () => {
    const db = database([
      quote("old-quote", "2026-09-14T07:00:00Z"),
      quote("at-cutoff", now.toISOString(), 50.10),
      quote("after-cutoff", "2026-09-21T00:00:00.001Z", 5000),
      quote("last-week", "2026-09-14T06:59:59Z", 9000), quote("unsigned", null),
    ]);
    const report = await loadWeeklySalesSmsReport(db.client, now);
    expect(report.week.startDate).toBe("2026-09-14");
    expect(report.week.endDate).toBe("2026-09-20");
    expect(report.week.totalCents).toBe(15035);
    expect(report.body).toBe("805 Shutters weekly sales — Mon, Sep 14–Sun, Sep 20, 2026. Gross signed sales as of Sunday 5:00 PM Pacific: $150.35.");
  });

  it("sends a verified empty week as zero and marks evidence gaps", async () => {
    const empty = await loadWeeklySalesSmsReport(database().client, now);
    expect(empty.body).toContain("$0.00.");
    expect(empty.body).not.toContain("review");
    const gaps = await loadWeeklySalesSmsReport(database([{ ...quote("gap", null), customer_signature: "Example" }]).client, now);
    expect(gaps.body).toContain("1 signing record needs review");
  });

  it("sends once to only Jessica and Mike across repeated and concurrent invocations", async () => {
    vi.stubEnv("CRM_SOLD_QUOTE_SMS_NUMBERS", "8055550199");
    const db = database([quote("one", "2026-09-15T12:00:00Z")]);
    const sender = vi.fn(async () => ({ sent: true, sid: "SM-test" }));
    await Promise.all([runWeeklySalesSms(db.client, now, sender), runWeeklySalesSms(db.client, now, sender)]);
    await runWeeklySalesSms(db.client, new Date("2026-09-21T00:30:00Z"), sender);
    expect(sender.mock.calls.map(call => (call as unknown as [{ to: string }])[0].to).sort()).toEqual(["+18055550101", "+18055550102"]);
    expect([...db.events.values()].filter(row => row.action === "weekly_sales_sms.accepted")).toHaveLength(2);
    expect([...db.events.values()].filter(row => row.action === "weekly_sales_sms.report")).toHaveLength(1);
  });

  it("preserves the same saved message and never blindly resends an uncertain SMS", async () => {
    const rows = [quote("one", "2026-09-15T12:00:00Z")];
    const db = database(rows);
    const sender = vi.fn().mockResolvedValueOnce({ sent: false, error: "network timeout" }).mockResolvedValue({ sent: true, sid: "SM-mike" });
    expect(await runWeeklySalesSms(db.client, now, sender)).toMatchObject({ accepted: 1, failed: 1 });
    rows[0].quote_total = 50000;
    expect(await runWeeklySalesSms(db.client, now, sender)).toMatchObject({ skipped: 2, totalCents: 10025 });
    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender.mock.calls[0][0].body).toBe(sender.mock.calls[1][0].body);
  });

  it.each(["crm_quotes", "crm_customer_contracts", "crm_activity_events"])("sends nothing when %s fails", async table => {
    const db = database(); db.fail(table);
    const sender = vi.fn();
    await expect(runWeeklySalesSms(db.client, now, sender)).rejects.toBeTruthy();
    expect(sender).not.toHaveBeenCalled();
  });

  it("does not send outside the reporting hour or with missing recipients", async () => {
    const sender = vi.fn(); const db = database();
    expect(await runWeeklySalesSms(db.client, new Date("2026-09-15T00:00:00Z"), sender)).toMatchObject({ outsideSendHour: true });
    vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "");
    await expect(runWeeklySalesSms(db.client, now, sender)).rejects.toThrow("Jessica and Mike");
    expect(sender).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated cron requests including missing server secrets", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new NextRequest("https://example.test/api/cron/weekly-sales"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "secret");
    expect((await GET(new NextRequest("https://example.test/api/cron/weekly-sales"))).status).toBe(401);
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();
  });
});
