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
  state: "verified_read_only" | "configuration_required" | "grant_required" | "manual_only" | "unsafe_permissions";
  missingConfiguration: string[];
  missingPermissions: ConnectorReadPermission[];
  forbiddenPermissions: string[];
  capabilities: readonly ConnectorReadPermission[];
  mode: "read_only" | "manual_only";
  verification: { verifiedAt: string; accountId: string; grantEvidenceId: string } | null;
  blockers: string[];
};

type ConnectorContract = {
  channel: PrimaryMarketingChannel;
  label: string;
  requiredConfiguration: readonly string[];
  requiredPermissions: readonly ConnectorReadPermission[];
  mode: "read_only" | "manual_only";
  knownBlockers: readonly string[];
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
    requiredPermissions: ["read_campaigns", "read_reporting"],
    mode: "read_only",
    knownBlockers: ["Manager-account developer token and OAuth grant have not been verified."]
  },
  yelp: {
    channel: "yelp",
    label: "Yelp",
    requiredConfiguration: [],
    requiredPermissions: [],
    mode: "manual_only",
    knownBlockers: ["Yelp owner reporting is manual-only; no approved reporting or lead-data connector is available."]
  },
  meta: {
    channel: "facebook",
    label: "Meta Ads",
    requiredConfiguration: [
      "META_APP_ID",
      "META_APP_SECRET",
      "META_AD_ACCOUNT_ID",
      "META_REPORTING_ACCESS_TOKEN"
    ],
    requiredPermissions: ["read_campaigns", "read_reporting"],
    mode: "read_only",
    knownBlockers: ["The existing system user has pixel/dataset access only; ad-account reporting assignment and token are unverified."]
  }
};

export type ConnectorVerification = {
  verifiedAt: string;
  accountId: string;
  grantEvidenceId: string;
};

function configured(env: Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  if (!value || /^(set|todo|replace-me|changeme|your[-_])/i.test(value)) return false;
  if (key === "GOOGLE_ADS_CUSTOMER_ID") return /^\d{10}$/.test(value.replaceAll("-", ""));
  if (key === "META_AD_ACCOUNT_ID") return /^act_\d+$/.test(value);
  return value.length >= 8;
}

export function validateConnectorConfiguration(
  connector: ChannelConnectorId,
  env: Record<string, string | undefined>,
  grantedPermissions: readonly string[] = [],
  verification: ConnectorVerification | null = null
): ConnectorValidation {
  const contract = channelConnectorContracts[connector];
  const granted = new Set(grantedPermissions);
  const missingConfiguration = contract.requiredConfiguration.filter((key) => !configured(env, key));
  const missingPermissions = contract.requiredPermissions.filter((permission) => !granted.has(permission));
  const forbiddenPermissions = forbiddenConnectorPermissions.filter((permission) => granted.has(permission));
  const validVerification = Boolean(
    verification?.accountId.trim() &&
    verification?.grantEvidenceId.trim() &&
    Number.isFinite(Date.parse(verification?.verifiedAt || "")) &&
    verification?.accountId === (connector === "google_ads" ? env.GOOGLE_ADS_CUSTOMER_ID?.replaceAll("-", "") : env.META_AD_ACCOUNT_ID)
  );
  const state: ConnectorValidation["state"] = contract.mode === "manual_only"
    ? "manual_only"
    : forbiddenPermissions.length
    ? "unsafe_permissions"
    : missingConfiguration.length
      ? "configuration_required"
      : missingPermissions.length || !validVerification
        ? "grant_required"
        : "verified_read_only";

  return {
    connector,
    channel: contract.channel,
    label: contract.label,
    state,
    missingConfiguration,
    missingPermissions,
    forbiddenPermissions,
    capabilities: contract.requiredPermissions,
    mode: contract.mode,
    verification: validVerification ? verification : null,
    blockers: state === "verified_read_only" ? [] : [...contract.knownBlockers]
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
    grantEvidenceId: string;
    grantVerifiedAt: string;
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
  verification?: ConnectorVerification;
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
    if (contract.mode === "manual_only") reasons.push("connector_manual_only");
    if (
      !context.verification ||
      context.verification.accountId !== context.accountId ||
      !context.verification.grantEvidenceId.trim() ||
      !Number.isFinite(Date.parse(context.verification.verifiedAt))
    ) reasons.push("unverified_account_grant");
    if (contract.requiredPermissions.some((permission) => !context.permissions.includes(permission))) reasons.push("missing_required_read_permission");
    if (context.permissions.some((permission) => forbiddenConnectorPermissions.includes(permission as typeof forbiddenConnectorPermissions[number]))) reasons.push("unsafe_permission");
    if (!context.sourceObject.trim()) reasons.push("missing_source_object");
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
        exactCrmLink: Boolean(crmLeadId),
        grantEvidenceId: context.verification!.grantEvidenceId,
        grantVerifiedAt: context.verification!.verifiedAt
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
