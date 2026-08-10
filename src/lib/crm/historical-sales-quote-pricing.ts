/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { getProduct, getProgram } from "@/lib/quote/catalog";

type AnyRow = Record<string, any>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIXTEENTH_FRACTIONS = new Map<string, number>([
  ["0", 0],
  ["1/16", 1],
  ["1/8", 2],
  ["3/16", 3],
  ["1/4", 4],
  ["5/16", 5],
  ["3/8", 6],
  ["7/16", 7],
  ["1/2", 8],
  ["9/16", 9],
  ["5/8", 10],
  ["11/16", 11],
  ["3/4", 12],
  ["13/16", 13],
  ["7/8", 14],
  ["15/16", 15],
]);

function exactMoneyCents(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const scaled = amount * 100;
  const cents = Math.round(scaled);
  return Number.isSafeInteger(cents) && Math.abs(scaled - cents) < 1e-7 ? cents : null;
}

function isExactZeroMoney(value: unknown): boolean {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  ) return false;
  return Number(value) === 0;
}

function strictQuantity(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function groupBy(rows: AnyRow[], key: string) {
  const map = new Map<string, AnyRow[]>();
  for (const row of rows) {
    const value = String(row[key] || "");
    if (!map.has(value)) map.set(value, []);
    map.get(value)?.push(row);
  }
  return map;
}

function moneyFromCents(cents: number) {
  return cents / 100;
}

function lineId(line: AnyRow): string {
  return typeof line.id === "string" ? line.id : "";
}

function strictSortOrder(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  ) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizedRoom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  return normalized || null;
}

function crmDimensionSixteenths(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  ) return null;
  const parsed = Number(value);
  const sixteenths = Math.round(parsed * 16);
  return Number.isFinite(parsed) &&
    parsed > 0 &&
    Number.isSafeInteger(sixteenths) &&
    Math.abs(parsed * 16 - sixteenths) < 1e-7
    ? sixteenths
    : null;
}

function v4DimensionSixteenths(whole: unknown, fraction: unknown): number | null {
  if (
    (typeof whole !== "number" && typeof whole !== "string") ||
    (typeof whole === "string" && !whole.trim())
  ) return null;
  const parsedWhole = Number(whole);
  const fractionSixteenths = typeof fraction === "string"
    ? SIXTEENTH_FRACTIONS.get(fraction)
    : undefined;
  if (!Number.isSafeInteger(parsedWhole) || parsedWhole < 0 || fractionSixteenths === undefined) {
    return null;
  }
  const sixteenths = parsedWhole * 16 + fractionSixteenths;
  return Number.isSafeInteger(sixteenths) && sixteenths > 0 ? sixteenths : null;
}

function structuralFingerprint(line: AnyRow): string {
  const hasCrmDimensions = ["width_in", "height_in"].some((key) => key in line);
  const hasV4Dimensions = [
    "width_whole",
    "width_fraction",
    "height_whole",
    "height_fraction",
  ].some((key) => key in line);
  if (hasCrmDimensions === hasV4Dimensions) {
    throw new CrmAuthError(409, "A historical price line dimension shape is missing or ambiguous.");
  }

  const room = normalizedRoom(hasCrmDimensions ? line.room : line.room_name);
  if (!room) {
    throw new CrmAuthError(409, "A historical price line room is blank or invalid.");
  }
  const width = hasCrmDimensions
    ? crmDimensionSixteenths(line.width_in)
    : v4DimensionSixteenths(line.width_whole, line.width_fraction);
  const height = hasCrmDimensions
    ? crmDimensionSixteenths(line.height_in)
    : v4DimensionSixteenths(line.height_whole, line.height_fraction);
  if (width === null || height === null) {
    throw new CrmAuthError(409, "A historical price line dimension is missing or invalid.");
  }
  return `${room}\u0000${width}\u0000${height}`;
}

function uniqueLinesByFingerprint(lines: AnyRow[], side: "source" | "target"): Map<string, AnyRow> {
  const byFingerprint = new Map<string, AnyRow>();
  for (const line of lines) {
    const fingerprint = structuralFingerprint(line);
    if (byFingerprint.has(fingerprint)) {
      throw new CrmAuthError(
        409,
        `The historical ${side} line structural fingerprints are ambiguous.`,
      );
    }
    byFingerprint.set(fingerprint, line);
  }
  return byFingerprint;
}

function uniqueLinesBySortOrder(lines: AnyRow[]): Map<number, AnyRow> | null {
  const bySortOrder = new Map<number, AnyRow>();
  for (const line of lines) {
    const sortOrder = strictSortOrder(line.sort_order);
    if (sortOrder === null || bySortOrder.has(sortOrder)) return null;
    bySortOrder.set(sortOrder, line);
  }
  return bySortOrder;
}

