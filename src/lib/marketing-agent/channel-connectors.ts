import type { PrimaryMarketingChannel } from "./sales-intelligence";
import type { CrmBookkeepingRow, CrmJob, CrmQuote } from "@/lib/crm/types";

export const channelConnectorIds = ["google_ads", "yelp", "meta"] as const;
export type ChannelConnectorId = (typeof channelConnectorIds)[number];

export const connectorReadPermissions = ["read_campaigns", "read_reporting", "read_leads"] as const;
export type ConnectorReadPermission = (typeof connectorReadPermissions)[number];

export const forbiddenConnectorPermissions = [
  "manage_campaigns",
  "manage_billing",
  "manage_forms",
  "publish_content",
  "manage_audiences",
  "write_leads",
  "send_messages",
  "manage_pricing"
] as const;

export type ConnectorValidation = {
  connector: ChannelConnectorId;
  channel: PrimaryMarketingChannel;
  label: string;
  state: "ready" | "configuration_required" | "unsafe_permissions";
  missingConfiguration: string[];
  missingPermissions: ConnectorReadPermission[];
  forbiddenPermissions: string[];
  capabilities: readonly ConnectorReadPermission[];
  mode: "read_only";
};

type ConnectorContract = {
  channel: PrimaryMarketingChannel;
  label: string;
  requiredConfiguration: readonly string[];
  requiredPermissions: readonly ConnectorReadPermission[];
};

export const channelConnectorContracts: Record<ChannelConnectorId, ConnectorContract> = {
  google_ads: {
    channel: "google",
    label: "Google Ads",
    requiredConfiguration: [
      "GOOGLE_ADS_CUSTOMER_ID",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "GOOGLE_ADS_CLIENT_ID",
      "GOOGLE_ADS_CLIENT_SECRET",
      "GOOGLE_ADS_REFRESH_TOKEN"
    ],
    requiredPermissions: ["read_campaigns", "read_reporting"]
  },
  yelp: {
    channel: "yelp",
    label: "Yelp",
    requiredConfiguration: ["YELP_BUSINESS_ID", "YELP_REPORTING_CLIENT_ID", "YELP_REPORTING_CLIENT_SECRET"],
    requiredPermissions: ["read_campaigns", "read_reporting", "read_leads"]
  },
  meta: {
    channel: "facebook",
    label: "Meta Leads",
    requiredConfiguration: [
      "META_APP_ID",
      "META_APP_SECRET",
      "META_PAGE_ID",
      "META_PAGE_ACCESS_TOKEN",
      "META_LEADS_VERIFY_TOKEN"
    ],
    requiredPermissions: ["read_campaigns", "read_reporting", "read_leads"]
  }
};

function configured(env: Record<string, string | undefined>, key: string) {
  return typeof env[key] === "string" && Boolean(env[key]?.trim());
}

export function validateConnectorConfiguration(
  connector: ChannelConnectorId,
  env: Record<string, string | undefined>,
  grantedPermissions: readonly string[] = []
): ConnectorValidation {
  const contract = channelConnectorContracts[connector];
  const granted = new Set(grantedPermissions);
  const missingConfiguration = contract.requiredConfiguration.filter((key) => !configured(env, key));
  const missingPermissions = contract.requiredPermissions.filter((permission) => !granted.has(permission));
  const forbiddenPermissions = forbiddenConnectorPermissions.filter((permission) => granted.has(permission));
  const state = forbiddenPermissions.length
    ? "unsafe_permissions"
    : missingConfiguration.length || missingPermissions.length
      ? "configuration_required"
      : "ready";

  return {
    connector,
    channel: contract.channel,
    label: contract.label,
    state,
    missingConfiguration,
    missingPermissions,
    forbiddenPermissions,
    capabilities: contract.requiredPermissions,
    mode: "read_only"
  };
}

export type NormalizedMarketingEvent = {
  schemaVersion: 1;
  channel: PrimaryMarketingChannel;
  connector: ChannelConnectorId;
  providerRecordId: string;
  occurredAt: string;
  eventType: "impression" | "click" | "lead";
  campaignId: string | null;
  campaignName: string | null;
  creativeId: string | null;
  creativeName: string | null;
  serviceArea: string | null;
  productInterest: string | null;
  offer: string | null;
  externalLeadId: string | null;
  crmLeadId: string | null;
  spendMicros: number | null;
  provenance: {
    sourceObject: string;
    accountId: string;
    fetchedAt: string;
    permissions: readonly ConnectorReadPermission[];
    exactCrmLink: boolean;
  };
};

export type NormalizedIngestionResult = {
  accepted: NormalizedMarketingEvent[];
  quarantined: Array<{ index: number; reasons: string[] }>;
};

export type ChannelImportRow = {
  id?: unknown;
  occurred_at?: unknown;
  event_type?: unknown;
  campaign_id?: unknown;
  campaign_name?: unknown;
  creative_id?: unknown;
  creative_name?: unknown;
  service_area?: unknown;
  product_interest?: unknown;
  offer?: unknown;
  external_lead_id?: unknown;
  crm_lead_id?: unknown;
  spend_micros?: unknown;
};

