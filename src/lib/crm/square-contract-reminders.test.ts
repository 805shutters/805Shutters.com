import { describe, expect, it, vi } from "vitest";
import {
  SQUARE_DEPOSIT_CONTRACT_REMINDER,
  isCustomerSmsOptOut,
  dispatchDueSquareContractReminders,
  maybeSendSquareContractReminder,
  resolveSquareContractReminderChannel,
  scheduleSquareContractReminder,
  squareContractReminderEligibility,
} from "@/lib/crm/square-contract-reminders";

const quote = {
  id: "11111111-1111-4111-8111-111111111111",
  job_id: "22222222-2222-4222-8222-222222222222",
  sent_at: "2026-07-30T17:00:00.000Z",
  signed_at: null,
  customer_signature: null,
  customer_phone: "805-555-0100",
  customer_email: "customer@example.com",
  sent_via: "sms",
  external_id: null,
  meta: {},
};
const job = {
  id: quote.job_id,
  phone: "+18055550100",
  email: "customer@example.com",
  meta: {},
};

describe("Square unsigned-contract reminder eligibility", () => {
  it("uses the approved customer wording", () => {
    expect(SQUARE_DEPOSIT_CONTRACT_REMINDER).toBe(
      "Thank you so much for your payment for the deposit for your window coverings. Would you please sign the contract that’s in your email as well?",
    );
  });

  it("uses only one reliably recorded original channel", () => {
    expect(resolveSquareContractReminderChannel({ crmSentVia: "sms" })).toEqual({ channel: "sms" });
    expect(resolveSquareContractReminderChannel({
      linkedSalesSentVia: "email",
      successfulSendChannels: ["email"],
    })).toEqual({ channel: "email" });
    expect(resolveSquareContractReminderChannel({ crmSentVia: "both" })).toMatchObject({
      reason: expect.stringMatching(/ambiguous/i),
    });
    expect(resolveSquareContractReminderChannel({})).toMatchObject({
      reason: expect.stringMatching(/not recorded/i),
    });
    expect(resolveSquareContractReminderChannel({
      crmSentVia: "sms",
      linkedSalesSentVia: "email",
      successfulSendChannels: ["sms"],
    })).toMatchObject({ reason: expect.stringMatching(/conflict/i) });
    expect(resolveSquareContractReminderChannel({
      linkedSalesSentVia: "sms",
    })).toMatchObject({ reason: expect.stringMatching(/successful.*not recorded/i) });
  });

  it("requires a sent, unsigned contract on the exact quote and job", () => {
    expect(squareContractReminderEligibility({
      quote,
      job,
      contracts: [{ id: "contract-1", job_id: job.id, signed_at: null, status: "sent" }],
      preference: null,
      channel: "sms",
    })).toEqual({ eligible: true, channel: "sms", recipient: "+18055550100" });
    expect(squareContractReminderEligibility({
      quote: { ...quote, sent_at: null },
      job,
      contracts: [],
      preference: null,
      channel: "sms",
    })).toMatchObject({ eligible: false, reason: expect.stringMatching(/no contract/i) });
    expect(squareContractReminderEligibility({
      quote,
      job: { ...job, id: "different-job" },
      contracts: [],
      preference: null,
      channel: "sms",
    })).toMatchObject({ eligible: false, reason: expect.stringMatching(/identity/i) });
  });

  it("suppresses signed contracts from either quote or contract state", () => {
    expect(squareContractReminderEligibility({
      quote: { ...quote, signed_at: "2026-07-30T18:00:00.000Z" },
      job,
      contracts: [],
      preference: null,
      channel: "sms",
    })).toMatchObject({ eligible: false, reason: expect.stringMatching(/already signed/i) });
    expect(squareContractReminderEligibility({
      quote,
      job,
      contracts: [{ id: "contract-1", job_id: job.id, signed_at: null, status: "signed" }],
      preference: null,
      channel: "sms",
    })).toMatchObject({ eligible: false, reason: expect.stringMatching(/already signed/i) });
  });

  it("fails closed on opt-out, unreachable, mismatched, or ambiguous identity", () => {
    expect(squareContractReminderEligibility({
      quote,
      job,
      contracts: [],
      preference: { do_not_contact: true, opted_out_at: null },
      channel: "sms",
    })).toMatchObject({ eligible: false, reason: expect.stringMatching(/opted out/i) });
    expect(squareContractReminderEligibility({
      quote: { ...quote, customer_phone: "not-a-phone" },
      job,
      contracts: [],
      preference: null,
      channel: "sms",
    })).toMatchObject({ eligible: false, reason: expect.stringMatching(/invalid/i) });
    expect(squareContractReminderEligibility({
      quote,
      job: { ...job, phone: "805-555-0199" },
      contracts: [],
      preference: null,
      channel: "sms",
    })).toMatchObject({ eligible: false, reason: expect.stringMatching(/do not exactly match/i) });
    expect(squareContractReminderEligibility({
      quote,
      job,
      contracts: [{ id: "contract-1", job_id: "different-job", signed_at: null, status: "sent" }],
      preference: null,
      channel: "sms",
    })).toMatchObject({ eligible: false, reason: expect.stringMatching(/ambiguous/i) });
  });

  it("recognizes standard one-word SMS opt-outs without treating prose as an opt-out", () => {
    expect(isCustomerSmsOptOut(" STOP ")).toBe(true);
    expect(isCustomerSmsOptOut("unsubscribe!")).toBe(true);
    expect(isCustomerSmsOptOut("please stop by tomorrow")).toBe(false);
  });
});

