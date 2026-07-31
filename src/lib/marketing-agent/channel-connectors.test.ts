import { describe, expect, it } from "vitest";
import type { CrmBookkeepingRow, CrmJob, CrmQuote } from "@/lib/crm/types";
import { attributeNormalizedEventsToFunnel, readOnlyChannelAdapters, validateConnectorConfiguration } from "./channel-connectors";

describe("read-only marketing channel connector contracts", () => {
  it("fails closed without exposing secret values", () => {
    const result = validateConnectorConfiguration("google_ads", { GOOGLE_ADS_CUSTOMER_ID: "805-secret-account" }, []);
    expect(result.state).toBe("configuration_required");
    expect(result.missingConfiguration).toContain("GOOGLE_ADS_DEVELOPER_TOKEN");
    expect(JSON.stringify(result)).not.toContain("805-secret-account");
    expect(result.mode).toBe("read_only");
  });

  it("rejects mutation permissions even when read configuration is complete", () => {
    const env = {
      META_APP_ID: "set", META_APP_SECRET: "set", META_PAGE_ID: "set",
      META_PAGE_ACCESS_TOKEN: "set", META_LEADS_VERIFY_TOKEN: "set"
    };
    const result = validateConnectorConfiguration("meta", env, ["read_campaigns", "read_reporting", "read_leads", "manage_campaigns"]);
    expect(result.state).toBe("unsafe_permissions");
    expect(result.forbiddenPermissions).toEqual(["manage_campaigns"]);
  });

  it("normalizes valid rows with provenance and quarantines invalid rows", () => {
    const result = readOnlyChannelAdapters.yelp.normalize([
      { id: "yelp-1", occurred_at: "2026-07-01T12:00:00Z", event_type: "lead", campaign_id: "campaign-1", crm_lead_id: "lead-805" },
      { id: "", occurred_at: "not-a-date", event_type: "purchase" }
    ], {
      accountId: "805-yelp", fetchedAt: "2026-07-02T12:00:00Z", sourceObject: "daily-report",
      permissions: ["read_reporting", "read_leads"]
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({ channel: "yelp", crmLeadId: "lead-805", provenance: { exactCrmLink: true } });
    expect(result.quarantined[0].reasons).toEqual(expect.arrayContaining(["missing_provider_record_id", "invalid_occurred_at", "invalid_event_type"]));
  });

  it("never infers a CRM identity when no exact CRM lead ID is supplied", () => {
    const result = readOnlyChannelAdapters.google_ads.normalize([
      { id: "click-1", occurred_at: "2026-07-01T12:00:00Z", event_type: "click", external_lead_id: "external-only" }
    ], { accountId: "google-805", fetchedAt: "2026-07-02T12:00:00Z", sourceObject: "click-view", permissions: ["read_reporting"] });
    expect(result.accepted[0].crmLeadId).toBeNull();
    expect(result.accepted[0].provenance.exactCrmLink).toBe(false);
  });

  it("attributes one exact lead across its CRM funnel and excludes unlinked imports", () => {
    const normalized = readOnlyChannelAdapters.meta.normalize([
      { id: "meta-lead", occurred_at: "2026-07-01T12:00:00Z", event_type: "lead", crm_lead_id: "lead-805", campaign_id: "c1", creative_id: "a1" },
      { id: "meta-unlinked", occurred_at: "2026-07-01T12:01:00Z", event_type: "lead" }
    ], { accountId: "meta-805", fetchedAt: "2026-07-02T12:00:00Z", sourceObject: "leadgen", permissions: ["read_leads"] });
    const jobs = [{ id: "job-1", lead_id: "lead-805", status: "installed", appointment_start: "2026-07-03", city: "Ventura", product_interest: "Shutters" } as CrmJob];
    const result = attributeNormalizedEventsToFunnel(
      normalized.accepted,
      jobs,
      [{ id: "quote-1", job_id: "job-1" } as CrmQuote],
      [{ jobId: "job-1", paidTotal: 100 } as CrmBookkeepingRow]
    );
    expect(result.attributed[0]).toMatchObject({
      crmLeadId: "lead-805", channel: "facebook",
      stages: { lead: true, appointment: true, quote: true, sale: true, install: true, paid: true }
    });
    expect(result.excluded).toEqual([{ providerRecordId: "meta-unlinked", reason: "missing_exact_crm_lead_id" }]);
  });
});
