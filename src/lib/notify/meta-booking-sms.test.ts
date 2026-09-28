import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { metaAttributionSource } from "@/lib/meta-booking-alert";
import { sendMetaBookingSms, metaBookingMessage } from "./meta-booking-sms";

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
const input = { calendarEventId: "test-appointment", metaSource: "Facebook/Instagram" as const,
  name: "Test Customer", phone: "8055550100", address: "123 Main St", startAt: "2035-10-01T17:00:00Z" };

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("META_BOOKING_SMS_ENABLED", "true");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "test"); vi.stubEnv("TWILIO_AUTH_TOKEN", "test");
  vi.stubEnv("TWILIO_FROM_PHONE", "+18055550100"); vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "+18055550101");
});
afterEach(() => vi.unstubAllEnvs());

describe("Meta booking qualification", () => {
  it("does not guess the placement from the campaign's shared facebook tag", () => {
    expect(metaAttributionSource({ utmSource: "facebook" })).toBe("Facebook/Instagram");
    expect(metaAttributionSource({ utmSource: "facebook", referrer: "https://l.instagram.com/" })).toBe("Instagram");
    expect(metaAttributionSource({ utmSource: "ig" })).toBe("Instagram");
    expect(metaAttributionSource({ fbclid: "real-click-id" })).toBe("Facebook/Instagram");
    expect(metaAttributionSource({ userAgent: "Mobile Instagram 400" })).toBe("Instagram");
    expect(metaAttributionSource({ referrer: "https://m.facebook.com/" })).toBe("Facebook");
  });
  it("does not treat Google or spoofed hosts as Meta", () => {
    expect(metaAttributionSource({ utmSource: "google" })).toBeNull();
    expect(metaAttributionSource({ referrer: "https://facebook.com.evil.example/" })).toBeNull();
    expect(metaAttributionSource({ fbclid: "fbclid" })).toBeNull();
  });
  it("includes the completed appointment, Pacific time and customer contact", () => {
    expect(metaBookingMessage(input)).toContain("New appointment booked via Facebook/Instagram.");
    expect(metaBookingMessage(input)).toContain("10:00 AM PDT");
    expect(metaBookingMessage(input)).toContain(input.name);
    expect(metaBookingMessage(input)).toContain(input.phone);
    expect(metaBookingMessage(input)).not.toContain("opened");
  });
});

describe("durable owner SMS protection", () => {
  it("sends once across concurrent workers and retries, only to the configured owner", async () => {
    const { db, rows } = database();
    const send = vi.fn().mockResolvedValue({ sent: true, sid: "SMtest", providerStatus: "queued" });
    await Promise.all(Array.from({ length: 8 }, () => sendMetaBookingSms(db, input, send)));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: "+18055550101", timeoutMs: 8000 });
    expect([...rows.values()].find(r => r.action === "meta_booking_sms").after_data.status).toBe("accepted");
  });
  it("sends separately for two completed appointments", async () => {
    const { db } = database(); const send = vi.fn().mockResolvedValue({ sent: true, sid: "SMtest" });
    await sendMetaBookingSms(db, input, send);
    await sendMetaBookingSms(db, { ...input, calendarEventId: "another-appointment" }, send);
    expect(send).toHaveBeenCalledTimes(2);
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
