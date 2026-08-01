import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("authenticated marketing agent route", () => {
  it("uses server-derived evidence and persists only governed records", () => {
    const source = readFileSync("src/app/api/crm/marketing-agent/route.ts", "utf8");
    expect(source).toContain("requireCrmUser(request)");
    expect(source).not.toContain("request.json()");
    expect(source).toContain('completeSources: ["crm"]');
    expect(source).toContain('from("crm_marketing_agent_runs").insert(record)');
    expect(source).not.toMatch(/fetch\(|googleads|graph\.facebook/i);
  });
});
