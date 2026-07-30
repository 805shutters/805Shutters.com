import { describe, expect, it, vi } from "vitest";
import {
  recordSoldQuoteSmsProviderStatus,
  sendSoldQuoteSmsNotifications,
  soldQuoteSmsRecipients,
  soldQuoteSmsStatusCallbackRequestUrl,
  soldQuoteSmsStatusCallbackUrl,
} from "./sold-quote-notifications";

const defaultRecipientEnv = {
  MIKE_805_SALES_SMS_NUMBER: "",
  JESSICA_805_SALES_SMS_NUMBER: "",
  CRM_SOLD_QUOTE_SMS_NUMBERS: "",
};

function fakeSupabase(options: {
  claimRows?: Array<Record<string, unknown>>;
  claimError?: string;
  currentRow?: Record<string, unknown> | null;
  updateError?: string;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const activities: Array<Record<string, unknown>> = [];
  const rpc = vi.fn().mockResolvedValue({
    data: options.claimRows || [],
    error: options.claimError ? { message: options.claimError } : null,
  });
  const from = vi.fn((table: string) => {
    if (table === "crm_activity_events") {
      return {
        insert: async (row: Record<string, unknown>) => {
          activities.push(row);
          return { error: null };
        },
      };
    }
    return {
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          eq: async () => {
            updates.push(patch);
            return {
              error: options.updateError ? { message: options.updateError } : null,
            };
          },
        }),
      }),
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.currentRow || null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
  });
  return {
    client: { rpc, from } as never,
    rpc,
    updates,
    activities,
  };
}

describe("soldQuoteSmsRecipients", () => {
  it("uses configured Michael and Jessica numbers, retains the third recipient, and deduplicates extras", () => {
    expect(
      soldQuoteSmsRecipients({
        MIKE_805_SALES_SMS_NUMBER: "805-555-0200",
        JESSICA_805_SALES_SMS_NUMBER: "+1 (805) 555-0300",
        CRM_SOLD_QUOTE_SMS_NUMBERS: "805-555-0300, 805-555-0100, not-a-phone",
      }),
    ).toEqual([
      { input: "805-555-0200", e164: "+18055550200", role: "primary" },
      { input: "+1 (805) 555-0300", e164: "+18055550300", role: "staff" },
      { input: "805-914-4917", e164: "+18059144917", role: "staff" },
      { input: "805-555-0100", e164: "+18055550100", role: "staff" },
      { input: "not-a-phone", e164: null, role: "staff" },
    ]);
  });

  it("falls back to the three established recipients when env is unset", () => {
    expect(soldQuoteSmsRecipients(defaultRecipientEnv)).toEqual([
      { input: "805-298-5555", e164: "+18052985555", role: "primary" },
      { input: "805-630-0848", e164: "+18056300848", role: "staff" },
      { input: "805-914-4917", e164: "+18059144917", role: "staff" },
    ]);
  });
});

describe("soldQuoteSmsStatusCallbackUrl", () => {
  it("builds the public HTTPS callback and rejects a non-HTTPS origin", () => {
    expect(soldQuoteSmsStatusCallbackUrl({
      NEXT_PUBLIC_SITE_URL: "https://example.com/",
    })).toBe("https://example.com/api/webhooks/twilio/sold-quote-status");
    expect(soldQuoteSmsStatusCallbackUrl({
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    })).toBeNull();
  });

  it("asks Twilio to retry transient callback failures", () => {
    expect(soldQuoteSmsStatusCallbackRequestUrl()).toContain(
      "#rc=2&rp=ct,rt,5xx",
    );
  });
});

