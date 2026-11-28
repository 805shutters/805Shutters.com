import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DEDICATED_805_STAFF_SMS_FROM, DEDICATED_805_STAFF_SMS_SERVICE_SID, dedicatedAccountMatches } from "@/lib/notify/agent-staff-sms";
import { OWNER_ALERT_FROM_PHONE } from "@/lib/notify/owner-alert-routing";
import { GET } from "@/app/api/cron/staff-alerts/route";
import { POST } from "@/app/api/crm/staff-alert/route";
import {
  deliverHeldStaffAlerts,
  handleStaffAlert,
  send805TwilioSms,
  staffAlertClaimIsOpen,
  staffAlertCountsTowardDedupe,
  STAFF_ALERT_CLAIM_LEASE_MS,
  type NewStaffAlert,
  type StaffAlertDeps,
  type StaffAlertRecord,
  type StaffAlertStore,
} from "./staff-alert";

const TOKEN = "bot-token";
const ACCOUNT = `AC${"4".repeat(32)}`;
const SERVICE = `MG60d4${"a".repeat(28)}`;
const FROM = "+18055550199";
const MIKE = "+18055550101";
const JESSICA = "+18055550102";
const SHARED_ACCOUNT = `AC${"2".repeat(32)}`;
const SHARED_SERVICE = `MG${"3".repeat(32)}`;
const TEXT = "805 ALERT | Ada Lovelace | 805-100 | missing: color, width | from quote-bot";

const alertBody = {
  customer: "Ada Lovelace",
  job_number: "805-100",
  missing: ["color", "width"],
  from_bot: "quote-bot",
  event_type: "measure_missing",
};

