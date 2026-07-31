import { describe, expect, it } from "vitest";
import { approvalKindsForAction, canExecuteProposal, initialMarketingAgentSpec } from "./governance";

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
});
