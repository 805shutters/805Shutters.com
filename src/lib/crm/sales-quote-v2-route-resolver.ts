import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  buildHistoricalQuotePriceLock,
  type HistoricalQuotePriceLock,
} from "@/lib/crm/historical-quote-price-lock";
import { loadHistoricalSalesQuoteMirrorPricing } from "@/lib/crm/historical-sales-quote-pricing";

type JsonRecord = Record<string, unknown>;

type StoredCrmQuoteRouteRow = {
  id: string;
  external_id?: string | null;
  meta?: JsonRecord | null;
  quote_total?: number | string | null;
};

type StoredSalesQuoteRouteRow = {
  id: string;
  quote_v2_backend?: boolean | null;
  quote_v2_status?: string | null;
  status?: string | null;
};

type StoredSalesLineRouteRow = {
  id: string;
  quote_id: string;
  selected_design_id?: string | null;
  quantity?: number | string | null;
};

type StoredSalesDesignRouteRow = {
  id: string;
  line_item_id: string;
  unit_price?: number | string | null;
};

type StoredCrmDesignPriceRow = {
  id: string;
  line_item_id: string;
  unit_price?: number | string | null;
};

export type SalesQuoteV2RouteResolution =
  | {
      status: "ready";
      crmQuoteId: string;
      salesQuoteId: string;
      lineCount: number;
      designCount: number;
      quoteV2Backend: boolean;
      quoteV2Status: string | null;
      quoteStatus: string | null;
      historicalPriceLock: HistoricalQuotePriceLock | null;
    }
  | {
      status: "legacy_import_required" | "crm_native_unsupported" | "malformed";
      crmQuoteId: string;
      salesQuoteId: string | null;
      reason:
        | "no_target_identity"
        | "target_not_found"
        | "target_structure_empty"
        | "conflicting_target_identity"
        | "invalid_target_identity"
        | "target_line_limit_exceeded"
        | "target_structure_invalid";
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUOTE_LINES = 40;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function externalQuoteId(value: unknown): string | null {
  const externalId = text(value);
  if (!externalId?.startsWith("quote:")) return null;
  return text(externalId.slice("quote:".length));
}

export function salesQuoteV2RouteCandidate(
  quote: StoredCrmQuoteRouteRow,
):
  | { status: "candidate"; salesQuoteId: string }
  | {
      status: "crm_native_unsupported" | "malformed";
      salesQuoteId: string | null;
      reason:
        | "no_target_identity"
        | "conflicting_target_identity"
        | "invalid_target_identity";
    } {
  const meta = quote.meta ?? {};
  const typedTarget = text(meta.target_sales_quote_id);
  const candidates = typedTarget
    ? [typedTarget]
    : Array.from(
        new Set(
          [
            text(meta.sales_quote_id),
            text(meta.mts_quote_id),
            externalQuoteId(quote.external_id),
          ].filter((value): value is string => Boolean(value)),
        ),
      );

  if (!candidates.length) {
    return {
      status: "crm_native_unsupported",
      salesQuoteId: null,
      reason: "no_target_identity",
    };
  }
  if (candidates.length > 1) {
    return {
      status: "malformed",
      salesQuoteId: null,
      reason: "conflicting_target_identity",
    };
  }
  if (!UUID_PATTERN.test(candidates[0])) {
    return {
      status: "malformed",
      salesQuoteId: candidates[0],
      reason: "invalid_target_identity",
    };
  }
  return { status: "candidate", salesQuoteId: candidates[0].toLowerCase() };
}

export function classifySalesQuoteV2Route(input: {
  crmQuote: StoredCrmQuoteRouteRow;
  salesQuote: StoredSalesQuoteRouteRow | null;
  lines: StoredSalesLineRouteRow[];
  designs: StoredSalesDesignRouteRow[];
  historicalPriceLock?: HistoricalQuotePriceLock | null;
}): SalesQuoteV2RouteResolution {
  const candidate = salesQuoteV2RouteCandidate(input.crmQuote);
  if (candidate.status !== "candidate") {
    return {
      status: candidate.status,
      crmQuoteId: input.crmQuote.id,
      salesQuoteId: candidate.salesQuoteId,
      reason: candidate.reason,
    };
  }
  if (!input.salesQuote || input.salesQuote.id !== candidate.salesQuoteId) {
    return {
      status: "legacy_import_required",
      crmQuoteId: input.crmQuote.id,
      salesQuoteId: candidate.salesQuoteId,
      reason: "target_not_found",
    };
  }
  if (input.lines.length > MAX_QUOTE_LINES) {
    return {
      status: "malformed",
      crmQuoteId: input.crmQuote.id,
      salesQuoteId: candidate.salesQuoteId,
      reason: "target_line_limit_exceeded",
    };
  }
  const sourceTotal = Number(input.crmQuote.quote_total ?? 0);
  if (Number.isFinite(sourceTotal) && sourceTotal > 0 && input.lines.length === 0) {
    return {
      status: "legacy_import_required",
      crmQuoteId: input.crmQuote.id,
      salesQuoteId: candidate.salesQuoteId,
      reason: "target_structure_empty",
    };
  }

  const lineIds = new Set(input.lines.map((line) => line.id));
  const designOwner = new Map(input.designs.map((design) => [design.id, design.line_item_id]));
  const invalid =
    lineIds.size !== input.lines.length ||
    input.lines.some(
      (line) =>
        line.quote_id !== candidate.salesQuoteId ||
        (line.selected_design_id != null &&
          designOwner.get(line.selected_design_id) !== line.id),
    ) ||
    input.designs.some((design) => !lineIds.has(design.line_item_id));

  if (invalid) {
    return {
      status: "malformed",
      crmQuoteId: input.crmQuote.id,
      salesQuoteId: candidate.salesQuoteId,
      reason: "target_structure_invalid",
    };
  }

  return {
    status: "ready",
    crmQuoteId: input.crmQuote.id,
    salesQuoteId: candidate.salesQuoteId,
    lineCount: input.lines.length,
    designCount: input.designs.length,
    quoteV2Backend: input.salesQuote.quote_v2_backend === true,
    quoteV2Status: text(input.salesQuote.quote_v2_status),
    quoteStatus: text(input.salesQuote.status),
    historicalPriceLock:
      input.historicalPriceLock ??
      buildHistoricalQuotePriceLock(input.crmQuote.quote_total, []),
  };
}

async function loadHistoricalPriceLock(
  supabase: SupabaseClient,
  crmQuoteId: string,
  total: unknown,
): Promise<HistoricalQuotePriceLock | null> {
  const { data: sourceLines, error: sourceLinesError } = await supabase
    .from("crm_quote_line_items")
    .select("id")
    .eq("quote_id", crmQuoteId);
  if (sourceLinesError) {
    throw new CrmAuthError(502, "The original quote price lock could not be loaded.");
  }

  const sourceLineIds = (sourceLines ?? []).flatMap((line) =>
    typeof line.id === "string" && line.id ? [line.id] : [],
  );
  let sourceDesigns: StoredCrmDesignPriceRow[] = [];
  if (sourceLineIds.length) {
    const { data, error } = await supabase
      .from("crm_quote_designs")
      .select("id,line_item_id,unit_price")
      .in("line_item_id", sourceLineIds);
    if (error) {
      throw new CrmAuthError(502, "The original quote design prices could not be loaded.");
    }
    sourceDesigns = (data ?? []) as unknown as StoredCrmDesignPriceRow[];
  }

  return buildHistoricalQuotePriceLock(total, sourceDesigns);
}

function hasExactMirrorIdentity(
  quote: StoredCrmQuoteRouteRow,
  salesQuoteId: string,
): boolean {
  const meta = quote.meta ?? {};
  const mirrorCandidates = new Set(
    [
      text(meta.sales_quote_id),
      text(meta.mts_quote_id),
      externalQuoteId(quote.external_id),
    ].filter((value): value is string => Boolean(value)),
  );
  return mirrorCandidates.size === 1 && [...mirrorCandidates][0].toLowerCase() === salesQuoteId;
}

async function loadUpstreamHistoricalPriceLock(
  supabase: SupabaseClient,
  salesQuote: StoredSalesQuoteRouteRow,
  targetLineItems: StoredSalesLineRouteRow[],
  targetDesignsByLineItemId: Map<string, StoredSalesDesignRouteRow[]>,
): Promise<HistoricalQuotePriceLock> {
  const projected = await loadHistoricalSalesQuoteMirrorPricing(
    supabase,
    salesQuote,
    targetLineItems,
    targetDesignsByLineItemId,
  );
  const lock = projected
    ? buildHistoricalQuotePriceLock(
        projected.total,
        [...projected.designsByLineItemId.values()].flat() as StoredCrmDesignPriceRow[],
      )
    : null;
  if (!lock) {
    throw new CrmAuthError(409, "The upstream historical quote price lock is invalid.");
  }
  return lock;
}

export async function resolveSalesQuoteV2Route(
  supabase: SupabaseClient,
  crmQuoteId: string,
): Promise<SalesQuoteV2RouteResolution> {
  if (!UUID_PATTERN.test(crmQuoteId)) {
    throw new CrmAuthError(400, "CRM quote ID is invalid.");
  }
  const { data: crmQuote, error: crmError } = await supabase
    .from("crm_quotes")
    .select("id,external_id,meta,quote_total")
    .eq("id", crmQuoteId)
    .maybeSingle();
  if (crmError) throw new CrmAuthError(502, "The CRM quote link could not be loaded.");
  if (!crmQuote) throw new CrmAuthError(404, "CRM quote was not found.");

  const candidate = salesQuoteV2RouteCandidate(
    crmQuote as unknown as StoredCrmQuoteRouteRow,
  );
  if (candidate.status !== "candidate") {
    return classifySalesQuoteV2Route({
      crmQuote: crmQuote as unknown as StoredCrmQuoteRouteRow,
      salesQuote: null,
      lines: [],
      designs: [],
    });
  }

  const { data: salesQuote, error: salesError } = await supabase
    .from("sales_quotes")
    .select("id,quote_v2_backend,quote_v2_status,status")
    .eq("id", candidate.salesQuoteId)
    .maybeSingle();
  if (salesError) throw new CrmAuthError(502, "The linked V2 quote could not be loaded.");
  if (!salesQuote) {
    return classifySalesQuoteV2Route({
      crmQuote: crmQuote as unknown as StoredCrmQuoteRouteRow,
      salesQuote: null,
      lines: [],
      designs: [],
    });
  }

  const { data: lines, error: linesError } = await supabase
    .from("sales_quote_line_items")
    .select("id,quote_id,selected_design_id,quantity")
    .eq("quote_id", candidate.salesQuoteId);
  if (linesError) throw new CrmAuthError(502, "The linked V2 quote lines could not be loaded.");

  const lineRows = (lines ?? []) as unknown as StoredSalesLineRouteRow[];
  let designs: StoredSalesDesignRouteRow[] = [];
  if (lineRows.length) {
    const { data: designRows, error: designsError } = await supabase
      .from("sales_quote_designs")
      .select("id,line_item_id,unit_price")
      .in(
        "line_item_id",
        lineRows.map((line) => line.id),
      );
    if (designsError) {
      throw new CrmAuthError(502, "The linked V2 quote designs could not be loaded.");
    }
    designs = (designRows ?? []) as unknown as StoredSalesDesignRouteRow[];
  }
  const designsByLineItemId = new Map<string, StoredSalesDesignRouteRow[]>();
  for (const design of designs) {
    const lineDesigns = designsByLineItemId.get(design.line_item_id) ?? [];
    lineDesigns.push(design);
    designsByLineItemId.set(design.line_item_id, lineDesigns);
  }

  let historicalPriceLock = await loadHistoricalPriceLock(
    supabase,
    crmQuoteId,
    (crmQuote as unknown as StoredCrmQuoteRouteRow).quote_total,
  );
  const crmQuoteRow = crmQuote as unknown as StoredCrmQuoteRouteRow;
  const salesQuoteRow = salesQuote as unknown as StoredSalesQuoteRouteRow;
  if (
    !historicalPriceLock &&
    salesQuoteRow.quote_v2_backend === true &&
    salesQuoteRow.quote_v2_status === "sent" &&
    hasExactMirrorIdentity(crmQuoteRow, candidate.salesQuoteId)
  ) {
    historicalPriceLock = await loadUpstreamHistoricalPriceLock(
      supabase,
      salesQuoteRow,
      lineRows,
      designsByLineItemId,
    );
  }

  return classifySalesQuoteV2Route({
    crmQuote: crmQuoteRow,
    salesQuote: salesQuoteRow,
    lines: lineRows,
    designs,
    historicalPriceLock,
  });
}
