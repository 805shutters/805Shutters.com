import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  MIKE_PAYMENT_ADMIN_EMAIL,
  normalizeCrmEmail,
} from "@/lib/crm/allowed-users";

type JsonPrimitive = string | number | boolean | null;
interface JsonObject {
  readonly [key: string]: JsonValue;
}
type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | JsonObject;
interface JsonRecord {
  [key: string]: JsonValue;
}

const JESSICA_WHOLESALE_LEDGER_EMAIL = "jessica@805shutters.com";
const WHOLESALE_LEDGER_ACCOUNT_KEY = "805";
const WHOLESALE_LEDGER_EMAILS = new Set([
  MIKE_PAYMENT_ADMIN_EMAIL,
  JESSICA_WHOLESALE_LEDGER_EMAIL,
]);

const LOOKUP_FIELDS = new Set([
  "manufacturerCode",
  "productKey",
  "programKey",
  "styleKey",
  "colorKey",
  "dimensions",
  "options",
  "asOf",
]);
const DIMENSION_FIELDS = new Set(["width", "height"]);
const MACHINE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const OPTION_KEY_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_OPTIONS_JSON_BYTES = 20_000;
const MAX_OPTION_DEPTH = 5;
const MAX_OPTION_COLLECTION_SIZE = 200;

const PROTECTED_OPTION_KEYS = new Set([
  "amount",
  "basecost",
  "basecostcents",
  "contenthash",
  "contentsha256",
  "cost",
  "costamount",
  "costcents",
  "currency",
  "dealercost",
  "dealercostcents",
  "effectivefrom",
  "effectiveuntil",
  "freightcost",
  "freightcostcents",
  "guideversion",
  "internalcost",
  "landedcost",
  "lookupfingerprint",
  "manufacturer cost",
  "manufacturercost",
  "margin",
  "markup",
  "multiplier",
  "othercost",
  "price",
  "priceamount",
  "pricecents",
  "profit",
  "profitamount",
  "provenance",
  "revision",
  "sourcehash",
  "sourceid",
  "sourcelocator",
  "sources",
  "total",
  "version",
  "versionid",
  "versionkey",
  "wholesale",
  "wholesalecost",
  "wholesalecostcents",
  "wholesaleunitcostcents",
  "wholesaleversionid",
  "wholesaleversionkey",
]);

const BLOCK_CODES = new Set([
  "WHOLESALE_MANUFACTURER_UNKNOWN",
  "WHOLESALE_VERSION_NOT_PUBLISHED",
  "WHOLESALE_PROGRAM_NOT_FOUND",
  "WHOLESALE_PROGRAM_NOT_QUOTE_READY",
  "WHOLESALE_PRICE_AXIS_UNSUPPORTED",
  "WHOLESALE_OPTION_UNKNOWN",
  "WHOLESALE_OPTION_REQUIRED",
  "WHOLESALE_OPTION_VALUE_UNSUPPORTED",
  "WHOLESALE_OPTION_PRICE_MISSING",
  "WHOLESALE_OPTION_COMPONENT_AMBIGUOUS",
  "WHOLESALE_DIMENSIONS_OUT_OF_RANGE",
  "WHOLESALE_GRID_OUT_OF_RANGE",
  "WHOLESALE_GRID_CELL_MISSING",
  "WHOLESALE_GRID_CELL_UNAVAILABLE",
  "WHOLESALE_GRID_CELL_MANUAL_QUOTE_REQUIRED",
  "WHOLESALE_ORDER_COST_AMBIGUOUS",
  "WHOLESALE_ORDER_COST_POLICY_UNRESOLVED",
  "WHOLESALE_ORDER_COST_MISSING",
  "WHOLESALE_ORDER_COST_UNRESOLVED",
]);

export type SalesQuoteV2WholesaleLookupInput = Readonly<{
  manufacturerCode: string;
  productKey: string;
  programKey: string;
  styleKey: string;
  colorKey: string;
  width: number;
  height: number;
  options: Readonly<JsonRecord>;
  asOf: string;
}>;