function resolveSourceLineByTargetId(
  sourceLineItems: AnyRow[],
  targetLineItems: AnyRow[],
): Map<string, AnyRow> {
  const sourceLineIds = new Set(sourceLineItems.map(lineId));
  const targetLineIds = new Set(targetLineItems.map(lineId));
  const lineMappingIsExact =
    sourceLineIds.size === sourceLineItems.length &&
    targetLineIds.size === targetLineItems.length &&
    sourceLineIds.size > 0 &&
    [...sourceLineIds].every((id) => id.length > 0) &&
    [...targetLineIds].every((id) => id.length > 0) &&
    sourceLineIds.size === targetLineIds.size &&
    [...sourceLineIds].every((id) => targetLineIds.has(id));
  if (lineMappingIsExact) {
    return new Map(sourceLineItems.map((line) => [lineId(line), line]));
  }

  if (
    sourceLineItems.length === 0 ||
    targetLineItems.length === 0 ||
    sourceLineItems.length !== targetLineItems.length
  ) {
    throw new CrmAuthError(409, "The historical price line count no longer matches this quote.");
  }
  if (
    sourceLineIds.size !== sourceLineItems.length ||
    targetLineIds.size !== targetLineItems.length
  ) {
    throw new CrmAuthError(409, "The historical price line mapping contains duplicate identities.");
  }
  if ([...sourceLineIds, ...targetLineIds].some((id) => !id)) {
    throw new CrmAuthError(409, "A historical price line identity is missing or invalid.");
  }

  const sourceByFingerprint = uniqueLinesByFingerprint(sourceLineItems, "source");
  const targetByFingerprint = uniqueLinesByFingerprint(targetLineItems, "target");
  if (
    sourceByFingerprint.size !== targetByFingerprint.size ||
    [...sourceByFingerprint.keys()].some((fingerprint) => !targetByFingerprint.has(fingerprint))
  ) {
    throw new CrmAuthError(409, "The historical price line structural fingerprint sets no longer match.");
  }

  const sourceBySort = uniqueLinesBySortOrder(sourceLineItems);
  const targetBySort = uniqueLinesBySortOrder(targetLineItems);
  const sortOrderMappingMatches =
    sourceBySort !== null &&
    targetBySort !== null &&
    sourceBySort.size === targetBySort.size &&
    [...sourceBySort].every(([sortOrder, sourceLine]) => {
      const targetLine = targetBySort.get(sortOrder);
      return targetLine && structuralFingerprint(sourceLine) === structuralFingerprint(targetLine);
    });

  const sourceByTargetId = new Map<string, AnyRow>();
  for (const targetLine of targetLineItems) {
    const targetFingerprint = structuralFingerprint(targetLine);
    const targetSortOrder = strictSortOrder(targetLine.sort_order);
    const sourceLine = sortOrderMappingMatches && targetSortOrder !== null
      ? sourceBySort.get(targetSortOrder)
      : sourceByFingerprint.get(targetFingerprint);
    if (!sourceLine || structuralFingerprint(sourceLine) !== targetFingerprint) {
      throw new CrmAuthError(409, "A historical price line structural fingerprint no longer matches.");
    }
    const targetId = lineId(targetLine);
    if (sourceByTargetId.has(targetId)) {
      throw new CrmAuthError(409, "The historical price line mapping contains duplicate targets.");
    }
    sourceByTargetId.set(targetId, sourceLine);
  }
  if (sourceByTargetId.size !== targetLineItems.length) {
    throw new CrmAuthError(409, "The historical price line mapping is incomplete.");
  }
  return sourceByTargetId;
}

