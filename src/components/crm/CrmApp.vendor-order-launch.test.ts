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

  it("routes each supported manufacturer without relabeling Onyx as Norman", () => {
    expect(source).toContain('label: "Start Order Entry"');
    expect(source).toContain('entry.vendorOrderTask?.manufacturer === "Norman" ? "Review-only Norman draft" : "Onyx shutters from submitted measure"');
    expect(source).toContain("onVendorOrderLaunch(entry.vendorOrderTask");
    expect(source).toContain("The order will not be placed.");
    expect(source).toContain('"https://admin.onyxshutters.com/OrderList.aspx"');
    expect(source).toContain("Use the submitted technical measure and review before placing.");
  });
});
