import { diagnoseFunnel, type FunnelDiagnostic, type FunnelSnapshot } from "./funnel-diagnostic";
import { initialMarketingAgentSpec } from "./governance";

export type MarketingSnapshotEnvelope = {
  snapshot: FunnelSnapshot;
  completeSources: readonly ("channel_reporting" | "website_analytics" | "crm" | "payments")[];
};

export type MarketingRunResult = {
  status: "completed" | "escalated";
  stopReason: string;
  diagnostic: FunnelDiagnostic | null;
  missingSources: string[];
};

const requiredSources = ["channel_reporting", "website_analytics", "crm", "payments"] as const;

export function evaluateMarketingRun(envelope: MarketingSnapshotEnvelope): MarketingRunResult {
  const supplied = new Set(envelope.completeSources);
  const missingSources = requiredSources.filter((source) => !supplied.has(source));
  if (missingSources.length) {
    return {
      status: "escalated",
      stopReason: "incomplete_source_snapshot",
      diagnostic: null,
      missingSources
    };
  }
  const diagnostic = diagnoseFunnel(envelope.snapshot);
  return {
    status: diagnostic.outcome === "escalated" ? "escalated" : "completed",
    stopReason: diagnostic.stopReason,
    diagnostic,
    missingSources: []
  };
}

export function durableRunRecord(envelope: MarketingSnapshotEnvelope, result: MarketingRunResult) {
  return {
    agent_id: initialMarketingAgentSpec.id,
    agent_version: "1",
    trigger_type: "manual_control_room",
    status: result.status,
    completed_at: new Date().toISOString(),
    iteration_budget: initialMarketingAgentSpec.limits.maxIterations,
    iterations_used: result.diagnostic?.iterationsUsed ?? 1,
    proposal_budget: initialMarketingAgentSpec.limits.maxProposalsPerRun,
    proposals_created: result.diagnostic?.proposal ? 1 : 0,
    runtime_budget_seconds: initialMarketingAgentSpec.limits.maxRuntimeSeconds,
    stop_reason: result.stopReason,
    source_snapshot: envelope,
    metrics: { missingSources: result.missingSources, evidence: result.diagnostic?.evidence ?? {} }
  };
}