export type SalesQuoteV2WholesaleLookupBlocked = Readonly<{
  status: "blocked";
  code: string;
  manufacturerCode: string;
  productKey: string;
  programKey: string;
  styleKey: string;
  colorKey: string;
  requestedWidth: number;
  requestedHeight: number;
  asOf: string;
}>;

export type SalesQuoteV2WholesaleCostComponent = Readonly<{
  componentKey: string;
  label: string;
  calculation: "fixed" | "percent_base" | "per_sqft";
  costCents: number;
  billingScope: "per_unit" | "per_line_once" | "per_order_once";
  sourceId: string;
  sourceLocator: Readonly<JsonRecord>;
}>;

export type SalesQuoteV2WholesaleOrderCostRule = Readonly<{
  ruleKey: string;
  label: string;
  kind: "freight" | "oversize" | "processing" | "other";
  calculation:
    | "first_plus_additional"
    | "flat"
    | "percent_subtotal"
    | "free_above_threshold"
    | "unresolved";
  firstUnitCostCents: number | null;
  additionalUnitCostCents: number | null;
  flatCostCents: number | null;
  rateBasisPoints: number | null;
  thresholdCents: number | null;
  thresholdOperator: "subtotal_lt" | "subtotal_gte" | null;
  status: "authoritative" | "documented" | "unresolved" | "quarantined";
  sourceId: string;
  sourceLocator: Readonly<JsonRecord>;
}>;

export type SalesQuoteV2WholesaleSource = Readonly<{
  sourceKey: string;
  sourceType: string;
  fileName: string;
  revision: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  receivedOn: string;
  sha256: string;
  accountScope: string | null;
  authorityScope: readonly string[];
}>;

export type SalesQuoteV2WholesaleLookupAuthoritative = Readonly<{
  status: "authoritative";
  wholesaleVersionId: string;
  wholesaleVersionKey: string;
  scopeKey: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  accountKey: "805";
  accountScope: string;
  programId: string;
  manufacturerCode: string;
  productKey: string;
  programKey: string;
  styleKey: string;
  colorKey: string;
  requestedWidth: number;
  requestedHeight: number;
  matchedWidth: number;
  matchedHeight: number;
  baseCostCents: number;
  optionCostCents: number;
  perUnitOptionCostCents: number;
  perLineOnceCostCents: number;
  perOrderOnceCostCents: number;
  wholesaleUnitCostCents: number;
  currency: "USD";
  components: readonly SalesQuoteV2WholesaleCostComponent[];
  orderCostRules: readonly SalesQuoteV2WholesaleOrderCostRule[];
  sources: readonly SalesQuoteV2WholesaleSource[];
  lookupFingerprint: string;
}>;

export type SalesQuoteV2WholesaleLookupResult =
  | SalesQuoteV2WholesaleLookupBlocked
  | SalesQuoteV2WholesaleLookupAuthoritative;

export type SalesQuoteV2WholesaleSnapshotBinding = Readonly<{
  authority: "wholesale_ledger";
  wholesaleVersionId: string;
  wholesaleVersionKey: string;
  lookupFingerprint: string;
  wholesaleLookupInput: Readonly<{
    manufacturerCode: string;
    accountKey: "805";
    productKey: string;
    programKey: string;
    styleKey: string;
    colorKey: string;
    width: number;
    height: number;
    options: Readonly<JsonRecord>;
    asOf: string;
  }>;
  wholesaleBaseCostCents: number;
  wholesalePerUnitOptionCostCents: number;
  wholesalePerLineOnceCostCents: number;
  wholesalePerOrderOnceCostCents: number;
  wholesaleUnitCostCents: number;
}>;

