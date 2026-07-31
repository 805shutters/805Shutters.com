import { initialMarketingAgentSpec } from "./governance";

export const funnelStages = [
  "ad_clicks",
  "website_sessions",
  "leads",
  "appointments",
  "quotes",
  "sold_customers",
  "installs",
  "paid_customers"
] as const;

export type FunnelStage = (typeof funnelStages)[number];
export type FunnelSnapshot = Record<FunnelStage, number> & {
  attributed_spend?: number | null;
  installed_revenue?: number | null;
  captured_at: string;
  source_ids: string[];
};

export type FunnelDiagnostic = {
  outcome: "proposal" | "escalated" | "no_action";
  stopReason: string;
  iterationsUsed: number;
  evidence: Record<string, unknown>;
  proposal?: {
    title: string;
    actionType: "data_quality_review" | "funnel_review";
    summary: string;
    expectedMetric: string;
    requiredApprovals: string[];
  };
};

function validCount(value: number) {
  return Number.isFinite(value) && value >= 0 && Number.isInteger(value);
}

export function diagnoseFunnel(snapshot: FunnelSnapshot): FunnelDiagnostic {
  const limits = initialMarketingAgentSpec.limits;
  const invalid = funnelStages.filter((stage) => !validCount(snapshot[stage]));
  if (invalid.length || !snapshot.source_ids.length || !Number.isFinite(Date.parse(snapshot.captured_at))) {
    return {
      outcome: "escalated",
      stopReason: "invalid_or_unproven_snapshot",
      iterationsUsed: 1,
      evidence: { invalidStages: invalid, sourceCount: snapshot.source_ids.length }
    };
  }

  const increases = funnelStages.slice(1).filter((stage, index) => snapshot[stage] > snapshot[funnelStages[index]]);
  if (increases.length) {
    return {
      outcome: "escalated",
      stopReason: "non_monotonic_funnel_requires_identity_audit",
      iterationsUsed: 1,
      evidence: { increasingStages: increases }
    };
  }

  if (snapshot.leads < 20) {
    return {
      outcome: "proposal",
      stopReason: "proposal_limit_reached",
      iterationsUsed: Math.min(2, limits.maxIterations),
      evidence: { leads: snapshot.leads, minimumHistoricalSample: 20 },
      proposal: {
        title: "Close funnel attribution and sample gaps",
        actionType: "data_quality_review",
        summary: "Prepare an internal exact-ID attribution audit before recommending creative, spend, or customer-facing changes.",
        expectedMetric: "At least 20 attributable leads with complete stage outcomes",
        requiredApprovals: []
      }
    };
  }

  const transitions = funnelStages.slice(1).map((stage, index) => {
    const prior = funnelStages[index];
    const denominator = snapshot[prior];
    return { prior, stage, rate: denominator === 0 ? 1 : snapshot[stage] / denominator };
  });
  const weakest = transitions.reduce((a, b) => (b.rate < a.rate ? b : a));
  if (weakest.rate >= 0.8) {
    return {
      outcome: "no_action",
      stopReason: "no_material_break_detected",
      iterationsUsed: Math.min(2, limits.maxIterations),
      evidence: { weakestTransition: weakest }
    };
  }

  return {
    outcome: "proposal",
    stopReason: "proposal_limit_reached",
    iterationsUsed: limits.maxIterations,
    evidence: { weakestTransition: weakest, sourceIds: snapshot.source_ids },
    proposal: {
      title: `Review ${weakest.prior} to ${weakest.stage} conversion`,
      actionType: "funnel_review",
      summary: "Prepare an internal cohort analysis and preview-only experiment brief. Do not launch, publish, message, change pricing, or edit CRM outcomes.",
      expectedMetric: `Improve ${weakest.prior} to ${weakest.stage} conversion from ${(weakest.rate * 100).toFixed(1)}%`,
      requiredApprovals: []
    }
  };
}
