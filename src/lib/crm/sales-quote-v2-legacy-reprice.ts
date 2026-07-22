import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SalesQuoteDesign,
  SalesQuoteLineItem,
} from "@mts/types/quote";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  prepareSalesQuoteV2PricingBatch,
  quoteV2ServerCatalogDate,
  type PreparedSalesQuoteV2PricingBatch,
} from "@/lib/crm/sales-quote-v2-price-save";
import {
  projectV2CustomerRetailPrice,
  type V2CustomerRetailPrice,
} from "@/lib/crm/sales-quote-v2-send";

type JsonRecord = Record<string, unknown>;

type LegacyQuoteRow = JsonRecord & {
  id: string;
  status: string;
  total_amount: number | string;
  quote_v2_backend: boolean;
  quote_v2_status: string;
  quote_v2_revision: number | string;
};

type LegacyLineRow = SalesQuoteLineItem & {
  selected_design_id?: string | null;
};

type PreviewRecordRow = JsonRecord & {
  id: string;
  quote_id: string;
  quote_revision: number | string;
  preview_digest: string;
  server_catalog_date: string;
  selection_map: unknown;
  line_count: number | string;
  customer_payload: unknown;
  expires_at: string;
  created_by: string;
};

type ApplyAuditRow = JsonRecord & {
  quote_id: string;
  preview_id: string;
  previous_revision: number | string;
  new_revision: number | string;
  preview_digest: string;
  quote_status: string;
  quote_total: number | string;
  priced_design_count: number | string;
  blocked_design_count: number | string;
  actor_id: string;
  idempotency_key: string;
  customer_payload: unknown;
};

export type LegacyV2SelectedDesign = Readonly<{
  lineItemId: string;
  designId: string;
}>;

export type LegacyV2PreviewBody = Readonly<{
  expectedRevision: number;
  idempotencyKey: string;
  selectedDesigns: readonly LegacyV2SelectedDesign[];
}>;

export type LegacyV2ApplyBody = Readonly<{
  expectedRevision: number;
  idempotencyKey: string;
  previewId: string;
  previewDigest: string;
  confirmation: "APPLY_V2_REPRICE";
}>;

export type LegacyV2CustomerPreviewLine = Readonly<{
  lineItemId: string;
  selectedDesignId: string;
  priceStatus: "authoritative" | "blocked" | "unpriceable";
  price:
    | V2CustomerRetailPrice
    | Readonly<{
        ok: false;
        code: string;
        error: string;
        validationStatus: string;
        catalogVersion: string | null;
      }>;
}>;

export type LegacyV2RepricePreview = Readonly<{
  backend: "authoritative_v2";
  mode: "legacy_reprice_preview";
  quoteId: string;
  expectedRevision: number;
  canApply: boolean;
  previewId: string | null;
  previewDigest: string | null;
  expiresAt: string | null;
  serverCatalogDate: string;
  legacyStoredTotal: number;
  proposedSelectedDesignTotal: number;
  difference: number;
  lineCount: number;
  lines: readonly LegacyV2CustomerPreviewLine[];
  blockingReasons: readonly Readonly<{
    lineItemId: string;
    selectedDesignId: string;
    code: string;
    message: string;
  }>[];
}>;

export type LegacyV2RepriceApplyResult = Readonly<{
  backend: "authoritative_v2";
  mode: "legacy_reprice_applied";
  quoteId: string;
  previewId: string;
  revision: number;
  quoteStatus: string;
  quoteTotal: number;
  pricedDesignCount: number;
  blockedDesignCount: number;
  lines: readonly LegacyV2CustomerPreviewLine[];
}>;

type StoredLegacyV2CustomerPreview = Readonly<{
  backend: "authoritative_v2";
  mode: "legacy_reprice_preview_proof";
  quoteId: string;
  expectedRevision: number;
  serverCatalogDate: string;
  legacyStoredTotal: number;
  proposedSelectedDesignTotal: number;
  difference: number;
  lineCount: number;
  lines: readonly LegacyV2CustomerPreviewLine[];
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const PREVIEW_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_QUOTE_LINES = 40;
const LEGACY_REPRICE_RUNTIME_ENABLE_VALUE =
  "enabled-after-v2-legacy-reprice-migration";
const PROTECTED_CUSTOMER_KEY_PATTERN =
  /(cost|dealer|wholesale|freight|oversize|margin|multiplier|factor|processingfee)/;

export const V2_LEGACY_REPRICE_WORKFLOW_IMPLEMENTED = true as const;

/**
 * The routes remain unavailable unless the additive migration and cutover are
 * both deliberately enabled with this exact, workflow-specific value.
 */
export function assertLegacyV2RepriceRuntimeEnabled(): void {
  if (
    process.env.QUOTE_V2_LEGACY_REPRICE !==
    LEGACY_REPRICE_RUNTIME_ENABLE_VALUE
  ) {
    throw new CrmAuthError(
      409,
      "Legacy V2 repricing is implemented but disabled until its migration and production cutover are explicitly approved.",
    );
  }
}

function plainRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as JsonRecord)
    : null;
}

function normalizedCustomerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Defense-in-depth for every stored or returned customer-facing payload. */
export function assertLegacyV2CustomerPayloadHasNoProtectedFields(
  value: unknown,
  path = "customerPayload",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertLegacyV2CustomerPayloadHasNoProtectedFields(
        entry,
        `${path}[${index}]`,
      ),
    );
    return;
  }
  const source = plainRecord(value);
  if (!source) return;
  for (const [key, child] of Object.entries(source)) {
    if (PROTECTED_CUSTOMER_KEY_PATTERN.test(normalizedCustomerKey(key))) {
      throw new CrmAuthError(
        502,
        `The stored legacy repricing customer payload contains a protected field at ${path}.${key}.`,
      );
    }
    assertLegacyV2CustomerPayloadHasNoProtectedFields(
      child,
      `${path}.${key}`,
    );
  }
}

function requiredUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new CrmAuthError(400, `${label} must be a valid UUID.`);
  }
  return value.trim().toLowerCase();
}

function requiredRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new CrmAuthError(
      400,
      "expectedRevision must be a nonnegative safe integer.",
    );
  }
  return value;
}

function requiredIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_PATTERN.test(value.trim())) {
    throw new CrmAuthError(
      400,
      "idempotencyKey must be 8-200 safe identifier characters.",
    );
  }
  return value.trim();
}

function exactKeys(body: JsonRecord, allowed: readonly string[], label: string) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(body).filter((key) => !allowedSet.has(key));
  if (unexpected.length) {
    throw new CrmAuthError(
      400,
      `${label} does not accept client-supplied field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`,
    );
  }
}

export function parseLegacyV2RepricePreviewBody(
  value: unknown,
): LegacyV2PreviewBody {
  const body = plainRecord(value);
  if (!body) throw new CrmAuthError(400, "A JSON request object is required.");
  exactKeys(
    body,
    ["expectedRevision", "idempotencyKey", "selectedDesigns"],
    "Legacy V2 repricing preview",
  );
  if (!Array.isArray(body.selectedDesigns)) {
    throw new CrmAuthError(400, "selectedDesigns must be an array.");
  }
  if (
    body.selectedDesigns.length < 1 ||
    body.selectedDesigns.length > MAX_QUOTE_LINES
  ) {
    throw new CrmAuthError(
      400,
      `selectedDesigns must contain between 1 and ${MAX_QUOTE_LINES} lines.`,
    );
  }
  const selectedDesigns = body.selectedDesigns.map((value, index) => {
    const selection = plainRecord(value);
    if (!selection) {
      throw new CrmAuthError(
        400,
        `selectedDesigns[${index}] must be an object.`,
      );
    }
    exactKeys(selection, ["lineItemId", "designId"], `selectedDesigns[${index}]`);
    return {
      lineItemId: requiredUuid(
        selection.lineItemId,
        `selectedDesigns[${index}].lineItemId`,
      ),
      designId: requiredUuid(
        selection.designId,
        `selectedDesigns[${index}].designId`,
      ),
    };
  });
  if (new Set(selectedDesigns.map((entry) => entry.lineItemId)).size !== selectedDesigns.length) {
    throw new CrmAuthError(400, "Each line item must be selected exactly once.");
  }
  return {
    expectedRevision: requiredRevision(body.expectedRevision),
    idempotencyKey: requiredIdempotencyKey(body.idempotencyKey),
    selectedDesigns,
  };
}

export function parseLegacyV2RepriceApplyBody(value: unknown): LegacyV2ApplyBody {
  const body = plainRecord(value);
  if (!body) throw new CrmAuthError(400, "A JSON request object is required.");
  exactKeys(
    body,
    [
      "expectedRevision",
      "idempotencyKey",
      "previewId",
      "previewDigest",
      "confirmation",
    ],
    "Legacy V2 repricing application",
  );
  if (body.confirmation !== "APPLY_V2_REPRICE") {
    throw new CrmAuthError(
      400,
      'confirmation must exactly equal "APPLY_V2_REPRICE".',
    );
  }
  if (
    typeof body.previewDigest !== "string" ||
    !PREVIEW_DIGEST_PATTERN.test(body.previewDigest.trim())
  ) {
    throw new CrmAuthError(400, "previewDigest is invalid.");
  }
  return {
    expectedRevision: requiredRevision(body.expectedRevision),
    idempotencyKey: requiredIdempotencyKey(body.idempotencyKey),
    previewId: requiredUuid(body.previewId, "previewId"),
    previewDigest: body.previewDigest.trim(),
    confirmation: "APPLY_V2_REPRICE",
  };
}

