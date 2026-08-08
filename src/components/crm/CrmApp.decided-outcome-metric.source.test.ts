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
});
