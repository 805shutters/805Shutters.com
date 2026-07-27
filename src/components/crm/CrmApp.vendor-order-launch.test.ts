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

  it("routes every manufacturer through its own submitted-measure task", () => {
    expect(source).toContain('"Open Ordering Agent in Chrome"');
    expect(source).toContain("manufacturerOrderChromeLaunchUrl");
    expect(source).toContain('["queued", "processing"].includes(entry.vendorOrderTask.status)');
    expect(source).toContain("this Chrome profile");
    expect(source).toContain("task.productNames.join");
    expect(source).toContain("task.lineCount");
    expect(source).toContain("onVendorOrderLaunch(entry.vendorOrderTask");
    expect(source).toContain("The order will not be placed.");
    expect(source).toContain("Sign in there if prompted.");
    expect(source).toContain("same customer and job identity");
    expect(source).toContain('label: "Mark Review Ready"');
    expect(source).toContain('label: "Confirm Manufacturer Order"');
  });

  it("opens protected order packets through the active CRM session", () => {
    expect(source).toContain("async function openVendorOrderPacket");
    expect(source).toContain("Authorization: `Bearer ${session.access_token}`");
    expect(source).toContain("URL.createObjectURL(await response.blob())");
    expect(source).toContain("onVendorOrderPacket(entry.vendorOrderTask");
  });
});
