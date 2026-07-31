import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/components/crm/CrmApp.tsx", "utf8");
const salesIntelligenceSource = readFileSync("src/components/crm/SalesIntelligencePage.tsx", "utf8");
const panelSource = readFileSync("src/components/crm/MarketingAgentPanel.tsx", "utf8");

describe("Sales Intelligence marketing-agent surface", () => {
  it("is embedded in the existing Sales Intelligence page with live dashboard inputs", () => {
    expect(appSource).toContain("<SalesIntelligencePage");
    expect(appSource).toContain("rows={rows}");
    expect(salesIntelligenceSource).toContain('import { MarketingAgentPanel } from "@/components/crm/MarketingAgentPanel"');
    expect(salesIntelligenceSource).toContain("<MarketingAgentPanel jobs={jobs} quotes={quotes} rows={rows} />");
  });

  it("shows the three primary channels and strict preview boundary", () => {
    expect(panelSource).toContain("Sales Intelligence · Ventura County");
    expect(panelSource).toContain("Google, Yelp, and Facebook gaps remain visible.");
    expect(panelSource).toContain("No ad access, scheduling, spend, publishing, messages, pricing changes, or production CRM writes.");
    expect(panelSource).toContain("Not connected. No performance values shown.");
  });

  it("does not expose an execution control", () => {
    expect(panelSource).not.toContain("onClick=");
    expect(panelSource).not.toContain("crmFetch");
    expect(panelSource).not.toContain("fetch(");
  });
});
