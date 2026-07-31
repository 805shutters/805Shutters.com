import { describe, expect, it } from "vitest";
import { diagnoseFunnel, FunnelSnapshot } from "./funnel-diagnostic";

const snapshot = (patch: Partial<FunnelSnapshot> = {}): FunnelSnapshot => ({
  ad_clicks: 500, website_sessions: 400, leads: 100, appointments: 50,
  quotes: 40, sold_customers: 20, installs: 15, paid_customers: 12,
  captured_at: "2026-07-31T12:00:00.000Z", source_ids: ["snapshot:test"], ...patch
});

describe("funnel diagnostic agent", () => {
  it("stops and escalates contradictory funnel data", () => {
    const result = diagnoseFunnel(snapshot({ appointments: 110 }));
    expect(result.outcome).toBe("escalated");
    expect(result.stopReason).toBe("non_monotonic_funnel_requires_identity_audit");
  });

  it("proposes attribution work before learning from a small sample", () => {
    const result = diagnoseFunnel(snapshot({ leads: 10, appointments: 5, quotes: 4, sold_customers: 2, installs: 1, paid_customers: 1 }));
    expect(result.proposal?.actionType).toBe("data_quality_review");
    expect(result.iterationsUsed).toBeLessThanOrEqual(3);
  });

  it("returns only one preview proposal for the weakest transition", () => {
    const result = diagnoseFunnel(snapshot());
    expect(result.outcome).toBe("proposal");
    expect(result.proposal?.title).toBe("Review website_sessions to leads conversion");
    expect(result.proposal?.summary).toContain("Do not launch");
    expect(result.stopReason).toBe("proposal_limit_reached");
  });
});