describe("sendSoldQuoteSmsNotifications", () => {
  it("persists a provider success and its SID", async () => {
    const db = fakeSupabase({
      claimRows: [{
        id: "delivery-1",
        recipient: "+18052985555",
        recipient_e164: "+18052985555",
        status: "sending",
        attempt_count: 1,
        provider_message_sid: null,
      }],
    });
    const smsSender = vi.fn().mockResolvedValue({ sent: true, sid: "SM123" });

    const result = await sendSoldQuoteSmsNotifications(db.client, {
      quoteId: "00000000-0000-0000-0000-000000000001",
      source: "public_contract_accept",
      recipientEnv: defaultRecipientEnv,
      statusCallbackUrl: "https://example.com/status",
      buildMessage: () => "signed",
    }, smsSender);

    expect(smsSender).toHaveBeenCalledTimes(3);
    expect(smsSender).toHaveBeenCalledWith(expect.objectContaining({
      statusCallback: "https://example.com/status",
    }));
    expect(result.every((item) => item.delivery.status === "accepted")).toBe(true);
    expect(db.updates).toHaveLength(3);
    expect(db.updates[0]).toMatchObject({
      status: "accepted",
      provider_message_sid: "SM123",
      provider_status: "accepted",
      last_error: null,
    });
    expect(db.activities).toHaveLength(3);
  });

  it("does not send when the atomic claim is unavailable", async () => {
    const db = fakeSupabase({ claimError: "function is missing" });
    const smsSender = vi.fn();

    const result = await sendSoldQuoteSmsNotifications(db.client, {
      quoteId: "00000000-0000-0000-0000-000000000001",
      source: "in_home_sold",
      recipientEnv: defaultRecipientEnv,
      buildMessage: () => "signed",
    }, smsSender);

    expect(smsSender).not.toHaveBeenCalled();
    expect(result).toHaveLength(3);
    expect(result.every((item) => item.delivery.persisted === false)).toBe(true);
  });

  it("suppresses a retry when the prior provider outcome is uncertain", async () => {
    const db = fakeSupabase({
      currentRow: {
        id: "delivery-1",
        recipient: "+18052985555",
        recipient_e164: "+18052985555",
        status: "unknown",
        attempt_count: 1,
        provider_message_sid: null,
      },
    });
    const smsSender = vi.fn();

    const result = await sendSoldQuoteSmsNotifications(db.client, {
      quoteId: "00000000-0000-0000-0000-000000000001",
      source: "public_contract_retry",
      recipientEnv: defaultRecipientEnv,
      buildMessage: () => "signed",
    }, smsSender);

    expect(smsSender).not.toHaveBeenCalled();
    expect(result.every((item) => item.delivery.status === "unknown")).toBe(true);
    expect(result.every((item) => item.result.skipped?.includes("reconciliation"))).toBe(true);
  });

  it("leaves a provider-accepted result in sending state if persistence fails", async () => {
    const db = fakeSupabase({
      claimRows: [{
        id: "delivery-1",
        recipient: "+18052985555",
        recipient_e164: "+18052985555",
        status: "sending",
        attempt_count: 1,
        provider_message_sid: null,
      }],
      updateError: "write failed",
    });
    const smsSender = vi.fn().mockResolvedValue({ sent: true, sid: "SM123" });

    const result = await sendSoldQuoteSmsNotifications(db.client, {
      quoteId: "00000000-0000-0000-0000-000000000001",
      source: "public_contract_accept",
      recipientEnv: defaultRecipientEnv,
      buildMessage: () => "signed",
    }, smsSender);

    expect(result.every((item) => item.delivery.status === "sending")).toBe(true);
    expect(result.every((item) => item.delivery.persisted === false)).toBe(true);
  });

  it("treats a prior provider acceptance as a successful duplicate suppression", async () => {
    const db = fakeSupabase({
      currentRow: {
        id: "delivery-1",
        recipient: "+18052985555",
        recipient_e164: "+18052985555",
        status: "accepted",
        attempt_count: 1,
        provider_message_sid: `SM${"a".repeat(32)}`,
      },
    });
    const smsSender = vi.fn();

    const result = await sendSoldQuoteSmsNotifications(db.client, {
      quoteId: "00000000-0000-0000-0000-000000000001",
      source: "public_contract_retry",
      recipientEnv: defaultRecipientEnv,
      buildMessage: () => "signed",
    }, smsSender);

    expect(smsSender).not.toHaveBeenCalled();
    expect(result.every((item) => item.delivery.status === "accepted")).toBe(true);
    expect(result.every((item) => item.result.sent)).toBe(true);
  });
});

describe("recordSoldQuoteSmsProviderStatus", () => {
  it("writes the provider callback through the private status RPC", async () => {
    const db = fakeSupabase({
      claimRows: [{
        id: "delivery-1",
        recipient: "+18052985555",
        recipient_e164: "+18052985555",
        status: "delivered",
        attempt_count: 1,
        provider_message_sid: `SM${"a".repeat(32)}`,
      }],
    });

    const result = await recordSoldQuoteSmsProviderStatus(db.client, {
      messageSid: `SM${"a".repeat(32)}`,
      providerStatus: "delivered",
      errorCode: null,
    });

    expect(result.updated).toBe(true);
    expect(db.rpc).toHaveBeenCalledWith(
      "record_crm_sold_quote_sms_provider_status",
      {
        p_message_sid: `SM${"a".repeat(32)}`,
        p_provider_status: "delivered",
        p_error_code: null,
      },
    );
  });
});
