import { describe, expect, it } from "vitest";
import type { CrmBookkeepingRow, CrmJob, CrmQuote } from "@/lib/crm/types";
import { attributeNormalizedEventsToFunnel, readOnlyChannelAdapters, validateConnectorConfiguration } from "./channel-connectors";

describe("read-only marketing channel connector contracts", () => {
  it("fails closed without exposing secret values", () => {
    const result = validateConnectorConfiguration("google_ads", { GOOGLE_ADS_CUSTOMER_ID: "805-secret-account" }, []);
    expect(result.state).toBe("grant_required");
    expect(result.missingConfiguration).toContain("GOOGLE_ADS_DEVELOPER_TOKEN");
    expect(JSON.stringify(result)).not.toContain("805-secret-account");
    expect(result.mode).toBe("read_only");
  });

  it("does not call configured credentials live without verified account and grant evidence", () => {
    const env = {
      GOOGLE_ADS_CUSTOMER_ID: "1234567890", GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
      GOOGLE_ADS_CLIENT_ID: "oauth-client", GOOGLE_ADS_CLIENT_SECRET: "oauth-secret", GOOGLE_ADS_REFRESH_TOKEN: "refresh-token"
    };
    const result = validateConnectorConfiguration("google_ads", env, ["read_campaigns", "read_reporting"]);
    expect(result.state).toBe("grant_required");
    expect(result.verification).toBeNull();
  });

  it("rejects placeholders and malformed exact account identifiers", () => {
    const google = validateConnectorConfiguration("google_ads", {
      GOOGLE_ADS_CUSTOMER_ID: "805", GOOGLE_ADS_DEVELOPER_TOKEN: "set"
    });
    const meta = validateConnectorConfiguration("meta", {
      META_APP_ID: "your-app", META_APP_SECRET: "replace-me", META_AD_ACCOUNT_ID: "805", META_REPORTING_ACCESS_TOKEN: "changeme"
    });
    expect(google.missingConfiguration).toEqual(expect.arrayContaining(["GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_DEVELOPER_TOKEN"]));
    expect(meta.missingConfiguration).toEqual(expect.arrayContaining(["META_APP_ID", "META_APP_SECRET", "META_AD_ACCOUNT_ID", "META_REPORTING_ACCESS_TOKEN"]));
  });

  it("reports verified read-only only with valid config, permissions, and matching evidence", () => {
    const result = validateConnectorConfiguration("meta", {
      META_APP_ID: "12345678", META_APP_SECRET: "secret-805", META_AD_ACCOUNT_ID: "act_123456", META_REPORTING_ACCESS_TOKEN: "token-805"
    }, ["read_campaigns", "read_reporting"], {
      accountId: "act_123456", verifiedAt: "2026-07-31T20:00:00Z", grantEvidenceId: "meta-grant-receipt-1"
    });
    expect(result.state).toBe("verified_read_only");
    expect(result.blockers).toEqual([]);
  });

  it("keeps Yelp manual-only regardless of supplied values or claimed permissions", () => {
    const result = validateConnectorConfiguration("yelp", { YELP_REPORTING_CLIENT_ID: "misleading" }, ["read_reporting"]);
    expect(result.state).toBe("manual_only");
    expect(result.mode).toBe("manual_only");
  });

  it("rejects mutation permissions even when read configuration is complete", () => {
    const env = { META_APP_ID: "12345678", META_APP_SECRET: "secret-805", META_AD_ACCOUNT_ID: "act_805", META_REPORTING_ACCESS_TOKEN: "token-805" };
    const result = validateConnectorConfiguration("meta", env, ["read_campaigns", "read_reporting", "read_leads", "manage_campaigns"]);
    expect(result.state).toBe("unsafe_permissions");
    expect(result.forbiddenPermissions).toEqual(["manage_campaigns"]);
  });

  it("normalizes valid rows with provenance and quarantines invalid rows", () => {
    const result = readOnlyChannelAdapters.meta.normalize([
      { id: "yelp-1", occurred_at: "2026-07-01T12:00:00Z", event_type: "lead", campaign_id: "campaign-1", crm_lead_id: "lead-805" },
      { id: "", occurred_at: "not-a-date", event_type: "purchase" }
    ], {
      accountId: "act_805", fetchedAt: "2026-07-02T12:00:00Z", sourceObject: "insights",
      permissions: ["read_campaigns", "read_reporting"], verification: { accountId: "act_805", verifiedAt: "2026-07-02T11:00:00Z", grantEvidenceId: "grant-1" }
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({ channel: "facebook", crmLeadId: "lead-805", provenance: { exactCrmLink: true, grantEvidenceId: "grant-1" } });
    expect(result.quarantined[0].reasons).toEqual(expect.arrayContaining(["missing_provider_record_id", "invalid_occurred_at", "invalid_event_type"]));
  });

  it("never infers a CRM identity when no exact CRM lead ID is supplied", () => {
    const result = readOnlyChannelAdapters.google_ads.normalize([
      { id: "click-1", occurred_at: "2026-07-01T12:00:00Z", event_type: "click", external_lead_id: "external-only" }
    ], { accountId: "google-805", fetchedAt: "2026-07-02T12:00:00Z", sourceObject: "click-view", permissions: ["read_reporting"] });
    expect(result.accepted).toHaveLength(0);
    expect(result.quarantined[0].reasons).toContain("unverified_account_grant");
  });

  it("attributes one exact lead across its CRM funnel and excludes unlinked imports", () => {
    const normalized = readOnlyChannelAdapters.meta.normalize([
      { id: "meta-lead", occurred_at: "2026-07-01T12:00:00Z", event_type: "lead", crm_lead_id: "lead-805", campaign_id: "c1", creative_id: "a1" },
      { id: "meta-unlinked", occurred_at: "2026-07-01T12:01:00Z", event_type: "lead" }
    ], { accountId: "meta-805", fetchedAt: "2026-07-02T12:00:00Z", sourceObject: "leadgen", permissions: ["read_campaigns", "read_reporting"], verification: { accountId: "meta-805", verifiedAt: "2026-07-02T11:00:00Z", grantEvidenceId: "grant-2" } });
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
