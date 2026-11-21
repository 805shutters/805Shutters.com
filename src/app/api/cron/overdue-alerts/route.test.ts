import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmQuote } from "@/lib/crm/types";
import { sendEmail } from "@/lib/notify/email";
import { sendSms } from "@/lib/notify/twilio";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { GET, POST } from "./route";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: vi.fn() }));
vi.mock("@/lib/notify/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/notify/twilio", () => ({ sendSms: vi.fn() }));

function request(method: "GET" | "POST", authorization?: string) {
  return new NextRequest("https://www.805shutters.com/api/cron/overdue-alerts/", {
    method,
    headers: authorization ? { authorization } : {},
  });
}

async function call(method: "GET" | "POST", authorization?: string) {
  const incoming = request(method, authorization);
  return method === "GET" ? GET(incoming) : POST(incoming);
}

function quote(): CrmQuote {
  return {
    id: "quote-ada",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    job_id: "job-ada",
    quote_number: "Q-1001",
    status: "sold",
    quote_total: 1000,
    materials_cost: 0,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 250,
    balance_due: 750,
    sold_by: null,
    sent_at: null,
    approved_at: null,
    sold_at: "2020-01-01T00:00:00.000Z",
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    share_token: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    quote_group_id: null,
    quote_label: null,
    meta: {},
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    customer_email: "ada@customer.test",
    customer_phone: "+18055550111",
    customer_address: null,
    notes: null,
    customer_name: "Ada Lovelace",
  };
}

function createDb(quotes: CrmQuote[] = []) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    crm_quotes: quotes,
    crm_quote_bookkeeping_entries: [],
    crm_quote_bookkeeping_payments: [],
    crm_activity_events: [],
  };
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      return {
        select: async () => ({ data: tables[table] ?? [], error: null }),
        update(values: Record<string, unknown>) {
          return {
            eq: async () => {
              updates.push({ table, values });
              return { error: null };
            },
          };
        },
        insert: async () => ({ error: null }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, updates, tables };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_FROM", "805 Shutters <805@805shutters.com>");
  vi.mocked(sendEmail).mockResolvedValue({ sent: true, id: "re_123" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("overdue alerts cron route", () => {
  it.each(["GET", "POST"] as const)("returns 401 JSON for a missing or bad %s token", async (method) => {
    vi.stubEnv("FOLLOW_UP_CRON_SECRET", "follow-secret");
    vi.stubEnv("CRON_SECRET", "cron-secret");

    const missing = await call(method);
    const bad = await call(method, "Bearer nope");

    expect(missing.status).toBe(401);
    expect(bad.status).toBe(401);
    expect(missing.headers.get("content-type")).toContain("application/json");
    expect(await missing.json()).toEqual({ message: "Overdue-alerts cron is not authorized." });
    expect(await bad.json()).toEqual({ message: "Overdue-alerts cron is not authorized." });
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("returns 503 when neither cron secret is configured", async () => {
    vi.stubEnv("FOLLOW_UP_CRON_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");

    const response = await call("GET", "Bearer anything");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: "Overdue-alerts cron secret is not configured." });
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("accepts either configured secret and sends nothing when no row is overdue", async () => {
    vi.stubEnv("FOLLOW_UP_CRON_SECRET", "follow-secret");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.mocked(getSupabaseServiceClient).mockReturnValue(createDb().client);

    const byFollowUpSecret = await call("GET", "Bearer follow-secret");
    const byCronSecret = await call("POST", "Bearer cron-secret");

    expect(byFollowUpSecret.status).toBe(200);
    expect(await byFollowUpSecret.json()).toEqual({ alerted: 0, emailed: 0, resendId: null });
    expect(byCronSecret.status).toBe(200);
    expect(await byCronSecret.json()).toEqual({ alerted: 0, emailed: 0, resendId: null });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("returns 502 and stamps nothing when the digest email fails", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.mocked(sendEmail).mockResolvedValue({ sent: false, error: "mailbox down" });
    const ada = quote();
    const db = createDb([ada]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(db.client);

    const response = await call("GET", "Bearer cron-secret");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ alerted: 0, emailed: 0, resendId: null });
    expect(sendSms).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("wcbot+805@mail.grokbot.com");
    expect(db.updates).toEqual([]);
    expect(ada.meta).toEqual({});
  });

  it("schedules overdue alerts on a trailing-slash path and leaves stale quotes unchanged", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const overdue = config.crons.find((cron) => cron.path.includes("overdue-alerts"));
    expect(overdue?.path.endsWith("/")).toBe(true);
    expect(overdue).toEqual({ path: "/api/cron/overdue-alerts/", schedule: "13 17 * * *" });

    const stale = config.crons.find((cron) => cron.path.includes("stale-quotes"));
    if (stale) expect(stale).toEqual({ path: "/api/cron/stale-quotes", schedule: "19 17 * * *" });
  });
});
