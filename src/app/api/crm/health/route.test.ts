import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/api/crm/health/route.ts", "utf8");

describe("CRM health migration readiness", () => {
  it("probes the partial acceptance RPC without targeting a real quote", () => {
    expect(source).toContain('p_quote_id: "00000000-0000-0000-0000-000000000000"');
    expect(source).toContain('partialAcceptanceProbeError?.code === "P0002"');
    expect(source).toContain("partialAcceptanceRpcReady");
  });
});
