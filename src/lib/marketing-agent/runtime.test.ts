import { describe, expect, it } from "vitest";
import { durableRunRecord, evaluateMarketingRun, type MarketingSnapshotEnvelope } from "./runtime";

const envelope = (): MarketingSnapshotEnvelope => ({
  completeSources: ["channel_reporting", "website_analytics", "crm", "payments"],
  snapshot: { ad_clicks: 100, website_sessions: 80, leads: 30, appointments: 20, quotes: 12, sold_customers: 7, installs: 5, paid_customers: 4, captured_at: "2026-07-31T20:00:00Z", source_ids: ["google:account:report-1", "crm:snapshot-1"] }
});

describe("marketing agent durable runtime", () => {
  it("refuses to diagnose when any required source is missing", () => {
    const input = envelope();
    input.completeSources = ["crm", "payments"];
    const result = evaluateMarketingRun(input);
    expect(result).toMatchObject({ status: "escalated", stopReason: "incomplete_source_snapshot", diagnostic: null });
    expect(result.missingSources).toEqual(["channel_reporting", "website_analytics"]);
  });

  it("creates a bounded persistence record without execution authority", () => {
    const input = envelope();
    const result = evaluateMarketingRun(input);
    const record = durableRunRecord(input, result);
    expect(record.iteration_budget).toBe(3);
    expect(record.proposal_budget).toBe(1);
    expect(record.trigger_type).toBe("manual_control_room");
    expect(JSON.stringify(record)).not.toMatch(/access_token|client_secret/i);
  });
});