export function projectHistoricalSalesQuoteMirrorPricing(input: {
  sourceQuote: AnyRow;
  sourceLineItems: AnyRow[];
  sourceDesigns: AnyRow[];
  targetLineItems: AnyRow[];
  targetDesignsByLineItemId: Map<string, AnyRow[]>;
}) {
  const sourceTotalCents = exactMoneyCents(input.sourceQuote.quote_total);
  if (sourceTotalCents === null) {
    throw new CrmAuthError(409, "The historical price total is missing or invalid.");
  }
  const sourceTotal = moneyFromCents(sourceTotalCents);

  const sourceLineByTargetId = resolveSourceLineByTargetId(
    input.sourceLineItems,
    input.targetLineItems,
  );

  const sourceDesignsByLineItemId = groupBy(input.sourceDesigns, "line_item_id");
  const projectedDesignsByLineItemId = new Map<string, AnyRow[]>();
  let subtotalCents = 0;
  for (const targetLine of input.targetLineItems) {
    const lineId = String(targetLine.id);
    const sourceLine = sourceLineByTargetId.get(lineId);
    const sourceLineId = String(sourceLine?.id || "");
    const sourceDesigns = sourceDesignsByLineItemId.get(sourceLineId) || [];
    const targetDesigns = input.targetDesignsByLineItemId.get(lineId) || [];
    const sourceQuantity = strictQuantity(sourceLine?.quantity);
    const targetQuantity = strictQuantity(targetLine.quantity);
    if (
      !sourceLine ||
      sourceQuantity === null ||
      targetQuantity === null
    ) {
      throw new CrmAuthError(409, "The historical price line quantity is missing or invalid.");
    }
    if (sourceDesigns.length === 0 || targetDesigns.length === 0) {
      throw new CrmAuthError(409, "The historical price design mapping is missing.");
    }
    if (sourceDesigns.length !== targetDesigns.length) {
      throw new CrmAuthError(409, "The historical price design count no longer matches this quote.");
    }

    const sourceByDesignId = new Map(sourceDesigns.map((design) => [String(design.id), design]));
    const mayMapSoleDesignByLine = sourceDesigns.length === 1 && targetDesigns.length === 1;
    const targetDesignIds = new Set(targetDesigns.map((design) => String(design.id || "")));
    const designMappingIsExact =
      mayMapSoleDesignByLine ||
      (sourceByDesignId.size === sourceDesigns.length &&
        targetDesignIds.size === targetDesigns.length &&
        sourceByDesignId.size === targetDesignIds.size &&
        [...sourceByDesignId.keys()].every((designId) => targetDesignIds.has(designId)));
    if (!designMappingIsExact) {
      throw new CrmAuthError(409, "The historical price design identities no longer match this quote.");
    }
    const projected = targetDesigns.map((targetDesign) => {
      const sourceDesign =
        sourceByDesignId.get(String(targetDesign.id)) ||
        (mayMapSoleDesignByLine ? sourceDesigns[0] : null);
      const sourceUnitCents = exactMoneyCents(sourceDesign?.unit_price);
      if (!sourceDesign || sourceUnitCents === null) {
        throw new CrmAuthError(409, "A historical source design price is missing or invalid.");
      }
      const protectedExtendedCents = sourceUnitCents * sourceQuantity;
      if (!Number.isSafeInteger(protectedExtendedCents)) {
        throw new CrmAuthError(409, "A historical source design amount is outside the safe range.");
      }
      if (protectedExtendedCents % targetQuantity !== 0) {
        throw new CrmAuthError(409, "A historical quantity regroup would require a fractional-cent price.");
      }
      const targetUnitCents = protectedExtendedCents / targetQuantity;
      if (targetUnitCents <= 0 || targetUnitCents * targetQuantity !== protectedExtendedCents) {
        throw new CrmAuthError(409, "A historical quantity regroup could not preserve its protected amount.");
      }
      const nextSubtotalCents = subtotalCents + targetUnitCents * targetQuantity;
      if (!Number.isSafeInteger(nextSubtotalCents)) {
        throw new CrmAuthError(409, "The historical protected subtotal is outside the safe range.");
      }
      subtotalCents = nextSubtotalCents;
      return { ...targetDesign, unit_price: moneyFromCents(targetUnitCents) };
    });
    projectedDesignsByLineItemId.set(lineId, projected);
  }

  if (subtotalCents <= 0 || subtotalCents !== sourceTotalCents) {
    throw new CrmAuthError(409, "The historical price total is inconsistent with its protected lines.");
  }
  const subtotal = moneyFromCents(subtotalCents);

  return {
    subtotal,
    total: sourceTotal,
    shouldSyncSourceTotal: true,
    designsByLineItemId: projectedDesignsByLineItemId,
  };
}

type ProtectedHistoricalPricingSource = {
  sourceQuote: AnyRow;
  sourceLineItems: AnyRow[];
  sourceDesigns: AnyRow[];
};

async function loadProtectedHistoricalPricingSource(
  supabase: SupabaseClient,
  salesQuoteId: string,
): Promise<ProtectedHistoricalPricingSource> {
  const { data: sourceQuotes, error: sourceQuoteError } = await supabase
    .from("crm_quotes")
    .select("id,quote_total,meta")
    .eq("meta->>target_sales_quote_id", salesQuoteId);
  if (sourceQuoteError) {
    throw new CrmAuthError(502, "The original historical quote price lock could not be loaded.");
  }
  if (!sourceQuotes || sourceQuotes.length !== 1) {
    throw new CrmAuthError(409, "The original historical quote price lock is missing or ambiguous.");
  }

  const sourceQuote = sourceQuotes[0] as AnyRow;
  if (sourceQuote.meta?.target_sales_quote_id !== salesQuoteId) {
    throw new CrmAuthError(409, "The original historical quote identity is inconsistent.");
  }

  const { data: sourceLineItems, error: sourceLineError } = await supabase
    .from("crm_quote_line_items")
    .select("id,quantity,room,width_in,height_in,sort_order")
    .eq("quote_id", sourceQuote.id);
  if (sourceLineError) {
    throw new CrmAuthError(502, "The original historical quote lines could not be loaded.");
  }

  const sourceLines = (sourceLineItems || []) as AnyRow[];
  const sourceLineIds = sourceLines.map((line) => line.id).filter(Boolean);
  const { data: sourceDesigns, error: sourceDesignError } = sourceLineIds.length
    ? await supabase
        .from("crm_quote_designs")
        .select("id,line_item_id,unit_price")
        .in("line_item_id", sourceLineIds)
    : { data: [], error: null };
  if (sourceDesignError) {
    throw new CrmAuthError(502, "The original historical quote prices could not be loaded.");
  }

  return {
    sourceQuote,
    sourceLineItems: sourceLines,
    sourceDesigns: (sourceDesigns || []) as AnyRow[],
  };
}

