import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { metaBookingSource, metaBookingMessage } from "@/lib/meta-booking-alert";
import { sendMetaBookingSms } from "./meta-booking-sms";

function database() {
  const rows = new Map<string, any>();
  let failure = false;
  const db = { from: () => ({
    insert: async (row: any) => {
      if (failure) return { error: { code: "offline" } };
      if (rows.has(row.id)) return { error: { code: "23505" } };
      rows.set(row.id, row); return { error: null };
    },
    select: () => ({ eq: (_key: string, action: string) => ({ gte: async () => ({
      count: [...rows.values()].filter(r => r.action === action).length,
      error: failure ? { code: "offline" } : null,
    }) }) }),
    update: (data: any) => ({ eq: async (_key: string, id: string) => {
      Object.assign(rows.get(id), data); return { error: null };
    } }),
  }) } as unknown as SupabaseClient;
  return { db, rows, fail: () => { failure = true; } };
}
const now = new Date("2026-09-28T15:10:30Z");
const input = { sessionId: "visit-1234567890123456", ip: "192.0.2.1", source: "Facebook/Instagram", now };

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("META_BOOKING_SMS_ENABLED", "true");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "test"); vi.stubEnv("TWILIO_AUTH_TOKEN", "test");
  vi.stubEnv("TWILIO_FROM_PHONE", "+18055550100"); vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "+18055550101");
});
afterEach(() => vi.unstubAllEnvs());

describe("Meta booking qualification", () => {
  it("handles the actual static campaign URL, Instagram, click IDs and in-app browsers", () => {
    expect(metaBookingSource("/book-consultation/?utm_source=facebook&utm_medium=cpc&utm_campaign=static-launch-1&utm_content=exterior-shades-book")).toBe("Facebook/Instagram");
    expect(metaBookingSource("/book-consultation/?utm_source=facebook", "https://l.instagram.com/")).toBe("Instagram");
    expect(metaBookingSource("/book-consultation/?utm_source=ig")).toBe("Instagram");
    expect(metaBookingSource("/book-consultation/?fbclid=real-click-id")).toBe("Facebook/Instagram");
    expect(metaBookingSource("/book-consultation/", "", "Mobile Instagram 400")).toBe("Instagram");
    expect(metaBookingSource("/free-window-treatment-consultation/", "https://m.facebook.com/")).toBe("Facebook/Instagram");
  });
  it("rejects ordinary traffic, unrelated pages, spoofed referrer hosts and previews", () => {
    expect(metaBookingSource("/book-consultation/?utm_source=google")).toBeNull();
    expect(metaBookingSource("/crm/?utm_source=facebook")).toBeNull();
    expect(metaBookingSource("/book-consultation/", "https://facebook.com.evil.example/")).toBeNull();
    expect(metaBookingSource("/book-consultation/?utm_source=facebook&fbclid=fbclid")).toBeNull();
    expect(metaBookingSource("/book-consultation/?utm_source=facebook", "", "facebookexternalhit/1.1")).toBeNull();
  });
  it("does not imply that a click is a lead or booked appointment", () => {
    expect(metaBookingMessage("Instagram")).toBe("805 Shutters: Someone opened the booking page from Instagram. No appointment has been submitted yet.");
  });
});

describe("durable owner SMS protection", () => {
  it("sends once across concurrent workers and refreshes, only to the configured owner", async () => {
    const { db, rows } = database();
    const send = vi.fn().mockResolvedValue({ sent: true, sid: "SMtest", providerStatus: "queued" });
    await Promise.all(Array.from({ length: 8 }, () => sendMetaBookingSms(db, input, send)));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: "+18055550101", timeoutMs: 8000 });
    expect([...rows.values()].find(r => r.action === "meta_booking_sms").after_data.status).toBe("accepted");
  });
  it("suppresses renewed sessions from one IP for a minute but allows other visitors", async () => {
    const { db } = database(); const send = vi.fn().mockResolvedValue({ sent: true, sid: "SMtest" });
    await sendMetaBookingSms(db, input, send);
    expect((await sendMetaBookingSms(db, { ...input, sessionId: "another" }, send)).skipped).toBe("rate_limited");
    await sendMetaBookingSms(db, { ...input, sessionId: "other-ip", ip: "192.0.2.2" }, send);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("enforces the hourly cap even for concurrent distinct sessions and IPs", async () => {
    const { db } = database(); const send = vi.fn().mockResolvedValue({ sent: true, sid: "SMtest" });
    for (let n = 0; n < 118; n++) await sendMetaBookingSms(db, { ...input, sessionId: `v${n}`, ip: `ip${n}` }, send);
    await Promise.all(Array.from({ length: 10 }, (_, n) => sendMetaBookingSms(db, { ...input, sessionId: `last${n}`, ip: `last${n}` }, send)));
    expect(send).toHaveBeenCalledTimes(120);
  });
  it("fails closed on missing database, recipient, disabled and preview environments", async () => {
    const h = database(); const send = vi.fn(); h.fail();
    expect((await sendMetaBookingSms(h.db, input, send)).skipped).toBe("database_unavailable");
    for (const [key, value] of [["VERCEL_ENV", "preview"], ["VERCEL_ENV", "development"], ["MIKE_805_SALES_SMS_NUMBER", ""], ["META_BOOKING_SMS_ENABLED", "false"]]) {
      vi.stubEnv(key, value);
      expect((await sendMetaBookingSms(database().db, input, send)).skipped).toBe("disabled");
      vi.stubEnv("VERCEL_ENV", "production");
    }
    expect(send).not.toHaveBeenCalled();
  });
  it("never retries uncertain provider acceptance", async () => {
    const { db } = database(); const send = vi.fn().mockResolvedValue({ sent: false, uncertain: true });
    await sendMetaBookingSms(db, input, send);
    await sendMetaBookingSms(db, input, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
