import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");

describe("CRM vendor-order launch workflow", () => {
  it("shows Ready to Order only when queued submitted-measure tasks exist", () => {
    expect(source).toContain('const readyToOrderCount = vendorOrderTasks.length');
    expect(source).toContain('{readyToOrderCount > 0 ? (');
    expect(source).toContain('<Metric label="Ready to Order"');
    expect(source).toContain('openSummaryDrill("readyToOrder")');
  });

  it("offers an intentional review-only launch action from the customer drill card", () => {
    expect(source).toContain('label: "Start Order Entry"');
    expect(source).toContain('detail: "Review-only Norman draft"');
    expect(source).toContain("onVendorOrderLaunch(entry.vendorOrderTask");
    expect(source).toContain("The order will not be placed.");
  });
});