export async function loadHistoricalSalesQuoteMirrorPricing(
  supabase: SupabaseClient,
  salesQuote: AnyRow,
  targetLineItems: AnyRow[],
  targetDesignsByLineItemId: Map<string, AnyRow[]>,
) {
  if (salesQuote.quote_v2_backend !== true || salesQuote.quote_v2_status === "priced") {
    return null;
  }

  const source = await loadProtectedHistoricalPricingSource(supabase, String(salesQuote.id));

  return projectHistoricalSalesQuoteMirrorPricing({
    sourceQuote: source.sourceQuote,
    sourceLineItems: source.sourceLineItems,
    sourceDesigns: source.sourceDesigns,
    targetLineItems,
    targetDesignsByLineItemId,
  });
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function externalSalesQuoteId(value: unknown): string | null {
  const externalId = text(value);
  return externalId?.startsWith("quote:") ? text(externalId.slice("quote:".length)) : null;
}

export function mirroredSalesQuoteId(quote: AnyRow): string | null {
  const meta = quote.meta && typeof quote.meta === "object" ? quote.meta as AnyRow : {};
  const candidates = new Set(
    [
      text(meta.mts_quote_id),
      text(meta.sales_quote_id),
      text(meta.source_sales_quote_id),
      externalSalesQuoteId(quote.external_id),
    ].filter((value): value is string => Boolean(value)),
  );
  if (!candidates.size) return null;
  if (candidates.size !== 1) {
    throw new CrmAuthError(409, "The mirrored historical quote identity is ambiguous.");
  }
  const salesQuoteId = [...candidates][0];
  if (!UUID_PATTERN.test(salesQuoteId)) {
    throw new CrmAuthError(409, "The mirrored historical quote identity is invalid.");
  }
  return salesQuoteId.toLowerCase();
}

const DONOR_NON_CONFIGURATION_FIELDS = new Set([
  "id",
  "line_item_id",
  "quote_id",
  "room",
  "width_in",
  "height_in",
  "quantity",
  "sort_order",
  "selected_design_id",
  "designs",
  "discount_percent",
  "unit_price",
  "wholesale_unit_price",
  "price_status",
  "priced_at",
  "created_at",
  "updated_at",
]);

function canonicalDonorConfiguration(value: unknown): string {
  const isNestedIdentityPriceOrAuditField = (key: string) => {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    return ["mtslineitemid", "mtsdesignid", "lineitemid", "designid", "quoteid"].includes(normalized) ||
      ["amount", "total", "subtotal"].includes(normalized) ||
      /price|cost|margin|profit/.test(normalized) ||
      ["createdat", "updatedat", "pricedat", "timestamp"].includes(normalized);
  };
  const canonicalize = (candidate: unknown, nested = false): unknown => {
    if (Array.isArray(candidate)) return candidate.map((item) => canonicalize(item, true));
    if (!candidate || typeof candidate !== "object") return candidate;
    return Object.fromEntries(
      Object.entries(candidate as AnyRow)
        .filter(([key]) => !nested || !isNestedIdentityPriceOrAuditField(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child, true)]),
    );
  };
  const configuration = value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value as AnyRow)
          .filter(([key]) => !DONOR_NON_CONFIGURATION_FIELDS.has(key)),
      )
    : value;
  return JSON.stringify(canonicalize(configuration));
}

function requireUniqueLineIds(lines: AnyRow[], side: "source" | "target"): Set<string> {
  const ids = lines.map(lineId);
  const unique = new Set(ids);
  if (ids.some((id) => !id) || unique.size !== lines.length) {
    throw new CrmAuthError(409, `The historical ${side} line identities are missing or ambiguous.`);
  }
  return unique;
}

function sameCrmDimensions(left: AnyRow, right: AnyRow): boolean {
  const leftWidth = crmDimensionSixteenths(left.width_in);
  const leftHeight = crmDimensionSixteenths(left.height_in);
  return leftWidth !== null &&
    leftHeight !== null &&
    leftWidth === crmDimensionSixteenths(right.width_in) &&
    leftHeight === crmDimensionSixteenths(right.height_in);
}