/**
 * Trusted bridge into the existing immutable pricing-snapshot RPCs.
 *
 * Merge this object only into the protected `internalCostSnapshot` produced
 * from the same lookup. The database replays the indexed lookup and rejects a
 * mismatched version, fingerprint, selection, grid result, or product cost.
 * No browser/customer route may accept these fields from a request.
 */
export function buildSalesQuoteV2WholesaleSnapshotBinding(
  input: SalesQuoteV2WholesaleLookupInput,
  result: SalesQuoteV2WholesaleLookupAuthoritative,
): SalesQuoteV2WholesaleSnapshotBinding {
  if (
    result.manufacturerCode !== input.manufacturerCode ||
    result.productKey !== input.productKey ||
    result.programKey !== input.programKey ||
    result.styleKey !== input.styleKey ||
    result.colorKey !== input.colorKey ||
    result.requestedWidth !== input.width ||
    result.requestedHeight !== input.height ||
    result.accountKey !== WHOLESALE_LEDGER_ACCOUNT_KEY
  ) {
    throw databaseFailure(
      "The wholesale snapshot binding does not match its normalized lookup input.",
    );
  }
  return {
    authority: "wholesale_ledger",
    wholesaleVersionId: result.wholesaleVersionId,
    wholesaleVersionKey: result.wholesaleVersionKey,
    lookupFingerprint: result.lookupFingerprint,
    wholesaleLookupInput: {
      manufacturerCode: input.manufacturerCode,
      accountKey: WHOLESALE_LEDGER_ACCOUNT_KEY,
      productKey: input.productKey,
      programKey: input.programKey,
      styleKey: input.styleKey,
      colorKey: input.colorKey,
      width: input.width,
      height: input.height,
      options: JSON.parse(JSON.stringify(input.options)) as JsonRecord,
      asOf: input.asOf,
    },
    wholesaleBaseCostCents: result.baseCostCents,
    wholesalePerUnitOptionCostCents: result.perUnitOptionCostCents,
    wholesalePerLineOnceCostCents: result.perLineOnceCostCents,
    wholesalePerOrderOnceCostCents: result.perOrderOnceCostCents,
    wholesaleUnitCostCents: result.wholesaleUnitCostCents,
  };
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CrmAuthError(400, `${label} must be a JSON object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CrmAuthError(400, `${label} must be a plain JSON object.`);
  }
  return value as Record<string, unknown>;
}

function exactFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
) {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw new CrmAuthError(
      400,
      `${label} rejected field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`,
    );
  }
}

function machineKey(
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean } = {},
): string {
  if (typeof value !== "string") {
    throw new CrmAuthError(400, `${label} must be a machine key.`);
  }
  const normalized = value.trim().toLowerCase();
  if (options.allowEmpty && !normalized) return "";
  if (!MACHINE_KEY_PATTERN.test(normalized)) {
    throw new CrmAuthError(
      400,
      `${label} must use lowercase letters, numbers, underscores, or hyphens.`,
    );
  }
  return normalized;
}

function dimension(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1_000
  ) {
    throw new CrmAuthError(
      400,
      `${label} must be a positive number no greater than 1,000 inches.`,
    );
  }
  return Math.round(value * 10_000) / 10_000;
}

function validIsoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CrmAuthError(400, `${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new CrmAuthError(400, `${label} must be a valid calendar date.`);
  }
  return value;
}

function serverBusinessDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function normalizedProtectedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function optionValue(
  value: unknown,
  path: string,
  depth: number,
): JsonValue {
  if (depth > MAX_OPTION_DEPTH) {
    throw new CrmAuthError(400, `${path} exceeds the supported nesting depth.`);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "string" && value.length > 500) {
      throw new CrmAuthError(400, `${path} is too long.`);
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CrmAuthError(400, `${path} must be a finite number.`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_OPTION_COLLECTION_SIZE) {
      throw new CrmAuthError(400, `${path} contains too many values.`);
    }
    return value.map((item, index) =>
      optionValue(item, `${path}[${index}]`, depth + 1),
    );
  }
  const source = plainRecord(value, path);
  const keys = Object.keys(source);
  if (keys.length > MAX_OPTION_COLLECTION_SIZE) {
    throw new CrmAuthError(400, `${path} contains too many fields.`);
  }
  const result: Record<string, JsonValue> = {};
  for (const key of keys.sort()) {
    if (!OPTION_KEY_PATTERN.test(key)) {
      throw new CrmAuthError(400, `${path}.${key} is not a supported option key.`);
    }
    const normalized = normalizedProtectedKey(key);
    if (
      PROTECTED_OPTION_KEYS.has(normalized) ||
      normalized.startsWith("wholesale") ||
      normalized.startsWith("dealercost") ||
      normalized.startsWith("manufacturercost") ||
      normalized.startsWith("internalcost") ||
      normalized.startsWith("provenance")
    ) {
      throw new CrmAuthError(
        400,
        `${path}.${key} is protected server-owned pricing metadata.`,
      );
    }
    result[key] = optionValue(source[key], `${path}.${key}`, depth + 1);
  }
  return result;
}

function normalizedOptions(value: unknown): Readonly<JsonRecord> {
  const result = optionValue(value ?? {}, "options", 0);
  if (!result || Array.isArray(result) || typeof result !== "object") {
    throw new CrmAuthError(400, "options must be a JSON object.");
  }
  const serialized = JSON.stringify(result);
  if (Buffer.byteLength(serialized, "utf8") > MAX_OPTIONS_JSON_BYTES) {
    throw new CrmAuthError(400, "options exceeds the 20 KB request limit.");
  }
  return result as Readonly<JsonRecord>;
}

export function assertSalesQuoteV2WholesaleLedgerAccess(
  email: string | null | undefined,
) {
  const normalized = email ? normalizeCrmEmail(email) : "";
  if (!normalized || !WHOLESALE_LEDGER_EMAILS.has(normalized)) {
    throw new CrmAuthError(
      403,
      "Wholesale cost lookup is restricted to authorized 805 pricing accounts.",
    );
  }
}

/**
 * Strict staff-request allowlist. Cost, source, provenance, version, margin,
 * and price values are always resolved by the service-role ledger RPC.
 */
export function parseSalesQuoteV2WholesaleLookupBody(
  value: unknown,
  now: Date = new Date(),
): SalesQuoteV2WholesaleLookupInput {
  const body = plainRecord(value, "Wholesale lookup request");
  exactFields(body, LOOKUP_FIELDS, "Wholesale lookup request");

  const dimensions = plainRecord(body.dimensions, "dimensions");
  exactFields(dimensions, DIMENSION_FIELDS, "dimensions");

  return {
    manufacturerCode: machineKey(
      body.manufacturerCode,
      "manufacturerCode",
    ),
    productKey: machineKey(body.productKey, "productKey"),
    programKey: machineKey(body.programKey, "programKey"),
    styleKey: machineKey(body.styleKey ?? "", "styleKey", {
      allowEmpty: true,
    }),
    colorKey: machineKey(body.colorKey ?? "", "colorKey", {
      allowEmpty: true,
    }),
    width: dimension(dimensions.width, "dimensions.width"),
    height: dimension(dimensions.height, "dimensions.height"),
    options: normalizedOptions(body.options),
    asOf: validIsoDate(body.asOf ?? serverBusinessDate(now), "asOf"),
  };
}

function databaseFailure(message: string): CrmAuthError {
  return new CrmAuthError(502, message);
}

function resultRecord(value: unknown): Record<string, unknown> {
  const unwrapped =
    Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) {
    throw databaseFailure("The wholesale ledger returned a malformed result.");
  }
  return unwrapped as Record<string, unknown>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw databaseFailure(`${label} is missing from the wholesale ledger result.`);
  }
  return value.trim();
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredText(value, label);
}

