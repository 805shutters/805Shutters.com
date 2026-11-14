import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildVoiceAgentOwnerSms,
  normalizeVoiceAgentAlertType,
  sendVoiceAgentOwnerAlert,
  voiceAgentAlertRecipient,
  voicemailNotificationRecipients,
} from "@/lib/voice-agent/owner-alerts";

const sendSms = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notify/twilio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notify/twilio")>();
  return { ...actual, sendSms };
});

describe("voice agent owner alerts", () => {
  beforeEach(() => {
    sendSms.mockReset();
    sendSms.mockResolvedValue({ sent: true, sid: "SMvoicemail" });
    vi.stubEnv("805_VOICE_ALERT_SMS_NUMBER", "805-298-5555");
  });

  it("normalizes supported alert types", () => {
    expect(normalizeVoiceAgentAlertType("voicemail")).toBe("voicemail");
    expect(normalizeVoiceAgentAlertType("call summary")).toBe("call_summary");
    expect(normalizeVoiceAgentAlertType("anything else")).toBe("missed_call");
  });

  it("prefers the dedicated voice alert recipient", () => {
    expect(
      voiceAgentAlertRecipient({
        "805_VOICE_ALERT_SMS_NUMBER": "8055551111",
        MIKE_805_SALES_SMS_NUMBER: "8055552222",
      }),
    ).toBe("8055551111");
  });

  it("texts a new voicemail to the existing recipient and Jessica", async () => {
    expect(voicemailNotificationRecipients()).toEqual(["805-298-5555", "805-914-4917"]);
    const input = {
      type: "voicemail",
      callerName: "Jane Customer",
      callerPhone: "805-555-0100",
      message: "Please call back.",
    };

    const result = await sendVoiceAgentOwnerAlert(input);

    expect(result.sent).toBe(true);
    expect(sendSms).toHaveBeenCalledTimes(2);
    expect(sendSms).toHaveBeenNthCalledWith(1, {
      to: "805-298-5555",
      body: buildVoiceAgentOwnerSms(input),
      ownerAlert: true,
    });
    expect(sendSms).toHaveBeenNthCalledWith(2, {
      to: "805-914-4917",
      body: buildVoiceAgentOwnerSms(input),
      ownerAlert: false,
    });
  });

  it("keeps missed-call and call-summary alerts on the single existing recipient", async () => {
    await sendVoiceAgentOwnerAlert({ type: "missed_call", callerName: "Jane" });
    await sendVoiceAgentOwnerAlert({ type: "call_summary", callerName: "Jane" });

    expect(sendSms).toHaveBeenCalledTimes(2);
    expect(sendSms.mock.calls.map((call) => call[0].to)).toEqual(["805-298-5555", "805-298-5555"]);
    expect(sendSms.mock.calls.every((call) => call[0].ownerAlert === true)).toBe(true);
  });

  it("formats a concise voicemail alert", () => {
    expect(
      buildVoiceAgentOwnerSms({
        type: "voicemail",
        callerName: "Jane Customer",
        callerPhone: "805-555-0100",
        message: "Needs shutters for a home in Camarillo and prefers a call back today.",
        callbackWindow: "After 2 PM",
        callId: "call_123",
      }),
    ).toBe(
      "805 Shutters voicemail: Jane Customer, 805-555-0100. Message: Needs shutters for a home in Camarillo and prefers a call back today. Callback: After 2 PM. Call ID: call_123.",
    );
  });
});