function normalizeHistoricalCrmPublicSource(
  source: ProtectedHistoricalPricingSource,
): ProtectedHistoricalPricingSource {
  const linesByFingerprint = new Map<string, AnyRow[]>();
  for (const line of source.sourceLineItems) {
    const fingerprint = structuralFingerprint(line);
    const lines = linesByFingerprint.get(fingerprint) || [];
    lines.push(line);
    linesByFingerprint.set(fingerprint, lines);
  }
  const duplicateGroups = [...linesByFingerprint.values()].filter((lines) => lines.length > 1);
  if (!duplicateGroups.length) return source;

  requireUniqueLineIds(source.sourceLineItems, "source");
  if (!uniqueLinesBySortOrder(source.sourceLineItems)) {
    throw new CrmAuthError(409, "A duplicate historical source line group has ambiguous orders.");
  }

  const designsByLineItemId = groupBy(source.sourceDesigns, "line_item_id");
  const designIdentityCounts = new Map<string, number>();
  for (const design of source.sourceDesigns) {
    const designId = lineId(design);
    designIdentityCounts.set(designId, (designIdentityCounts.get(designId) || 0) + 1);
  }

  const canonicalLineByGroupedId = new Map<string, AnyRow>();
  const canonicalDesignByGroupedId = new Map<string, AnyRow>();
  for (const group of duplicateGroups) {
    const ordered = [...group].sort((left, right) =>
      Number(left.sort_order) - Number(right.sort_order));
    const sortOrders = ordered.map((line) => strictSortOrder(line.sort_order));
    const consecutiveOrders = sortOrders.every((order, index) =>
      order !== null && (index === 0 || order === (sortOrders[index - 1] as number) + 1));
    const protectedDesigns = ordered.map((line) => designsByLineItemId.get(lineId(line)) || []);
    const soleDesigns = protectedDesigns.map((designs) => designs[0]);
    const unitPrices = soleDesigns.map((design) => exactMoneyCents(design?.unit_price));
    const designIds = soleDesigns.map((design) => lineId(design || {}));
    const sharedUnitPrice = unitPrices[0];
    if (
      !consecutiveOrders ||
      ordered.some((line) => strictQuantity(line.quantity) !== 1) ||
      protectedDesigns.some((designs) => designs.length !== 1) ||
      sharedUnitPrice === null ||
      unitPrices.some((unitPrice) => unitPrice !== sharedUnitPrice) ||
      designIds.some((designId) => !designId || designIdentityCounts.get(designId) !== 1)
    ) {
      throw new CrmAuthError(409, "A duplicate historical source line group is ambiguous.");
    }

    const canonicalLine = { ...ordered[0], quantity: ordered.length };
    const canonicalDesign = {
      ...soleDesigns[0],
      line_item_id: lineId(canonicalLine),
      unit_price: moneyFromCents(sharedUnitPrice),
    };
    for (const line of ordered) {
      canonicalLineByGroupedId.set(lineId(line), canonicalLine);
      canonicalDesignByGroupedId.set(lineId(line), canonicalDesign);
    }
  }

  const emittedLines = new Set<string>();
  const sourceLineItems = source.sourceLineItems.flatMap((line) => {
    const canonical = canonicalLineByGroupedId.get(lineId(line));
    if (!canonical) return [line];
    const canonicalId = lineId(canonical);
    if (emittedLines.has(canonicalId)) return [];
    emittedLines.add(canonicalId);
    return [canonical];
  });
  const groupedLineIds = new Set(canonicalLineByGroupedId.keys());
  const emittedDesigns = new Set<string>();
  const sourceDesigns = source.sourceDesigns.flatMap((design) => {
    const groupedLineId = String(design.line_item_id || "");
    if (!groupedLineIds.has(groupedLineId)) return [design];
    const canonical = canonicalDesignByGroupedId.get(groupedLineId);
    if (!canonical) return [];
    const canonicalId = lineId(canonical);
    if (emittedDesigns.has(canonicalId)) return [];
    emittedDesigns.add(canonicalId);
    return [canonical];
  });

  return { ...source, sourceLineItems, sourceDesigns };
}

