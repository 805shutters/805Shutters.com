import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("marketing agent readiness surface", () => {
  it("documents the verified unavailable/manual channel states without live claims", () => {
    const source = readFileSync("src/components/crm/MarketingAgentPanel.tsx", "utf8");
    const docs = readFileSync("docs/marketing-agent-foundation.md", "utf8");
    expect(source).toContain("connector.state.replaceAll");
    expect(docs).toContain("Google Ads — grant required");
    expect(docs).toContain("Meta Ads — grant required");
    expect(docs).toContain("Yelp — manual only");
    expect(docs).toContain("Configuration presence is not live verification");
  });
});
