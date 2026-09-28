import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { twilioWebhookSignature } from "@/lib/notify/twilio";
const m = vi.hoisted(() => ({ updates: [] as any[], row: { metadata: { source: "Instagram" }, after_data: { sid: "SMtest" } } }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: () => ({ from: () => ({
  select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.row, error: null }) }) }) }),
  update: (data: any) => { m.updates.push(data); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
}) }) }));
import { POST } from "./route";
const url = "https://www.805shutters.com/api/webhooks/meta-booking-sms/?id=12345678-1234-4123-8123-123456789012";
function req(status: string, signed = true, sid = "SMtest") {
  const body = new URLSearchParams({ AccountSid: "ACtest", To: "+18055550101", MessageSid: sid, MessageStatus: status });
  return new NextRequest(url, { method: "POST", body: body.toString(), headers: { "x-twilio-signature": signed ? twilioWebhookSignature("secret", url, body) : "bad" } });
}
beforeEach(() => { m.updates.length = 0; vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest"); vi.stubEnv("TWILIO_AUTH_TOKEN", "secret"); vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "+18055550101"); });
afterEach(() => vi.unstubAllEnvs());
it("requires authentic callbacks for the exact message", async () => {
  expect((await POST(req("delivered", false))).status).toBe(403);
  expect((await POST(req("delivered", true, "SMwrong"))).status).toBe(403);
  expect(m.updates).toEqual([]);
});
it("keeps delivered evidence separate from delayed intermediate callbacks", async () => {
  expect((await POST(req("delivered"))).status).toBe(200);
  expect(m.updates[0].before_data).toMatchObject({ delivery_status: "delivered", sid: "SMtest" });
  expect((await POST(req("sent"))).status).toBe(200);
  expect(m.updates[1]).not.toHaveProperty("before_data");
});
