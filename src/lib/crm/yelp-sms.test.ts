import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { buildDashboardData, loadCrmDashboardData } from "./backend";
import { CrmAuthError, requireCrmUser } from "./auth";
import { listYelpSmsStatuses, sendCustomerYelpSms } from "./yelp-sms";
import { YELP_PAGE_URL, yelpSmsBody, yelpSmsPhone } from "./yelp-sms-shared";
import { GET, POST } from "@/app/api/crm/yelp-sms/route";
import type { CrmJob } from "./types";

vi.mock("./backend", async original => ({ ...await original<typeof import("./backend")>(), loadCrmDashboardData: vi.fn() }));
vi.mock("./auth", async original => ({ ...await original<typeof import("./auth")>(), requireCrmUser: vi.fn() }));

const jobId = "10000000-0000-4000-8000-000000000001";
const actor = { email: "805@805shutters.com", userId: "10000000-0000-4000-8000-000000000099" };
const input = { itemId: `job:${jobId}`, expectedPhone: "+18055550100" };
type Row = Record<string, unknown>;

function database() {
  const events = new Map<string, Row>();
  const errors = { insert: false, read: false, update: false };
  const client = { from(table: string) {
    expect(table).toBe("crm_activity_events");
    let operation = "read", payload: Row = {}, filters: [string, unknown][] = [], selectedActions: string[] = [];
    const result = () => {
      if (errors[operation as keyof typeof errors]) return { data: null, error: { message: "Database unavailable" } };
      if (operation === "insert") {
        const id = String(payload.id);
        if (events.has(id)) return { data: null, error: { code: "23505" } };
        events.set(id, { ...payload, created_at: new Date().toISOString() });
        return { data: null, error: null };
      }
      const matches = [...events.values()].filter(row => filters.every(([key, value]) => row[key] === value)
        && (!selectedActions.length || selectedActions.includes(String(row.action))));
      if (operation === "update") matches.forEach(row => Object.assign(row, payload));
      return { data: structuredClone(matches), error: null };
    };
    const query = {
      select() { return query; }, order() { return query; },
      insert(row: Row) { operation = "insert"; payload = row; return query; },
      update(row: Row) { operation = "update"; payload = row; return query; },
      eq(key: string, value: unknown) { filters.push([key, value]); return query; },
      in(_key: string, values: string[]) { selectedActions = values; return query; },
      single() { const value = result(); return Promise.resolve({ ...value, data: value.data?.[0] || null }); },
      range(from: number, to: number) { const value = result(); return Promise.resolve({ ...value, data: value.data?.slice(from, to + 1) || null }); },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve); }
    };
    return query;
  } } as unknown as SupabaseClient;
  return { client, events, errors };
}