function projectOneMissingHistoricalCrmMirrorLine(input: {
  mirrorQuote: AnyRow;
  source: ProtectedHistoricalPricingSource;
  targetLineItems: AnyRow[];
  targetDesignsByLineItemId: Map<string, AnyRow[]>;
}) {
  if (
    input.mirrorQuote.signed_at ||
    input.mirrorQuote.customer_signature ||
    input.mirrorQuote.customer_printed_name
  ) {
    throw new CrmAuthError(409, "A signed historical mirror cannot reconstruct a missing line.");
  }

  const sourceIds = requireUniqueLineIds(input.source.sourceLineItems, "source");
  const targetIds = requireUniqueLineIds(input.targetLineItems, "target");
  const sourceByFingerprint = uniqueLinesByFingerprint(input.source.sourceLineItems, "source");
  const targetByFingerprint = uniqueLinesByFingerprint(input.targetLineItems, "target");
  if ([...targetByFingerprint.keys()].some((fingerprint) => !sourceByFingerprint.has(fingerprint))) {
    throw new CrmAuthError(409, "The historical target line fingerprints are not an exact source subset.");
  }
  const missingFingerprints = [...sourceByFingerprint.keys()]
    .filter((fingerprint) => !targetByFingerprint.has(fingerprint));
  if (missingFingerprints.length !== 1) {
    throw new CrmAuthError(409, "Exactly one historical source line must be missing from the mirror.");
  }

  const missingSourceLine = sourceByFingerprint.get(missingFingerprints[0]);
  const missingSourceId = lineId(missingSourceLine || {});
  if (
    !missingSourceLine ||
    !sourceIds.has(missingSourceId) ||
    targetIds.has(missingSourceId) ||
    strictQuantity(missingSourceLine.quantity) !== 1
  ) {
    throw new CrmAuthError(409, "The missing historical source line identity or quantity is invalid.");
  }

  const sourceDesignsByLineItemId = groupBy(input.source.sourceDesigns, "line_item_id");
  const protectedDesigns = sourceDesignsByLineItemId.get(missingSourceId) || [];
  const protectedDesign = protectedDesigns[0];
  const protectedUnitCents = exactMoneyCents(protectedDesign?.unit_price);
  if (protectedDesigns.length !== 1 || !lineId(protectedDesign || {}) || protectedUnitCents === null) {
    throw new CrmAuthError(409, "The missing historical source line must have one exact protected design price.");
  }

  const donors = input.targetLineItems.filter((line) => sameCrmDimensions(line, missingSourceLine));
  if (!donors.length) {
    throw new CrmAuthError(409, "The missing historical line has no exact-dimension donor.");
  }
  const donorDesigns = donors.map((donor) => input.targetDesignsByLineItemId.get(lineId(donor)) || []);
  if (donorDesigns.some((designs) => designs.length !== 1)) {
    throw new CrmAuthError(409, "Every exact-dimension donor must have exactly one current design.");
  }
  const donorConfigurations = new Set(
    donors.map((donor, index) => [
      canonicalDonorConfiguration(donor),
      canonicalDonorConfiguration(donorDesigns[index][0]),
    ].join("\u0000")),
  );
  if (donorConfigurations.size !== 1) {
    throw new CrmAuthError(409, "The exact-dimension donor configuration is ambiguous.");
  }

  const donorLine = donors[0];
  const donorDesign = donorDesigns[0][0];
  const syntheticDesignId = String(protectedDesign.id);
  const currentDesignIds = new Set(
    [...input.targetDesignsByLineItemId.values()].flat().map((design) => String(design.id || "")),
  );
  if (!syntheticDesignId || currentDesignIds.has(syntheticDesignId)) {
    throw new CrmAuthError(409, "The reconstructed historical design identity is invalid or ambiguous.");
  }

  const syntheticDesign = {
    ...donorDesign,
    id: syntheticDesignId,
    line_item_id: missingSourceId,
    unit_price: moneyFromCents(protectedUnitCents),
  };
  const syntheticLine = {
    ...donorLine,
    id: missingSourceId,
    room: missingSourceLine.room,
    width_in: missingSourceLine.width_in,
    height_in: missingSourceLine.height_in,
    quantity: missingSourceLine.quantity,
    sort_order: missingSourceLine.sort_order,
    selected_design_id: syntheticDesignId,
    designs: [syntheticDesign],
  };
  const lineItems = [...input.targetLineItems, syntheticLine];
  const designsByLineItemId = new Map(input.targetDesignsByLineItemId);
  designsByLineItemId.set(missingSourceId, [syntheticDesign]);
  if (!uniqueLinesBySortOrder(input.source.sourceLineItems)) {
    throw new CrmAuthError(409, "The protected historical line order is missing or ambiguous.");
  }
  lineItems.sort((left, right) => {
    const leftSource = sourceByFingerprint.get(structuralFingerprint(left));
    const rightSource = sourceByFingerprint.get(structuralFingerprint(right));
    return Number(leftSource?.sort_order) - Number(rightSource?.sort_order);
  });

  const pricing = projectHistoricalSalesQuoteMirrorPricing({
    sourceQuote: input.source.sourceQuote,
    sourceLineItems: input.source.sourceLineItems,
    sourceDesigns: input.source.sourceDesigns,
    targetLineItems: lineItems,
    targetDesignsByLineItemId: designsByLineItemId,
  });
  return { ...pricing, lineItems };
}

const LEGACY_ONYX_POLY_AGGREGATE_TOTAL_CENTS = 349_910;
const LEGACY_ONYX_POLY_DISCOUNT_PERCENT = 10;
const LEGACY_ONYX_POLY_MIRROR_SHAPE = [
  { room: "flex room", width: 35, height: 60, quantity: 1 },
  { room: "dining room", width: 35, height: 60, quantity: 1 },
  { room: "dining room", width: 60, height: 52, quantity: 1 },
  { room: "living room", width: 35, height: 60, quantity: 2 },
  { room: "bed 1", width: 22, height: 60, quantity: 1 },
  { room: "bed 2", width: 60, height: 52, quantity: 1 },
] as const;

