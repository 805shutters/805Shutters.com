import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");

describe("CRM decided-outcome header metric", () => {
  it("labels the current decided cohort and explains its denominator", () => {
    expect(source).toContain('label="Current CRM Decided-Outcome Rate"');
    expect(source).toContain("decided customer outcomes");
    expect(source).toContain("open excluded");
    expect(source).not.toContain('label="All-Time Close Rate"');
  });
});
