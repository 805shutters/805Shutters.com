import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  prepareV2CustomerSendPayloadFromDatabase,
  projectV2CustomerRetailPrice,
  type PreparedV2CustomerQuote,
} from "@/lib/crm/sales-quote-v2-send";

type JsonRecord = Record<string, unknown>;
type SentVia = "email" | "sms" | "both";

type PersistedQuoteIdentity = JsonRecord & {
  id: string;
  status: string;
  total_amount: number | string;
  quote_v2_backend: boolean;
  quote_v2_status: string;
  quote_v2_catalog_version: string | null;
  quote_v2_revision: number | string;
};

export type PersistSalesQuoteV2CustomerSendInput = Readonly<{
  quoteId: string;
  expectedRevision: number;
  idempotencyKey: string;
  actorId: string;
  sentVia: SentVia;
}>;

export type PersistSalesQuoteV2CustomerSendResponse = Readonly<{
  backend: "authoritative_v2";
  quoteId: string;
  sendSnapshotId: string;
  crmQuoteId: string;
  previousRevision: number;
  revision: number;
  catalogVersion: string;
  total: number;
  sentAt: string;
  sentVia: SentVia;
  customerPayload: PreparedV2CustomerQuote;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const RUNTIME_ENABLE_VALUE = "enabled-after-v2-send-migration";

function plainRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as JsonRecord)
    : null;
}

function requiredUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new CrmAuthError(400, `${label} must be a valid UUID.`);
  }
  return value.trim().toLowerCase();
}

function persistedUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new CrmAuthError(502, `${label} returned an invalid UUID.`);
  }
  return value.trim().toLowerCase();
}

function positiveRevision(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new CrmAuthError(
      400,
      "expectedRevision must be a positive safe integer.",
    );
  }
  return value;
}

function persistedRevision(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CrmAuthError(502, `${label} returned an invalid quote revision.`);
  }
  return parsed;
}

function idempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_PATTERN.test(value.trim())) {
    throw new CrmAuthError(
      400,
      "idempotencyKey must be 8-200 safe identifier characters.",
    );
  }
  return value.trim();
}

function sentVia(value: unknown): SentVia {
  if (value !== "email" && value !== "sms" && value !== "both") {
    throw new CrmAuthError(400, "sentVia must be email, sms, or both.");
  }
  return value;
}

function persistedSentVia(value: unknown): SentVia {
  if (value !== "email" && value !== "sms" && value !== "both") {
    throw new CrmAuthError(
      502,
      "V2 persistence returned an invalid delivery channel.",
    );
  }
  return value;
}

function money(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CrmAuthError(502, `${label} returned an invalid retail total.`);
  }
  return Math.round(parsed * 100) / 100;
}

function nonemptyText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CrmAuthError(502, `${label} returned an invalid value.`);
  }
  return value.trim();
}

