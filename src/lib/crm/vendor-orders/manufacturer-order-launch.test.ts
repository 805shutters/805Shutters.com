import { describe, expect, it } from "vitest";
import {
  MANUFACTURER_ORDER_QUEUE_URLS,
  manufacturerOrderChromeLaunchUrl,
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

  it("opens the exact manufacturer queue in the current Chrome profile", () => {
    expect(manufacturerOrderChromeLaunchUrl({
      taskId: "onyx:form-123:abcdef123456",
      manufacturer: "Onyx",
    })).toBe("https://admin.onyxshutters.com/OrderList.aspx");
  });

  it("rejects malformed tasks and unknown manufacturers", () => {
    expect(() => manufacturerOrderChromeLaunchUrl({
      taskId: "bad&portal=https://example.com",
      manufacturer: "Onyx",
    })).toThrow(/identifier is invalid/i);
    expect(() => manufacturerOrderChromeLaunchUrl({
      taskId: "valid-task-123",
      manufacturer: "Other",
    })).toThrow(/not configured/i);
  });
});
