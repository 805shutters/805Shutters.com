import type { QuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";
import type {
  SalesQuoteDesign,
  SalesQuoteLineItem,
} from "@mts/types/quote";

type JsonObject = Record<string, unknown>;

export type QuoteV2StructureOperation =
  | Readonly<{ type: "quote.update"; patch: JsonObject }>
  | Readonly<{
      type: "line.create";
      lineItemId: string;
      patch: JsonObject;
    }>
  | Readonly<{
      type: "line.update";
      lineItemId: string;
      patch: JsonObject;
    }>
  | Readonly<{ type: "line.delete"; lineItemId: string }>
  | Readonly<{ type: "lines.clear" }>
  | Readonly<{
      type: "line.copy";
      sourceLineItemId: string;
      targetLineItemId: string;
      sortOrder?: number;
    }>
  | Readonly<{
      type: "design.upsert";
      lineItemId: string;
      designId?: string;
      variant: string;
      selectDesign: boolean;
      patch: JsonObject;
    }>
  | Readonly<{
      type: "design.select" | "design.delete";
      lineItemId: string;
      designId: string;
    }>
  | Readonly<{
      type: "design.copySet";
      sourceLineItemId: string;
      targetLineItemId: string;
    }>;

export type QuoteV2DraftResponse = Readonly<{
  backend: "authoritative_v2";
  quoteId: string;
  quoteNumber: string;
  revision: number;
  status: "draft";
  quoteV2Status: "draft";
  lineCount: 0;
}>;

export type QuoteV2StructureResponse = Readonly<{
  backend: "authoritative_v2";
  quoteId: string;
  revision: number;
  status: "draft";
  quoteV2Status: "draft" | "stale";
  lineCount: number;
  selectedDesigns: Readonly<Record<string, string | null>>;
  operations: readonly JsonObject[];
}>;

export type QuoteV2PriceResponse = Readonly<{
  backend: "authoritative_v2";
  quoteId: string;
  lineItemId: string;
  designId: string;
  revision: number;
  quoteStatus: string;
  quoteTotal: number;
  priceStatus: "authoritative" | "blocked" | "unpriceable";
  pricedDesignCount: number;
  blockedDesignCount: number;
  lines: readonly Readonly<{
    lineItemId: string;
    designId: string;
    priceStatus: "authoritative" | "blocked" | "unpriceable";
  }>[];
}>;

const PROTECTED_OPTION_KEYS = new Set([
  "price",
  "amount",
  "subtotal",
  "total",
  "unitprice",
  "retail",
  "retailtotal",
  "totalamount",
  "productcost",
  "manufacturercost",
  "profitamount",
  "baseprice",
  "surchargetotal",
  "pricingmethod",
  "pricinggridkey",
  "pricinggridprice",
  "pricinggridwidth",
  "pricinggridheight",
  "pricingbuiltinadjustment",
  "discountsourceprice",
  "discountamount",
  "manualpriceoverride",
  "processingfee",
  "processingfeeallocated",
  "freight",
  "freightallocated",
  "oversizecharge",
  "oversizeallocated",
  "authoritativeprice",
  "authoritativepricebreakdown",
  "authoritativecostbreakdown",
  "authoritativeoncetotal",
  "authoritativev2snapshot",
  "authoritativepricestatus",
  "pricedselectionfingerprint",
  "pricedcatalogversion",
  "quotev2backend",
  "quotev2catalogversion",
  "quotev2catalogasof",
  "quotev2selection",
  "quotev2pricestatus",
  "quotev2selectionfingerprint",
  "quotev2pricedcatalogversion",
  "quotev2pricedat",
  "currentv2snapshotid",
  "dealerportalsnapshot",
  "provenance",
  "provenancesnapshot",
  "validationsnapshot",
  "sourceid",
  "sourcehash",
  "sourcefilename",
  "sourcerevision",
  "sourcepage",
  "sourcesheet",
  "effectivedate",
  "guideversion",
  "catalogversion",
  "catalogasof",
]);

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isProtectedQuoteV2ClientKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return (
    /(dealer|wholesale|internal|landed|margin|markup|multiplier|cost)/.test(
      normalized,
    ) ||
    PROTECTED_OPTION_KEYS.has(normalized) ||
    /^(authoritative|priced)/.test(normalized) ||
    /(snapshot|fingerprint)$/.test(normalized) ||
    /retail/.test(normalized) ||
    /(price|amount|subtotal)(cents|dollars|persqft)?$/.test(normalized) ||
    /^total(cents|dollars)?$/.test(normalized)
  );
}

/**
 * Design controls still receive the saved display row, including the previous
 * authoritative price snapshot. Only configuration data may cross the
 * structural API boundary; money, cost, provenance, and lock data are rebuilt
 * by trusted server code.
 */
export function customerSafeQuoteV2Options(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(customerSafeQuoteV2Options);
  }
  if (!value || typeof value !== "object") return value;

  const safe: JsonObject = {};
  for (const [key, entry] of Object.entries(value as JsonObject)) {
    if (isProtectedQuoteV2ClientKey(key)) continue;
    safe[key] = customerSafeQuoteV2Options(entry);
  }
  return safe;
}

