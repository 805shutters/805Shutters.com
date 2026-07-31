import type { CrmBookkeepingRow, CrmJob, CrmQuote } from "@/lib/crm/types";

export const primaryMarketingChannels = ["google", "yelp", "facebook"] as const;
export type PrimaryMarketingChannel = (typeof primaryMarketingChannels)[number];

export type MarketingChannelFunnel = {
  channel: PrimaryMarketingChannel;
  label: string;
  integrationState: "partial" | "missing";
  leads: number | null;
  appointments: number | null;
  quotes: number | null;
  sales: number | null;
  installs: number | null;
  paidCustomers: number | null;
  evidence: string[];
  gaps: string[];
};

export type MarketingIntelligenceView = {
  channels: MarketingChannelFunnel[];
  attributedLeadCount: number;
  unattributedJobCount: number;
  proposal: {
    title: string;
    summary: string;
    requestedApprovals: string[];
    status: "preview_only";
  };
  localDimensions: Array<{ label: string; state: "available" | "partial" | "missing"; detail: string }>;
};

function normalizedSource(job: CrmJob): PrimaryMarketingChannel | null {
  const meta = job.meta || {};
  const candidates = [job.source, meta.utm_source, meta.lead_source, meta.channel]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase().trim());
  if (candidates.some((value) => /(^|\b)(google|google_ads|adwords)(\b|$)/.test(value))) return "google";
  if (candidates.some((value) => /(^|\b)yelp(\b|$)/.test(value))) return "yelp";
  if (candidates.some((value) => /(^|\b)(facebook|fb|meta)(\b|$)/.test(value))) return "facebook";
  return null;
}

function distinctExactLeads(jobs: CrmJob[]) {
  const byLead = new Map<string, CrmJob>();
  for (const job of jobs) {
    if (job.lead_id && !byLead.has(job.lead_id)) byLead.set(job.lead_id, job);
  }
  return [...byLead.values()];
}

function hasPaidOutcome(job: CrmJob, rows: CrmBookkeepingRow[]) {
  return rows.some((row) => row.jobId === job.id && row.paidTotal > 0);
}

export function buildMarketingIntelligence(
  jobs: CrmJob[],
  quotes: CrmQuote[],
  rows: CrmBookkeepingRow[]
): MarketingIntelligenceView {
  const attributed = jobs.filter((job) => job.lead_id && normalizedSource(job));
  const exactLeads = distinctExactLeads(attributed);
  const attributedJobIds = new Set(attributed.map((job) => job.id));
  const labels: Record<PrimaryMarketingChannel, string> = {
    google: "Google Leads",
    yelp: "Yelp Leads",
    facebook: "Facebook Leads"
  };

  const channels = primaryMarketingChannels.map((channel): MarketingChannelFunnel => {
    const channelJobs = attributed.filter((job) => normalizedSource(job) === channel);
    const channelLeads = distinctExactLeads(channelJobs);
    if (!channelLeads.length) {
      return {
        channel,
        label: labels[channel],
        integrationState: "missing",
        leads: null,
        appointments: null,
        quotes: null,
        sales: null,
        installs: null,
        paidCustomers: null,
        evidence: [],
        gaps: ["No exact lead ID plus verified channel source is available in the Sales Intelligence contract."]
      };
    }
    const leadJobIds = new Set(channelLeads.map((job) => job.id));
    return {
      channel,
      label: labels[channel],
      integrationState: "partial",
      leads: channelLeads.length,
      appointments: channelLeads.filter((job) => Boolean(job.appointment_start)).length,
      quotes: channelLeads.filter((job) => quotes.some((quote) => quote.job_id === job.id)).length,
      sales: channelLeads.filter((job) => ["sold", "ordered", "installed", "invoiced", "closed"].includes(job.status)).length,
      installs: channelLeads.filter((job) => ["installed", "invoiced", "closed"].includes(job.status)).length,
      paidCustomers: channelLeads.filter((job) => hasPaidOutcome(job, rows)).length,
      evidence: [`${channelLeads.length} distinct exact lead IDs`, `${leadJobIds.size} linked CRM jobs`],
      gaps: ["Ad spend, campaign, ad set, creative, clicks, and website-session attribution are not connected read-only."]
    };
  });

  const knownCities = jobs.filter((job) => Boolean(job.city?.trim())).length;
  const knownProducts = jobs.filter((job) => Boolean(job.product_interest?.trim())).length;
  const knownCampaigns = jobs.filter((job) => typeof job.meta?.utm_campaign === "string" || typeof job.meta?.campaign === "string").length;

  return {
    channels,
    attributedLeadCount: exactLeads.length,
    unattributedJobCount: jobs.filter((job) => !attributedJobIds.has(job.id)).length,
    proposal: {
      title: "Build the Ventura County attribution spine",
      summary: "Connect Google, Yelp, and Facebook performance read-only to exact website touch, lead, appointment, quote, sold, install, and collected-payment outcomes. Quarantine ambiguous identities; do not backfill by phone-only or fuzzy matching.",
      requestedApprovals: [],
      status: "preview_only"
    },
    localDimensions: [
      { label: "Service area / location", state: knownCities ? "partial" : "missing", detail: `${knownCities} of ${jobs.length} CRM jobs have a city.` },
      { label: "Lead source", state: exactLeads.length ? "partial" : "missing", detail: `${exactLeads.length} exact leads identify Google, Yelp, or Facebook.` },
      { label: "Product interest", state: knownProducts ? "partial" : "missing", detail: `${knownProducts} of ${jobs.length} CRM jobs have product interest.` },
      { label: "Campaign / creative", state: knownCampaigns ? "partial" : "missing", detail: `${knownCampaigns} of ${jobs.length} CRM jobs carry campaign metadata; creative IDs are not guaranteed.` },
      { label: "Funnel outcome", state: jobs.length ? "partial" : "missing", detail: "CRM stages exist, but channel comparison requires exact lead attribution and read-only ad data." }
    ]
  };
}
