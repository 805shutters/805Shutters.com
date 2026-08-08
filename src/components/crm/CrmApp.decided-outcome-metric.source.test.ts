import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");

describe("CRM sales-rate header metrics", () => {
  it("shows customer-opportunity denominators and includes open follow-ups", () => {
    expect(source).toContain('label="Current CRM Close Rate"');
    expect(source).toContain("customer opportunities");
    expect(source).toContain("open follow-ups included");
    expect(source).toContain("closeRate30DaysTotal");
    expect(source).toContain("closeRate60DaysTotal");
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
