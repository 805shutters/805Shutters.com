import { createHash } from "node:crypto";

/**
 * Shared manufacturer price record, schema `805-price-record/v1`.
 *
 * Every manufacturer worker (norman, onyx, sundance, lotus) submits this one
 * shape. Norman is wired to dealer RA00743. Onyx and Sundance normalize into
 * the same shape and the same spec hash. Their account numbers are not in the
 * repo, so acceptance fails closed with reason `no_vendor_account` and no
 * account row is invented. The live-lookup switches stay off until Mike turns
 * them on. The record holds no credentials.
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

export const ONYX_PRICE_BOT = "onyx";
export const SUNDANCE_PRICE_BOT = "sundance";
/** Public portal host. Not an account number. */
export const ONYX_PRICE_SITE = "https://admin.onyxshutters.com/Login.aspx";
export const SUNDANCE_PRICE_SITE = "https://sundance.blindata.app";
/**
 * Onyx and Sundance dealer account numbers are not in this repo.
 * Leave these null. Do not invent a number. `no_vendor_account` stays the result
 * until Mike supplies the account and a later change seeds `crm_vendor_accounts`.
 */
export const ONYX_VENDOR_ACCOUNT: string | null = null;
export const SUNDANCE_VENDOR_ACCOUNT: string | null = null;

export const NO_VENDOR_ACCOUNT = "no_vendor_account";
export const PRICE_BASIS_UNCONFIRMED = "price_basis_unconfirmed";

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
  "grand_total",
  "list_price",
  "list_unit_price",
  "msrp",
  "suggested_retail",
  "dealer_factor",
  "net_price",
  "dealer_net",
  "dealer_net_base_price",
  "retail_price",
  "extended_price",
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

export function normalizeOptionKey(key: string): string {
  return trimEdges(key).toLowerCase().replace(/[\t\n\r -]+/g, "_").replace(/_+/g, "_");
}

function looseName(value: string): string {
  return trimEdges(value).toLowerCase().replace(/[\t\n\r ]+/g, " ");
}

const ONYX_PRODUCT_KEYS: Record<string, string> = {
  "painted basswood": "painted_basswood",
  "stained basswood": "stained_basswood",
  sycamore: "secamore",
  secamore: "secamore",
  "vlo hybrid": "vlo_hybrid",
  vlo: "vlo_hybrid",
  "onyx us made vinyl": "onyx_us_made_vinyl",
  "us made vinyl": "onyx_us_made_vinyl",
  "poly composite": "poly_composite",
  "onyx signature roller shades": "onyx_signature_roller",
  "onyx signature sunscreen shades": "onyx_signature_sunscreen",
  "onyx signature zebra shades": "onyx_signature_zebra",
  "onyx lux fabric blinds": "onyx_lux_fabric_blinds",
  "onyx lux honeycomb shades": "onyx_lux_honeycomb",
  "onyx lux sheerview shades": "onyx_lux_sheerview",
  "onyx woven wood shades": "onyx_woven",
  "onyx ash shutters": "onyx_ash_shutters",
};

const SUNDANCE_PRODUCT_KEYS: Record<string, string> = {
  "sundance roller": "sundance_roller",
  "sundance flat roman": "sundance_flat_roman",
  "sundance europanels": "sundance_europanels",
  "louvolite roller": "sundance_louvolite_roller",
  "louvolite flat roman": "sundance_louvolite_flat_roman",
  "louvolite europanels": "sundance_louvolite_europanels",
  "sundance zebra": "sundance_zebra",
  "louvolite zebra": "sundance_louvolite_zebra",
  sheerview: "sundance_sheerview",
  "sundance sheerview": "sundance_sheerview",
  "sheer view": "sundance_sheerview",
  "cellular horizontal": "sundance_cellular",
  verticell: "sundance_verticell",
  "cellular specialty shapes": "sundance_cellular_shapes",
  "advantage ii 2-inch faux wood": "sundance_advantage_ii_2",
  "advantage ii 2.5-inch faux wood": "sundance_advantage_ii_2_5",
  "premium ii 2-inch wood": "sundance_premium_ii_2",
  "premium ii 2.5-inch wood": "sundance_premium_ii_2_5",
  "2-inch aluminum 8-gauge": "sundance_aluminum_2",
  "1-inch aluminum variants": "sundance_aluminum_1",
  "basicvue 2-inch faux wood": "sundance_basicvue",
  "chateau woods 2/2.5-inch": "sundance_chateau_woods",
  "vertical essence custom/stock": "sundance_vertical_essence",
  "custom wood shutters": "sundance_wood_shutters",
  "solid vinyl shutters": "sundance_vinyl_shutters",
  "exterior cable-guided": "sundance_exterior_cable",
  "exterior zipscreen": "sundance_exterior_zip",
  "walden premier woven": "sundance_walden_premier",
  "walden select woven": "sundance_walden_select",
  "portfolio roman": "sundance_portfolio_roman",
};

