import { describe, it, expect, beforeEach } from "vitest";
import { toE164, sendSms } from "./twilio";

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
});