function uuidResult(value: unknown, label: string): string {
  const parsed = requiredText(value, label).toLowerCase();
  if (!UUID_PATTERN.test(parsed)) {
    throw databaseFailure(`${label} is invalid in the wholesale ledger result.`);
  }
  return parsed;
}

function cents(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw databaseFailure(`${label} is invalid in the wholesale ledger result.`);
  }
  return parsed;
}

function nullableCents(value: unknown, label: string): number | null {
  return value === null ? null : cents(value, label);
}

function positiveResultNumber(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw databaseFailure(`${label} is invalid in the wholesale ledger result.`);
  }
  return parsed;
}

function serverJsonRecord(value: unknown, label: string): Readonly<JsonRecord> {
  try {
    const record = plainRecord(value, label);
    const encoded = JSON.stringify(record);
    if (Buffer.byteLength(encoded, "utf8") > MAX_OPTIONS_JSON_BYTES) {
      throw new Error("too large");
    }
    return JSON.parse(encoded) as JsonRecord;
  } catch {
    throw databaseFailure(`${label} is invalid in the wholesale ledger result.`);
  }
}

function resultIsoDate(value: unknown, label: string): string {
  try {
    return validIsoDate(value, label);
  } catch {
    throw databaseFailure(`${label} is invalid in the wholesale ledger result.`);
  }
}