const DESIGN_STRING_FIELDS = [
  ["product_type", "productType"],
  ["supplier", "supplier"],
  ["material", "material"],
  ["louver_size", "louverSize"],
  ["tilt_type", "tiltType"],
  ["hinge_color", "hingeColor"],
  ["panel_config", "panelConfig"],
  ["mount_type", "mountType"],
  ["shade_type", "shadeType"],
  ["lift_system", "liftSystem"],
  ["valance", "valance"],
  ["fabric", "fabric"],
  ["motor_type", "motorType"],
  ["remote_type", "remoteType"],
  ["notes", "notes"],
] as const;

const DESIGN_BOOLEAN_FIELDS = [
  ["hard_surface_install", "hardSurfaceInstall"],
  ["ladder_over_15ft", "ladderOver15ft"],
  ["requires_takedown", "requiresTakedown"],
] as const;

export function quoteV2DesignPatch(
  design: Partial<SalesQuoteDesign>,
): JsonObject {
  const patch: JsonObject = {};
  for (const [source, target] of DESIGN_STRING_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(design, source)) {
      patch[target] = design[source] ?? null;
    }
  }
  for (const [source, target] of DESIGN_BOOLEAN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(design, source)) {
      patch[target] = Boolean(design[source]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(design, "options_json")) {
    patch.optionsJson = customerSafeQuoteV2Options(design.options_json ?? {});
  }
  return patch;
}

const LINE_FIELDS = [
  ["room_name", "roomName"],
  ["product_type", "productType"],
  ["width_whole", "widthWhole"],
  ["width_fraction", "widthFraction"],
  ["height_whole", "heightWhole"],
  ["height_fraction", "heightFraction"],
  ["quantity", "quantity"],
  ["sort_order", "sortOrder"],
] as const;

export function quoteV2LinePatch(
  line: Partial<SalesQuoteLineItem>,
): JsonObject {
  const patch: JsonObject = {};
  for (const [source, target] of LINE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(line, source)) {
      patch[target] = line[source];
    }
  }
  return patch;
}

const QUOTE_FIELDS = [
  ["customer_name", "customerName"],
  ["customer_phone", "customerPhone"],
  ["customer_email", "customerEmail"],
  ["customer_address", "customerAddress"],
  ["appointment_date", "appointmentDate"],
  ["installer_notes", "installerNotes"],
  ["quote_group_id", "quoteGroupId"],
  ["quote_letter", "quoteLetter"],
] as const;

export function quoteV2QuotePatch(
  quote: Readonly<Record<string, unknown>>,
): JsonObject {
  const patch: JsonObject = {};
  for (const [source, target] of QUOTE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(quote, source)) {
      patch[target] = quote[source];
    }
  }
  return patch;
}

export function quoteV2RequestKey(scope: string): string {
  const normalizedScope =
    scope.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 60) || "quote-v2";
  return `${normalizedScope}:${Date.now()}:${crypto.randomUUID()}`;
}

async function crmAccessToken(database: QuoteBuilderDatabase): Promise<string> {
  const { data, error } = await database.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Your CRM session is unavailable. Sign in again.");
  return token;
}

async function postAuthenticated<T>(
  database: QuoteBuilderDatabase,
  url: string,
  body: unknown,
): Promise<T> {
  const token = await crmAccessToken(database);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | T
    | { message?: string }
    | null;
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Quote V2 request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("Quote V2 returned an invalid response.");
  }
  return payload as T;
}

export function createQuoteV2Draft(
  database: QuoteBuilderDatabase,
  input: Readonly<{
    customerName: string;
    customerPhone?: string | null;
    customerEmail?: string | null;
    customerAddress?: string | null;
    appointmentDate?: string | null;
    installerNotes?: string | null;
    quoteGroupId?: string | null;
    quoteLetter?: string;
  }>,
): Promise<QuoteV2DraftResponse> {
  return postAuthenticated<QuoteV2DraftResponse>(
    database,
    "/api/crm/sales-quotes/v2",
    {
      idempotencyKey: quoteV2RequestKey("draft-create"),
      ...input,
    },
  );
}

export function mutateQuoteV2Structure(
  database: QuoteBuilderDatabase,
  quoteId: string,
  expectedRevision: number,
  operations: readonly QuoteV2StructureOperation[],
): Promise<QuoteV2StructureResponse> {
  return postAuthenticated<QuoteV2StructureResponse>(
    database,
    `/api/crm/sales-quotes/${encodeURIComponent(quoteId)}/v2/structure`,
    {
      expectedRevision,
      idempotencyKey: quoteV2RequestKey("structure"),
      operations,
    },
  );
}

export function priceQuoteV2(
  database: QuoteBuilderDatabase,
  quoteId: string,
  input: Readonly<{
    lineItemId: string;
    designId: string;
    expectedRevision: number;
  }>,
): Promise<QuoteV2PriceResponse> {
  return postAuthenticated<QuoteV2PriceResponse>(
    database,
    `/api/crm/sales-quotes/${encodeURIComponent(quoteId)}/v2/price`,
    {
      ...input,
      idempotencyKey: quoteV2RequestKey("price"),
    },
  );
}
