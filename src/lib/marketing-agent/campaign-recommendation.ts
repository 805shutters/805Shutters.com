import type { CrmJob } from "@/lib/crm/types";
import { approvalKindsForAction, type MarketingApprovalKind } from "./governance";
import type { MarketingIntelligenceView, PrimaryMarketingChannel } from "./sales-intelligence";

export type VenturaCampaignRecommendation = {
  status: "preview_only";
  confidence: "insufficient" | "limited";
  proposedChannel: PrimaryMarketingChannel;
  serviceArea: string;
  productHypothesis: string;
  offerHypothesis: string;
  evidence: string[];
  dataGaps: string[];
  measurementPlan: string[];
  requiredApprovals: MarketingApprovalKind[];
  stopConditions: string[];
};

const channelOrder: PrimaryMarketingChannel[] = ["google", "yelp", "facebook"];

function exactChannel(job: CrmJob): PrimaryMarketingChannel | null {
  if (!job.lead_id) return null;
  const values = [job.lead_source, job.source, job.meta?.lead_source, job.meta?.utm_source]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase().trim());
  if (values.some((value) => /google|adwords/.test(value))) return "google";
  if (values.some((value) => value === "yelp" || value.startsWith("yelp "))) return "yelp";
  if (values.some((value) => /facebook|\bmeta\b|^fb$/.test(value))) return "facebook";
  return null;
}

function topValue(values: Array<string | null | undefined>, fallback: string) {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const clean = value?.trim();
    if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || fallback;
}

export function recommendVenturaCampaign(
  jobs: CrmJob[],
  intelligence: MarketingIntelligenceView
): VenturaCampaignRecommendation {
  const attributed = jobs.filter((job) => exactChannel(job));
  const countByChannel = new Map<PrimaryMarketingChannel, number>();
  attributed.forEach((job) => {
    const channel = exactChannel(job)!;
    countByChannel.set(channel, (countByChannel.get(channel) || 0) + 1);
  });
  const proposedChannel = [...channelOrder].sort((a, b) => (countByChannel.get(b) || 0) - (countByChannel.get(a) || 0))[0];
  const channelJobs = attributed.filter((job) => exactChannel(job) === proposedChannel);
  const serviceArea = topValue(channelJobs.map((job) => job.city), "Ventura County area pending exact city evidence");
  const product = topValue(channelJobs.map((job) => job.product_interest), "product category pending exact CRM evidence");
  const exactCount = channelJobs.length;
  const completeCampaignMetadata = channelJobs.filter((job) => Boolean(job.meta?.utm_campaign || job.meta?.campaign)).length;
  const channelLabel = proposedChannel === "facebook" ? "Meta/Facebook" : proposedChannel === "google" ? "Google" : "Yelp";
  const requiredApprovals = approvalKindsForAction(
    `Operate ${channelLabel} account, approve budget spend, publish campaign creative, and write CRM attribution`
  );

  return {
    status: "preview_only",
    confidence: exactCount >= 20 && completeCampaignMetadata >= 10 ? "limited" : "insufficient",
    proposedChannel,
    serviceArea,
    productHypothesis: exactCount
      ? `Evaluate ${product} messaging for exact ${serviceArea} leads; this is a measurement candidate, not a performance claim.`
      : "Do not select product creative until exact channel, city, and product evidence exists.",
    offerHypothesis: "Use the existing free in-home consultation proposition only as a draft measurement hypothesis; no discount or price change is proposed.",
    evidence: [
      `${exactCount} exact ${channelLabel} lead-linked CRM jobs are available.`,
      `${completeCampaignMetadata} of those jobs include campaign metadata.`,
      `${intelligence.unattributedJobCount} CRM jobs remain excluded from channel comparison.`
    ],
    dataGaps: [
      "Read-only channel reporting is not yet connected.",
      "Creative IDs, spend, impressions, clicks, and website sessions are incomplete or absent.",
      "A recommendation cannot claim lift until exact lead-to-paid outcomes meet the historical sample threshold."
    ],
    measurementPlan: [
      "Capture provider campaign and creative IDs with immutable provenance.",
      "Join only on an explicit CRM lead ID; quarantine ambiguous identities.",
      "Compare lead → appointment → quote → sale → install → paid by channel, city, product, and creative.",
      "Evaluate historically before requesting any external-account or spend approval."
    ],
    requiredApprovals,
    stopConditions: [
      "Stop if fewer than 20 exact attributable leads are available for evaluation.",
      "Stop if funnel stages increase because identity joins are inconsistent.",
      "Stop if source data is stale, contradictory, or missing provenance.",
      "Stop before spend, activation, publication, messaging, pricing, forms, billing, audience, or CRM changes."
    ]
  };
}