type NormalizationContext = {
  accountId: string;
  fetchedAt: string;
  permissions: readonly ConnectorReadPermission[];
  sourceObject: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRows(
  connector: ChannelConnectorId,
  rows: readonly ChannelImportRow[],
  context: NormalizationContext
): NormalizedIngestionResult {
  const contract = channelConnectorContracts[connector];
  const accepted: NormalizedMarketingEvent[] = [];
  const quarantined: NormalizedIngestionResult["quarantined"] = [];
  rows.forEach((row, index) => {
    const reasons: string[] = [];
    const providerRecordId = text(row.id);
    const occurredAt = text(row.occurred_at);
    const eventType = text(row.event_type);
    const spendMicros = row.spend_micros == null ? null : Number(row.spend_micros);
    if (!providerRecordId) reasons.push("missing_provider_record_id");
    if (!occurredAt || !Number.isFinite(Date.parse(occurredAt))) reasons.push("invalid_occurred_at");
    if (!eventType || !["impression", "click", "lead"].includes(eventType)) reasons.push("invalid_event_type");
    if (spendMicros !== null && (!Number.isInteger(spendMicros) || spendMicros < 0)) reasons.push("invalid_spend_micros");
    if (!context.accountId.trim()) reasons.push("missing_account_id");
    if (!Number.isFinite(Date.parse(context.fetchedAt))) reasons.push("invalid_fetched_at");
    if (reasons.length) {
      quarantined.push({ index, reasons });
      return;
    }
    const crmLeadId = text(row.crm_lead_id);
    accepted.push({
      schemaVersion: 1,
      channel: contract.channel,
      connector,
      providerRecordId: providerRecordId!,
      occurredAt: occurredAt!,
      eventType: eventType as NormalizedMarketingEvent["eventType"],
      campaignId: text(row.campaign_id),
      campaignName: text(row.campaign_name),
      creativeId: text(row.creative_id),
      creativeName: text(row.creative_name),
      serviceArea: text(row.service_area),
      productInterest: text(row.product_interest),
      offer: text(row.offer),
      externalLeadId: text(row.external_lead_id),
      crmLeadId,
      spendMicros,
      provenance: {
        sourceObject: context.sourceObject,
        accountId: context.accountId,
        fetchedAt: context.fetchedAt,
        permissions: context.permissions,
        exactCrmLink: Boolean(crmLeadId)
      }
    });
  });
  return { accepted, quarantined };
}

export const readOnlyChannelAdapters = {
  google_ads: { normalize: (rows: readonly ChannelImportRow[], context: NormalizationContext) => normalizeRows("google_ads", rows, context) },
  yelp: { normalize: (rows: readonly ChannelImportRow[], context: NormalizationContext) => normalizeRows("yelp", rows, context) },
  meta: { normalize: (rows: readonly ChannelImportRow[], context: NormalizationContext) => normalizeRows("meta", rows, context) }
} as const;

export type NormalizedChannelFunnelRecord = {
  crmLeadId: string;
  channel: PrimaryMarketingChannel;
  providerRecordIds: string[];
  campaignIds: string[];
  creativeIds: string[];
  serviceAreas: string[];
  productInterests: string[];
  stages: {
    lead: true;
    appointment: boolean;
    quote: boolean;
    sale: boolean;
    install: boolean;
    paid: boolean;
  };
  provenance: NormalizedMarketingEvent["provenance"][];
};

export type FunnelAttributionResult = {
  attributed: NormalizedChannelFunnelRecord[];
  excluded: Array<{ providerRecordId: string; reason: "missing_exact_crm_lead_id" | "crm_lead_not_found" | "conflicting_channel" }>;
};

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function attributeNormalizedEventsToFunnel(
  events: readonly NormalizedMarketingEvent[],
  jobs: readonly CrmJob[],
  quotes: readonly CrmQuote[],
  rows: readonly CrmBookkeepingRow[]
): FunnelAttributionResult {
  const eventGroups = new Map<string, NormalizedMarketingEvent[]>();
  const excluded: FunnelAttributionResult["excluded"] = [];
  events.forEach((event) => {
    if (!event.crmLeadId) {
      excluded.push({ providerRecordId: event.providerRecordId, reason: "missing_exact_crm_lead_id" });
      return;
    }
    const linkedJobs = jobs.filter((job) => job.lead_id === event.crmLeadId);
    if (!linkedJobs.length) {
      excluded.push({ providerRecordId: event.providerRecordId, reason: "crm_lead_not_found" });
      return;
    }
    const group = eventGroups.get(event.crmLeadId) || [];
    if (group.length && group[0].channel !== event.channel) {
      excluded.push({ providerRecordId: event.providerRecordId, reason: "conflicting_channel" });
      return;
    }
    group.push(event);
    eventGroups.set(event.crmLeadId, group);
  });

  const attributed = [...eventGroups.entries()].map(([crmLeadId, linkedEvents]): NormalizedChannelFunnelRecord => {
    const linkedJobs = jobs.filter((job) => job.lead_id === crmLeadId);
    const jobIds = new Set(linkedJobs.map((job) => job.id));
    return {
      crmLeadId,
      channel: linkedEvents[0].channel,
      providerRecordIds: unique(linkedEvents.map((event) => event.providerRecordId)),
      campaignIds: unique(linkedEvents.map((event) => event.campaignId)),
      creativeIds: unique(linkedEvents.map((event) => event.creativeId)),
      serviceAreas: unique([...linkedEvents.map((event) => event.serviceArea), ...linkedJobs.map((job) => job.city || null)]),
      productInterests: unique([...linkedEvents.map((event) => event.productInterest), ...linkedJobs.map((job) => job.product_interest || null)]),
      stages: {
        lead: true,
        appointment: linkedJobs.some((job) => Boolean(job.appointment_start)),
        quote: quotes.some((quote) => jobIds.has(quote.job_id)),
        sale: linkedJobs.some((job) => ["sold", "ordered", "installed", "invoiced", "closed"].includes(job.status)),
        install: linkedJobs.some((job) => ["installed", "invoiced", "closed"].includes(job.status)),
        paid: rows.some((row) => typeof row.jobId === "string" && jobIds.has(row.jobId) && row.paidTotal > 0)
      },
      provenance: linkedEvents.map((event) => event.provenance)
    };
  });
  return { attributed, excluded };
}