function exactLegacyBreakdownDetail(design: AnyRow, label: string): string | null {
  const details = Array.isArray(design.price_breakdown?.details)
    ? design.price_breakdown.details as AnyRow[]
    : [];
  const matches = details.filter((detail) => detail?.label === label);
  return matches.length === 1 ? text(matches[0].value) : null;
}

function isExactLegacyOnyxPolyCompositeDesign(design: AnyRow): boolean {
  // Generic legacy Shutters mirrors were stored with the Norman placeholder id.
  return design.product_id === "norman_shutters" &&
    design.program_id === null &&
    design.fabric === "Poly Composite" &&
    design.price_breakdown?.source === "mts_805_bookkeeping" &&
    design.price_breakdown?.productType === "Shutters" &&
    exactLegacyBreakdownDetail(design, "Supplier") === "Onyx" &&
    exactLegacyBreakdownDetail(design, "Material") === "Poly Composite" &&
    exactLegacyBreakdownDetail(design, "Color") === "101_White" &&
    exactLegacyBreakdownDetail(design, "Hinge Color") === "Match";
}

function discountedLegacyOnyxPolyCompositeCents(
  width: number,
  height: number,
  catalogRate: number,
): number {
  const grossCents = Math.round((width * height * catalogRate * 100) / 144);
  return Math.round(grossCents * (100 - LEGACY_ONYX_POLY_DISCOUNT_PERCENT) / 100);
}

/** Read-only recovery for one owner-verified aggregate legacy mirror shape. */
function projectExactLegacyOnyxPolyCompositeAggregateMirror(input: {
  mirrorQuote: AnyRow;
  source: ProtectedHistoricalPricingSource;
  targetLineItems: AnyRow[];
  targetDesignsByLineItemId: Map<string, AnyRow[]>;
}) {
  if (
    input.mirrorQuote.signed_at ||
    input.mirrorQuote.customer_signature ||
    input.mirrorQuote.customer_printed_name ||
    exactMoneyCents(input.source.sourceQuote.quote_total) !==
      LEGACY_ONYX_POLY_AGGREGATE_TOTAL_CENTS ||
    input.source.sourceLineItems.length !== 1 ||
    input.source.sourceDesigns.length !== 1 ||
    input.targetLineItems.length !== LEGACY_ONYX_POLY_MIRROR_SHAPE.length
  ) return null;

  const aggregateLine = input.source.sourceLineItems[0];
  const aggregateDesign = input.source.sourceDesigns[0];
  const aggregateQuantity = strictQuantity(aggregateLine.quantity);
  const aggregateUnitCents = exactMoneyCents(aggregateDesign.unit_price);
  if (
    !lineId(aggregateLine) ||
    !lineId(aggregateDesign) ||
    aggregateDesign.line_item_id !== aggregateLine.id ||
    aggregateQuantity !== 1 ||
    aggregateUnitCents === null ||
    Math.round(aggregateUnitCents * (100 - LEGACY_ONYX_POLY_DISCOUNT_PERCENT) / 100) !==
      LEGACY_ONYX_POLY_AGGREGATE_TOTAL_CENTS
  ) return null;

  try {
    requireUniqueLineIds(input.targetLineItems, "target");
  } catch {
    return null;
  }
  const targetDesigns: AnyRow[] = [];
  for (let index = 0; index < input.targetLineItems.length; index += 1) {
    const line = input.targetLineItems[index];
    const expected = LEGACY_ONYX_POLY_MIRROR_SHAPE[index];
    const designs = input.targetDesignsByLineItemId.get(lineId(line)) || [];
    const design = designs[0];
    if (
      normalizedRoom(line.room) !== expected.room ||
      crmDimensionSixteenths(line.width_in) !== expected.width * 16 ||
      crmDimensionSixteenths(line.height_in) !== expected.height * 16 ||
      strictQuantity(line.quantity) !== expected.quantity ||
      designs.length !== 1 ||
      !lineId(design || {}) ||
      line.selected_design_id !== design.id ||
      !isExactZeroMoney(design.unit_price) ||
      !isExactLegacyOnyxPolyCompositeDesign(design)
    ) return null;
    targetDesigns.push(design);
  }
  if (new Set(targetDesigns.map(lineId)).size !== targetDesigns.length) return null;

  const configurationFingerprints = new Set(input.targetLineItems.map((line, index) => [
    canonicalDonorConfiguration(line),
    canonicalDonorConfiguration(targetDesigns[index]),
  ].join("\u0000")));
  if (configurationFingerprints.size !== 1) return null;

  const product = getProduct("onyx_shutters");
  const program = product ? getProgram(product, "poly_composite") : undefined;
  const catalogRate = program?.pricePerSqft;
  if (typeof catalogRate !== "number" || !Number.isFinite(catalogRate) || catalogRate <= 0) {
    return null;
  }

  const donorLine = input.targetLineItems.find((line) =>
    sameCrmDimensions(line, { width_in: 35, height_in: 60 }));
  const donorDesign = donorLine
    ? targetDesigns[input.targetLineItems.findIndex((line) => line.id === donorLine.id)]
    : null;
  if (!donorLine || !donorDesign) return null;
  const syntheticLineId = `${lineId(donorLine)}:legacy-missing-line`;
  const syntheticDesignId = `${lineId(donorDesign)}:legacy-missing-design`;
  if (
    input.targetLineItems.some((line) => lineId(line) === syntheticLineId) ||
    targetDesigns.some((design) => lineId(design) === syntheticDesignId)
  ) return null;

  const syntheticDesign = {
    ...donorDesign,
    id: syntheticDesignId,
    line_item_id: syntheticLineId,
    unit_price: 0,
  };
  const bedTwoIndex = LEGACY_ONYX_POLY_MIRROR_SHAPE.length - 1;
  const syntheticLine = {
    ...donorLine,
    id: syntheticLineId,
    room: "Bed 1",
    width_in: 35,
    height_in: 60,
    quantity: 1,
    sort_order: input.targetLineItems[bedTwoIndex].sort_order,
    selected_design_id: syntheticDesignId,
    designs: [syntheticDesign],
  };
  const lineItems = [
    ...input.targetLineItems.slice(0, bedTwoIndex),
    syntheticLine,
    input.targetLineItems[bedTwoIndex],
  ];
  const designsByLineItemId = new Map<string, AnyRow[]>();
  let subtotalCents = 0;
  for (const line of lineItems) {
    const targetIndex = input.targetLineItems.findIndex((target) => target.id === line.id);
    const design = line.id === syntheticLineId ? syntheticDesign : targetDesigns[targetIndex];
    const quantity = strictQuantity(line.quantity);
    const width = crmDimensionSixteenths(line.width_in);
    const height = crmDimensionSixteenths(line.height_in);
    if (!design || quantity === null || width === null || height === null) return null;
    const unitCents = discountedLegacyOnyxPolyCompositeCents(width / 16, height / 16, catalogRate);
    subtotalCents += unitCents * quantity;
    designsByLineItemId.set(lineId(line), [{ ...design, unit_price: moneyFromCents(unitCents) }]);
  }
  if (subtotalCents !== LEGACY_ONYX_POLY_AGGREGATE_TOTAL_CENTS) return null;

  return {
    subtotal: moneyFromCents(subtotalCents),
    total: moneyFromCents(LEGACY_ONYX_POLY_AGGREGATE_TOTAL_CENTS),
    shouldSyncSourceTotal: true,
    designsByLineItemId,
    lineItems,
  };
}