function dashboard(phone: string | null = "(805) 555-0100") {
  return { ...buildDashboardData({ jobs: [{ id: jobId, customer_name: "Avery Sample", phone, status: "scheduled", product_interest: "Shutters", meta: {} } as CrmJob],
    quotes: [], events: [], customers: [], products: [], contracts: [], entries: [], payments: [], credits: [], expenses: [],
    installationInvoiceEmails: [], kenPayments: [], openingBalance: 0, payoffTarget: 500000 }), technicalMeasureSubmissions: [], ownedActions: [], integrationHealth: [], loadWarnings: [] };
}
const sender = () => vi.fn(async () => ({ sent: true, sid: "SM-test-only" }));

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "test-only");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "test-only");
  vi.stubEnv("TWILIO_FROM_PHONE", "+18055550199");
  vi.mocked(loadCrmDashboardData).mockResolvedValue(dashboard());
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Yelp text workflow", () => {
  it("uses Mike's exact link and an informational personalized message", () => {
    expect(yelpSmsBody(" Avery Sample ")).toBe(`Hi Avery, here's 805 Shutters on Yelp: ${YELP_PAGE_URL}`);
    expect(yelpSmsBody("")).toMatch(/^Hi,/);
    expect(yelpSmsPhone("805-555-0100")).toBe("+18055550100");
    expect(yelpSmsPhone("123")).toBeNull();
    expect(yelpSmsPhone("0000000000")).toBeNull();
  });

  it("texts only the server-resolved number, records the provider SID, and reads it back", async () => {
    const db = database(), sms = sender();
    expect(await sendCustomerYelpSms(db.client, { ...input, phone: "8055559999", customerName: "Forged" }, actor, sms))
      .toMatchObject({ status: "accepted", duplicate: false, warning: null });
    expect(sms).toHaveBeenCalledExactlyOnceWith({ to: input.expectedPhone, body: yelpSmsBody("Avery Sample") });
    expect([...db.events.values()][0]).toMatchObject({ action: "yelp_sms.accepted", actor_email: actor.email,
      after_data: { provider: { sid: "SM-test-only" } } });
    expect(await listYelpSmsStatuses(db.client)).toMatchObject([{ phone: input.expectedPhone, status: "accepted" }]);
  });

  it("atomically blocks concurrent sends and remains blocked after a reload", async () => {
    const db = database(), sms = sender();
    await Promise.all([sendCustomerYelpSms(db.client, input, actor, sms), sendCustomerYelpSms(db.client, input, actor, sms)]);
    expect(sms).toHaveBeenCalledTimes(1);
    expect(await sendCustomerYelpSms(db.client, input, actor, sms)).toMatchObject({ duplicate: true, status: "accepted" });
    expect(sms).toHaveBeenCalledTimes(1);
  });

  it("also blocks another job pointing to the same customer cell", async () => {
    const db = database(), sms = sender();
    await sendCustomerYelpSms(db.client, input, actor, sms);
    const other = dashboard(); other.jobs[0].id = actor.userId;
    vi.mocked(loadCrmDashboardData).mockResolvedValue(other);
    expect(await sendCustomerYelpSms(db.client, { ...input, itemId: `job:${actor.userId}` }, actor, sms)).toMatchObject({ duplicate: true });
    expect(sms).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { ...input, itemId: "Avery" }, { ...input, expectedPhone: "bad" }])("rejects unsafe input %j before sending", async payload => {
    const db = database(), sms = sender();
    await expect(sendCustomerYelpSms(db.client, payload, actor, sms)).rejects.toMatchObject({ status: 400 });
    expect(sms).not.toHaveBeenCalled(); expect(db.events.size).toBe(0);
  });

  it.each([null, "8055550101"])("blocks missing or changed saved number %s", async phone => {
    vi.mocked(loadCrmDashboardData).mockResolvedValue(dashboard(phone));
    const db = database(), sms = sender();
    await expect(sendCustomerYelpSms(db.client, input, actor, sms)).rejects.toBeInstanceOf(CrmAuthError);
    expect(sms).not.toHaveBeenCalled(); expect(db.events.size).toBe(0);
  });

  it("blocks incomplete source data and unavailable SMS configuration", async () => {
    const db = database(), sms = sender();
    vi.mocked(loadCrmDashboardData).mockResolvedValue({ ...dashboard(), loadWarnings: ["Missing jobs"] });
    await expect(sendCustomerYelpSms(db.client, input, actor, sms)).rejects.toMatchObject({ status: 503 });
    vi.mocked(loadCrmDashboardData).mockResolvedValue(dashboard());
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    await expect(sendCustomerYelpSms(db.client, input, actor, sms)).rejects.toMatchObject({ status: 503 });
    expect(sms).not.toHaveBeenCalled(); expect(db.events.size).toBe(0);
  });

  it.each(["insert", "read"] as const)("requires a verified durable claim when %s fails", async operation => {
    const db = database(), sms = sender(); db.errors[operation] = true;
    await expect(sendCustomerYelpSms(db.client, input, actor, sms)).rejects.toMatchObject({ status: 502 });
    expect(sms).not.toHaveBeenCalled();
  });

  it("retains an uncertain send and never automatically retries it", async () => {
    const db = database(), sms = vi.fn(async () => { throw new Error("timeout"); });
    expect(await sendCustomerYelpSms(db.client, input, actor, sms)).toMatchObject({ status: "needs_review" });
    expect(await sendCustomerYelpSms(db.client, input, actor, sms)).toMatchObject({ duplicate: true, status: "needs_review" });
    expect(sms).toHaveBeenCalledTimes(1);
  });

  it("requires a provider ID and warns when the accepted send cannot be saved", async () => {
    const db = database();
    expect(await sendCustomerYelpSms(db.client, input, actor, vi.fn(async () => ({ sent: true }))))
      .toMatchObject({ status: "needs_review" });
    const other = database(); other.errors.update = true;
    expect(await sendCustomerYelpSms(other.client, input, actor, sender())).toMatchObject({ status: "accepted", warning: expect.stringContaining("log check") });
    expect(await listYelpSmsStatuses(other.client)).toMatchObject([{ status: "needs_review" }]);
  });

  it("requires CRM authorization for both history and sending", async () => {
    vi.mocked(requireCrmUser).mockRejectedValue(new CrmAuthError(401, "CRM session is required."));
    expect((await GET(new NextRequest("http://localhost/api/crm/yelp-sms"))).status).toBe(401);
    expect((await POST(new NextRequest("http://localhost/api/crm/yelp-sms", { method: "POST", body: JSON.stringify(input) }))).status).toBe(401);
  });
});
