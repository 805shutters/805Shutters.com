import { afterEach, describe, expect, it, vi } from "vitest";
import { OWNER_ALERT_FROM_PHONE } from "./owner-alert-routing";
import { DEDICATED_805_STAFF_SMS_FROM, DEDICATED_805_STAFF_SMS_SERVICE_SID, dedicatedAccountMatches, readAgentStaffSmsConfig, sendAgentStaffBookingSms } from "./agent-staff-sms";

const dedicatedAccount = process.env.VOICE_805_STAFF_SMS_ACCOUNT_SID_FIXTURE || "";
const sharedAccount = `AC${"2".repeat(32)}`;
const sharedService = `MG${"3".repeat(32)}`;
const dedicatedFrom = DEDICATED_805_STAFF_SMS_FROM;

function dedicatedEnv() {
    vi.stubEnv("VOICE_805_STAFF_SMS_ACCOUNT_SID", dedicatedAccount || `AC${"4".repeat(32)}`);
  vi.stubEnv("VOICE_805_STAFF_SMS_AUTH_TOKEN", "dedicated-token");
  vi.stubEnv("VOICE_805_STAFF_SMS_MESSAGING_SERVICE_SID", DEDICATED_805_STAFF_SMS_SERVICE_SID);
  vi.stubEnv("VOICE_805_STAFF_SMS_FROM", dedicatedFrom);
  vi.stubEnv("TWILIO_ACCOUNT_SID", sharedAccount);
  vi.stubEnv("TWILIO_AUTH_TOKEN", "shared-token");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", sharedService);
  vi.stubEnv("TWILIO_FROM_PHONE", "+18055550101");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("dedicated 805 staff SMS configuration", () => {
  it("rejects missing, shared, and owner-alert sender configuration without a network call", () => {
    expect(readAgentStaffSmsConfig({}).ok).toBe(false);
    dedicatedEnv();
    delete process.env.VOICE_805_STAFF_SMS_AUTH_TOKEN;
    expect(readAgentStaffSmsConfig().ok).toBe(false);
    vi.stubEnv("VOICE_805_STAFF_SMS_AUTH_TOKEN", "dedicated-token");
    vi.stubEnv("VOICE_805_STAFF_SMS_MESSAGING_SERVICE_SID", sharedService);
    expect(readAgentStaffSmsConfig()).toMatchObject({ ok: false });
    vi.stubEnv("VOICE_805_STAFF_SMS_MESSAGING_SERVICE_SID", DEDICATED_805_STAFF_SMS_SERVICE_SID);
    vi.stubEnv("VOICE_805_STAFF_SMS_FROM", OWNER_ALERT_FROM_PHONE);
    expect(readAgentStaffSmsConfig()).toMatchObject({ ok: false, reason: expect.stringContaining("not allowed") });
    vi.stubEnv("VOICE_805_STAFF_SMS_FROM", "+18055550199");
    expect(readAgentStaffSmsConfig()).toMatchObject({ ok: false, reason: expect.stringContaining("not the 805 number") });
    vi.stubEnv("VOICE_805_STAFF_SMS_FROM", dedicatedFrom);
    vi.stubEnv("VOICE_805_STAFF_SMS_ACCOUNT_SID", sharedAccount);
    expect(readAgentStaffSmsConfig()).toMatchObject({ ok: false, reason: expect.stringContaining("not the 805 account") });
  });
});

describe("sendAgentStaffBookingSms", () => {
  it.skipIf(!dedicatedAccount || !dedicatedAccountMatches(dedicatedAccount))("posts both staff recipients through the dedicated account, service, and from number", async () => {
    dedicatedEnv();
    const fetch = vi.fn(async (url: string, init: { headers: { Authorization: string }; body: string }) => {
      if (!url.startsWith("https://api.twilio.com/") || !init.body) throw new Error("missing request");
      return new Response(JSON.stringify({ sid: "SMstaff", status: "queued" }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetch);
    const jessica = await sendAgentStaffBookingSms({ to: "+18055551111", body: "booked VIA AGENT Jessica" });
    const mike = await sendAgentStaffBookingSms({ to: "+18055552222", body: "booked VIA AGENT Mike" });
    expect(jessica).toEqual({ sent: true, sid: "SMstaff", providerStatus: "queued" });
    expect(mike.sent).toBe(true);
    const calls = fetch.mock.calls.map((call) => ({
      url: call[0],
      auth: call[1].headers.Authorization,
      form: new URLSearchParams(call[1].body),
    }));
    expect(calls.map((call) => call.form.get("To"))).toEqual(["+18055551111", "+18055552222"]);
    for (const call of calls) {
      expect(call.url).toContain(dedicatedAccount);
      expect(call.url).not.toContain(sharedAccount);
      expect(call.auth).toBe(`Basic ${Buffer.from(`${dedicatedAccount}:dedicated-token`).toString("base64")}`);
      expect(call.form.get("MessagingServiceSid")).toBe(DEDICATED_805_STAFF_SMS_SERVICE_SID);
      expect(call.form.get("From")).toBe(dedicatedFrom);
      expect(call.form.get("From")).not.toBe(OWNER_ALERT_FROM_PHONE);
    }
  });

  it("does not call Twilio or report success when dedicated config is missing", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", sharedAccount);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "shared-token");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", sharedService);
    vi.stubEnv("TWILIO_FROM_PHONE", OWNER_ALERT_FROM_PHONE);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await sendAgentStaffBookingSms({ to: "+18055551111", body: "booked VIA AGENT" });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: false, skipped: expect.stringContaining("not configured") });
    expect(result.sid).toBeUndefined();
    expect(result.uncertain).toBeUndefined();
  });

  it("does not call Twilio when the account is not the pinned 805 account", async () => {
    dedicatedEnv();
    vi.stubEnv("VOICE_805_STAFF_SMS_ACCOUNT_SID", `AC${"4".repeat(32)}`);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await sendAgentStaffBookingSms({ to: "+18055551111", body: "booked VIA AGENT" });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: false, skipped: expect.stringContaining("not the 805 account") });
    expect(result.uncertain).toBeUndefined();
  });

  it.skipIf(!dedicatedAccount || !dedicatedAccountMatches(dedicatedAccount))("keeps a provider timeout or a response without a Message SID unsuccessful", async () => {
    dedicatedEnv();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("The operation was aborted"); }));
    const timedOut = await sendAgentStaffBookingSms({ to: "+18055552222", body: "booked VIA AGENT" });
    expect(timedOut).toMatchObject({ sent: false, uncertain: true });
    expect(timedOut.sid).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "queued" }), { status: 201 })));
    const missingSid = await sendAgentStaffBookingSms({ to: "+18055551111", body: "booked VIA AGENT" });
    expect(missingSid).toMatchObject({ sent: false, uncertain: true, providerStatus: "queued" });
    expect(missingSid.sid).toBeUndefined();
  });
});