function numericRevision(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CrmAuthError(502, `${label} returned an invalid revision.`);
  }
  return parsed;
}

function money(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CrmAuthError(502, `${label} returned an invalid total.`);
  }
  return Math.round(parsed * 100) / 100;
}

function rpcRow(value: unknown, label: string): JsonRecord {
  const candidate = Array.isArray(value) ? value[0] : value;
  const row = plainRecord(candidate);
  if (!row) throw new CrmAuthError(502, `${label} returned no result.`);
  return row;
}

function databaseFailure(message: string): CrmAuthError {
  return new CrmAuthError(502, message);
}

function storedExactKeys(
  source: JsonRecord,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(source).filter((key) => !allowedSet.has(key));
  const missing = allowed.filter((key) => !(key in source));
  if (unexpected.length || missing.length) {
    throw databaseFailure(`${label} does not match the customer-safe schema.`);
  }
}

function storedUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw databaseFailure(`${label} is invalid in the stored customer payload.`);
  }
  return value.trim().toLowerCase();
}

function storedMoney(value: unknown, label: string): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  ) {
    throw databaseFailure(`${label} is missing from the stored customer payload.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw databaseFailure(`${label} is invalid in the stored customer payload.`);
  }
  return Math.round(parsed * 100) / 100;
}

function sameMoney(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.005;
}

function parseStoredLegacyV2CustomerPreview(
  value: unknown,
): StoredLegacyV2CustomerPreview {
  assertLegacyV2CustomerPayloadHasNoProtectedFields(value);
  const source = plainRecord(value);
  if (!source) {
    throw databaseFailure("The stored legacy repricing customer payload is malformed.");
  }
  storedExactKeys(
    source,
    [
      "backend",
      "mode",
      "quoteId",
      "expectedRevision",
      "serverCatalogDate",
      "legacyStoredTotal",
      "proposedSelectedDesignTotal",
      "difference",
      "lineCount",
      "lines",
    ],
    "The stored legacy repricing customer payload",
  );
  if (
    source.backend !== "authoritative_v2" ||
    source.mode !== "legacy_reprice_preview_proof"
  ) {
    throw databaseFailure("The stored legacy repricing customer payload identity is invalid.");
  }
  const quoteId = storedUuid(source.quoteId, "Stored customer quoteId");
  const expectedRevision = numericRevision(
    source.expectedRevision,
    "Stored customer preview",
  );
  if (
    typeof source.serverCatalogDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(source.serverCatalogDate) ||
    !Number.isFinite(Date.parse(`${source.serverCatalogDate}T00:00:00.000Z`))
  ) {
    throw databaseFailure("The stored customer preview catalog date is invalid.");
  }
  const legacyStoredTotal = storedMoney(
    source.legacyStoredTotal,
    "Stored legacy total",
  );
  const proposedSelectedDesignTotal = storedMoney(
    source.proposedSelectedDesignTotal,
    "Stored proposed total",
  );
  const difference = Number(source.difference);
  if (
    !Number.isFinite(difference) ||
    !sameMoney(
      Math.round(difference * 100) / 100,
      Math.round((proposedSelectedDesignTotal - legacyStoredTotal) * 100) / 100,
    )
  ) {
    throw databaseFailure("The stored customer preview difference is inconsistent.");
  }
  const lineCount = numericRevision(source.lineCount, "Stored customer preview");
  if (
    lineCount < 1 ||
    lineCount > MAX_QUOTE_LINES ||
    !Array.isArray(source.lines) ||
    source.lines.length !== lineCount
  ) {
    throw databaseFailure("The stored customer preview line count is invalid.");
  }
  const lines = source.lines.map((value, index) => {
    const line = plainRecord(value);
    if (!line) {
      throw databaseFailure(`Stored customer preview line ${index + 1} is malformed.`);
    }
    storedExactKeys(
      line,
      ["lineItemId", "selectedDesignId", "priceStatus", "price"],
      `Stored customer preview line ${index + 1}`,
    );
    if (line.priceStatus !== "authoritative") {
      throw databaseFailure(
        `Stored customer preview line ${index + 1} is not authoritative.`,
      );
    }
    const priceSource = plainRecord(line.price);
    if (!priceSource) {
      throw databaseFailure(
        `Stored customer preview line ${index + 1} has a malformed retail projection.`,
      );
    }
    const allowedPriceKeys = new Set([
      "productId",
      "programId",
      "programName",
      "matchedWidth",
      "matchedHeight",
      "sqft",
      "billableSqft",
      "base",
      "surchargeLines",
      "unitPrice",
      "discountPercent",
      "discountAmount",
      "quantity",
      "onceTotal",
      "total",
    ]);
    if (Object.keys(priceSource).some((key) => !allowedPriceKeys.has(key))) {
      throw databaseFailure(
        `Stored customer preview line ${index + 1} has unexpected retail fields.`,
      );
    }
    if (Array.isArray(priceSource.surchargeLines)) {
      priceSource.surchargeLines.forEach((entry) => {
        const surcharge = plainRecord(entry);
        if (
          !surcharge ||
          Object.keys(surcharge).some(
            (key) => !new Set(["id", "label", "amount"]).has(key),
          )
        ) {
          throw databaseFailure(
            `Stored customer preview line ${index + 1} has an invalid retail surcharge.`,
          );
        }
      });
    }
    let price: V2CustomerRetailPrice;
    try {
      price = projectV2CustomerRetailPrice({ ok: true, ...priceSource });
    } catch {
      throw databaseFailure(
        `Stored customer preview line ${index + 1} has an invalid retail projection.`,
      );
    }
    return {
      lineItemId: storedUuid(
        line.lineItemId,
        `Stored customer preview line ${index + 1} lineItemId`,
      ),
      selectedDesignId: storedUuid(
        line.selectedDesignId,
        `Stored customer preview line ${index + 1} selectedDesignId`,
      ),
      priceStatus: "authoritative" as const,
      price,
    };
  });
  if (new Set(lines.map((line) => line.lineItemId)).size !== lines.length) {
    throw databaseFailure("The stored customer preview repeats a quote line.");
  }
  const lineTotal = Math.round(
    lines.reduce((sum, line) => sum + (line.price as V2CustomerRetailPrice).total, 0) *
      100,
  ) / 100;
  if (!sameMoney(lineTotal, proposedSelectedDesignTotal)) {
    throw databaseFailure(
      "The stored customer preview line totals do not match its proposed total.",
    );
  }
  return {
    backend: "authoritative_v2",
    mode: "legacy_reprice_preview_proof",
    quoteId,
    expectedRevision,
    serverCatalogDate: source.serverCatalogDate,
    legacyStoredTotal,
    proposedSelectedDesignTotal,
    difference: Math.round(difference * 100) / 100,
    lineCount,
    lines,
  };
}

async function loadQuote(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<LegacyQuoteRow> {
  const { data, error } = await supabase
    .from("sales_quotes")
    .select(
      "id,status,total_amount,quote_v2_backend,quote_v2_status,quote_v2_revision",
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw databaseFailure("The legacy quote could not be loaded.");
  if (!data) throw new CrmAuthError(404, "Quote was not found.");
  return data as unknown as LegacyQuoteRow;
}

async function loadLines(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<LegacyLineRow[]> {
  const { data, error } = await supabase
    .from("sales_quote_line_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sort_order", { ascending: true });
  if (error) throw databaseFailure("The legacy quote lines could not be loaded.");
  return ([...(data ?? [])] as unknown as LegacyLineRow[]).sort(
    (left, right) =>
      Number(left.sort_order) - Number(right.sort_order) ||
      left.id.localeCompare(right.id),
  );
}

async function loadDesigns(
  supabase: SupabaseClient,
  lineIds: readonly string[],
): Promise<SalesQuoteDesign[]> {
  if (!lineIds.length) return [];
  const { data, error } = await supabase
    .from("sales_quote_designs")
    .select("*")
    .in("line_item_id", [...lineIds]);
  if (error) throw databaseFailure("The legacy quote designs could not be loaded.");
  return (data ?? []) as unknown as SalesQuoteDesign[];
}

function requireLegacyDraft(quote: LegacyQuoteRow, expectedRevision: number) {
  if (
    quote.quote_v2_backend !== false ||
    quote.quote_v2_status !== "legacy"
  ) {
    throw new CrmAuthError(
      409,
      "Only an unconverted legacy quote can use the legacy V2 repricing workflow.",
    );
  }
  if (quote.status !== "draft") {
    throw new CrmAuthError(
      409,
      "Only an unsent legacy draft can be explicitly repriced into V2.",
    );
  }
  const revision = numericRevision(quote.quote_v2_revision, "Legacy quote");
  if (revision !== expectedRevision) {
    throw new CrmAuthError(
      409,
      "This legacy quote changed revision. Reload it and create a new preview.",
    );
  }
}

function resolveSelectedDesigns(
  lines: readonly LegacyLineRow[],
  designs: readonly SalesQuoteDesign[],
  selected: readonly LegacyV2SelectedDesign[],
): SalesQuoteDesign[] {
  if (!lines.length) {
    throw new CrmAuthError(409, "A quote must contain at least one line item.");
  }
  if (lines.length > MAX_QUOTE_LINES) {
    throw new CrmAuthError(
      409,
      `A V2 quote cannot contain more than ${MAX_QUOTE_LINES} line items.`,
    );
  }
  if (selected.length !== lines.length) {
    throw new CrmAuthError(
      409,
      "The preview must explicitly select exactly one design for every line item.",
    );
  }
  const lineIds = new Set(lines.map((line) => line.id));
  if (selected.some((entry) => !lineIds.has(entry.lineItemId))) {
    throw new CrmAuthError(409, "A selected line does not belong to this quote.");
  }
  return lines.map((line) => {
    const selection = selected.find((entry) => entry.lineItemId === line.id);
    if (!selection) {
      throw new CrmAuthError(
        409,
        `Line item ${line.id} is missing an explicit selected design.`,
      );
    }
    const matches = designs.filter(
      (design) =>
        design.id === selection.designId && design.line_item_id === line.id,
    );
    if (matches.length !== 1) {
      throw new CrmAuthError(
        409,
        `Line item ${line.id} does not resolve to exactly one selected design.`,
      );
    }
    const design = matches[0];
    return {
      ...design,
      options_json: {
        ...(plainRecord(design.options_json) ?? {}),
        quote_v2_backend: true,
      },
    };
  });
}

function customerFailure(value: unknown): LegacyV2CustomerPreviewLine["price"] {
  const source = plainRecord(value) ?? {};
  return {
    ok: false,
    code: typeof source.code === "string" ? source.code : "CONFIGURATION_INCOMPLETE",
    error:
      typeof source.error === "string"
        ? source.error
        : "Pricing is unavailable for this saved configuration.",
    validationStatus:
      typeof source.validationStatus === "string"
        ? source.validationStatus
        : "blocked",
    catalogVersion:
      typeof source.catalogVersion === "string" ? source.catalogVersion : null,
  };
}

function customerLines(
  batch: PreparedSalesQuoteV2PricingBatch,
): LegacyV2CustomerPreviewLine[] {
  return batch.prepared.map((entry) => ({
    lineItemId: entry.lineItemId,
    selectedDesignId: entry.designId,
    priceStatus: entry.priceStatus,
    price:
      entry.priceStatus === "authoritative"
        ? projectV2CustomerRetailPrice(entry.customerPrice)
        : customerFailure(entry.customerPrice),
  }));
}

function blockingReasons(
  batch: PreparedSalesQuoteV2PricingBatch,
): LegacyV2RepricePreview["blockingReasons"] {
  return batch.repriced.sendability.reasons.map((reason) => ({
    lineItemId: reason.lineItemId,
    selectedDesignId: reason.selectedDesignId,
    code: reason.code,
    message: reason.message,
  }));
}

function normalizedSelectionMap(value: unknown): LegacyV2SelectedDesign[] {
  if (!Array.isArray(value)) {
    throw databaseFailure("The saved legacy repricing preview is malformed.");
  }
  const parsed = value.map((entry, index) => {
    const source = plainRecord(entry);
    if (!source) {
      throw databaseFailure(
        `The saved preview selection at index ${index} is malformed.`,
      );
    }
    return {
      lineItemId: requiredUuid(source.lineItemId, "Saved preview lineItemId"),
      designId: requiredUuid(source.designId, "Saved preview designId"),
    };
  });
  if (new Set(parsed.map((entry) => entry.lineItemId)).size !== parsed.length) {
    throw databaseFailure("The saved preview contains duplicate line selections.");
  }
  return parsed;
}

async function loadPreview(
  supabase: SupabaseClient,
  input: Readonly<{
    quoteId: string;
    previewId: string;
    previewDigest: string;
    actorId: string;
  }>,
): Promise<PreviewRecordRow> {
  const { data, error } = await supabase
    .from("sales_quote_v2_legacy_reprice_previews")
    .select(
      "id,quote_id,quote_revision,preview_digest,server_catalog_date,selection_map,line_count,customer_payload,expires_at,created_by",
    )
    .eq("id", input.previewId)
    .maybeSingle();
  if (error) throw databaseFailure("The legacy repricing preview could not be loaded.");
  if (!data) throw new CrmAuthError(404, "The legacy repricing preview was not found.");
  const preview = data as unknown as PreviewRecordRow;
  if (
    preview.quote_id !== input.quoteId ||
    preview.preview_digest !== input.previewDigest ||
    preview.created_by !== input.actorId
  ) {
    throw new CrmAuthError(
      409,
      "The legacy repricing preview identity is not valid for this quote and user.",
    );
  }
  if (!Number.isFinite(Date.parse(preview.expires_at))) {
    throw databaseFailure("The saved legacy repricing preview expiry is invalid.");
  }
  if (Date.parse(preview.expires_at) <= Date.now()) {
    throw new CrmAuthError(
      409,
      "The saved legacy repricing preview expired. Create a new preview.",
    );
  }
  parseStoredLegacyV2CustomerPreview(preview.customer_payload);
  return preview;
}

function applyResultFromAudit(
  audit: ApplyAuditRow,
  input: Readonly<{
    quoteId: string;
    previewId: string;
    previewDigest: string;
    expectedRevision: number;
    actorId: string;
    idempotencyKey: string;
  }>,
): LegacyV2RepriceApplyResult {
  if (
    audit.quote_id !== input.quoteId ||
    audit.preview_id !== input.previewId ||
    audit.preview_digest !== input.previewDigest ||
    audit.actor_id !== input.actorId ||
    audit.idempotency_key !== input.idempotencyKey ||
    numericRevision(audit.previous_revision, "Legacy repricing audit") !==
      input.expectedRevision
  ) {
    throw new CrmAuthError(
      409,
      "The apply idempotency key was already used for different legacy repricing inputs.",
    );
  }
  const customer = parseStoredLegacyV2CustomerPreview(audit.customer_payload);
  const revision = numericRevision(audit.new_revision, "Legacy repricing audit");
  const quoteTotal = money(audit.quote_total, "Legacy repricing audit");
  const pricedDesignCount = numericRevision(
    audit.priced_design_count,
    "Legacy repricing audit",
  );
  const blockedDesignCount = numericRevision(
    audit.blocked_design_count,
    "Legacy repricing audit",
  );
  if (
    customer.quoteId !== input.quoteId ||
    customer.expectedRevision !== input.expectedRevision ||
    !sameMoney(customer.proposedSelectedDesignTotal, quoteTotal) ||
    customer.lineCount !== pricedDesignCount ||
    blockedDesignCount !== 0 ||
    audit.quote_status !== "priced"
  ) {
    throw databaseFailure(
      "The immutable legacy repricing audit and customer payload are inconsistent.",
    );
  }
  return {
    backend: "authoritative_v2",
    mode: "legacy_reprice_applied",
    quoteId: input.quoteId,
    previewId: input.previewId,
    revision,
    quoteStatus: "priced",
    quoteTotal,
    pricedDesignCount,
    blockedDesignCount,
    lines: customer.lines,
  };
}

async function loadCompletedApplyReplay(
  supabase: SupabaseClient,
  input: Readonly<{
    quoteId: string;
    previewId: string;
    previewDigest: string;
    expectedRevision: number;
    actorId: string;
    idempotencyKey: string;
  }>,
): Promise<LegacyV2RepriceApplyResult | null> {
  const { data, error } = await supabase
    .from("sales_quote_v2_legacy_reprice_audits")
    .select(
      "quote_id,preview_id,previous_revision,new_revision,preview_digest,quote_status,quote_total,priced_design_count,blocked_design_count,actor_id,idempotency_key,customer_payload",
    )
    .eq("quote_id", input.quoteId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (error) {
    throw databaseFailure("The legacy repricing replay audit could not be loaded.");
  }
  if (!data) return null;
  return applyResultFromAudit(data as unknown as ApplyAuditRow, input);
}

export async function previewLegacySalesQuoteV2Reprice(
  supabase: SupabaseClient,
  input: LegacyV2PreviewBody & Readonly<{
    quoteId: string;
    actorId: string;
    serverDate?: string;
  }>,
): Promise<LegacyV2RepricePreview> {
  const quoteId = requiredUuid(input.quoteId, "quoteId");
  const actorId = requiredUuid(input.actorId, "actorId");
  const quote = await loadQuote(supabase, quoteId);
  requireLegacyDraft(quote, input.expectedRevision);
  const lines = await loadLines(supabase, quoteId);
  const designs = await loadDesigns(
    supabase,
    lines.map((line) => line.id),
  );
  const selectedDesigns = resolveSelectedDesigns(
    lines,
    designs,
    input.selectedDesigns,
  );
  const serverCatalogDate = input.serverDate ?? quoteV2ServerCatalogDate();
  const batch = prepareSalesQuoteV2PricingBatch({
    lines,
    selectedDesigns,
    serverDate: serverCatalogDate,
  });
  const linesForCustomer = customerLines(batch);
  const reasons = blockingReasons(batch);
  const canApply =
    batch.prepared.every((entry) => entry.priceStatus === "authoritative") &&
    batch.repriced.sendability.sendable;
  const legacyStoredTotal = money(quote.total_amount, "Legacy quote");
  const proposedSelectedDesignTotal = money(
    batch.repriced.total,
    "Authoritative preview",
  );

  if (!canApply) {
    return {
      backend: "authoritative_v2",
      mode: "legacy_reprice_preview",
      quoteId,
      expectedRevision: input.expectedRevision,
      canApply: false,
      previewId: null,
      previewDigest: null,
      expiresAt: null,
      serverCatalogDate,
      legacyStoredTotal,
      proposedSelectedDesignTotal,
      difference: Math.round((proposedSelectedDesignTotal - legacyStoredTotal) * 100) / 100,
      lineCount: lines.length,
      lines: linesForCustomer,
      blockingReasons: reasons,
    };
  }

  const customerPayload = parseStoredLegacyV2CustomerPreview({
    backend: "authoritative_v2",
    mode: "legacy_reprice_preview_proof",
    quoteId,
    expectedRevision: input.expectedRevision,
    serverCatalogDate,
    legacyStoredTotal,
    proposedSelectedDesignTotal,
    difference:
      Math.round((proposedSelectedDesignTotal - legacyStoredTotal) * 100) / 100,
    lineCount: lines.length,
    lines: linesForCustomer,
  });

  const { data, error } = await supabase.rpc(
    "record_quote_v2_legacy_reprice_preview",
    {
      p_quote_id: quoteId,
      p_expected_revision: input.expectedRevision,
      p_idempotency_key: input.idempotencyKey,
      p_actor_id: actorId,
      p_server_catalog_date: serverCatalogDate,
      p_selection_map: input.selectedDesigns,
      p_legacy_total: legacyStoredTotal,
      p_proposed_total: proposedSelectedDesignTotal,
      p_customer_payload: customerPayload,
      p_results: batch.prepared.map((entry) => entry.rpcResult),
    },
  );
  if (error) {
    const source = plainRecord(error);
    const message = typeof source?.message === "string" ? source.message : "";
    if (/revision|changed|state|idempot|expired|legacy|draft/i.test(message)) {
      throw new CrmAuthError(
        409,
        "The legacy quote changed while its preview was being recorded. Reload it and preview again.",
      );
    }
    throw databaseFailure("The legacy repricing preview could not be recorded.");
  }
  const saved = rpcRow(data, "Legacy repricing preview persistence");
  const previewId = requiredUuid(saved.preview_id, "Recorded previewId");
  if (
    typeof saved.preview_digest !== "string" ||
    !PREVIEW_DIGEST_PATTERN.test(saved.preview_digest)
  ) {
    throw databaseFailure("Legacy repricing preview persistence returned an invalid digest.");
  }
  if (typeof saved.expires_at !== "string" || !Number.isFinite(Date.parse(saved.expires_at))) {
    throw databaseFailure("Legacy repricing preview persistence returned an invalid expiry.");
  }
  if (Date.parse(saved.expires_at) <= Date.now()) {
    throw new CrmAuthError(
      409,
      "The recorded legacy repricing preview is already expired. Create a new preview.",
    );
  }
  const savedCustomer = parseStoredLegacyV2CustomerPreview(saved.customer_payload);
  if (
    savedCustomer.quoteId !== quoteId ||
    savedCustomer.expectedRevision !== input.expectedRevision ||
    savedCustomer.serverCatalogDate !== serverCatalogDate ||
    !sameMoney(savedCustomer.legacyStoredTotal, legacyStoredTotal) ||
    !sameMoney(
      savedCustomer.proposedSelectedDesignTotal,
      proposedSelectedDesignTotal,
    )
  ) {
    throw databaseFailure(
      "Legacy repricing preview persistence returned a mismatched customer payload.",
    );
  }
  return {
    backend: "authoritative_v2",
    mode: "legacy_reprice_preview",
    quoteId,
    expectedRevision: input.expectedRevision,
    canApply: true,
    previewId,
    previewDigest: saved.preview_digest,
    expiresAt: saved.expires_at,
    serverCatalogDate: savedCustomer.serverCatalogDate,
    legacyStoredTotal: savedCustomer.legacyStoredTotal,
    proposedSelectedDesignTotal: savedCustomer.proposedSelectedDesignTotal,
    difference: savedCustomer.difference,
    lineCount: savedCustomer.lineCount,
    lines: savedCustomer.lines,
    blockingReasons: [],
  };
}

export async function applyLegacySalesQuoteV2Reprice(
  supabase: SupabaseClient,
  input: LegacyV2ApplyBody & Readonly<{
    quoteId: string;
    actorId: string;
  }>,
): Promise<LegacyV2RepriceApplyResult> {
  const quoteId = requiredUuid(input.quoteId, "quoteId");
  const actorId = requiredUuid(input.actorId, "actorId");
  const replayInput = {
    quoteId,
    previewId: input.previewId,
    previewDigest: input.previewDigest,
    expectedRevision: input.expectedRevision,
    actorId,
    idempotencyKey: input.idempotencyKey,
  } as const;
  const completedReplay = await loadCompletedApplyReplay(supabase, replayInput);
  if (completedReplay) return completedReplay;

  const preview = await loadPreview(supabase, {
    quoteId,
    previewId: input.previewId,
    previewDigest: input.previewDigest,
    actorId,
  });
  const previewRevision = numericRevision(
    preview.quote_revision,
    "Legacy repricing preview",
  );
  if (
    previewRevision !== input.expectedRevision ||
    numericRevision(preview.line_count, "Legacy repricing preview") < 1 ||
    numericRevision(preview.line_count, "Legacy repricing preview") > MAX_QUOTE_LINES
  ) {
    throw new CrmAuthError(409, "The legacy repricing preview revision is stale.");
  }

  const selected = normalizedSelectionMap(preview.selection_map);
  const quote = await loadQuote(supabase, quoteId);
  const alreadyAppliedV2 =
    quote.quote_v2_backend === true && quote.quote_v2_status !== "legacy";
  if (alreadyAppliedV2) {
    // A concurrent request can complete between the first audit lookup and the
    // quote read. Once the V2 transition is visible, its append-only audit must
    // also be visible and is the only valid retry result.
    const racedReplay = await loadCompletedApplyReplay(supabase, replayInput);
    if (racedReplay) return racedReplay;
    throw new CrmAuthError(
      409,
      "This quote was converted by a different operation. Reload it before continuing.",
    );
  }
  requireLegacyDraft(quote, input.expectedRevision);
  const lines = await loadLines(supabase, quoteId);
  const designs = await loadDesigns(
    supabase,
    lines.map((line) => line.id),
  );
  const selectedDesigns = resolveSelectedDesigns(lines, designs, selected);
  const batch = prepareSalesQuoteV2PricingBatch({
    lines,
    selectedDesigns,
    serverDate: preview.server_catalog_date,
  });
  if (
    !batch.repriced.sendability.sendable ||
    batch.prepared.some((entry) => entry.priceStatus !== "authoritative")
  ) {
    throw new CrmAuthError(
      409,
      "The saved legacy quote no longer reprices authoritatively. Create a new preview.",
    );
  }

  const { data, error } = await supabase.rpc("apply_quote_v2_legacy_reprice", {
    p_quote_id: quoteId,
    p_expected_revision: input.expectedRevision,
    p_preview_id: input.previewId,
    p_preview_digest: input.previewDigest,
    p_idempotency_key: input.idempotencyKey,
    p_actor_id: actorId,
    p_results: batch.prepared.map((entry) => entry.rpcResult),
  });
  if (error) {
    const source = plainRecord(error);
    const message = typeof source?.message === "string" ? source.message : "";
    if (/revision|changed|state|preview|idempot|legacy|draft|concurrent/i.test(message)) {
      throw new CrmAuthError(
        409,
        "The legacy quote or preview changed before application. Reload it and preview again.",
      );
    }
    throw databaseFailure("The explicit legacy V2 repricing could not be applied.");
  }
  const saved = rpcRow(data, "Legacy V2 repricing persistence");
  if (saved.quote_id !== quoteId || saved.preview_id !== input.previewId) {
    throw databaseFailure("Legacy V2 repricing persistence returned mismatched identities.");
  }
  return applyResultFromAudit(
    {
      quote_id: String(saved.quote_id),
      preview_id: String(saved.preview_id),
      previous_revision: input.expectedRevision,
      new_revision: saved.new_revision as number | string,
      preview_digest: input.previewDigest,
      quote_status: String(saved.quote_status),
      quote_total: saved.quote_total as number | string,
      priced_design_count: saved.priced_design_count as number | string,
      blocked_design_count: saved.blocked_design_count as number | string,
      actor_id: actorId,
      idempotency_key: input.idempotencyKey,
      customer_payload: saved.customer_payload,
    },
    replayInput,
  );
}
