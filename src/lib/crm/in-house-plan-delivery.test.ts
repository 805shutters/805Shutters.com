import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import {
  deliverPlanMessage,
  verifyPlanSmsSignature,
} from "./in-house-plan-delivery";
import { POST as callback } from "@/app/api/webhooks/in-house-plan-sms/route";

import { GET as cron } from "@/app/api/cron/in-house-payments/route";
import { requireCrmUser } from "./auth";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: vi.fn() }));
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  requireCrmUser: vi.fn(),
}));
const id = "80500000-0000-4000-8000-000000000001";
const base = "https://example.test/api/webhooks/in-house-plan-sms/";
const message = {
  id,
  channel: "sms" as const,
  to: "+18055550100",
  subject: "Installment",
  text: "Test only",
};
beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token");
  vi.stubEnv("TWILIO_FROM_PHONE", "+18055550101");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
  vi.stubEnv("RESEND_API_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("payment plan provider boundaries", () => {
  it("sends email from the approved account with a stable idempotency key", async () => {
    const f = vi.fn().mockResolvedValue(Response.json({ id: "email-1" }));
    vi.stubGlobal("fetch", f);
    expect(
      await deliverPlanMessage({
        ...message,
        channel: "email",
        to: "recipient@example.com",
      }),
    ).toMatchObject({ status: "accepted", providerId: "email-1" });
    const options = f.mock.calls[0][1];
    expect(JSON.parse(options.body)).toMatchObject({
      from: "805 Shutters <805@805shutters.com>",
      to: ["recipient@example.com"],
    });
    expect(options.headers["Idempotency-Key"]).toBe(`805-plan-${id}`);
  });
  it("includes the authenticated SMS status callback and exact test recipient", async () => {
    const f = vi.fn().mockResolvedValue(Response.json({ sid: "SMtest" }));
    vi.stubGlobal("fetch", f);
    await deliverPlanMessage(message);
    const b = f.mock.calls[0][1].body as URLSearchParams;
    expect(b.get("StatusCallback")).toBe(`${base}?notification=${id}`);
    expect(b.get("To")).toBe(message.to);
  });
  it.each([
    [429, "failed", true],
    [500, "unknown", false],
    [400, "failed", false],
  ])(
    "classifies provider HTTP %s conservatively",
    async (code, status, retry) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ message: "Test error" }, { status: Number(code) }),
          ),
      );
      const r = await deliverPlanMessage(message);
      expect(r.status).toBe(status);
      expect(Boolean(r.retry)).toBe(retry);
    },
  );
  it("records opt-out without retrying", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ code: 21610 }, { status: 400 })),
    );
    expect(await deliverPlanMessage(message)).toMatchObject({
      status: "skipped",
      error: expect.stringContaining("opted out"),
    });
  });
  it("does not send with missing contact or callback configuration", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await deliverPlanMessage({ ...message, to: null })).status).toBe(
      "skipped",
    );
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    expect((await deliverPlanMessage(message)).status).toBe("skipped");
    expect(f).not.toHaveBeenCalled();
  });
  it("marks a lost response as uncertain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect((await deliverPlanMessage(message)).status).toBe("unknown");
  });
});
function callbackRequest(fields: Record<string, string>, valid = true) {
  const url = `${base}?notification=${id}`;
  const signature = createHmac("sha1", "test-token")
    .update(
      url +
        Object.keys(fields)
          .sort()
          .map((k) => k + fields[k])
          .join(""),
    )
    .digest("base64");
  return new NextRequest(url, {
    method: "POST",
    headers: { "x-twilio-signature": valid ? signature : "bad" },
    body: new URLSearchParams(fields),
  });
}
describe("authorization and callback state", () => {
  it("rejects invalid signatures before database access", async () => {
    expect(
      (
        await callback(
          callbackRequest(
            { MessageSid: "SMtest", MessageStatus: "delivered" },
            false,
          ),
        )
      ).status,
    ).toBe(401);
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();
    expect(verifyPlanSmsSignature("wrong-host", {}, "bad")).toBe(false);
  });
  it("stores delivery once and prevents a later status from downgrading it", async () => {
    const row = { channel: "sms", status: "accepted", provider_id: "SMtest" };
    const changes: unknown[] = [];
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      neq: () => q,
      maybeSingle: async () => ({ data: { ...row }, error: null }),
      update: (value: object) => {
        changes.push(value);
        Object.assign(row, value);
        return q;
      },
      then: (resolve: (x: unknown) => unknown) =>
        Promise.resolve(resolve({ error: null })),
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: () => q,
    } as never);
    expect(
      (
        await callback(
          callbackRequest({ MessageSid: "SMtest", MessageStatus: "delivered" }),
        )
      ).status,
    ).toBe(200);
    expect(row.status).toBe("delivered");
    await callback(
      callbackRequest({ MessageSid: "SMtest", MessageStatus: "sent" }),
    );
    expect(changes).toHaveLength(1);
  });
  it("rejects callbacks for another provider message", async () => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      neq: () => q,
      maybeSingle: async () => ({
        data: {
          channel: "sms",
          status: "accepted",
          provider_id: "SMdifferent",
        },
        error: null,
      }),
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: () => q,
    } as never);
    expect(
      (
        await callback(
          callbackRequest({ MessageSid: "SMtest", MessageStatus: "delivered" }),
        )
      ).status,
    ).toBe(409);
  });
  it("fails closed when the scheduled processor secret is absent or wrong", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(
      (await cron(new NextRequest("http://localhost/api/cron/payment-plans")))
        .status,
    ).toBe(401);
    vi.stubEnv("CRON_SECRET", "test-cron");
    expect(
      (
        await cron(
          new NextRequest("http://localhost/api/cron/payment-plans", {
            headers: { Authorization: "Bearer wrong" },
          }),
        )
      ).status,
    ).toBe(401);
  });
});

it("pins the existing owner channel while leaving customer payment-plan SMS routing unchanged", async () => {
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MGshared");
  const f = vi.fn().mockImplementation(async () => Response.json({ sid: "SMtest" }));
  vi.stubGlobal("fetch", f);
  await deliverPlanMessage(message);
  await deliverPlanMessage({ ...message, channel: "owner" });
  const customer = f.mock.calls[0][1].body as URLSearchParams;
  const owner = f.mock.calls[1][1].body as URLSearchParams;
  expect(customer.get("From")).toBeNull();
  expect(owner.get("From")).toBe("+18057931853");
  expect(owner.get("MessagingServiceSid")).toBe("MGshared");
  expect(owner.get("To")).toBe(message.to); expect(owner.get("Body")).toBe(message.text);
});
