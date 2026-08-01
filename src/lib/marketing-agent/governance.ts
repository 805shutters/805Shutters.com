export const INITIAL_MARKETING_AGENT_ID = "funnel-diagnostic-v1" as const;

export const marketingApprovalKinds = [
  "spend_money",
  "publish_content",
  "modify_pricing",
  "send_communication",
  "write_crm",
  "operate_external_account"
] as const;

export type MarketingApprovalKind = (typeof marketingApprovalKinds)[number];
export type MarketingProposalStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "expired"
  | "executed"
  | "failed";

export type MarketingAgentSpec = {
  id: typeof INITIAL_MARKETING_AGENT_ID;
  job: string;
  trigger: string;
  allowedContext: readonly string[];
  toolPermissions: readonly string[];
  allowedActions: readonly string[];
  approvalsRequired: readonly MarketingApprovalKind[];
  escalationConditions: readonly string[];
  successMetrics: readonly string[];
  limits: {
    maxIterations: number;
    maxProposalsPerRun: number;
    maxRuntimeSeconds: number;
  };
};

export const initialMarketingAgentSpec: MarketingAgentSpec = {
  id: INITIAL_MARKETING_AGENT_ID,
  job: "Find the most important measurable break in the 805 lead-to-revenue funnel and prepare one evidence-backed improvement proposal.",
  trigger: "Manual control-room run; scheduled preview may be added only after historical evaluation passes.",
  allowedContext: [
    "aggregated advertising performance imported read-only",
    "aggregated website sessions and conversion events",
    "805 leads and exact lead-to-job identifiers",
    "appointments, quotes, sold status, installation status, and recorded revenue",
    "approved creative patterns and prior proposal outcomes"
  ],
  toolPermissions: [
    "read approved funnel snapshots",
    "calculate deterministic metrics",
    "write only marketing-agent runs, evidence, proposals, and audit events",
    "create internal drafts and preview artifacts"
  ],
  allowedActions: [
    "identify missing or low-quality funnel data",
    "rank one diagnostic opportunity",
    "prepare an internal analysis, creative brief, or experiment proposal",
    "request a human approval",
    "stop with an escalation or no-action result"
  ],
  approvalsRequired: [...marketingApprovalKinds],
  escalationConditions: [
    "customer identity cannot be joined by exact identifiers",
    "source data is stale, incomplete, contradictory, or below sample threshold",
    "proposal could affect spend, publication, pricing, communications, CRM records, or an external account",
    "iteration, proposal, or runtime limit is reached",
    "requested action is outside this agent specification"
  ],
  successMetrics: [
    "historical precision of diagnosed funnel breaks",
    "percentage of proposals accepted by a human reviewer",
    "approved experiment lift in qualified appointments and sold customers",
    "installed revenue per attributable lead and per approved ad dollar",
    "zero unapproved production or external actions"
  ],
  limits: { maxIterations: 3, maxProposalsPerRun: 1, maxRuntimeSeconds: 30 }
};

export function approvalKindsForAction(action: string): MarketingApprovalKind[] {
  const normalized = action.toLowerCase();
  const required = new Set<MarketingApprovalKind>();
  if (/budget|bid|spend|purchase|payment/.test(normalized)) required.add("spend_money");
  if (/publish|post|launch|activate|live/.test(normalized)) required.add("publish_content");
  if (/price|discount|offer|catalog/.test(normalized)) required.add("modify_pricing");
  if (/email|sms|message|contact|outreach|reply/.test(normalized)) required.add("send_communication");
  if (/crm|lead|job|quote|appointment|sale|install|payment|revenue/.test(normalized)) required.add("write_crm");
  if (/meta|facebook|google|yelp|vendor|account/.test(normalized)) required.add("operate_external_account");
  return [...required];
}

export function canExecuteProposal(input: {
  status: MarketingProposalStatus;
  requiredApprovals: readonly MarketingApprovalKind[];
  grantedApprovals: readonly MarketingApprovalKind[];
}) {
  if (input.status !== "approved") return false;
  const granted = new Set(input.grantedApprovals);
  return input.requiredApprovals.every((approval) => granted.has(approval));
}

export type MarketingApprovalRecord = {
  kind: MarketingApprovalKind;
  decision: "approved" | "rejected" | "revoked";
  decidedByAuthUserId: string | null;
  decidedAt: string;
};

export function authorizeProposal(input: {
  status: MarketingProposalStatus;
  requiredApprovals: readonly MarketingApprovalKind[];
  approvals: readonly MarketingApprovalRecord[];
  expiresAt: string | null;
  now: string;
}) {
  const reasons: string[] = [];
  if (input.status !== "approved") reasons.push("proposal_not_approved");
  if (!Number.isFinite(Date.parse(input.now))) reasons.push("invalid_evaluation_time");
  if (!input.expiresAt || !Number.isFinite(Date.parse(input.expiresAt))) reasons.push("missing_or_invalid_expiry");
  else if (Date.parse(input.expiresAt) <= Date.parse(input.now)) reasons.push("proposal_expired");

  for (const kind of input.requiredApprovals) {
    const decisions = input.approvals
      .filter((approval) => approval.kind === kind)
      .sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt));
    const latest = decisions[0];
    if (!latest || latest.decision !== "approved") reasons.push(`approval_missing:${kind}`);
    else if (!latest.decidedByAuthUserId) reasons.push(`approval_identity_missing:${kind}`);
    else if (!Number.isFinite(Date.parse(latest.decidedAt))) reasons.push(`approval_time_invalid:${kind}`);
  }
  return { authorized: reasons.length === 0, reasons };
}