function resultMachineKey(
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean } = {},
): string {
  try {
    return machineKey(value, label, options);
  } catch {
    throw databaseFailure(`${label} is invalid in the wholesale ledger result.`);
  }
}

function components(value: unknown): SalesQuoteV2WholesaleCostComponent[] {
  if (!Array.isArray(value)) {
    throw databaseFailure("Wholesale option components are malformed.");
  }
  return value.map((entry, index) => {
    const row = resultRecord(entry);
    const calculation = requiredText(
      row.calculation,
      `Component ${index + 1} calculation`,
    );
    const billingScope = requiredText(
      row.billingScope,
      `Component ${index + 1} billing scope`,
    );
    if (!["fixed", "percent_base", "per_sqft"].includes(calculation)) {
      throw databaseFailure(
        `Component ${index + 1} calculation is unsupported.`,
      );
    }
    if (!["per_unit", "per_line_once", "per_order_once"].includes(billingScope)) {
      throw databaseFailure(
        `Component ${index + 1} billing scope is unsupported.`,
      );
    }
    return {
      componentKey: requiredText(
        row.componentKey,
        `Component ${index + 1} key`,
      ),
      label: requiredText(row.label, `Component ${index + 1} label`),
      calculation: calculation as SalesQuoteV2WholesaleCostComponent["calculation"],
      costCents: cents(row.costCents, `Component ${index + 1} cost`),
      billingScope:
        billingScope as SalesQuoteV2WholesaleCostComponent["billingScope"],
      sourceId: uuidResult(row.sourceId, `Component ${index + 1} source`),
      sourceLocator: serverJsonRecord(
        row.sourceLocator,
        `Component ${index + 1} source locator`,
      ),
    };
  });
}