function request(body: unknown, token?: string, url = "https://www.805shutters.com/api/crm/staff-alert/") {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function createMemoryStore(now: () => Date): StaffAlertStore & { rows: StaffAlertRecord[] } {
  const rows: StaffAlertRecord[] = [];
  const clone = (row: StaffAlertRecord): StaffAlertRecord => ({ ...row, missing: [...row.missing], twilio_sids: [...row.twilio_sids] });
  return {
    rows,
    async findRecent(dedupeKey, sinceIso) {
      const since = Date.parse(sinceIso);
      const found = rows.find((row) => row.dedupe_key === dedupeKey && Date.parse(row.created_at) >= since && staffAlertCountsTowardDedupe(row.status));
      return found ? clone(found) : null;
    },
    async insert(row: NewStaffAlert) {
      const saved: StaffAlertRecord = { ...row, id: randomUUID(), created_at: now().toISOString(), missing: [...row.missing], twilio_sids: [...row.twilio_sids] };
      rows.push(saved);
      return clone(saved);
    },
    async claimDue(limit) {
      const due = rows
        .filter((row) => row.status === "held" && row.deliver_at && !staffAlertClaimIsOpen(row, now()) && Date.parse(row.deliver_at) <= now().getTime())
        .sort((left, right) => (left.deliver_at || "").localeCompare(right.deliver_at || "") || left.id.localeCompare(right.id))
        .slice(0, limit);
      const claimedAt = now().toISOString();
      const leaseUntil = new Date(now().getTime() + STAFF_ALERT_CLAIM_LEASE_MS).toISOString();
      for (const row of due) {
        row.claim_token = randomUUID();
        row.claimed_at = claimedAt;
        row.lease_until = leaseUntil;
      }
      return due.map(clone);
    },
    async finish(id, claimToken, patch) {
      const row = rows.find((item) => item.id === id && item.claim_token === claimToken && item.status === "held");
      if (!row) return false;
      row.status = patch.status;
      row.sent_at = patch.sent_at;
      row.twilio_sids = [...patch.twilio_sids];
      row.error = patch.error;
      return true;
    },
  };
}

function harness(at = "2026-01-16T18:00:00.000Z") {
  const clock = { now: new Date(at) };
  const store = createMemoryStore(() => clock.now);
  const env = {
    STAFF_ALERT_BOT_TOKEN: TOKEN,
    TWILIO_805_ACCOUNT_SID: ACCOUNT,
    TWILIO_805_AUTH_TOKEN: "test-token",
    TWILIO_805_MESSAGING_SERVICE_SID: SERVICE,
    TWILIO_805_FROM_PHONE: FROM,
    MIKE_805_SALES_SMS_NUMBER: MIKE,
    JESSICA_805_SALES_SMS_NUMBER: JESSICA,
    VOICE_805_STAFF_SMS_ACCOUNT_SID: `AC${"8".repeat(32)}`,
    VOICE_805_STAFF_SMS_AUTH_TOKEN: "voice-token",
    VOICE_805_STAFF_SMS_MESSAGING_SERVICE_SID: DEDICATED_805_STAFF_SMS_SERVICE_SID,
    VOICE_805_STAFF_SMS_FROM: DEDICATED_805_STAFF_SMS_FROM,
    TWILIO_ACCOUNT_SID: SHARED_ACCOUNT,
    TWILIO_AUTH_TOKEN: "shared-token",
    TWILIO_MESSAGING_SERVICE_SID: SHARED_SERVICE,
    TWILIO_FROM_PHONE: OWNER_ALERT_FROM_PHONE,
  };
  const deps: StaffAlertDeps = {
    now: () => clock.now,
    env,
    store,
    send: send805TwilioSms,
  };
  return { clock, store, env, deps };
}

function twilioOk() {
  let n = 0;
  const fetch = vi.fn(async (_url: string, init: { headers: { Authorization: string }; body: string }) => {
    n += 1;
    return new Response(JSON.stringify({ sid: `SM${n}`, status: "queued" }), { status: 201 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/crm/staff-alert auth", () => {
  it("returns 503 when the bot token is unset", async () => {
    vi.stubEnv("STAFF_ALERT_BOT_TOKEN", "");
    const response = await POST(request(alertBody, TOKEN));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Staff alert token is not configured." });
  });

  it("returns 401 for a bad token", async () => {
    vi.stubEnv("STAFF_ALERT_BOT_TOKEN", TOKEN);
    const response = await POST(request(alertBody, "wrong-token"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("accepts a good token and then validates the body", async () => {
    vi.stubEnv("STAFF_ALERT_BOT_TOKEN", TOKEN);
    const response = await POST(request({ customer: "Ada" }, TOKEN));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "job_number is required." });
  });
});

describe("staff alert validation and event policy", () => {
  it("rejects an incomplete body", async () => {
    const { deps, store } = harness();
    const cases: Array<[unknown, string]> = [
      [{}, "customer is required."],
      [{ customer: "  " }, "customer is required."],
      [{ customer: "Ada" }, "job_number is required."],
      [{ customer: "Ada", job_number: "805-100" }, "from_bot is required."],
      [{ customer: "Ada", job_number: "805-100", from_bot: "quote-bot" }, "event_type is required."],
      [{ customer: "Ada", job_number: "805-100", from_bot: "quote-bot", event_type: "measure_missing" }, "missing is required."],
      [{ ...alertBody, missing: 4 }, "missing must be a string or an array of strings."],
      [{ ...alertBody, missing: [1] }, "missing must be a string or an array of strings."],
      [{ ...alertBody, missing: ["  "] }, "missing must be a string or an array of strings."],
      [[], "A JSON object is required."],
    ];
    for (const [body, error] of cases) {
      const response = await handleStaffAlert(request(body, TOKEN), deps);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
    expect(store.rows).toEqual([]);
  });

  it.each(["sale", "sold", "quote_sold", "contract_signed", "signed", "signing", "signature", "accepted", "Contract Signed", "sale_payment"])(
    "rejects %s and logs it",
    async (eventType) => {
      const { deps, store } = harness("2026-01-16T04:00:00.000Z");
      const fetch = twilioOk();
      const response = await handleStaffAlert(request({ ...alertBody, event_type: eventType }, TOKEN), deps);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ status: "rejected", error: "Sale and contract-signing events are not texted." });
      expect(store.rows.map((row) => row.status)).toEqual(["rejected"]);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("allows a payment event", async () => {
    const { deps, store } = harness();
    const fetch = twilioOk();
    const response = await handleStaffAlert(request({ ...alertBody, event_type: "payment_received" }, TOKEN), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "sent" });
    expect(store.rows[0]?.status).toBe("sent");
    expect(store.rows[0]?.event_type).toBe("payment_received");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("staff alert delivery", () => {
  it("sends the exact text to both staff numbers through the 805 Twilio account", async () => {
    const { deps } = harness();
    const fetch = twilioOk();
    const sent = await handleStaffAlert(request(alertBody, TOKEN), deps);
    expect(sent.status).toBe(200);
    expect(await sent.json()).toMatchObject({ status: "sent", sids: ["SM1", "SM2"] });
    expect(fetch).toHaveBeenCalledTimes(2);
    const calls = fetch.mock.calls.map((call) => ({
      url: String(call[0]),
      auth: call[1].headers.Authorization,
      form: new URLSearchParams(call[1].body),
    }));
    expect(calls.map((call) => call.form.get("To"))).toEqual([MIKE, JESSICA]);
    for (const call of calls) {
      expect(call.form.get("Body")).toBe(TEXT);
      expect(call.form.get("From")).toBe(FROM);
      expect(call.form.get("From")).not.toBe(OWNER_ALERT_FROM_PHONE);
      expect(call.form.get("MessagingServiceSid")).toBe(SERVICE);
      expect(call.url).toContain(`/Accounts/${ACCOUNT}/`);
      expect(call.url).not.toContain(SHARED_ACCOUNT);
      expect(call.auth).toBe(`Basic ${Buffer.from(`${ACCOUNT}:test-token`).toString("base64")}`);
      expect(call.auth).not.toContain("shared-token");
      expect(call.auth).not.toContain("voice-token");
      expect(call.url).not.toContain(`AC${"8".repeat(32)}`);
    }
  });

  it("does not fall back to the generic Twilio account when 805 credentials are missing", async () => {
    const { deps, store, env } = harness();
    env.TWILIO_805_ACCOUNT_SID = "";
    env.TWILIO_805_AUTH_TOKEN = "";
    env.TWILIO_805_MESSAGING_SERVICE_SID = "";
    env.TWILIO_805_FROM_PHONE = "";
    env.VOICE_805_STAFF_SMS_ACCOUNT_SID = "";
    env.VOICE_805_STAFF_SMS_AUTH_TOKEN = "";
    env.VOICE_805_STAFF_SMS_MESSAGING_SERVICE_SID = "";
    env.VOICE_805_STAFF_SMS_FROM = "";
    vi.stubEnv("TWILIO_ACCOUNT_SID", SHARED_ACCOUNT);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "shared-token");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", SHARED_SERVICE);
    vi.stubEnv("TWILIO_FROM_PHONE", OWNER_ALERT_FROM_PHONE);
    const fetch = twilioOk();
    const response = await handleStaffAlert(request(alertBody, TOKEN), deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "failed", error: "805 Twilio credentials are not configured." });
    expect(store.rows[0]?.status).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses the shared owner-alert sender and a messaging service outside the 805 prefix", async () => {
    const fetch = twilioOk();
    const sharedSender = harness();
    sharedSender.env.TWILIO_805_FROM_PHONE = OWNER_ALERT_FROM_PHONE;
    const sender = await handleStaffAlert(request(alertBody, TOKEN), sharedSender.deps);
    expect(sender.status).toBe(503);
    expect(sharedSender.store.rows[0]?.error).toBe("805 Twilio sender is not allowed.");

    const sharedService = harness();
    sharedService.env.TWILIO_805_MESSAGING_SERVICE_SID = SHARED_SERVICE;
    const service = await handleStaffAlert(request(alertBody, TOKEN), sharedService.deps);
    expect(service.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the dedicated voice staff account only when TWILIO_805 is unset", async () => {
    const blocked = harness();
    blocked.env.TWILIO_805_ACCOUNT_SID = "";
    blocked.env.TWILIO_805_AUTH_TOKEN = "";
    blocked.env.TWILIO_805_MESSAGING_SERVICE_SID = "";
    blocked.env.TWILIO_805_FROM_PHONE = "";
    const fetch = twilioOk();
    const response = await handleStaffAlert(request(alertBody, TOKEN), blocked.deps);
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();

    const explicit = harness();
    explicit.env.TWILIO_805_FROM_PHONE = OWNER_ALERT_FROM_PHONE;
    const refused = await handleStaffAlert(request(alertBody, TOKEN), explicit.deps);
    expect(refused.status).toBe(503);
    expect(explicit.store.rows[0]?.error).toBe("805 Twilio sender is not allowed.");
    expect(fetch).not.toHaveBeenCalled();
  });

  const dedicatedVoiceAccount = process.env.VOICE_805_STAFF_SMS_ACCOUNT_SID_FIXTURE || "";
  it.skipIf(!dedicatedVoiceAccount || !dedicatedAccountMatches(dedicatedVoiceAccount))("sends with the voice staff account when TWILIO_805 is unset", async () => {
    const { deps, env } = harness();
    env.TWILIO_805_ACCOUNT_SID = "";
    env.TWILIO_805_AUTH_TOKEN = "";
    env.TWILIO_805_MESSAGING_SERVICE_SID = "";
    env.TWILIO_805_FROM_PHONE = "";
    env.VOICE_805_STAFF_SMS_ACCOUNT_SID = dedicatedVoiceAccount;
    env.VOICE_805_STAFF_SMS_AUTH_TOKEN = "voice-token";
    env.VOICE_805_STAFF_SMS_MESSAGING_SERVICE_SID = DEDICATED_805_STAFF_SMS_SERVICE_SID;
    env.VOICE_805_STAFF_SMS_FROM = DEDICATED_805_STAFF_SMS_FROM;
    const fetch = twilioOk();
    const response = await handleStaffAlert(request(alertBody, TOKEN), deps);
    expect(response.status).toBe(200);
    const call = fetch.mock.calls[0];
    expect(String(call?.[0])).toContain(`/Accounts/${dedicatedVoiceAccount}/`);
    expect(String(call?.[0])).not.toContain(SHARED_ACCOUNT);
    expect(new URLSearchParams(call?.[1].body).get("From")).toBe(DEDICATED_805_STAFF_SMS_FROM);
    expect(new URLSearchParams(call?.[1].body).get("From")).not.toBe(OWNER_ALERT_FROM_PHONE);
  });

  it("skips a normalized duplicate inside 24 hours and sends again after the window", async () => {
    const { deps, store, clock } = harness("2026-01-16T18:00:00.000Z");
    const fetch = twilioOk();
    const first = await handleStaffAlert(request(alertBody, TOKEN), deps);
    expect(first.status).toBe(200);
    clock.now = new Date("2026-01-17T18:00:00.000Z");
    const duplicate = await handleStaffAlert(request({
      customer: "  ada   lovelace ",
      job_number: "805-100",
      missing: ["Width", "color"],
      from_bot: "quote-bot",
      event_type: "Measure Missing",
    }, TOKEN), deps);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ status: "deduped" });
    expect(store.rows.map((row) => row.status)).toEqual(["sent", "deduped"]);
    clock.now = new Date("2026-01-17T18:00:01.000Z");
    const again = await handleStaffAlert(request(alertBody, TOKEN), deps);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: "sent" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});

describe("quiet hours", () => {
  const heldUntil = async (at: string, deliverAt: string) => {
    const { deps, store } = harness(at);
    const fetch = twilioOk();
    const response = await handleStaffAlert(request(alertBody, TOKEN), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "held", deliver_at: deliverAt });
    expect(store.rows[0]).toMatchObject({ status: "held", deliver_at: deliverAt });
    expect(fetch).not.toHaveBeenCalled();
  };

  it("holds 8:00 PM Pacific until the next 7:00 AM", async () => {
    await heldUntil("2026-01-16T04:00:00.000Z", "2026-01-16T15:00:00.000Z");
  });

  it("holds 11:00 PM Pacific until the next 7:00 AM", async () => {
    await heldUntil("2026-01-16T07:00:00.000Z", "2026-01-16T15:00:00.000Z");
  });

  it("holds 6:59 AM Pacific until 7:00 AM the same morning", async () => {
    await heldUntil("2026-01-16T14:59:00.000Z", "2026-01-16T15:00:00.000Z");
  });

  it("sends at 7:00 AM Pacific", async () => {
    const { deps, store } = harness("2026-01-16T15:00:00.000Z");
    const fetch = twilioOk();
    const response = await handleStaffAlert(request(alertBody, TOKEN), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "sent" });
    expect(store.rows[0]?.status).toBe("sent");
    expect(store.rows[0]?.deliver_at).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps 7:00 AM on the spring-forward and fall-back mornings", async () => {
    await heldUntil("2026-03-08T04:00:00.000Z", "2026-03-08T14:00:00.000Z");
    const springSend = harness("2026-03-08T14:00:00.000Z");
    const fetch = twilioOk();
    const sent = await handleStaffAlert(request(alertBody, TOKEN), springSend.deps);
    expect(sent.status).toBe(200);
    expect(await sent.json()).toMatchObject({ status: "sent" });
    await heldUntil("2026-11-01T03:00:00.000Z", "2026-11-01T15:00:00.000Z");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("held staff alert cron", () => {
  it("delivers a held alert once", async () => {
    const { deps, store, clock } = harness("2026-01-16T04:00:00.000Z");
    const fetch = twilioOk();
    const held = await handleStaffAlert(request(alertBody, TOKEN), deps);
    expect(await held.json()).toMatchObject({ status: "held", deliver_at: "2026-01-16T15:00:00.000Z" });
    clock.now = new Date("2026-01-16T14:59:00.000Z");
    const early = await deliverHeldStaffAlerts(deps);
    expect(await early.json()).toEqual({ status: "ok", delivered: 0, failed: 0 });
    expect(fetch).not.toHaveBeenCalled();
    clock.now = new Date("2026-01-16T15:00:00.000Z");
    const [first, second] = await Promise.all([deliverHeldStaffAlerts(deps), deliverHeldStaffAlerts(deps)]);
    const bodies = [await first.json(), await second.json()];
    expect(bodies.reduce((sum, body) => sum + body.delivered, 0)).toBe(1);
    expect(bodies.reduce((sum, body) => sum + body.failed, 0)).toBe(0);
    const third = await deliverHeldStaffAlerts(deps);
    expect(await third.json()).toEqual({ status: "ok", delivered: 0, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.rows.filter((row) => row.status === "sent")).toHaveLength(1);
    const sentCall = fetch.mock.calls[0];
    expect(new URLSearchParams(sentCall?.[1].body).get("Body")).toBe(TEXT);
  });

  it("skips a held alert while its claim lease is live and retries after the lease expires", async () => {
    const { deps, store, clock } = harness("2026-01-16T04:00:00.000Z");
    const fetch = twilioOk();
    await handleStaffAlert(request(alertBody, TOKEN), deps);
    clock.now = new Date("2026-01-16T15:00:00.000Z");
    const held = store.rows[0];
    expect(held?.status).toBe("held");
    if (!held) return;
    held.claim_token = randomUUID();
    held.claimed_at = clock.now.toISOString();
    held.lease_until = new Date(clock.now.getTime() + STAFF_ALERT_CLAIM_LEASE_MS).toISOString();
    const live = await deliverHeldStaffAlerts(deps);
    expect(await live.json()).toEqual({ status: "ok", delivered: 0, failed: 0 });
    expect(fetch).not.toHaveBeenCalled();
    clock.now = new Date(Date.parse(held.lease_until) + 1000);
    const expired = await deliverHeldStaffAlerts(deps);
    expect(await expired.json()).toEqual({ status: "ok", delivered: 1, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(held.status).toBe("sent");
    const again = await deliverHeldStaffAlerts(deps);
    expect(await again.json()).toEqual({ status: "ok", delivered: 0, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("guards the cron route with CRON_SECRET and schedules both Pacific offsets", async () => {
    const missing = await GET(new NextRequest("https://www.805shutters.com/api/cron/staff-alerts/"));
    expect(missing.status).toBe(503);
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const rejected = await GET(new NextRequest("https://www.805shutters.com/api/cron/staff-alerts/", {
      headers: { authorization: "Bearer wrong" },
    }));
    expect(rejected.status).toBe(401);
    const authorized = await GET(new NextRequest("https://www.805shutters.com/api/cron/staff-alerts/", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(authorized.status).toBe(503);
    expect(await authorized.json()).toEqual({ error: "Staff alert log is unavailable." });
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> };
    expect(config.crons.find((entry) => entry.path.includes("staff-alerts"))).toEqual({
      path: "/api/cron/staff-alerts/",
      schedule: "0 14,15 * * *",
    });
  });
});

describe("staff alert migration", () => {
  it("adds crm_staff_alerts after every existing migration and does not alter other tables", () => {
    const names = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql"));
    const file = "20261128223000_crm_staff_alerts.sql";
    expect(names.includes(file)).toBe(true);
    for (const name of names) {
      if (name !== file) expect(file > name).toBe(true);
    }
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8").toLowerCase();
    expect(sql).toContain("create table public.crm_staff_alerts");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("grant select, insert, update, delete on public.crm_staff_alerts to service_role");
    expect(sql).toContain("revoke all on public.crm_staff_alerts from public, anon, authenticated, service_role");
    expect(sql).toContain("claim_due_crm_staff_alerts");
    expect(sql).not.toMatch(/\bdrop\b/);
    expect(sql).not.toContain("alter table public.crm_quotes");
    expect(sql).not.toContain("alter table public.crm_jobs");
    expect(sql).not.toContain("references public.");
    const source = readFileSync("src/lib/crm/staff-alert.ts", "utf8");
    expect(source).not.toMatch(/process\.env\.TWILIO_(ACCOUNT_SID|AUTH_TOKEN|FROM_PHONE|MESSAGING_SERVICE_SID)\b/);
    expect(source).not.toContain("sendSms");
    expect(source).not.toContain("sold-quote");
  });
});
