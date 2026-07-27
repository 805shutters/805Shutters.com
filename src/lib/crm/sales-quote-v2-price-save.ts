import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SalesQuoteDesign,
  SalesQuoteLineItem,
} from "@mts/types/quote";
import { CrmAuthError } from "@/lib/crm/auth";
import { repriceExactQuoteBuilderForServerDate } from "@/lib/quote-lab/exact-backend";
import { getProduct, getProgram } from "@/lib/quote/catalog";
import type {
  SelectionContext,
  SourceProvenance,
} from "@/lib/quote-v2/core";
import {
  toCustomerQuotePriceResult,
  type QuoteV2PriceResult,
} from "@/lib/quote-v2/engine";
import {
  sourceProvenance,
  type SourceManifestId,
} from "@/lib/quote-v2/source-manifest";

type JsonRecord = Record<string, unknown>;

type PersistedV2Quote = JsonRecord & {
  id: string;
  quote_v2_backend: boolean;
  quote_v2_revision: number | string;
};

type PersistedV2Line = SalesQuoteLineItem & {
  selected_design_id?: string | null;
};

type V2PriceStatus = "authoritative" | "blocked" | "unpriceable";

export type SaveSalesQuoteV2PriceInput = Readonly<{
  quoteId: string;
  lineItemId: string;
  designId: string;
  expectedRevision: number;
  idempotencyKey: string;
  actorId: string;
  /** Injectable for deterministic catalog-boundary tests; route callers omit it. */
  serverDate?: string;
}>;

export type SaveSalesQuoteV2PriceResponse = Readonly<{
  backend: "authoritative_v2";
  quoteId: string;
  lineItemId: string;
  designId: string;
  revision: number;
  quoteStatus: string;
  quoteTotal: number;
  priceStatus: V2PriceStatus;
  price: Record<string, unknown>;
  pricedDesignCount: number;
  blockedDesignCount: number;
  lines: readonly Readonly<{
    lineItemId: string;
    designId: string;
    priceStatus: V2PriceStatus;
    price: Record<string, unknown>;
  }>[];
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const CUSTOMER_PRICING_FAILURE =
  "Pricing is currently unavailable for this selection. Please review the configuration or contact us for assistance.";
const SOURCE_COST_PLUS_PRODUCTS = new Set([
  "faux_wood",
  "smartprivacy_faux",
  "lotus_faux_wood_blinds",
]);

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

function expectedRevision(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new CrmAuthError(400, "expectedRevision must be a nonnegative safe integer.");
  }
  return value;
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

/**
 * Strict HTTP-body allowlist. Client prices, costs, catalog labels, snapshots,
 * fingerprints, selections, and dates are rejected rather than ignored.
 */
export function parseSalesQuoteV2PriceSaveBody(value: unknown): Readonly<{
  lineItemId: string;
  designId: string;
  expectedRevision: number;
  idempotencyKey: string;
}> {
  const body = plainRecord(value);
  if (!body) throw new CrmAuthError(400, "A JSON request object is required.");
  const allowed = new Set([
    "lineItemId",
    "designId",
    "expectedRevision",
    "idempotencyKey",
  ]);
  const unexpected = Object.keys(body).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw new CrmAuthError(
      400,
      `Quote V2 pricing does not accept client-supplied field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`,
    );
  }
  return {
    lineItemId: requiredUuid(body.lineItemId, "lineItemId"),
    designId: requiredUuid(body.designId, "designId"),
    expectedRevision: expectedRevision(body.expectedRevision),
    idempotencyKey: idempotencyKey(body.idempotencyKey),
  };
}

/** Catalog cutovers use the 805 business date, never UTC's next calendar day. */
export function quoteV2ServerCatalogDate(now: Date = new Date()): string {
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

function numericRevision(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CrmAuthError(502, `${label} returned an invalid quote revision.`);
  }
  return parsed;
}

function money(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CrmAuthError(502, `${label} returned an invalid quote total.`);
  }
  return Math.round(parsed * 100) / 100;
}

function databaseError(message: string): CrmAuthError {
  return new CrmAuthError(502, message);
}