function exactObjectKeys(
  value: JsonRecord,
  allowed: readonly string[],
  label: string,
) {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (extra.length) {
    throw new CrmAuthError(
      502,
      `${label} contained non-customer fields: ${extra.join(", ")}.`,
    );
  }
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function protectedKey(value: string): boolean {
  const key = normalizedKey(value);
  return (
    /dealer|wholesale|internal|landed|margin|markup|multiplier/.test(key) ||
    /cost/.test(key) ||
    [
      "optionsjson",
      "provenance",
      "validationsnapshot",
      "dealerschedule",
      "processingfeeallocated",
    ].includes(key)
  );
}

/** Defense in depth for both RPC parameters and the RPC result projection. */
export function assertV2CustomerPayloadHasNoProtectedFields(
  value: unknown,
  path = "customerPayload",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertV2CustomerPayloadHasNoProtectedFields(entry, `${path}[${index}]`),
    );
    return;
  }
  const source = plainRecord(value);
  if (!source) return;
  for (const [key, child] of Object.entries(source)) {
    if (protectedKey(key)) {
      throw new CrmAuthError(
        502,
        `${path} contained protected field ${key}.`,
      );
    }
    assertV2CustomerPayloadHasNoProtectedFields(child, `${path}.${key}`);
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const source = plainRecord(value);
  if (source) {
    return `{${Object.keys(source)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function samePayload(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/**
 * Strict HTTP body allow-list. The browser cannot submit contacts, selections,
 * catalog identity, retail, dealer cost, snapshots, or lifecycle state.
 */
export function parseSalesQuoteV2CustomerSendBody(value: unknown): Readonly<{
  expectedRevision: number;
  idempotencyKey: string;
  sentVia: SentVia;
}> {
  const body = plainRecord(value);
  if (!body) throw new CrmAuthError(400, "A JSON request object is required.");
  const allowed = new Set([
    "expectedRevision",
    "idempotencyKey",
    "sentVia",
  ]);
  const unexpected = Object.keys(body).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw new CrmAuthError(
      400,
      `Quote V2 customer-send persistence does not accept client-supplied field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`,
    );
  }
  return {
    expectedRevision: positiveRevision(body.expectedRevision),
    idempotencyKey: idempotencyKey(body.idempotencyKey),
    sentVia: sentVia(body.sentVia),
  };
}

/**
 * Production stays fail-closed until the migration is applied and cutover is
 * explicitly enabled. The unusual value prevents a generic truthy env var from
 * activating a lifecycle mutation accidentally.
 */
export function assertV2CustomerSendPersistenceRuntimeEnabled(): void {
  if (
    process.env.QUOTE_V2_CUSTOMER_SEND_PERSISTENCE !== RUNTIME_ENABLE_VALUE
  ) {
    throw new CrmAuthError(
      409,
      "V2 customer-send persistence is implemented but disabled until its migration and production cutover are explicitly approved.",
    );
  }
}

async function loadQuoteIdentity(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<PersistedQuoteIdentity> {
  const { data, error } = await supabase
    .from("sales_quotes")
    .select(
      "id,status,total_amount,quote_v2_backend,quote_v2_status,quote_v2_catalog_version,quote_v2_revision",
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw new CrmAuthError(502, "The V2 quote could not be loaded.");
  if (!data) throw new CrmAuthError(404, "Quote was not found.");
  return data as unknown as PersistedQuoteIdentity;
}

function parseCustomerPayload(value: unknown): PreparedV2CustomerQuote {
  assertV2CustomerPayloadHasNoProtectedFields(value);
  const source = plainRecord(value);
  if (!source) {
    throw new CrmAuthError(502, "V2 persistence returned no customer payload.");
  }
  exactObjectKeys(source, ["backend", "total", "lines"], "customerPayload");
  if (source.backend !== "authoritative_v2" || !Array.isArray(source.lines)) {
    throw new CrmAuthError(502, "V2 persistence returned an invalid customer payload.");
  }
  const lines = source.lines.map((entry, index) => {
    const line = plainRecord(entry);
    if (!line) {
      throw new CrmAuthError(502, `Customer line ${index + 1} is malformed.`);
    }
    exactObjectKeys(
      line,
      [
        "lineItemId",
        "selectedDesignId",
        "selectedVariant",
        "room",
        "productType",
        "widthInches",
        "heightInches",
        "quantity",
        "price",
      ],
      `customerPayload.lines[${index}]`,
    );
    const room = line.room;
    const productType = line.productType;
    if (room !== null && typeof room !== "string") {
      throw new CrmAuthError(502, `Customer line ${index + 1} has an invalid room.`);
    }
    if (productType !== null && typeof productType !== "string") {
      throw new CrmAuthError(
        502,
        `Customer line ${index + 1} has an invalid product type.`,
      );
    }
    const widthInches = Number(line.widthInches);
    const heightInches = Number(line.heightInches);
    const quantity = Number(line.quantity);
    if (
      !Number.isFinite(widthInches) ||
      widthInches < 0 ||
      !Number.isFinite(heightInches) ||
      heightInches < 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    ) {
      throw new CrmAuthError(
        502,
        `Customer line ${index + 1} has invalid dimensions or quantity.`,
      );
    }
    let price;
    try {
      price = projectV2CustomerRetailPrice({
        ...(plainRecord(line.price) ?? {}),
        ok: true,
      });
    } catch {
      throw new CrmAuthError(
        502,
        `Customer line ${index + 1} has an invalid retail projection.`,
      );
    }
    if (!samePayload(line.price, price)) {
      throw new CrmAuthError(
        502,
        `Customer line ${index + 1} retail projection contains unsupported fields.`,
      );
    }
    return {
      lineItemId: persistedUuid(line.lineItemId, "lineItemId"),
      selectedDesignId: persistedUuid(
        line.selectedDesignId,
        "selectedDesignId",
      ),
      selectedVariant: nonemptyText(
        line.selectedVariant,
        "selectedVariant",
      ),
      room,
      productType,
      widthInches,
      heightInches,
      quantity,
      price,
    };
  });
  const total = money(source.total, "V2 customer payload");
  const lineTotal = Math.round(
    lines.reduce((sum, line) => sum + line.price.total, 0) * 100,
  ) / 100;
  if (Math.abs(total - lineTotal) >= 0.005) {
    throw new CrmAuthError(
      502,
      "V2 persistence returned a customer total that does not equal its lines.",
    );
  }
  return { backend: "authoritative_v2", total, lines };
}

function rpcRow(value: unknown): JsonRecord {
  const row = Array.isArray(value) ? value[0] : value;
  const source = plainRecord(row);
  if (!source) {
    throw new CrmAuthError(
      502,
      "V2 customer-send persistence returned no result.",
    );
  }
  return source;
}

function isConflict(error: unknown): boolean {
  const source = plainRecord(error);
  const code = typeof source?.code === "string" ? source.code : "";
  const message = typeof source?.message === "string" ? source.message : "";
  return (
    code === "40001" ||
    code === "23505" ||
    /revision|catalog|snapshot|stale|drift|idempotency|lifecycle/i.test(message)
  );
}

/**
 * Revalidates through the authoritative engine, then asks one service-role RPC
 * to lock/recheck/persist the allow-listed mirror and lifecycle transition.
 * This function performs no email, SMS, notification, or payment action.
 */
export async function persistSalesQuoteV2CustomerSend(
  supabase: SupabaseClient,
  input: PersistSalesQuoteV2CustomerSendInput,
): Promise<PersistSalesQuoteV2CustomerSendResponse> {
  const quoteId = requiredUuid(input.quoteId, "quoteId");
  const actorId = requiredUuid(input.actorId, "actorId");
  const expected = positiveRevision(input.expectedRevision);
  const requestKey = idempotencyKey(input.idempotencyKey);
  const channel = sentVia(input.sentVia);

  const quote = await loadQuoteIdentity(supabase, quoteId);
  if (quote.quote_v2_backend !== true) {
    throw new CrmAuthError(
      409,
      "This quote has not been enabled for the authoritative V2 backend.",
    );
  }
  const catalogVersion = nonemptyText(
    quote.quote_v2_catalog_version,
    "Quote catalog identity",
  );
  const storedRevision = persistedRevision(
    quote.quote_v2_revision,
    "Quote load",
  );
  const idempotentRetry =
    quote.status === "sent" &&
    quote.quote_v2_status === "sent" &&
    storedRevision === expected + 1;
  if (!idempotentRetry) {
    if (
      quote.status !== "draft" ||
      quote.quote_v2_status !== "priced" ||
      storedRevision !== expected
    ) {
      throw new CrmAuthError(
        409,
        "The quote lifecycle, revision, or catalog changed before customer-send persistence.",
      );
    }
  }

  const prepared = idempotentRetry
    ? null
    : await prepareV2CustomerSendPayloadFromDatabase(supabase, quote);
  if (prepared) assertV2CustomerPayloadHasNoProtectedFields(prepared);

  const rpcInput = {
    p_quote_id: quoteId,
    p_expected_revision: expected,
    p_expected_catalog_version: catalogVersion,
    p_idempotency_key: requestKey,
    p_actor_id: actorId,
    p_sent_via: channel,
    p_customer_payload: prepared,
  };
  assertV2CustomerPayloadHasNoProtectedFields(rpcInput.p_customer_payload);

  const { data, error } = await supabase.rpc(
    "persist_quote_v2_customer_send",
    rpcInput,
  );
  if (error) {
    if (isConflict(error)) {
      throw new CrmAuthError(
        409,
        "This quote changed while customer-send persistence was running. Reload it before trying again.",
      );
    }
    const source = plainRecord(error);
    if (source?.code === "42501") {
      throw new CrmAuthError(
        403,
        "This CRM user is not authorized for V2 customer-send persistence.",
      );
    }
    throw new CrmAuthError(
      502,
      "The customer-safe V2 send mirror could not be saved.",
    );
  }

  const saved = rpcRow(data);
  const payload = parseCustomerPayload(saved.customer_payload);
  if (prepared && !samePayload(payload, prepared)) {
    throw new CrmAuthError(
      502,
      "V2 customer-send persistence returned a payload that drifted after revalidation.",
    );
  }
  if (saved.quote_id !== quoteId) {
    throw new CrmAuthError(
      502,
      "V2 customer-send persistence returned mismatched quote identity.",
    );
  }
  const previousRevision = persistedRevision(
    saved.previous_revision,
    "V2 customer-send persistence",
  );
  const revision = persistedRevision(
    saved.new_revision,
    "V2 customer-send persistence",
  );
  if (previousRevision !== expected || revision !== expected + 1) {
    throw new CrmAuthError(
      502,
      "V2 customer-send persistence returned mismatched revision identity.",
    );
  }
  const returnedCatalog = nonemptyText(
    saved.catalog_version,
    "V2 persisted catalog identity",
  );
  if (returnedCatalog !== catalogVersion) {
    throw new CrmAuthError(
      502,
      "V2 customer-send persistence returned mismatched catalog identity.",
    );
  }
  const total = money(saved.quote_total, "V2 customer-send persistence");
  if (Math.abs(total - payload.total) >= 0.005) {
    throw new CrmAuthError(
      502,
      "V2 customer-send persistence returned mismatched retail totals.",
    );
  }
  const returnedChannel = persistedSentVia(saved.persisted_sent_via);
  if (returnedChannel !== channel) {
    throw new CrmAuthError(
      502,
      "V2 customer-send persistence returned a mismatched delivery channel.",
    );
  }
  const sentAt = nonemptyText(
    saved.persisted_sent_at,
    "V2 persisted sent timestamp",
  );
  if (Number.isNaN(Date.parse(sentAt))) {
    throw new CrmAuthError(
      502,
      "V2 customer-send persistence returned an invalid sent timestamp.",
    );
  }

  return {
    backend: "authoritative_v2",
    quoteId,
    sendSnapshotId: persistedUuid(
      saved.send_snapshot_id,
      "sendSnapshotId",
    ),
    crmQuoteId: persistedUuid(saved.crm_quote_id, "crmQuoteId"),
    previousRevision,
    revision,
    catalogVersion: returnedCatalog,
    total,
    sentAt,
    sentVia: returnedChannel,
    customerPayload: payload,
  };
}
