import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const queueRoute = readFileSync(
  new URL("../../app/api/integrations/hermes/805/crm-feedback/route.ts", import.meta.url),
  "utf8"
);
const topicRoute = readFileSync(
  new URL("../../app/api/integrations/hermes/805/crm-feedback/[id]/route.ts", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL("../../../supabase/migrations/20260726120000_create_crm_feedback_requests.sql", import.meta.url),
  "utf8"
);
const claimRenewalMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260727211718_renew_crm_feedback_processing_claims.sql",
    import.meta.url,
  ),
  "utf8",
);
const companyScopeMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260727213644_scope_crm_feedback_to_805.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Hermes CRM feedback integration contract", () => {
  it("exposes only exact approval-gated queue statuses", () => {
    expect(queueRoute).toContain('"clarifying", "implementation_approved", "deployment_approved"');
    expect(queueRoute).toContain('action?: "claim" | "renew_claim"');
    expect(queueRoute).toContain("claim_crm_feedback_request");
  });

  it("requires exact claim, revision, and idempotency data for every topic action", () => {
    for (const action of [
      "submit_clarification",
      "submit_assessment",
      "begin_implementation",
      "submit_completed_proposal",
      "begin_deployment",
      "mark_completed"
    ]) {
      expect(topicRoute).toContain(action);
    }
    expect(topicRoute).toContain("body.claimToken !== topic.hermes_claim_token");
    expect(topicRoute).toContain("body.revision !== topic.revision");
    expect(topicRoute).toContain("external_event_id");
  });

  it("implements atomic leases and event deduplication in the database", () => {
    expect(migration).toContain("create or replace function public.claim_crm_feedback_request");
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain("external_event_id text unique");
    expect(migration).toContain("request.hermes_claimed_by = p_claimed_by");
    expect(claimRenewalMigration).toContain("'implementing', 'deploying'");
  });

  it("keeps every transition conditional on the exact claim token", () => {
    expect(topicRoute).toContain('.eq("hermes_claim_token", body.claimToken)');
  });

  it("locks topics, approvals, and claims to company scope 805", () => {
    expect(companyScopeMigration).toContain("company_scope text not null default '805'");
    expect(companyScopeMigration).toContain("check (company_scope = '805')");
    expect(companyScopeMigration).toContain("p_company_scope text");
    expect(companyScopeMigration).toContain("request.company_scope = p_company_scope");
    expect(queueRoute).toContain('.eq("company_scope", "805")');
    expect(queueRoute).toContain('company === "805"');
  });
});
