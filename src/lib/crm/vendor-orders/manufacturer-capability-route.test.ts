import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/api/crm/order-entry-capabilities/route.ts", "utf8");

describe("manufacturer order capability audit route", () => {
  it("is authenticated and publishes the never-submit boundary", () => {
    expect(source).toContain("requireCrmUser(request)");
    expect(source).toContain("MANUFACTURER_ORDER_CAPABILITY_MATRIX");
    expect(source).toContain("review_only_never_submit_checkout_pay_or_email");
  });
});
