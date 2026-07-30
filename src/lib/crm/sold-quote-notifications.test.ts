import { describe, expect, it, vi } from "vitest";
import {
  sendSoldQuoteSmsNotifications,
  soldQuoteSmsRecipients,
} from "./sold-quote-notifications";

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
  it("always keeps the required business recipients and adds normalized config", () => {
    expect(
      soldQuoteSmsRecipients(" +1 (805) 630-0848, 805-555-0100, not-a-phone "),
    ).toEqual([
      { input: "805-298-5555", e164: "+18052985555" },
      { input: "805-630-0848", e164: "+18056300848" },
      { input: "805-914-4917", e164: "+18059144917" },
      { input: "805-555-0100", e164: "+18055550100" },
      { input: "not-a-phone", e164: null },
    ]);
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
      configuredRecipients: "",
      buildMessage: () => "signed",
    }, smsSender);

    expect(smsSender).toHaveBeenCalledTimes(3);
    expect(result.every((item) => item.delivery.status === "sent")).toBe(true);
    expect(db.updates).toHaveLength(3);
    expect(db.updates[0]).toMatchObject({
      status: "sent",
      provider_message_sid: "SM123",
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
      configuredRecipients: "",
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
      configuredRecipients: "",
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
      configuredRecipients: "",
      buildMessage: () => "signed",
    }, smsSender);

    expect(result.every((item) => item.delivery.status === "sending")).toBe(true);
    expect(result.every((item) => item.delivery.persisted === false)).toBe(true);
  });
});
