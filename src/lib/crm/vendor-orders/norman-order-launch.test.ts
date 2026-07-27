import { describe, expect, it } from "vitest";
import { NORMAN_ORDER_BRIDGE_URL, normanOrderBridgeLaunchUrl } from "./norman-order-launch";

describe("Norman order launch bridge", () => {
  it("targets only the local review-only runner with an opaque task id", () => {
    expect(NORMAN_ORDER_BRIDGE_URL).toBe("http://127.0.0.1:47635");
    expect(normanOrderBridgeLaunchUrl("task_12345678")).toBe(
      "http://127.0.0.1:47635/start?taskId=task_12345678",
    );
    expect(normanOrderBridgeLaunchUrl("norman:form-123:abcdef123456")).toBe(
      "http://127.0.0.1:47635/start?taskId=norman%3Aform-123%3Aabcdef123456",
    );
  });

  it("rejects malformed task ids instead of adding arbitrary query data", () => {
    expect(() => normanOrderBridgeLaunchUrl("bad&secret=value")).toThrow(/identifier is invalid/i);
  });
});