function fakeSupabase(input: {
  claim?: unknown[];
  preference?: { do_not_contact: boolean; opted_out_at: string | null } | null;
  quote?: Omit<typeof quote, "signed_at"> & { signed_at: string | null };
  dueRows?: unknown[];
  scheduledRows?: unknown[];
}) {
  const updatePayloads: unknown[] = [];
  const rpc = vi.fn(async (name: string) => {
    if (name === "claim_crm_square_contract_reminder") {
      return { data: input.claim ?? [{ id: "delivery-1", status: "sending", attempt_count: 1 }], error: null };
    }
    if (name === "schedule_crm_square_contract_reminder") {
      return { data: input.scheduledRows ?? [], error: null };
    }
    if (name === "claim_due_crm_square_contract_reminders") {
      return { data: input.dueRows ?? [], error: null };
    }
    return { data: null, error: null };
  });
  const from = vi.fn((table: string) => {
    if (table === "crm_quotes") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: input.quote || quote, error: null }) }) }) };
    }
    if (table === "crm_jobs") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: job, error: null }) }) }) };
    }
    if (table === "crm_customer_contracts") {
      return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
    }
    if (table === "crm_activity_events") {
      const channel = input.quote?.sent_via || quote.sent_via;
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: async () => ({
                data: [{
                  metadata: {
                    sms: channel === "sms",
                    email: channel === "email",
                  },
                }],
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "crm_customer_sms_preferences") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: input.preference ?? null, error: null }) }),
        }),
      };
    }
    if (table === "crm_customer_email_preferences") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    }
    if (table === "sales_quotes") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    }
    if (table === "crm_square_contract_reminders") {
      return {
        update: (payload: unknown) => {
          updatePayloads.push(payload);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
  return { client: { from, rpc } as never, rpc, updatePayloads };
}

describe("Square unsigned-contract reminder delivery", () => {
  it("durably schedules the reminder exactly 15 minutes after payment without sending", async () => {
    const db = fakeSupabase({
      scheduledRows: [{
        id: "scheduled-1",
        quote_id: quote.id,
        square_payment_id: "square-payment-delay",
        scheduled_for: "2026-07-30T18:15:00.000Z",
      }],
    });
    await expect(scheduleSquareContractReminder(db.client, {
      quoteId: quote.id,
      jobId: job.id,
      squarePaymentId: "square-payment-delay",
      paidAt: "2026-07-30T18:00:00.000Z",
    })).resolves.toMatchObject({
      status: "scheduled",
      sent: false,
      deliveryId: "scheduled-1",
    });
    expect(db.rpc).toHaveBeenCalledWith("schedule_crm_square_contract_reminder", expect.objectContaining({
      p_scheduled_for: "2026-07-30T18:15:00.000Z",
    }));
    await expect(scheduleSquareContractReminder(db.client, {
      quoteId: quote.id,
      jobId: job.id,
      squarePaymentId: "square-payment-delay",
      paidAt: "2026-07-30T18:00:00.000Z",
    })).resolves.toMatchObject({ status: "scheduled", deliveryId: "scheduled-1" });
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });

  it("claims and persists one provider-accepted attempt without live SMS", async () => {
    const db = fakeSupabase({});
    const sender = vi.fn().mockResolvedValue({
      sent: true,
      sid: "SM123",
      providerStatus: "queued",
    });
    await expect(maybeSendSquareContractReminder(db.client, {
      quoteId: quote.id,
      squarePaymentId: "square-payment-1",
      claimedDeliveryId: "delivery-1",
    }, sender)).resolves.toMatchObject({
      status: "accepted",
      sent: true,
      deliveryId: "delivery-1",
      providerMessageSid: "SM123",
    });
    expect(sender).toHaveBeenCalledWith(expect.objectContaining({
      to: "+18055550100",
      body: SQUARE_DEPOSIT_CONTRACT_REMINDER,
    }));
    expect(db.updatePayloads).toContainEqual(expect.objectContaining({
      status: "accepted",
      provider_message_sid: "SM123",
    }));
  });

  it("does not dispatch anything when a scheduler retry produces no new due claim", async () => {
    const db = fakeSupabase({ dueRows: [] });
    const sender = vi.fn();
    await expect(dispatchDueSquareContractReminders(db.client, 50, sender, vi.fn()))
      .resolves.toMatchObject({ claimed: 0, sent: 0 });
    expect(sender).not.toHaveBeenCalled();
  });

  it("persists a definitive provider failure and does not report it as sent", async () => {
    const db = fakeSupabase({});
    const sender = vi.fn().mockResolvedValue({ sent: false, error: "provider rejected" });
    await expect(maybeSendSquareContractReminder(db.client, {
      quoteId: quote.id,
      squarePaymentId: "square-payment-2",
      claimedDeliveryId: "delivery-2",
    }, sender)).resolves.toMatchObject({
      status: "failed",
      sent: false,
      reason: "provider rejected",
    });
    expect(db.updatePayloads).toContainEqual(expect.objectContaining({
      status: "failed",
      last_error: "provider rejected",
    }));
  });

  it("routes a verified email-origin contract through the established email sender", async () => {
    const db = fakeSupabase({ quote: { ...quote, sent_via: "email" } });
    const smsSender = vi.fn();
    const emailSender = vi.fn().mockResolvedValue({ sent: true, id: "email-123" });
    await expect(maybeSendSquareContractReminder(db.client, {
      quoteId: quote.id,
      squarePaymentId: "square-payment-email",
      claimedDeliveryId: "delivery-email",
    }, smsSender, emailSender)).resolves.toMatchObject({
      status: "accepted",
      sent: true,
      channel: "email",
    });
    expect(smsSender).not.toHaveBeenCalled();
    expect(emailSender).toHaveBeenCalledWith(expect.objectContaining({
      to: "customer@example.com",
      subject: expect.stringMatching(/please sign/i),
      idempotencyKey: "square-contract-reminder-square-payment-email",
    }));
    expect(db.updatePayloads).toContainEqual(expect.objectContaining({
      provider_message_id: "email-123",
      status: "accepted",
    }));
  });

  it("suppresses a stale due task when the contract was signed during the grace period", async () => {
    const db = fakeSupabase({
      quote: { ...quote, signed_at: "2026-07-30T18:07:00.000Z" },
      dueRows: [{
        id: "due-signed",
        quote_id: quote.id,
        square_payment_id: "square-payment-signed",
        scheduled_for: "2026-07-30T18:15:00.000Z",
      }],
    });
    const result = await dispatchDueSquareContractReminders(db.client, 50, vi.fn(), vi.fn());
    expect(result).toMatchObject({ claimed: 1, sent: 0, suppressed: 1 });
    expect(db.updatePayloads).toContainEqual(expect.objectContaining({
      status: "skipped",
      reason: expect.stringMatching(/already signed/i),
    }));
  });

  it("dispatches one still-unsigned due task and atomically removes it from retry eligibility", async () => {
    const db = fakeSupabase({
      dueRows: [{
        id: "due-unsigned",
        quote_id: quote.id,
        square_payment_id: "square-payment-unsigned",
        scheduled_for: "2026-07-30T18:15:00.000Z",
      }],
    });
    const smsSender = vi.fn().mockResolvedValue({ sent: true, sid: "SMdue" });
    const result = await dispatchDueSquareContractReminders(db.client, 50, smsSender, vi.fn());
    expect(result).toMatchObject({ claimed: 1, sent: 1 });
    expect(smsSender).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("claim_due_crm_square_contract_reminders", { p_limit: 50 });
    expect(db.rpc).not.toHaveBeenCalledWith("claim_crm_square_contract_reminder", expect.anything());
  });
});
