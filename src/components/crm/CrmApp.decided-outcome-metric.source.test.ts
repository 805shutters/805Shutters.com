import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");

describe("CRM sales-rate header metrics", () => {
  it("shows the three close-rate values without explanatory detail text", () => {
    expect(source).toContain('label="30-Day Close Rate"');
    expect(source).toContain("value={formatCloseRate(commandPerformance.closeRate30Days)}");
    expect(source).toContain('label="60-Day Close Rate"');
    expect(source).toContain("value={formatCloseRate(commandPerformance.closeRate60Days)}");
    expect(source).toContain('label="Current CRM Close Rate"');
    expect(source).toContain("value={formatCloseRate(commandPerformance.currentCrmSalesRate)}");
    expect(source).toContain('import { buildCommandPerformanceMetrics, formatCloseRate } from "@/lib/crm/command-performance"');
    expect(source).not.toContain("customer opportunities");
    expect(source).not.toContain("open follow-ups included");
    expect(source).not.toContain('label="All-Time Close Rate"');
    expect(source).not.toContain('label="Current CRM Decided-Outcome Rate"');
  });

  it("uses a deduplicated sold-order allocation rather than all-row Mike net", () => {
    expect(source).toContain('label="Sold-Order Profit Allocation"');
    expect(source).toContain("Mike 100% / Jessica sales 50%");
    expect(source).toContain("This is projected profit allocation, not cash earnings.");
    expect(source).toContain("buildMikeSoldProfitAllocationSummary(rows)");
    expect(source).toContain("missing COGS");
    expect(source).toContain("incomplete installer costs");
    expect(source).not.toContain('label="Profit"');
    expect(source).not.toContain('sub="Mike net"');
  });
});
