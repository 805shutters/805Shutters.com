import { createHash } from "node:crypto";

export const INSTALLATION_HANDOFF_SCHEMA_VERSION = "805-mts-installation-handoff-v1";
export const INSTALLATION_HANDOFF_RECIPIENT = "mtsinstallations@gmail.com";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OFFSET_INSTANT_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

type InstallationHandoffEnvelope = {
  schemaVersion: typeof INSTALLATION_HANDOFF_SCHEMA_VERSION;
  sourceSystem: "805_crm";
  sourceCustomerId: string;
  sourceJobId: string;
  sourceDocumentId: string;
  sourceVersion: string;
  submittedAt: string;
  submittedBySourceProfileId?: string;
};

export type TechnicalMeasureInstallationHandoff = InstallationHandoffEnvelope & {
  handoffKind: "technical_measure";
  durationMinutes: number;
};

export type NoMeasureInstallationHandoff = InstallationHandoffEnvelope & {
  handoffKind: "no_measure";
  distinctPhysicalWindowOpenings: number;
  hasDrapery: boolean;
};

export type InstallationHandoff =
  | TechnicalMeasureInstallationHandoff
  | NoMeasureInstallationHandoff;

export type InstallationHandoffPackage = {
  payload: InstallationHandoff;
  canonicalJson: string;
  sha256: string;
  jsonFilename: string;
  sha256Filename: string;
};

export type InstallationHandoffDeliveryState = {
  schema_version: typeof INSTALLATION_HANDOFF_SCHEMA_VERSION;
  handoff_kind: InstallationHandoff["handoffKind"];
  canonical_json: string;
  source_version: string;
  source_sha256: string;
  status: "pending_delivery" | "sent" | "email_failed";
  email_recipient: typeof INSTALLATION_HANDOFF_RECIPIENT;
  email_message_id: string | null;
  email_error: string | null;
  sent_at: string | null;
};

function exactUuid(value: string, label: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${label} must be an exact UUID.`);
  }
  return normalized.toLowerCase();
}

export function normalizeInstallationDurationMinutes(value: unknown): number {
  const duration = Number(value);
  if (
    !Number.isInteger(duration) ||
    duration < 15 ||
    duration > 480 ||
    duration % 15 !== 0
  ) {
    throw new Error("Installation duration must be 15–480 minutes in 15-minute increments.");
  }
  return duration;
}

export function normalizePhysicalOpeningCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Physical opening count must be a positive integer.");
  }
  return count;
}

function exactInstant(value: string): string {
  const normalized = value.trim();
  if (
    !OFFSET_INSTANT_PATTERN.test(normalized) ||
    !Number.isFinite(new Date(normalized).getTime())
  ) {
    throw new Error("submittedAt must be an ISO timestamp with an explicit offset.");
  }
  return normalized;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not allow non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`;
  }
  throw new Error("Canonical JSON contains an unsupported value.");
}

export function canonicalInstallationHandoffJson(
  payload: InstallationHandoff,
): string {
  return canonicalize(payload);
}

function installationHandoffPackage(payload: InstallationHandoff): InstallationHandoffPackage {
  const canonicalJson = canonicalInstallationHandoffJson(payload);
  const sha256 = createHash("sha256").update(canonicalJson, "utf8").digest("hex");
  const basename = `805-mts-installation-handoff-${payload.sourceDocumentId}`;
  return {
    payload,
    canonicalJson,
    sha256,
    jsonFilename: `${basename}.json`,
    sha256Filename: `${basename}.sha256`,
  };
}

function installationHandoffEnvelope(input: {
  handoffKind: InstallationHandoff["handoffKind"];
  sourceCustomerId: string;
  sourceJobId: string;
  sourceDocumentId: string;
  submittedAt: string;
  submittedBySourceProfileId?: string | null;
}): InstallationHandoffEnvelope {
  const sourceDocumentId = exactUuid(input.sourceDocumentId, "sourceDocumentId");
  const submittedAt = exactInstant(input.submittedAt);
  const sourceVersion = `${input.handoffKind}:${sourceDocumentId}:${submittedAt}`;
  if (sourceVersion.length > 120) throw new Error("sourceVersion exceeds the v1 contract limit.");

  return {
    schemaVersion: INSTALLATION_HANDOFF_SCHEMA_VERSION,
    sourceSystem: "805_crm",
    sourceCustomerId: exactUuid(input.sourceCustomerId, "sourceCustomerId"),
    sourceJobId: exactUuid(input.sourceJobId, "sourceJobId"),
    sourceDocumentId,
    sourceVersion,
    submittedAt,
    ...(input.submittedBySourceProfileId
      ? {
          submittedBySourceProfileId: exactUuid(
            input.submittedBySourceProfileId,
            "submittedBySourceProfileId",
          ),
        }
      : {}),
  };
}

