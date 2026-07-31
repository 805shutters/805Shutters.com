import { describe, expect, it } from "vitest";
import type { CrmBookkeepingRow, CrmJob, CrmQuote } from "@/lib/crm/types";
import { buildMarketingIntelligence } from "./sales-intelligence";
import { recommendVenturaCampaign } from "./campaign-recommendation";

const job = (patch: Partial<CrmJob>): CrmJob => ({
  id: "job-1", created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
  source: "website", lead_id: null, status: "new", priority: "normal", customer_name: "Test Person",
  phone: "", email: null, address: null, city: "Ventura", product_interest: "Shutters", sales_owner: "Mike",
  next_action: null, next_action_due: null, appointment_start: null, appointment_end: null,
  estimated_total: 0, deposit_paid: 0, notes: null, meta: {}, ...patch
});

function recommendation(jobs: CrmJob[]) {
  const intelligence = buildMarketingIntelligence(jobs, [] as CrmQuote[], [] as CrmBookkeepingRow[]);
  return recommendVenturaCampaign(jobs, intelligence);
}

describe("Ventura campaign recommendation preview", () => {
  it("uses exact evidence to produce a measurement candidate without a performance claim", () => {
    const result = recommendation([
      job({ id: "g-1", lead_id: "lead-g-1", lead_source: "Google Ads", city: "Oxnard", product_interest: "Roller Shades", meta: { utm_campaign: "ventura-shades" } }),
      job({ id: "g-2", lead_id: "lead-g-2", lead_source: "Google Ads", city: "Oxnard", product_interest: "Roller Shades" }),
      job({ id: "y-1", lead_id: "lead-y-1", lead_source: "Yelp", city: "Camarillo", product_interest: "Shutters" })
    ]);
    expect(result).toMatchObject({ status: "preview_only", confidence: "insufficient", proposedChannel: "google", serviceArea: "Oxnard" });
    expect(result.productHypothesis).toContain("measurement candidate, not a performance claim");
    expect(result.requiredApprovals).toEqual(expect.arrayContaining(["spend_money", "publish_content", "write_crm", "operate_external_account"]));
  });

  it("falls back to an evidence-gap plan instead of inventing an area or product", () => {
    const result = recommendation([job({})]);
    expect(result.proposedChannel).toBe("google");
    expect(result.serviceArea).toContain("pending exact city evidence");
    expect(result.productHypothesis).toContain("Do not select product creative");
    expect(result.stopConditions).toContain("Stop if fewer than 20 exact attributable leads are available for evaluation.");
  });
});