export async function loadHistoricalCrmMirrorPricing(
  supabase: SupabaseClient,
  mirrorQuote: AnyRow,
  targetLineItems: AnyRow[],
  targetDesignsByLineItemId: Map<string, AnyRow[]>,
) {
  const salesQuoteId = mirroredSalesQuoteId(mirrorQuote);
  if (!salesQuoteId) return null;

  const { data: salesQuote, error } = await supabase
    .from("sales_quotes")
    .select("id,quote_v2_backend,quote_v2_status")
    .eq("id", salesQuoteId)
    .maybeSingle();
  if (error) throw new CrmAuthError(502, "The mirrored sales quote identity could not be verified.");
  if (!salesQuote) throw new CrmAuthError(409, "The mirrored sales quote identity no longer exists.");
  if (salesQuote.id !== salesQuoteId) {
    throw new CrmAuthError(409, "The mirrored sales quote identity is inconsistent.");
  }

  if (salesQuote.quote_v2_backend !== true || salesQuote.quote_v2_status === "priced") return null;

  const protectedSource = await loadProtectedHistoricalPricingSource(supabase, salesQuoteId);
  const source = normalizeHistoricalCrmPublicSource(protectedSource);
  const aggregateRecovery = projectExactLegacyOnyxPolyCompositeAggregateMirror({
    mirrorQuote,
    source: protectedSource,
    targetLineItems,
    targetDesignsByLineItemId,
  });
  if (aggregateRecovery) return aggregateRecovery;
  if (source.sourceLineItems.length === targetLineItems.length + 1) {
    return projectOneMissingHistoricalCrmMirrorLine({
      mirrorQuote,
      source,
      targetLineItems,
      targetDesignsByLineItemId,
    });
  }

  const pricing = projectHistoricalSalesQuoteMirrorPricing({
    sourceQuote: source.sourceQuote,
    sourceLineItems: source.sourceLineItems,
    sourceDesigns: source.sourceDesigns,
    targetLineItems,
    targetDesignsByLineItemId,
  });
  return { ...pricing, lineItems: targetLineItems };
}