export function buildTechnicalMeasureInstallationHandoff(input: {
  sourceCustomerId: string;
  sourceJobId: string;
  sourceDocumentId: string;
  submittedAt: string;
  submittedBySourceProfileId?: string | null;
  durationMinutes: unknown;
}): InstallationHandoffPackage {
  const payload: TechnicalMeasureInstallationHandoff = {
    ...installationHandoffEnvelope({ ...input, handoffKind: "technical_measure" }),
    handoffKind: "technical_measure",
    durationMinutes: normalizeInstallationDurationMinutes(input.durationMinutes),
  };
  return installationHandoffPackage(payload);
}

export function buildNoMeasureInstallationHandoff(input: {
  sourceCustomerId: string;
  sourceJobId: string;
  sourceDocumentId: string;
  submittedAt: string;
  submittedBySourceProfileId?: string | null;
  distinctPhysicalWindowOpenings: unknown;
  hasDrapery: unknown;
}): InstallationHandoffPackage {
  if (typeof input.hasDrapery !== "boolean") {
    throw new Error("hasDrapery must be a boolean.");
  }
  const payload: NoMeasureInstallationHandoff = {
    ...installationHandoffEnvelope({ ...input, handoffKind: "no_measure" }),
    handoffKind: "no_measure",
    distinctPhysicalWindowOpenings: normalizePhysicalOpeningCount(
      input.distinctPhysicalWindowOpenings,
    ),
    hasDrapery: input.hasDrapery,
  };
  return installationHandoffPackage(payload);
}

export function pendingInstallationHandoffDeliveryState(
  handoff: InstallationHandoffPackage,
): InstallationHandoffDeliveryState {
  return {
    schema_version: INSTALLATION_HANDOFF_SCHEMA_VERSION,
    handoff_kind: handoff.payload.handoffKind,
    canonical_json: handoff.canonicalJson,
    source_version: handoff.payload.sourceVersion,
    source_sha256: handoff.sha256,
    status: "pending_delivery",
    email_recipient: INSTALLATION_HANDOFF_RECIPIENT,
    email_message_id: null,
    email_error: null,
    sent_at: null,
  };
}

export function installationHandoffDeliveryState(
  value: unknown,
): InstallationHandoffDeliveryState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<InstallationHandoffDeliveryState>;
  if (
    row.schema_version !== INSTALLATION_HANDOFF_SCHEMA_VERSION ||
    !["technical_measure", "no_measure"].includes(String(row.handoff_kind)) ||
    !["pending_delivery", "sent", "email_failed"].includes(String(row.status)) ||
    row.email_recipient !== INSTALLATION_HANDOFF_RECIPIENT
  ) {
    return null;
  }
  try {
    const canonicalJson = String(row.canonical_json || "");
    const payload = JSON.parse(canonicalJson) as InstallationHandoff;
    const parsed = payload.handoffKind === "technical_measure"
      ? buildTechnicalMeasureInstallationHandoff({
          sourceCustomerId: payload.sourceCustomerId,
          sourceJobId: payload.sourceJobId,
          sourceDocumentId: payload.sourceDocumentId,
          submittedAt: payload.submittedAt,
          submittedBySourceProfileId: payload.submittedBySourceProfileId,
          durationMinutes: payload.durationMinutes,
        })
      : buildNoMeasureInstallationHandoff({
          sourceCustomerId: payload.sourceCustomerId,
          sourceJobId: payload.sourceJobId,
          sourceDocumentId: payload.sourceDocumentId,
          submittedAt: payload.submittedAt,
          submittedBySourceProfileId: payload.submittedBySourceProfileId,
          distinctPhysicalWindowOpenings: payload.distinctPhysicalWindowOpenings,
          hasDrapery: payload.hasDrapery,
        });
    if (
      parsed.canonicalJson !== canonicalJson ||
      parsed.sha256 !== row.source_sha256 ||
      parsed.payload.sourceVersion !== row.source_version ||
      parsed.payload.handoffKind !== row.handoff_kind
    ) {
      return null;
    }
    return {
      schema_version: row.schema_version,
      handoff_kind: row.handoff_kind as InstallationHandoff["handoffKind"],
      canonical_json: canonicalJson,
      source_version: parsed.payload.sourceVersion,
      source_sha256: parsed.sha256,
      status: row.status as InstallationHandoffDeliveryState["status"],
      email_recipient: row.email_recipient,
      email_message_id:
        typeof row.email_message_id === "string" && row.email_message_id ? row.email_message_id : null,
      email_error: typeof row.email_error === "string" && row.email_error ? row.email_error : null,
      sent_at: typeof row.sent_at === "string" && row.sent_at ? exactInstant(row.sent_at) : null,
    };
  } catch {
    return null;
  }
}

export function installationHandoffPackageFromDeliveryState(
  state: InstallationHandoffDeliveryState,
): InstallationHandoffPackage {
  const payload = JSON.parse(state.canonical_json) as InstallationHandoff;
  return installationHandoffPackage(payload);
}
