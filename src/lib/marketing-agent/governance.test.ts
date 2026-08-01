import { describe, expect, it } from "vitest";
import { approvalKindsForAction, authorizeProposal, canExecuteProposal, initialMarketingAgentSpec } from "./governance";

describe("marketing agent governance", () => {
  it("keeps the initial loop tightly bounded", () => {
    expect(initialMarketingAgentSpec.limits).toEqual({ maxIterations: 3, maxProposalsPerRun: 1, maxRuntimeSeconds: 30 });
    expect(initialMarketingAgentSpec.approvalsRequired).toContain("spend_money");
    expect(initialMarketingAgentSpec.approvalsRequired).toContain("write_crm");
  });

  it("classifies consequential actions into explicit approvals", () => {
    expect(approvalKindsForAction("Launch a Meta campaign and update CRM leads")).toEqual(
      expect.arrayContaining(["publish_content", "write_crm", "operate_external_account"])
    );
  });

  it("never treats partial or proposed approval as executable", () => {
    expect(canExecuteProposal({ status: "proposed", requiredApprovals: ["publish_content"], grantedApprovals: ["publish_content"] })).toBe(false);
    expect(canExecuteProposal({ status: "approved", requiredApprovals: ["publish_content", "spend_money"], grantedApprovals: ["publish_content"] })).toBe(false);
    expect(canExecuteProposal({ status: "approved", requiredApprovals: ["publish_content"], grantedApprovals: ["publish_content"] })).toBe(true);
  });

  it("fails closed on expired, anonymous, or revoked durable approvals", () => {
    const result = authorizeProposal({
      status: "approved", requiredApprovals: ["publish_content", "spend_money"],
      expiresAt: "2026-08-01T00:00:00Z", now: "2026-08-02T00:00:00Z",
      approvals: [
        { kind: "publish_content", decision: "approved", decidedByAuthUserId: null, decidedAt: "2026-07-31T00:00:00Z" },
        { kind: "spend_money", decision: "approved", decidedByAuthUserId: "user-1", decidedAt: "2026-07-30T00:00:00Z" },
        { kind: "spend_money", decision: "revoked", decidedByAuthUserId: "user-1", decidedAt: "2026-07-31T00:00:00Z" }
      ]
    });
    expect(result.authorized).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(["proposal_expired", "approval_identity_missing:publish_content", "approval_missing:spend_money"]));
  });
});
