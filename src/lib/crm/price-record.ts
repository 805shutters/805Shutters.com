import { createHash } from "node:crypto";

/**
 * Shared manufacturer price record, schema `805-price-record/v1`.
 *
 * Every manufacturer worker (norman, onyx, sundance, lotus) submits this one
 * shape. Norman is the only worker wired to it. The other vendor switches stay
 * off until Mike turns them on. The record holds no credentials.
 *
 * ```json
 * {
 *   "schema": "805-price-record/v1",
 *   "vendor": "norman",
 *   "account": "RA00743",
 *   "line_id": "00000000-0000-4000-8000-000000000001",
 *   "spec_hash": "<sha256 hex of the normalized line spec>",
 *   "dealer_net_base_price": "115.20",
 *   "currency": "USD",
 *   "captured_at": "2026-11-21T17:00:00Z",
 *   "source_url": "https://www.normanwindowcoverings.com/Login/default.asp",
 *   "evidence": "optional note or capture reference",
 *   "captured_by": "norman"
 * }
 * ```
 *
 * `source_url` or `evidence` is required. `account` is the vendor account
 * number on `crm_vendor_accounts` (Norman dealer RA00743), not a login.
 *
 * spec_hash is the lowercase hex SHA-256 of the canonical JSON for
 * manufacturer, product, width and height quantized to the nearest 1/8 inch,
 * and configuration options. Object keys are sorted by Unicode code point.
 * Leading and trailing spaces, tabs, and line breaks are removed. Manufacturer
 * and product are compared in lowercase. Price, margin, and audit fields are
 * not part of the spec, so writing a price does not change the hash. A receipt
 * is applied only when its spec_hash still equals the quote line. A mismatch
 * blocks with reason `spec_changed`.
 */
export const PRICE_RECORD_SCHEMA = "805-price-record/v1";

export const PRICE_RECORD_VENDORS = ["norman", "onyx", "sundance", "lotus"] as const;

export type PriceRecordVendor = (typeof PRICE_RECORD_VENDORS)[number];

export const NORMAN_VENDOR_ACCOUNT = "RA00743";
export const NORMAN_PRICE_BOT = "norman";
export const NORMAN_PRICE_SITE = "https://www.normanwindowcoverings.com/Login/default.asp";

export type PriceRecord = {
  schema: typeof PRICE_RECORD_SCHEMA;
  vendor: PriceRecordVendor;
  account: string;
  line_id: string;
  spec_hash: string;
  dealer_net_base_price: string;
  currency: "USD";
  captured_at: string;
  captured_by: string;
  source_url?: string;
  evidence?: string;
};

export type LineSpec = {
  manufacturer: string;
  product: string;
  widthInches: number | null;
  heightInches: number | null;
  options?: Record<string, unknown> | null;
};

export type QuoteLineSpecInput = {
  productType?: string | null;
  widthWhole?: number | null;
  widthFraction?: string | null;
  heightWhole?: number | null;
  heightFraction?: string | null;
  options?: Record<string, unknown> | null;
};

const OMITTED_OPTION_KEYS = new Set([
  "manufacturer",
  "catalog_manufacturer",
  "manufacturerId",
  "product",
  "catalog_product_id",
  "productId",
  "quote_lab_product_id",
  "price_source",
  "live_margin",
  "live_net_unit_price",
  "manual_customer_charge_policy",
  "customer_charges",
  "manual_typed_by",
  "unit_price",
  "priced_at",
  "created_at",
  "updated_at",
  "quote_v2_price_status",
  "authoritative_price_status",
  "manual_price_override",
  "priced_selection_fingerprint",
  "priced_catalog_version",
]);

function trimEdges(value: string): string {
  return value.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
}

function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("spec numbers must be finite");
    if (Object.is(value, -0) || Object.is(value, 0)) return "0";
    if (Number.isInteger(value)) return String(value);
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(trimEdges(value));
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  throw new Error("unsupported spec value");
}

function omitKeys(options: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(options).filter(([key]) => !OMITTED_OPTION_KEYS.has(key)));
}

function firstText(options: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = options[key];
    if (typeof value === "string" && trimEdges(value) !== "") return trimEdges(value);
  }
  return "";
}

export function eighthsFromInches(inches: number): number {
  if (!Number.isFinite(inches)) throw new Error("size must be a finite number of inches");
  return Math.round(inches * 8);
}