export function manufacturerProductKey(manufacturer: string, product: string): string {
  const name = trimEdges(manufacturer).toLowerCase();
  const trimmed = trimEdges(product).toLowerCase();
  const loose = looseName(product);
  if (name === "onyx") return ONYX_PRODUCT_KEYS[loose] ?? trimmed;
  if (name === "sundance") return SUNDANCE_PRODUCT_KEYS[loose] ?? trimmed;
  return trimmed;
}

function readDimension(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("size fraction is not a number");
  const record = value as Record<string, unknown>;
  const whole = record.whole;
  const fraction = record.fraction;
  if (whole == null && (fraction == null || fraction === "")) return null;
  if (whole != null && (typeof whole !== "number" || !Number.isInteger(whole))) throw new Error("size fraction is not a number");
  if (fraction != null && typeof fraction !== "string") throw new Error("size fraction is not a number");
  return eighthsFromWholeFraction(typeof whole === "number" ? whole : null, typeof fraction === "string" ? fraction : null);
}

function applyOnyxSize(
  manufacturer: string,
  widthEighths: number | null,
  heightEighths: number | null,
  options: Record<string, unknown>,
): { widthEighths: number | null; heightEighths: number | null } {
  if (trimEdges(manufacturer).toLowerCase() !== "onyx") return { widthEighths, heightEighths };
  let width = widthEighths;
  let height = heightEighths;
  for (const [key, value] of Object.entries(options)) {
    const next = normalizeOptionKey(key);
    if (next !== "width_a" && next !== "height_b") continue;
    const alt = readDimension(value);
    const current = next === "width_a" ? width : height;
    if (current != null && alt != null && current !== alt) throw new Error("spec size conflict");
    if (next === "width_a") width = current ?? alt;
    else height = current ?? alt;
  }
  return { widthEighths: width, heightEighths: height };
}

function specOptions(manufacturer: string, options: Record<string, unknown>): Record<string, unknown> {
  const name = trimEdges(manufacturer).toLowerCase();
  const reshape = name === "onyx" || name === "sundance";
  const built: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    const next = reshape ? normalizeOptionKey(key) : key;
    if (next === "") throw new Error("option key is empty");
    if (name === "onyx" && (next === "width_a" || next === "height_b")) continue;
    if (OMITTED_OPTION_KEYS.has(key) || OMITTED_OPTION_KEYS.has(next)) continue;
    if (Object.prototype.hasOwnProperty.call(built, next)) throw new Error("option keys collide");
    built[next] = value;
  }
  return built;
}

function finalizeSpec(spec: {
  manufacturer: string;
  product: string;
  widthEighths: number | null;
  heightEighths: number | null;
  options: Record<string, unknown>;
}) {
  const sized = applyOnyxSize(spec.manufacturer, spec.widthEighths, spec.heightEighths, spec.options);
  return {
    manufacturer: trimEdges(spec.manufacturer).toLowerCase(),
    product: manufacturerProductKey(spec.manufacturer, spec.product),
    widthEighths: sized.widthEighths,
    heightEighths: sized.heightEighths,
    options: specOptions(spec.manufacturer, spec.options),
  };
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
  return hashCanonical(finalizeSpec({
    manufacturer: spec.manufacturer,
    product: spec.product,
    widthEighths: spec.widthInches == null ? null : eighthsFromInches(spec.widthInches),
    heightEighths: spec.heightInches == null ? null : eighthsFromInches(spec.heightInches),
    options: spec.options ?? {},
  }));
}

