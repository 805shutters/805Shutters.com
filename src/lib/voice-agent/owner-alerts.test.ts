import { describe, expect, it } from "vitest";
import {
  buildVoiceAgentOwnerSms,
  normalizeVoiceAgentAlertType,
  voiceAgentAlertRecipient,
} from "@/lib/voice-agent/owner-alerts";

describe("voice agent owner alerts", () => {
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