async function loadQuote(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<PersistedV2Quote> {
  const { data, error } = await supabase
    .from("sales_quotes")
    .select("id, quote_v2_backend, quote_v2_revision")
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw databaseError("The V2 quote could not be loaded.");
  if (!data) throw new CrmAuthError(404, "Quote was not found.");
  return data as unknown as PersistedV2Quote;
}

async function loadQuoteLines(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<PersistedV2Line[]> {
  const { data, error } = await supabase
    .from("sales_quote_line_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sort_order", { ascending: true });
  if (error) throw databaseError("The V2 quote lines could not be loaded.");
  return ([...(data ?? [])] as unknown as PersistedV2Line[]).sort(
    (left, right) =>
      Number(left.sort_order) - Number(right.sort_order) ||
      left.id.localeCompare(right.id),
  );
}

async function loadQuoteDesigns(
  supabase: SupabaseClient,
  lineItemIds: readonly string[],
): Promise<SalesQuoteDesign[]> {
  if (!lineItemIds.length) return [];
  const { data, error } = await supabase
    .from("sales_quote_designs")
    .select("*")
    .in("line_item_id", [...lineItemIds]);
  if (error) throw databaseError("The V2 quote designs could not be loaded.");
  return (data ?? []) as unknown as SalesQuoteDesign[];
}

function fallbackSourceId(productId: string): SourceManifestId {
  if (productId.startsWith("lotus_")) return "lotus-west-a26-v1";
  if (productId.startsWith("polar_")) {
    return "polar-shades-dealer-book-current-2026-07-18";
  }
  if (productId === "onyx_shutters") {
    return "onyx-reference-guide-2020-2021";
  }
  return "norman-retail-guide-2026-07";
}

function selectedPriceSource(selection: SelectionContext): SourceProvenance {
  const product = getProduct(selection.productId);
  const program =
    product && selection.programId
      ? getProgram(product, selection.programId)
      : undefined;
  const sourceId = program?.sourceId;
  if (sourceId) {
    try {
      return sourceProvenance(sourceId as SourceManifestId, {
        ...(program.sourcePages?.length ? { pages: program.sourcePages } : {}),
      });
    } catch {
      // An unknown catalog source ID must not erase provenance. The product's
      // pinned manufacturer source remains the fail-closed audit identity.
    }
  }
  return sourceProvenance(fallbackSourceId(selection.productId), {
    ...(program?.sourcePages?.length
      ? { pages: program.sourcePages }
      : product?.pages?.length
        ? { pages: product.pages }
        : {}),
  });
}

function uniqueProvenance(
  result: QuoteV2PriceResult,
  selection: SelectionContext,
): JsonRecord[] {
  const sources = [
    selectedPriceSource(selection),
    ...result.validationIssues.map((issue) => issue.source),
    ...(result.ok ? result.components.map((component) => component.source) : []),
  ];
  const unique = new Map<string, JsonRecord>();
  for (const source of sources) {
    const identity = [
      source.sourceId,
      source.sha256,
      source.page ?? "",
      source.pages?.join(",") ?? "",
      source.sheet ?? "",
      source.range ?? "",
    ].join("|");
    if (!unique.has(identity)) unique.set(identity, source as unknown as JsonRecord);
  }
  return [...unique.values()];
}

function protectedInternalSnapshot(
  result: QuoteV2PriceResult,
  costResult: unknown,
  costSummary: unknown,
): JsonRecord | null {
  if (!result.ok || !result.internalCost) return null;
  return {
    // Keep the canonical landed-cost fields at the snapshot root so the
    // transactional RPC can validate and total them without trusting a second
    // client-visible representation.
    ...result.internalCost,
    components: result.components.map((component) => ({
      id: component.id,
      category: component.category,
      label: component.label,
      status: component.status,
      basis: component.basis,
      catalogAmount: component.catalogAmount,
      wholesaleAmount: component.wholesaleAmount,
      units: component.units,
      billingScope: component.billingScope,
      source: component.source,
    })),
    componentTotals: {
      catalogPerWindow: result.componentTotals.catalogPerWindow,
      wholesalePerWindow: result.componentTotals.wholesalePerWindow,
      catalogOncePerLine: result.componentTotals.catalogOncePerLine,
      wholesaleOncePerLine: result.componentTotals.wholesaleOncePerLine,
    },
    costResult,
    costSummary,
  };
}

function validationSnapshot(
  result: QuoteV2PriceResult,
  costStatus: "complete" | "incomplete",
  costWarnings: readonly string[],
  missingSelection: Readonly<{
    lineItemId: string;
    designId: string;
    source: SourceProvenance;
  }> | null,
): JsonRecord {
  const selectionIssue = missingSelection
    ? {
        severity: "hard_block",
        ruleId: "quote.selected_design.missing",
        source: missingSelection.source,
        selectedValues: {
          lineItemId: missingSelection.lineItemId,
          fallbackDesignId: missingSelection.designId,
        },
        explanation:
          "This line did not have a persisted selected design. A deterministic fallback was revalidated but cannot become authoritative until it is explicitly selected.",
      }
    : null;
  return {
    validationStatus:
      result.validationStatus === "blocked" || selectionIssue
        ? "blocked"
        : result.validationStatus,
    productStatus: result.productStatus,
    issues: [
      ...result.validationIssues,
      ...(selectionIssue ? [selectionIssue] : []),
    ],
    warnings: result.warnings,
    costStatus,
    costWarnings,
    persistedSelectedDesign: missingSelection === null,
    ...(!result.ok ? { pricingFailure: { code: result.code, message: result.error } } : {}),
  };
}

function customerSafeFailure(result: QuoteV2PriceResult): JsonRecord {
  if (!result.ok) return toCustomerQuotePriceResult(result);
  return {
    ok: false,
    code: "CONFIGURATION_INCOMPLETE",
    error: CUSTOMER_PRICING_FAILURE,
    validationStatus: "blocked",
    catalogVersion: result.catalogVersion,
  };
}

function rpcRow(value: unknown): JsonRecord {
  const row = Array.isArray(value) ? value[0] : value;
  const record = plainRecord(row);
  if (!record) {
    throw new CrmAuthError(
      502,
      "Authoritative V2 persistence returned no result.",
    );
  }
  return record;
}

function isRevisionConflict(error: unknown): boolean {
  const source = plainRecord(error);
  const code = typeof source?.code === "string" ? source.code : "";
  const message = typeof source?.message === "string" ? source.message : "";
  return code === "40001" || /revision|concurrent|stale/i.test(message);
}

export type PreparedSalesQuoteV2PricingLine = Readonly<{
  lineItemId: string;
  designId: string;
  priceStatus: V2PriceStatus;
  customerPrice: JsonRecord;
  rpcResult: JsonRecord;
}>;

export type PreparedSalesQuoteV2PricingBatch = Readonly<{
  repriced: Extract<
    ReturnType<typeof repriceExactQuoteBuilderForServerDate>,
    { backend: "v2" }
  >;
  prepared: readonly PreparedSalesQuoteV2PricingLine[];
}>;

/**
 * Pure server-side quote-wide pricing preparation shared by normal V2 saves
 * and the explicit legacy-draft preview/apply workflow. Nothing is persisted
 * here. Callers must use an atomic, service-role-only RPC for any mutation.
 */
export function prepareSalesQuoteV2PricingBatch(input: Readonly<{
  lines: readonly PersistedV2Line[];
  selectedDesigns: readonly SalesQuoteDesign[];
  serverDate: string;
  missingPersistedSelection?: ReadonlySet<string>;
}>): PreparedSalesQuoteV2PricingBatch {
  const selectedVariantByLine = Object.fromEntries(
    input.selectedDesigns.map((design) => [design.line_item_id, design.variant]),
  );
  let repriced: ReturnType<typeof repriceExactQuoteBuilderForServerDate>;
  try {
    repriced = repriceExactQuoteBuilderForServerDate(
      {
        lines: [...input.lines],
        designs: [...input.selectedDesigns],
        selectedVariantByLine,
      },
      input.serverDate,
    );
  } catch (error) {
    throw new CrmAuthError(
      422,
      `Authoritative V2 pricing could not interpret the saved selection: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  if (!("backend" in repriced) || repriced.backend !== "v2") {
    throw new CrmAuthError(
      500,
      "The server-authoritative V2 engine did not handle this quote.",
    );
  }
  if (repriced.designs.length !== input.lines.length) {
    throw new CrmAuthError(
      500,
      "The server-authoritative V2 engine did not return exactly one result per quote line.",
    );
  }

  const missingPersistedSelection =
    input.missingPersistedSelection ?? new Set<string>();
  const prepared = input.lines.map((line) => {
    const selected = input.selectedDesigns.find(
      (design) => design.line_item_id === line.id,
    );
    if (!selected) {
      throw new CrmAuthError(
        500,
        `Selected design resolution failed for line ${line.id}.`,
      );
    }
    const priced = repriced.designs.find(
      (entry) =>
        entry.lineItemId === line.id && entry.designId === selected.id,
    );
    if (!priced) {
      throw new CrmAuthError(
        500,
        `The server-authoritative V2 engine returned no result for line ${line.id}.`,
      );
    }
    const result = priced.result;
    const internalSnapshot = protectedInternalSnapshot(
      result,
      priced.costResult,
      repriced.costSummary,
    );
    const forcedBlocked = missingPersistedSelection.has(line.id);
    const authoritative =
      !forcedBlocked &&
      result.ok &&
      result.validationStatus === "valid" &&
      (result.internalCost?.freightStatus !== "unresolved" ||
        SOURCE_COST_PLUS_PRODUCTS.has(priced.selection.productId)) &&
      internalSnapshot !== null &&
      priced.snapshot !== null;
    const priceStatus: V2PriceStatus = authoritative
      ? "authoritative"
      : forcedBlocked || result.validationStatus === "blocked"
        ? "blocked"
        : "unpriceable";
    const provenanceSnapshot = {
      catalogVersion: result.catalogVersion,
      catalogAsOf: result.catalogAsOf,
      sources: uniqueProvenance(result, priced.selection),
    };
    return {
      lineItemId: line.id,
      designId: selected.id,
      priceStatus,
      customerPrice: authoritative
        ? (toCustomerQuotePriceResult(result) as JsonRecord)
        : customerSafeFailure(result),
      rpcResult: {
        lineItemId: line.id,
        designId: selected.id,
        selectDesign: !forcedBlocked,
        selection: priced.selection,
        selectionFingerprint: result.selectionFingerprint,
        catalogVersion: result.catalogVersion,
        priceStatus,
        authoritativeSnapshot: authoritative ? priced.snapshot : null,
        internalCostSnapshot: authoritative ? internalSnapshot : null,
        validationSnapshot: validationSnapshot(
          result,
          repriced.costSummary.status,
          repriced.costSummary.warnings,
          forcedBlocked
            ? {
                lineItemId: line.id,
                designId: selected.id,
                source: selectedPriceSource(priced.selection),
              }
            : null,
        ),
        provenanceSnapshot,
      },
    } satisfies PreparedSalesQuoteV2PricingLine;
  });

  return {
    repriced: repriced as PreparedSalesQuoteV2PricingBatch["repriced"],
    prepared,
  };
}

/**
 * Server-only quote-wide authoritative pricing + atomic batch persistence.
 * Every price-affecting value is loaded from the database; the client cannot
 * select a catalog date, submit a price, or manufacture a fingerprint.
 */
export async function saveSalesQuoteV2AuthoritativePrice(
  supabase: SupabaseClient,
  input: SaveSalesQuoteV2PriceInput,
): Promise<SaveSalesQuoteV2PriceResponse> {
  const quoteId = requiredUuid(input.quoteId, "quoteId");
  const lineItemId = requiredUuid(input.lineItemId, "lineItemId");
  const designId = requiredUuid(input.designId, "designId");
  const actorId = requiredUuid(input.actorId, "actorId");
  const revision = expectedRevision(input.expectedRevision);
  const requestKey = idempotencyKey(input.idempotencyKey);

  const quote = await loadQuote(supabase, quoteId);
  if (quote.quote_v2_backend !== true) {
    throw new CrmAuthError(
      409,
      "This quote has not been enabled for the authoritative V2 backend.",
    );
  }
  const storedRevision = numericRevision(quote.quote_v2_revision, "Quote load");
  if (storedRevision < revision) {
    throw new CrmAuthError(
      409,
      `The requested revision ${revision} is ahead of the current quote revision ${storedRevision}.`,
    );
  }

  const lines = await loadQuoteLines(supabase, quoteId);
  if (!lines.length) {
    throw new CrmAuthError(409, "A V2 quote must contain at least one line item.");
  }
  const targetLine = lines.find((line) => line.id === lineItemId);
  if (!targetLine) {
    throw new CrmAuthError(404, "The line item was not found on this quote.");
  }
  const storedDesigns = await loadQuoteDesigns(
    supabase,
    lines.map((line) => line.id),
  );
  const targetDesign = storedDesigns.find(
    (design) => design.id === designId && design.line_item_id === lineItemId,
  );
  if (!targetDesign) {
    throw new CrmAuthError(404, "The design was not found on this line item.");
  }

  const missingPersistedSelection = new Set<string>();
  const selectedDesigns = lines.map((line) => {
    const lineDesigns = storedDesigns
      .filter((design) => design.line_item_id === line.id)
      .sort(
        (left, right) =>
          Number(right.variant === "A") - Number(left.variant === "A") ||
          left.variant.localeCompare(right.variant) ||
          left.id.localeCompare(right.id),
      );
    if (!lineDesigns.length) {
      throw new CrmAuthError(
        409,
        `Line item ${line.id} has no saved design to revalidate.`,
      );
    }
    let selected: SalesQuoteDesign | undefined;
    if (line.id === lineItemId) {
      selected = targetDesign;
    } else if (typeof line.selected_design_id === "string") {
      selected = lineDesigns.find(
        (design) => design.id === line.selected_design_id,
      );
      if (!selected) {
        throw new CrmAuthError(
          409,
          `Line item ${line.id} references a selected design that no longer belongs to it.`,
        );
      }
    } else {
      selected = lineDesigns[0];
      missingPersistedSelection.add(line.id);
    }

    // The server-owned quote row, not a browser-editable options flag,
    // authorizes V2. The exact-interface adapter strips this marker before
    // fingerprinting.
    return {
      ...selected,
      options_json: {
        ...(plainRecord(selected.options_json) ?? {}),
        quote_v2_backend: true,
      },
    };
  });
  const serverDate = input.serverDate ?? quoteV2ServerCatalogDate();
  const { prepared } = prepareSalesQuoteV2PricingBatch({
    lines,
    selectedDesigns,
    serverDate,
    missingPersistedSelection,
  });

  const { data, error } = await supabase.rpc("save_quote_v2_pricing_batch", {
    p_quote_id: quoteId,
    p_expected_revision: revision,
    p_idempotency_key: requestKey,
    p_actor_id: actorId,
    p_results: prepared.map((entry) => entry.rpcResult),
  });
  if (error) {
    if (isRevisionConflict(error)) {
      throw new CrmAuthError(
        409,
        "This quote changed while it was being priced. Reload it and try again.",
      );
    }
    throw databaseError("Authoritative V2 pricing could not be saved.");
  }

  const saved = rpcRow(data);
  if (saved.quote_id !== quoteId) {
    throw databaseError("Authoritative V2 persistence returned mismatched row identities.");
  }
  const newRevision = numericRevision(saved.new_revision, "V2 persistence");
  if (newRevision < revision) {
    throw databaseError("Authoritative V2 persistence returned an older revision.");
  }
  const target = prepared.find(
    (entry) => entry.lineItemId === lineItemId && entry.designId === designId,
  );
  if (!target) {
    throw new CrmAuthError(500, "The requested design was not included in the saved batch.");
  }

  return {
    backend: "authoritative_v2",
    quoteId,
    lineItemId,
    designId,
    revision: newRevision,
    quoteStatus:
      typeof saved.quote_status === "string"
        ? saved.quote_status
        : target.priceStatus,
    quoteTotal: money(saved.quote_total, "V2 persistence"),
    priceStatus: target.priceStatus,
    price: target.customerPrice,
    pricedDesignCount: numericRevision(
      saved.priced_design_count,
      "V2 persistence priced-design count",
    ),
    blockedDesignCount: numericRevision(
      saved.blocked_design_count,
      "V2 persistence blocked-design count",
    ),
    lines: prepared.map((entry) => ({
      lineItemId: entry.lineItemId,
      designId: entry.designId,
      priceStatus: entry.priceStatus,
      price: entry.customerPrice,
    })),
  };
}
