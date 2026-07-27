import { describe, expect, it } from "vitest";
import {
  MANUFACTURER_ORDER_QUEUE_URLS,
  manufacturerOrderBridgeLaunchUrl,
} from "./manufacturer-order-launch";

describe("manufacturer order launch bridge", () => {
  it("stores the four approved manufacturer queue URLs", () => {
    expect(MANUFACTURER_ORDER_QUEUE_URLS).toEqual({
      onyx: "https://admin.onyxshutters.com/OrderList.aspx",
      norman: "https://www.normanwindowcoverings.com/Login/default.asp",
      lotus: "https://www.lotusblind.com/",
      polar: "https://polarshades.picbusiness.com/",
    });
  });

  it("launches the local review-only agent with an opaque task and exact manufacturer", () => {
    expect(manufacturerOrderBridgeLaunchUrl({
      taskId: "onyx:form-123:abcdef123456",
      manufacturer: "Onyx",
    })).toBe(
      "http://127.0.0.1:47635/start?taskId=onyx%3Aform-123%3Aabcdef123456&manufacturer=onyx",
    );
  });

  it("rejects malformed tasks and unknown manufacturers", () => {
    expect(() => manufacturerOrderBridgeLaunchUrl({
      taskId: "bad&portal=https://example.com",
      manufacturer: "Onyx",
    })).toThrow(/identifier is invalid/i);
    expect(() => manufacturerOrderBridgeLaunchUrl({
      taskId: "valid-task-123",
      manufacturer: "Other",
    })).toThrow(/not configured/i);
  });
});