function orderCostRules(value: unknown): SalesQuoteV2WholesaleOrderCostRule[] {
  if (!Array.isArray(value)) {
    throw databaseFailure("Wholesale order cost rules are malformed.");
  }
  return value.map((entry, index) => {
    const row = resultRecord(entry);
    const kind = requiredText(row.kind, `Order rule ${index + 1} kind`);
    const calculation = requiredText(
      row.calculation,
      `Order rule ${index + 1} calculation`,
    );
    const status = requiredText(row.status, `Order rule ${index + 1} status`);
    const thresholdOperator =
      row.thresholdOperator === null
        ? null
        : requiredText(
            row.thresholdOperator,
            `Order rule ${index + 1} threshold operator`,
          );
    if (!["freight", "oversize", "processing", "other"].includes(kind)) {
      throw databaseFailure(`Order rule ${index + 1} kind is unsupported.`);
    }
    if (
      ![
        "first_plus_additional",
        "flat",
        "percent_subtotal",
        "free_above_threshold",
        "unresolved",
      ].includes(calculation)
    ) {
      throw databaseFailure(
        `Order rule ${index + 1} calculation is unsupported.`,
      );
    }
    if (
      !["authoritative", "documented", "unresolved", "quarantined"].includes(
        status,
      )
    ) {
      throw databaseFailure(`Order rule ${index + 1} status is unsupported.`);
    }
    if (
      thresholdOperator !== null &&
      !["subtotal_lt", "subtotal_gte"].includes(thresholdOperator)
    ) {
      throw databaseFailure(
        `Order rule ${index + 1} threshold operator is unsupported.`,
      );
    }
    return {
      ruleKey: requiredText(row.ruleKey, `Order rule ${index + 1} key`),
      label: requiredText(row.label, `Order rule ${index + 1} label`),
      kind: kind as SalesQuoteV2WholesaleOrderCostRule["kind"],
      calculation:
        calculation as SalesQuoteV2WholesaleOrderCostRule["calculation"],
      firstUnitCostCents: nullableCents(
        row.firstUnitCostCents,
        `Order rule ${index + 1} first-unit cost`,
      ),
      additionalUnitCostCents: nullableCents(
        row.additionalUnitCostCents,
        `Order rule ${index + 1} additional-unit cost`,
      ),
      flatCostCents: nullableCents(
        row.flatCostCents,
        `Order rule ${index + 1} flat cost`,
      ),
      rateBasisPoints: nullableCents(
        row.rateBasisPoints,
        `Order rule ${index + 1} rate`,
      ),
      thresholdCents: nullableCents(
        row.thresholdCents,
        `Order rule ${index + 1} threshold`,
      ),
      thresholdOperator:
        thresholdOperator as SalesQuoteV2WholesaleOrderCostRule["thresholdOperator"],
      status: status as SalesQuoteV2WholesaleOrderCostRule["status"],
      sourceId: uuidResult(row.sourceId, `Order rule ${index + 1} source`),
      sourceLocator: serverJsonRecord(
        row.sourceLocator,
        `Order rule ${index + 1} source locator`,
      ),
    };
  });
}

function sources(value: unknown): SalesQuoteV2WholesaleSource[] {
  if (!Array.isArray(value) || !value.length) {
    throw databaseFailure(
      "An authoritative wholesale result requires source provenance.",
    );
  }
  return value.map((entry, index) => {
    const row = resultRecord(entry);
    const sha256 = requiredText(row.sha256, `Source ${index + 1} SHA-256`);
    if (!SHA256_PATTERN.test(sha256)) {
      throw databaseFailure(`Source ${index + 1} SHA-256 is invalid.`);
    }
    if (!Array.isArray(row.authorityScope)) {
      throw databaseFailure(`Source ${index + 1} authority scope is invalid.`);
    }
    return {
      sourceKey: requiredText(row.sourceKey, `Source ${index + 1} key`),
      sourceType: requiredText(row.sourceType, `Source ${index + 1} type`),
      fileName: requiredText(row.fileName, `Source ${index + 1} file name`),
      revision: requiredText(row.revision, `Source ${index + 1} revision`),
      effectiveFrom:
        row.effectiveFrom === null
          ? null
          : resultIsoDate(
              row.effectiveFrom,
              `Source ${index + 1} effectiveFrom`,
            ),
      effectiveUntil:
        row.effectiveUntil === null
          ? null
          : resultIsoDate(
              row.effectiveUntil,
              `Source ${index + 1} effectiveUntil`,
            ),
      receivedOn: resultIsoDate(
        row.receivedOn,
        `Source ${index + 1} receivedOn`,
      ),
      sha256,
      accountScope: nullableText(
        row.accountScope,
        `Source ${index + 1} account scope`,
      ),
      authorityScope: row.authorityScope.map((scope, scopeIndex) =>
        requiredText(
          scope,
          `Source ${index + 1} authority scope ${scopeIndex + 1}`,
        ),
      ),
    };
  });
}

