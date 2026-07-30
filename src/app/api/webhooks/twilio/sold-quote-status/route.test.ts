import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { twilioWebhookSignature } from "@/lib/notify/twilio";

const mocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn(),
  recordSoldQuoteSmsProviderStatus: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceClient: mocks.getSupabaseServiceClient,
}));

vi.mock("@/lib/crm/sold-quote-notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crm/sold-quote-notifications")>(
    "@/lib/crm/sold-quote-notifications",
  );
  return {
    ...actual,
    recordSoldQuoteSmsProviderStatus: mocks.recordSoldQuoteSmsProviderStatus,
  };
});

import { POST } from "./route";

const callbackUrl = "https://www.805shutters.com/api/webhooks/twilio/sold-quote-status";
const messageSid = `SM${"a".repeat(32)}`;

function requestFor(
  form: URLSearchParams,
  signature = twilioWebhookSignature("secret", callbackUrl, form),
) {
  return new NextRequest(callbackUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: form.toString(),
  });
}

describe("sold quote Twilio status callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.805shutters.com";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    mocks.getSupabaseServiceClient.mockReturnValue({ rpc: vi.fn() });
    mocks.recordSoldQuoteSmsProviderStatus.mockResolvedValue({ updated: true });
  });

  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_ACCOUNT_SID;
  });

  it("rejects an invalid Twilio signature before database access", async () => {
    const response = await POST(requestFor(new URLSearchParams({
      AccountSid: "AC123",
      MessageSid: messageSid,
      MessageStatus: "delivered",
    }), "invalid"));

    expect(response.status).toBe(401);
    expect(mocks.getSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("records a signed final delivery callback by provider SID", async () => {
    const response = await POST(requestFor(new URLSearchParams({
      AccountSid: "AC123",
      MessageSid: messageSid,
      MessageStatus: "delivered",
      ErrorCode: "",
    })));

    expect(response.status).toBe(204);
    expect(mocks.recordSoldQuoteSmsProviderStatus).toHaveBeenCalledWith(
      expect.anything(),
      {
        messageSid,
        providerStatus: "delivered",
        errorCode: "",
      },
    );
  });

  it("returns a retryable response when the callback races SID persistence", async () => {
    mocks.recordSoldQuoteSmsProviderStatus.mockResolvedValue({ updated: false });
    const response = await POST(requestFor(new URLSearchParams({
      AccountSid: "AC123",
      MessageSid: messageSid,
      MessageStatus: "sent",
    })));

    expect(response.status).toBe(503);
  });
});