/** Same inputs `price_record_line_spec_hash` reads from the quote line. */
export function quoteLineSpecHash(input: QuoteLineSpecInput): string {
  const options = input.options ?? {};
  const manufacturer = firstText(options, ["manufacturer", "catalog_manufacturer", "manufacturerId"]);
  const product = firstText(options, ["product", "catalog_product_id", "productId", "quote_lab_product_id"])
    || trimEdges(input.productType ?? "");
  return hashCanonical(finalizeSpec({
    manufacturer,
    product,
    widthEighths: eighthsFromWholeFraction(input.widthWhole ?? null, input.widthFraction ?? null),
    heightEighths: eighthsFromWholeFraction(input.heightWhole ?? null, input.heightFraction ?? null),
    options,
  }));
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

/** Norman dealer RA00743. Onyx and Sundance use their own accept functions. */
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

const LINE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEALER_NET_LABELS = new Set(["dealer_net_base_price", "dealer net base price", "dealer net"]);

const UNCONFIRMED_PRICE_LABELS = new Set([
  "grand_total",
  "grand total",
  "list_price",
  "list price",
  "list_unit_price",
  "msrp",
  "suggested_retail",
  "suggested retail",
  "retail_price",
  "retail",
  "net",
  "net_price",
  "unit_price",
  "dealer_cost",
  "extended_price",
  "area",
]);

export type ManufacturerPriceCapture = {
  lineId: string;
  product: string;
  widthInches?: number | null;
  heightInches?: number | null;
  widthWhole?: number | null;
  widthFraction?: string | null;
  heightWhole?: number | null;
  heightFraction?: string | null;
  options?: Record<string, unknown> | null;
  dealerNetBasePrice?: number | null;
  observedPrice?: { label: string; amount: number } | null;
  capturedAt: string;
  sourceUrl?: string;
  evidence?: string;
  capturedBy?: string;
};

export type ManufacturerPriceAcceptance =
  | { ok: true; record: PriceRecord; spec_hash: string }
  | { ok: false; reason: "no_vendor_account" | "invalid_record" | "price_basis_unconfirmed"; spec_hash?: string };

function portalMatches(vendor: "onyx" | "sundance", sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== "https:") return false;
    return vendor === "onyx"
      ? parsed.hostname === "admin.onyxshutters.com"
      : parsed.hostname === "sundance.blindata.app";
  } catch {
    return false;
  }
}

function priceAmount(capture: ManufacturerPriceCapture): { amount: number } | { reason: "invalid_record" | "price_basis_unconfirmed" } {
  const observed = capture.observedPrice;
  if (observed && !DEALER_NET_LABELS.has(looseName(observed.label).replace(/_/g, " ")) && !DEALER_NET_LABELS.has(looseName(observed.label))) {
    return { reason: PRICE_BASIS_UNCONFIRMED };
  }
  if (observed && UNCONFIRMED_PRICE_LABELS.has(looseName(observed.label))) return { reason: PRICE_BASIS_UNCONFIRMED };
  const explicit = capture.dealerNetBasePrice;
  const fromLabel = observed ? observed.amount : null;
  if (explicit != null && fromLabel != null && Math.round(explicit * 100) !== Math.round(fromLabel * 100)) {
    return { reason: PRICE_BASIS_UNCONFIRMED };
  }
  const amount = explicit ?? fromLabel;
  if (amount == null) {
    const options = capture.options ?? {};
    for (const [key, value] of Object.entries(options)) {
      const next = normalizeOptionKey(key);
      if (value != null && (UNCONFIRMED_PRICE_LABELS.has(next) || UNCONFIRMED_PRICE_LABELS.has(looseName(key)))) {
        return { reason: PRICE_BASIS_UNCONFIRMED };
      }
    }
    return { reason: "invalid_record" };
  }
  if (!Number.isFinite(amount) || amount <= 0) return { reason: "invalid_record" };
  return { amount };
}