function normalizeLookupResult(
  value: unknown,
  input: SalesQuoteV2WholesaleLookupInput,
): SalesQuoteV2WholesaleLookupResult {
  const row = resultRecord(value);
  if (row.status === "blocked") {
    const code = requiredText(row.code, "Wholesale block code");
    if (!BLOCK_CODES.has(code)) {
      throw databaseFailure("The wholesale ledger returned an unknown block code.");
    }
    for (const key of Object.keys(row)) {
      const normalized = normalizedProtectedKey(key);
      if (
        normalized.includes("cost") ||
        normalized.includes("margin") ||
        normalized.includes("profit") ||
        normalized.includes("price")
      ) {
        throw databaseFailure(
          "A blocked wholesale result unexpectedly contained cost data.",
        );
      }
    }
    return {
      status: "blocked",
      code,
      manufacturerCode: input.manufacturerCode,
      productKey: input.productKey,
      programKey: input.programKey,
      styleKey: input.styleKey,
      colorKey: input.colorKey,
      requestedWidth: input.width,
      requestedHeight: input.height,
      asOf: input.asOf,
    };
  }
  if (row.status !== "authoritative") {
    throw databaseFailure("The wholesale ledger returned an invalid status.");
  }

  const baseCostCents = cents(row.baseCostCents, "Wholesale base cost");
  const optionCostCents = cents(row.optionCostCents, "Wholesale option cost");
  const perUnitOptionCostCents = cents(
    row.perUnitOptionCostCents,
    "Wholesale per-unit option cost",
  );
  const perLineOnceCostCents = cents(
    row.perLineOnceCostCents,
    "Wholesale once-per-line option cost",
  );
  const perOrderOnceCostCents = cents(
    row.perOrderOnceCostCents,
    "Wholesale once-per-order option cost",
  );
  if (optionCostCents !== perUnitOptionCostCents) {
    throw databaseFailure(
      "The wholesale ledger per-unit option totals do not reconcile.",
    );
  }
  const normalizedComponents = components(row.components);
  const componentTotal = (
    billingScope: SalesQuoteV2WholesaleCostComponent["billingScope"],
  ) =>
    normalizedComponents
      .filter((component) => component.billingScope === billingScope)
      .reduce((sum, component) => sum + component.costCents, 0);
  if (
    componentTotal("per_unit") !== perUnitOptionCostCents ||
    componentTotal("per_line_once") !== perLineOnceCostCents ||
    componentTotal("per_order_once") !== perOrderOnceCostCents
  ) {
    throw databaseFailure(
      "The wholesale ledger scoped option components do not reconcile.",
    );
  }
  const wholesaleUnitCostCents = cents(
    row.wholesaleUnitCostCents,
    "Wholesale unit cost",
  );
  if (baseCostCents + optionCostCents !== wholesaleUnitCostCents) {
    throw databaseFailure("The wholesale ledger cost components do not reconcile.");
  }
  const currency = requiredText(row.currency, "Wholesale currency");
  if (currency !== "USD") {
    throw databaseFailure("The wholesale ledger returned an unsupported currency.");
  }
  const lookupFingerprint = requiredText(
    row.lookupFingerprint,
    "Wholesale lookup fingerprint",
  );
  if (!SHA256_PATTERN.test(lookupFingerprint)) {
    throw databaseFailure("The wholesale lookup fingerprint is invalid.");
  }

  const normalized: SalesQuoteV2WholesaleLookupAuthoritative = {
    status: "authoritative",
    wholesaleVersionId: uuidResult(
      row.wholesaleVersionId,
      "Wholesale version ID",
    ),
    wholesaleVersionKey: requiredText(
      row.wholesaleVersionKey,
      "Wholesale version key",
    ),
    scopeKey: resultMachineKey(row.scopeKey, "Wholesale scope key"),
    effectiveFrom: resultIsoDate(row.effectiveFrom, "Wholesale effectiveFrom"),
    effectiveUntil:
      row.effectiveUntil === null
        ? null
        : resultIsoDate(row.effectiveUntil, "Wholesale effectiveUntil"),
    accountKey:
      requiredText(row.accountKey, "Wholesale account key") ===
      WHOLESALE_LEDGER_ACCOUNT_KEY
        ? WHOLESALE_LEDGER_ACCOUNT_KEY
        : (() => {
            throw databaseFailure(
              "The wholesale ledger returned the wrong account scope.",
            );
          })(),
    accountScope: requiredText(row.accountScope, "Wholesale account scope"),
    programId: uuidResult(row.programId, "Wholesale program ID"),
    manufacturerCode: resultMachineKey(
      row.manufacturerCode,
      "Wholesale manufacturer code",
    ),
    productKey: resultMachineKey(row.productKey, "Wholesale product key"),
    programKey: resultMachineKey(row.programKey, "Wholesale program key"),
    styleKey: resultMachineKey(row.styleKey ?? "", "Wholesale style key", {
      allowEmpty: true,
    }),
    colorKey: resultMachineKey(row.colorKey ?? "", "Wholesale color key", {
      allowEmpty: true,
    }),
    requestedWidth: positiveResultNumber(
      row.requestedWidth,
      "Wholesale requested width",
    ),
    requestedHeight: positiveResultNumber(
      row.requestedHeight,
      "Wholesale requested height",
    ),
    matchedWidth: positiveResultNumber(
      row.matchedWidth,
      "Wholesale matched width",
    ),
    matchedHeight: positiveResultNumber(
      row.matchedHeight,
      "Wholesale matched height",
    ),
    baseCostCents,
    optionCostCents,
    perUnitOptionCostCents,
    perLineOnceCostCents,
    perOrderOnceCostCents,
    wholesaleUnitCostCents,
    currency: "USD",
    components: normalizedComponents,
    orderCostRules: orderCostRules(row.orderCostRules),
    sources: sources(row.sources),
    lookupFingerprint,
  };

  if (
    normalized.manufacturerCode !== input.manufacturerCode ||
    normalized.productKey !== input.productKey ||
    normalized.programKey !== input.programKey ||
    normalized.styleKey !== input.styleKey ||
    normalized.colorKey !== input.colorKey ||
    normalized.requestedWidth !== input.width ||
    normalized.requestedHeight !== input.height ||
    normalized.matchedWidth < input.width ||
    normalized.matchedHeight < input.height
  ) {
    throw databaseFailure(
      "The wholesale ledger result does not match the normalized request.",
    );
  }
  return normalized;
}

/**
 * Calls only the service-role-only RPC. The database independently checks
 * auth.role(), so passing any browser or authenticated client fails closed.
 */
export async function lookupPublishedSalesQuoteV2WholesaleCost(
  supabase: SupabaseClient,
  input: SalesQuoteV2WholesaleLookupInput,
): Promise<SalesQuoteV2WholesaleLookupResult> {
  const { data, error } = await supabase.rpc(
    "lookup_quote_v2_wholesale_cost",
    {
      p_manufacturer_code: input.manufacturerCode,
      p_account_key: WHOLESALE_LEDGER_ACCOUNT_KEY,
      p_product_key: input.productKey,
      p_program_key: input.programKey,
      p_style_key: input.styleKey,
      p_color_key: input.colorKey,
      p_width: input.width,
      p_height: input.height,
      p_options: input.options,
      p_as_of: input.asOf,
    },
  );
  if (error) {
    throw databaseFailure("The authoritative wholesale lookup failed.");
  }
  return normalizeLookupResult(data, input);
}