export function eighthsFromWholeFraction(whole: number | null, fraction: string | null): number | null {
  const frac = trimEdges(fraction ?? "");
  if (whole == null && frac === "") return null;
  const base = whole ?? 0;
  if (frac === "" || frac === "0") return base * 8;
  const slash = /^([0-9]+)\/([1-9][0-9]*)$/.exec(frac);
  if (slash) return Math.round((base + Number(slash[1]) / Number(slash[2])) * 8);
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(frac)) return Math.round((base + Number(frac)) * 8);
  throw new Error("size fraction is not a number");
}

function hashCanonical(spec: {
  manufacturer: string;
  product: string;
  widthEighths: number | null;
  heightEighths: number | null;
  options: Record<string, unknown>;
}): string {
  const payload = canonicalJson({
    height_eighths: spec.heightEighths,
    manufacturer: spec.manufacturer,
    options: spec.options,
    product: spec.product,
    width_eighths: spec.widthEighths,
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function specHash(spec: LineSpec): string {
  return hashCanonical({
    manufacturer: trimEdges(spec.manufacturer).toLowerCase(),
    product: trimEdges(spec.product).toLowerCase(),
    widthEighths: spec.widthInches == null ? null : eighthsFromInches(spec.widthInches),
    heightEighths: spec.heightInches == null ? null : eighthsFromInches(spec.heightInches),
    options: omitKeys(spec.options ?? {}),
  });
}

/** Same inputs `price_record_line_spec_hash` reads from the quote line. */
export function quoteLineSpecHash(input: QuoteLineSpecInput): string {
  const options = input.options ?? {};
  const manufacturer = firstText(options, ["manufacturer", "catalog_manufacturer", "manufacturerId"]);
  const product = firstText(options, ["product", "catalog_product_id", "productId", "quote_lab_product_id"])
    || trimEdges(input.productType ?? "");
  return hashCanonical({
    manufacturer: manufacturer.toLowerCase(),
    product: product.toLowerCase(),
    widthEighths: eighthsFromWholeFraction(input.widthWhole ?? null, input.widthFraction ?? null),
    heightEighths: eighthsFromWholeFraction(input.heightWhole ?? null, input.heightFraction ?? null),
    options: omitKeys(options),
  });
}

function formatDealerNet(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("dealer net base price must be a positive number");
  const cents = Math.round(amount * 100);
  if (cents <= 0) throw new Error("dealer net base price must be a positive number");
  return `${Math.trunc(cents / 100)}.${String(Math.abs(cents % 100)).padStart(2, "0")}`;
}

export function buildPriceRecord(input: {
  vendor: PriceRecordVendor;
  account: string;
  lineId: string;
  specHash: string;
  dealerNetBasePrice: number;
  capturedAt: string;
  capturedBy: string;
  sourceUrl?: string;
  evidence?: string;
}): PriceRecord {
  const sourceUrl = input.sourceUrl?.trim() ?? "";
  const evidence = input.evidence?.trim() ?? "";
  if (!sourceUrl && !evidence) throw new Error("source_url or evidence is required");
  const record: PriceRecord = {
    schema: PRICE_RECORD_SCHEMA,
    vendor: input.vendor,
    account: input.account.trim(),
    line_id: input.lineId,
    spec_hash: input.specHash,
    dealer_net_base_price: formatDealerNet(input.dealerNetBasePrice),
    currency: "USD",
    captured_at: input.capturedAt,
    captured_by: input.capturedBy.trim(),
  };
  if (sourceUrl) record.source_url = sourceUrl;
  if (evidence) record.evidence = evidence;
  return record;
}

/** Norman dealer RA00743. Lotus, Onyx, and Sundance do not call this. */
export function buildNormanPriceRecord(input: {
  lineId: string;
  specHash: string;
  dealerNetBasePrice: number;
  capturedAt: string;
  sourceUrl?: string;
  evidence?: string;
  capturedBy?: string;
}): PriceRecord {
  return buildPriceRecord({
    vendor: "norman",
    account: NORMAN_VENDOR_ACCOUNT,
    lineId: input.lineId,
    specHash: input.specHash,
    dealerNetBasePrice: input.dealerNetBasePrice,
    capturedAt: input.capturedAt,
    capturedBy: input.capturedBy ?? NORMAN_PRICE_BOT,
    sourceUrl: input.sourceUrl ?? (input.evidence ? undefined : NORMAN_PRICE_SITE),
    evidence: input.evidence,
  });
}
