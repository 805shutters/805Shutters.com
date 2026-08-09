/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";

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

  const sourceBySort = new Map<number, AnyRow>();
  const targetBySort = new Map<number, AnyRow>();
  for (const line of sourceLineItems) {
    const sortOrder = strictSortOrder(line.sort_order);
    if (sortOrder === null) {
      throw new CrmAuthError(409, "A historical source line sort order is missing or invalid.");
    }
    if (sourceBySort.has(sortOrder)) {
      throw new CrmAuthError(409, "The historical source line sort orders are ambiguous.");
    }
    sourceBySort.set(sortOrder, line);
  }
  for (const line of targetLineItems) {
    const sortOrder = strictSortOrder(line.sort_order);
    if (sortOrder === null) {
      throw new CrmAuthError(409, "A historical target line sort order is missing or invalid.");
    }
    if (targetBySort.has(sortOrder)) {
      throw new CrmAuthError(409, "The historical target line sort orders are ambiguous.");
    }
    targetBySort.set(sortOrder, line);
  }
  if (
    sourceBySort.size !== targetBySort.size ||
    [...sourceBySort.keys()].some((sortOrder) => !targetBySort.has(sortOrder))
  ) {
    throw new CrmAuthError(409, "The historical price line sort order sets no longer match.");
  }

  const sourceByTargetId = new Map<string, AnyRow>();
  for (const [sortOrder, targetLine] of targetBySort) {
    const sourceLine = sourceBySort.get(sortOrder);
    if (!sourceLine || structuralFingerprint(sourceLine) !== structuralFingerprint(targetLine)) {
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

export async function loadHistoricalSalesQuoteMirrorPricing(
  supabase: SupabaseClient,
  salesQuote: AnyRow,
  targetLineItems: AnyRow[],
  targetDesignsByLineItemId: Map<string, AnyRow[]>,
) {
  if (salesQuote.quote_v2_backend !== true || salesQuote.quote_v2_status === "priced") {
    return null;
  }

  const { data: sourceQuotes, error: sourceQuoteError } = await supabase
    .from("crm_quotes")
    .select("id,quote_total,meta")
    .eq("meta->>target_sales_quote_id", salesQuote.id);
  if (sourceQuoteError) {
    throw new CrmAuthError(502, "The original historical quote price lock could not be loaded.");
  }
  if (!sourceQuotes || sourceQuotes.length !== 1) {
    throw new CrmAuthError(409, "The original historical quote price lock is missing or ambiguous.");
  }

  const sourceQuote = sourceQuotes[0] as AnyRow;
  if (sourceQuote.meta?.target_sales_quote_id !== salesQuote.id) {
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

  return projectHistoricalSalesQuoteMirrorPricing({
    sourceQuote,
    sourceLineItems: sourceLines,
    sourceDesigns: (sourceDesigns || []) as AnyRow[],
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

  return loadHistoricalSalesQuoteMirrorPricing(
    supabase,
    salesQuote as AnyRow,
    targetLineItems,
    targetDesignsByLineItemId,
  );
}
