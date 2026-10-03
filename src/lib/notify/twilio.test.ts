import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isValidTwilioWebhookSignature,
  sendSms,
  toE164,
  twilioWebhookSignature,
} from "./twilio";

describe("toE164", () => {
  it("normalizes 10-digit US numbers", () => {
    expect(toE164("8055551234")).toBe("+18055551234");
    expect(toE164("(805) 555-1234")).toBe("+18055551234");
  });
  it("normalizes 11-digit leading-1 numbers", () => {
    expect(toE164("1-805-555-1234")).toBe("+18055551234");
  });
  it("passes through existing +E.164 and strips internal punctuation", () => {
    expect(toE164("+447911123456")).toBe("+447911123456");
    expect(toE164("+44 7911 123456")).toBe("+447911123456");
  });
  it("rejects + numbers that are too short or have no digits", () => {
    expect(toE164("+12")).toBeNull();
    expect(toE164("+abc")).toBeNull();
  });
  it("rejects junk", () => {
    expect(toE164("abc")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164("12345")).toBeNull();
  });
});

describe("sendSms guards (never throws, no-ops without config)", () => {
  beforeEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_PHONE;
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("skips on invalid destination", async () => {
    const r = await sendSms({ to: "abc", body: "x" });
    expect(r.sent).toBe(false);
    expect(r.skipped).toContain("phone");
  });
  it("skips when Twilio is not configured", async () => {
    const r = await sendSms({ to: "8055551234", body: "x" });
    expect(r.sent).toBe(false);
    expect(r.skipped).toBe("twilio not configured");
  });

  it("passes a status callback and reports provider acceptance honestly", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM_PHONE = "+18055550000";
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ sid: `SM${"a".repeat(32)}`, status: "queued" }),
      { status: 201, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms({
      to: "8055551234",
      body: "signed",
      statusCallback: "https://www.805shutters.com/api/webhooks/twilio/sold-quote-status",
    });

    expect(result).toEqual({
      sent: true,
      sid: `SM${"a".repeat(32)}`,
      providerStatus: "queued",
    });
    const requestBody = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(requestBody.get("StatusCallback")).toBe(
      "https://www.805shutters.com/api/webhooks/twilio/sold-quote-status",
    );
  });

  it("holds a 2xx response without a Message SID as uncertain", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM_PHONE = "+18055550000";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ status: "queued" }),
      { status: 201, headers: { "content-type": "application/json" } },
    )));

    const result = await sendSms({ to: "8055551234", body: "signed" });

    expect(result).toMatchObject({
      sent: false,
      uncertain: true,
      providerStatus: "queued",
    });
  });
});

describe("Twilio webhook signatures", () => {
  it("validates the exact callback URL and complete form", () => {
    const url = "https://www.805shutters.com/api/webhooks/twilio/sold-quote-status";
    const form = new URLSearchParams({
      MessageSid: `SM${"a".repeat(32)}`,
      MessageStatus: "delivered",
    });
    const signature = twilioWebhookSignature("secret", url, form);

    expect(isValidTwilioWebhookSignature({
      authToken: "secret",
      webhookUrl: url,
      form,
      providedSignature: signature,
    })).toBe(true);
    expect(isValidTwilioWebhookSignature({
      authToken: "secret",
      webhookUrl: `${url}?wrong=1`,
      form,
      providedSignature: signature,
    })).toBe(false);
  });
});

describe("MMS media transport", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("attaches images while preserving body, sender, callback, and provider status", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest");vi.stubEnv("TWILIO_AUTH_TOKEN", "test");vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MGtest");
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({sid:"MMtest",status:"queued"}),{status:201}));
    vi.stubGlobal("fetch",fetchMock);
    const result=await sendSms({to:"8055550100",body:"Confirmed",mediaUrls:["https://example.test/card.png"],statusCallback:"https://example.test/status"});
    const form=new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(form.getAll("MediaUrl")).toEqual(["https://example.test/card.png"]);
    expect(form.get("Body")).toBe("Confirmed");expect(form.get("MessagingServiceSid")).toBe("MGtest");
    expect(form.get("StatusCallback")).toBe("https://example.test/status");
    expect(result).toEqual({sent:true,sid:"MMtest",providerStatus:"queued"});
  });
});

describe("owner-only sender separation", () => {
  beforeEach(() => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test");
    vi.stubEnv("TWILIO_FROM_PHONE", "+18055550123");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it.each(["MGshared", ""])("pins only owner alerts, preserving recipients and customer routing (service %s)", async service => {
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", service);
    const f = vi.fn().mockImplementation(async () => Response.json({ sid: "SMtest", status: "queued" }));
    vi.stubGlobal("fetch", f);
    const input = { to: "+18055550100", body: "Existing content", statusCallback: "https://example.test/status", timeoutMs: 1000 };
    await sendSms(input);
    await sendSms({ ...input, ownerAlert: true });
    const customer = new URLSearchParams(f.mock.calls[0][1].body);
    const owner = new URLSearchParams(f.mock.calls[1][1].body);
    expect(customer.get("From")).toBe(service ? null : "+18055550123");
    expect(owner.get("From")).toBe("+18057931853");
    expect(owner.get("MessagingServiceSid")).toBe(service || null);
    expect(owner.get("To")).toBe(input.to); expect(owner.get("Body")).toBe(input.body);
    expect(owner.get("StatusCallback")).toBe(input.statusCallback);
    owner.delete("From"); customer.delete("From");
    expect(owner.toString()).toBe(customer.toString());
  });
});
