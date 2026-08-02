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

  it("emails every manufacturer packet to the 805 Codex intake inbox", () => {
    expect(source).toContain('"Email Codex Order Packet"');
    expect(source).toContain("/email");
    expect(source).toContain('["queued", "processing"].includes(entry.vendorOrderTask.status)');
    expect(source).toContain("805@805shutters.com");
    expect(source).toContain("task.productNames.join");
    expect(source).toContain("task.lineCount");
    expect(source).toContain("onVendorOrderEmail(entry.vendorOrderTask");
    expect(source).toContain("The task remains Ready to Order.");
    expect(source).toContain("same customer and job identity");
    expect(source).toContain('label: "Mark Review Ready"');
    expect(source).toContain('label: "Confirm Manufacturer Order"');
    expect(source).toContain('key: "vendor-order-bypass"');
    expect(source).toContain('label: "Mark Ordered"');
    expect(source).toContain('detail: "Bypass Codex packet"');
    expect(source).toContain("entry.vendorOrderTask && isAlreadyOrdered && onVendorOrderAction");
    expect(source).toContain('onVendorOrderAction(entry.vendorOrderTask as CrmVendorOrderTask, "bypass")');
  });

  it("opens protected order packets through the active CRM session", () => {
    expect(source).toContain("async function openVendorOrderPacket");
    expect(source).toContain("Authorization: `Bearer ${session.access_token}`");
    expect(source).toContain("URL.createObjectURL(await response.blob())");
    expect(source).toContain("onVendorOrderPacket(entry.vendorOrderTask");
  });

  it("opens View Measure in the desktop CRM measure workspace", () => {
    expect(source).toContain('window.open(`/crm/measure/${measureFormId}`');
    expect(source).toContain('href={`/crm/measure/${savedForm.id}`}');
    expect(source).not.toContain('window.open(`/crm/technical-measures/${measureFormId}`');
    expect(source).not.toContain('href={`/crm/technical-measures/${savedForm.id}`}');
  });

  it("shows the selected Ready to Order customer's saved measure in a desktop split pane", () => {
    expect(source).toContain('payload.metric === "readyToOrder"');
    expect(source).toContain("<TechnicalMeasurePreviewPane");
    expect(source).toContain('aria-label={`Saved Technical Measure for ${customerName}`}');
    expect(source).toContain('title={`${customerName} saved Technical Measure`}');
    expect(source).toContain('src={url}');
    expect(source).toContain('crm-global-search-body--contract');
  });
});
