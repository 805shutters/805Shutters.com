import { describe, expect, it } from "vitest";
import {
  assertTopicApprovalAllowed,
  feedbackCallbackData,
  parseFeedbackCallbackData
} from "./feedback-workflow";

describe("CRM feedback approval isolation", () => {
  const topic = { status: "ready_for_implementation_approval" as const, revision: 3 };

  it("accepts only the exact topic revision and approval stage", () => {
    expect(() => assertTopicApprovalAllowed(topic, "implementation", 3)).not.toThrow();
    expect(() => assertTopicApprovalAllowed(topic, "implementation", 2)).toThrow(/stale/i);
    expect(() => assertTopicApprovalAllowed(topic, "deployment", 3)).toThrow(/not waiting/i);
  });

  it("round-trips topic-specific Telegram callback data", () => {
    const id = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";
    expect(parseFeedbackCallbackData(feedbackCallbackData(id, 7, "deployment"))).toEqual({
      id,
      revision: 7,
      type: "deployment"
    });
    expect(parseFeedbackCallbackData("approve")).toBeNull();
  });
});