function knownVendorAccount(vendor: "onyx" | "sundance"): string | null {
  return vendor === "onyx" ? ONYX_VENDOR_ACCOUNT : SUNDANCE_VENDOR_ACCOUNT;
}

/**
 * Normalize an Onyx or Sundance capture into `805-price-record/v1`.
 * The spec hash is the same canonical SHA-256 Norman uses. A portal price
 * under any label other than dealer net is refused (`price_basis_unconfirmed`).
 * With no seeded account, a valid capture is refused (`no_vendor_account`).
 */
export function acceptManufacturerPriceRecord(
  vendor: "onyx" | "sundance",
  capture: ManufacturerPriceCapture,
): ManufacturerPriceAcceptance {
  const sourceUrl = capture.sourceUrl?.trim() ?? "";
  const evidence = capture.evidence?.trim() ?? "";
  const capturedBy = (capture.capturedBy ?? vendor).trim();
  if (!LINE_ID.test(capture.lineId)) return { ok: false, reason: "invalid_record" };
  if (!trimEdges(capture.product)) return { ok: false, reason: "invalid_record" };
  if (!capture.capturedAt || Number.isNaN(Date.parse(capture.capturedAt))) return { ok: false, reason: "invalid_record" };
  if (!sourceUrl && !evidence) return { ok: false, reason: "invalid_record" };
  if (sourceUrl && !portalMatches(vendor, sourceUrl)) return { ok: false, reason: "invalid_record" };
  if (capturedBy !== vendor) return { ok: false, reason: "invalid_record" };
  const priced = priceAmount(capture);
  if ("reason" in priced) return { ok: false, reason: priced.reason };
  let hashed: string;
  try {
    const widthFromWhole = eighthsFromWholeFraction(capture.widthWhole ?? null, capture.widthFraction ?? null);
    const heightFromWhole = eighthsFromWholeFraction(capture.heightWhole ?? null, capture.heightFraction ?? null);
    const widthFromInches = capture.widthInches == null ? null : eighthsFromInches(capture.widthInches);
    const heightFromInches = capture.heightInches == null ? null : eighthsFromInches(capture.heightInches);
    if (widthFromWhole != null && widthFromInches != null && widthFromWhole !== widthFromInches) {
      return { ok: false, reason: "invalid_record" };
    }
    if (heightFromWhole != null && heightFromInches != null && heightFromWhole !== heightFromInches) {
      return { ok: false, reason: "invalid_record" };
    }
    hashed = hashCanonical(finalizeSpec({
      manufacturer: vendor,
      product: capture.product,
      widthEighths: widthFromInches ?? widthFromWhole,
      heightEighths: heightFromInches ?? heightFromWhole,
      options: capture.options ?? {},
    }));
  } catch {
    return { ok: false, reason: "invalid_record" };
  }
  const account = knownVendorAccount(vendor);
  if (!account) return { ok: false, reason: NO_VENDOR_ACCOUNT, spec_hash: hashed };
  try {
    const record = buildPriceRecord({
      vendor,
      account,
      lineId: capture.lineId,
      specHash: hashed,
      dealerNetBasePrice: priced.amount,
      capturedAt: capture.capturedAt,
      capturedBy,
      sourceUrl: sourceUrl || undefined,
      evidence: evidence || undefined,
    });
    return { ok: true, record, spec_hash: hashed };
  } catch {
    return { ok: false, reason: "invalid_record", spec_hash: hashed };
  }
}

export function acceptOnyxPriceRecord(capture: ManufacturerPriceCapture): ManufacturerPriceAcceptance {
  return acceptManufacturerPriceRecord("onyx", capture);
}

export function acceptSundancePriceRecord(capture: ManufacturerPriceCapture): ManufacturerPriceAcceptance {
  return acceptManufacturerPriceRecord("sundance", capture);
}
