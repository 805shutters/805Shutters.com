/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";

type AnyRow = Record<string, any>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function money(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function normalizeQuantity(value: unknown) {
  const parsed = Math.floor(Number(value) || 1);
  return parsed > 0 ? parsed : 1;
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

function historicalSubtotal(
  lineItems: AnyRow[],
  designsByLineItemId: Map<string, AnyRow[]>,
) {
  return money(
    lineItems.reduce((quoteSum, lineItem) => {
      const designTotal = (designsByLineItemId.get(String(lineItem.id)) || [])
        .reduce((designSum, design) => designSum + money(design.unit_price), 0);
      return quoteSum + designTotal * normalizeQuantity(lineItem.quantity);
    }, 0),
  );
}

export function projectHistoricalSalesQuoteMirrorPricing(input: {
  sourceQuote: AnyRow;
  sourceLineItems: AnyRow[];
  sourceDesigns: AnyRow[];
  targetLineItems: AnyRow[];
  targetDesignsByLineItemId: Map<string, AnyRow[]>;
}) {
  const sourceTotal = money(input.sourceQuote.quote_total);
  if (sourceTotal <= 0) {
    throw new CrmAuthError(409, "The historical price total is missing or invalid.");
  }

  const sourceLineIds = new Set(input.sourceLineItems.map((line) => String(line.id || "")));
  const targetLineIds = new Set(input.targetLineItems.map((line) => String(line.id || "")));
  const lineMappingIsExact =
    sourceLineIds.size === input.sourceLineItems.length &&
    targetLineIds.size === input.targetLineItems.length &&
    sourceLineIds.size > 0 &&
    sourceLineIds.size === targetLineIds.size &&
    [...sourceLineIds].every((lineId) => targetLineIds.has(lineId));
  if (!lineMappingIsExact) {
    throw new CrmAuthError(409, "The historical price mapping no longer matches this quote.");
  }

  const sourceDesignsByLineItemId = groupBy(input.sourceDesigns, "line_item_id");
  const projectedDesignsByLineItemId = new Map<string, AnyRow[]>();
  for (const targetLine of input.targetLineItems) {
    const lineId = String(targetLine.id);
    const sourceLine = input.sourceLineItems.find((line) => String(line.id) === lineId);
    const sourceDesigns = sourceDesignsByLineItemId.get(lineId) || [];
    const targetDesigns = input.targetDesignsByLineItemId.get(lineId) || [];
    const sourceQuantity = strictQuantity(sourceLine?.quantity);
    const targetQuantity = strictQuantity(targetLine.quantity);
    if (
      !sourceLine ||
      sourceQuantity === null ||
      targetQuantity === null ||
      sourceQuantity !== targetQuantity ||
      sourceDesigns.length === 0 ||
      sourceDesigns.length !== targetDesigns.length
    ) {
      throw new CrmAuthError(409, "The historical price mapping no longer matches this quote.");
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
      throw new CrmAuthError(409, "The historical price mapping no longer matches this quote.");
    }
    const projected = targetDesigns.map((targetDesign) => {
      const sourceDesign =
        sourceByDesignId.get(String(targetDesign.id)) ||
        (mayMapSoleDesignByLine ? sourceDesigns[0] : null);
      const unitPrice = money(sourceDesign?.unit_price);
      if (!sourceDesign || unitPrice <= 0) {
        throw new CrmAuthError(409, "The historical price mapping no longer matches this quote.");
      }
      return { ...targetDesign, unit_price: unitPrice };
    });
    projectedDesignsByLineItemId.set(lineId, projected);
  }

  const subtotal = historicalSubtotal(input.targetLineItems, projectedDesignsByLineItemId);
  if (subtotal <= 0 || subtotal !== sourceTotal) {
    throw new CrmAuthError(409, "The historical price total is inconsistent with its protected lines.");
  }

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
    .select("id,quantity")
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
