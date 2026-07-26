/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isServerMarkedV2SalesQuote } from "@/lib/crm/sales-quote-v2-send-guard";
import { quoteV2ServerCatalogDate } from "@/lib/crm/sales-quote-v2-price-save";
import { repriceExactQuoteBuilderForServerDate } from "@/lib/quote-lab/exact-backend";
import {
  QUOTE_V2_CATALOG_VERSION,
  QUOTE_V2_ROLLER_PREVIEW_VERSION,
} from "@/lib/quote-v2/catalog";
import type {
  SalesQuoteDesign,
  SalesQuoteLineItem,
} from "@mts/types/quote";
import {
  customerConfigurationFromSelection,
  type V2CustomerConfiguration,
} from "@/lib/crm/sales-quote-v2-customer-configuration";

type AnyRow = Record<string, any>;
type V2PersistedLine = SalesQuoteLineItem & {
  selected_design_id?: string | null;
};
type V2PersistedDesign = SalesQuoteDesign & {
  quote_v2_selection?: unknown;
  quote_v2_price_status?: string | null;
  quote_v2_selection_fingerprint?: string | null;
  quote_v2_priced_catalog_version?: string | null;
  current_v2_snapshot_id?: string | null;
};
type V2RetailSnapshotRow = {
  id?: unknown;
  quote_id?: unknown;
  line_item_id?: unknown;
  design_id?: unknown;
  quote_revision?: unknown;
  selection_fingerprint?: unknown;
  catalog_version?: unknown;
  retail_total?: unknown;
  retail_snapshot?: unknown;
  provenance_snapshot?: unknown;
};

export type V2CustomerRetailPrice = {
  productId: string;
  programId: string;
  programName: string;
  matchedWidth: number;
  matchedHeight: number | null;
  sqft?: number;
  billableSqft?: number;
  base: number;
  surchargeLines: Array<{ id: string; label: string; amount: number }>;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  quantity: number;
  onceTotal: number;
  total: number;
};

export type PreparedV2CustomerQuote = {
  backend: "authoritative_v2";
  total: number;
  lines: Array<{
    lineItemId: string;
    selectedDesignId: string;
    selectedVariant: string;
    room: string | null;
    productType: string | null;
    widthInches: number;
    heightInches: number;
    quantity: number;
    configuration: V2CustomerConfiguration;
    price: V2CustomerRetailPrice;
  }>;
};

type PrepareV2CustomerSendInput = {
  quote: AnyRow;
  lineItems: V2PersistedLine[];
  designs: V2PersistedDesign[];
  /** Customer-safe columns from the append-only authoritative snapshot table. */
  snapshots: V2RetailSnapshotRow[];
  /** Injectable only so catalog cutover boundaries can be tested deterministically. */
  serverDate?: string;
};

export class V2SendPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V2SendPreparationError";
  }
}

function fail(message: string): never {
  throw new V2SendPreparationError(message);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(`${label} is missing from the authoritative retail snapshot.`);
  }
  return value;
}

function nullableFiniteNumber(value: unknown, label: string): number | null {
  return value === null ? null : finiteNumber(value, label);
}

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function persistedMoney(value: unknown, label: string): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  ) {
    return fail(`${label} is missing from authoritative persistence.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fail(`${label} is invalid in authoritative persistence.`);
  }
  return Math.round(parsed * 100) / 100;
}

function sameMoney(left: unknown, right: unknown): boolean {
  return Math.abs(money(left) - money(right)) < 0.005;
}

function decimalMeasurement(whole: unknown, fraction: unknown): number {
  const base = Number(whole) || 0;
  const value = String(fraction || "").trim();
  if (!value || value === "0") return base;
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return base;
  }
  return Math.round((base + numerator / denominator) * 10_000) / 10_000;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Resolve catalog identity from server code and date, never from client JSON. */
export function serverCatalogVersionForV2Product(
  productId: string,
  serverDate: string,
): string {
  if (!validIsoDate(serverDate)) fail("The server catalog date is invalid.");
  if (productId === "roller" && serverDate >= "2026-08-01") {
    return QUOTE_V2_ROLLER_PREVIEW_VERSION;
  }
  return QUOTE_V2_CATALOG_VERSION;
}

function projectSurchargeLines(value: unknown): V2CustomerRetailPrice["surchargeLines"] {
  if (!Array.isArray(value)) fail("The authoritative surcharge breakdown is missing.");
  return value.map((entry, index) => {
    const source = record(entry);
    if (!source) fail(`Authoritative surcharge ${index + 1} is malformed.`);
    const id = text(source.id);
    const label = text(source.label);
    if (!id || !label) fail(`Authoritative surcharge ${index + 1} is incomplete.`);
    return {
      id,
      label,
      amount: finiteNumber(source.amount, `Authoritative surcharge ${index + 1} amount`),
    };
  });
}

/**
 * Allow-list projection. Raw options and every dealer-cost, landed-cost,
 * freight, multiplier, and margin field are intentionally impossible to emit.
 */
export function projectV2CustomerRetailPrice(value: unknown): V2CustomerRetailPrice {
  const source = record(value);
  if (!source || source.ok !== true) fail("The immutable retail snapshot is not successful.");
  const productId = text(source.productId);
  const programId = text(source.programId);
  const programName = text(source.programName);
  if (!productId || !programId || !programName) {
    fail("The immutable retail snapshot is missing its product or program identity.");
  }

  const projected: V2CustomerRetailPrice = {
    productId,
    programId,
    programName,
    matchedWidth: finiteNumber(source.matchedWidth, "Matched width"),
    matchedHeight: nullableFiniteNumber(source.matchedHeight, "Matched height"),
    base: finiteNumber(source.base, "Retail base"),
    surchargeLines: projectSurchargeLines(source.surchargeLines),
    unitPrice: finiteNumber(source.unitPrice, "Retail unit price"),
    discountPercent: finiteNumber(source.discountPercent, "Retail discount percent"),
    discountAmount: finiteNumber(source.discountAmount, "Retail discount amount"),
    quantity: finiteNumber(source.quantity, "Retail quantity"),
    onceTotal: finiteNumber(source.onceTotal, "Retail one-time total"),
    total: finiteNumber(source.total, "Retail total"),
  };
  // Onyx retail snapshots already substitute the measured opening for matched
  // geometry. Its internal frame-pricing area must never enter the customer
  // DTO even if a malformed or stale snapshot contains area fields.
  if (productId !== "onyx_shutters") {
    if (typeof source.sqft === "number" && Number.isFinite(source.sqft)) {
      projected.sqft = source.sqft;
    }
    if (
      typeof source.billableSqft === "number" &&
      Number.isFinite(source.billableSqft)
    ) {
      projected.billableSqft = source.billableSqft;
    }
  }
  return projected;
}

type RequiredQuoteIdentity = {
  id: string;
  revision: number;
  catalogVersions: string[];
};

function quoteCatalogVersions(value: unknown): string[] {
  const raw = text(value);
  if (!raw) return [];
  const values = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(values)].sort();
}

function requireQuoteIdentity(quote: AnyRow): RequiredQuoteIdentity {
  if (!isServerMarkedV2SalesQuote(quote)) {
    return fail("The quote row is not authoritatively marked V2.");
  }
  const id = text(quote.id);
  if (!id) fail("The authoritative V2 quote ID is missing.");
  if (quote.status !== "draft" || quote.quote_v2_status !== "priced") {
    fail("The authoritative V2 quote is not in the priced draft lifecycle state.");
  }
  const revision = Number(quote.quote_v2_revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    fail("The authoritative V2 quote revision is invalid.");
  }
  const catalogVersions = quoteCatalogVersions(quote.quote_v2_catalog_version);
  if (!catalogVersions.length) {
    fail("The authoritative V2 quote catalog identity is missing.");
  }
  return { id, revision, catalogVersions };
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function requireStoredSnapshot(
  design: V2PersistedDesign,
  lineItemId: string,
  quoteIdentity: RequiredQuoteIdentity,
  snapshots: V2RetailSnapshotRow[],
) {
  if (design.quote_v2_price_status !== "authoritative") {
    return fail(`Selected design ${design.id} does not have an authoritative price.`);
  }
  const currentSnapshotId = text(design.current_v2_snapshot_id);
  const fingerprint = text(design.quote_v2_selection_fingerprint);
  const catalogVersion = text(design.quote_v2_priced_catalog_version);
  if (!currentSnapshotId || !fingerprint || !catalogVersion) {
    return fail(`Selected design ${design.id} is missing its immutable authoritative snapshot.`);
  }
  const matches = snapshots.filter((snapshot) => text(snapshot.id) === currentSnapshotId);
  if (matches.length !== 1) {
    return fail(`Selected design ${design.id} does not resolve to exactly one current snapshot.`);
  }
  const snapshotRow = matches[0];
  if (
    text(snapshotRow.quote_id) !== quoteIdentity.id ||
    text(snapshotRow.line_item_id) !== lineItemId ||
    text(snapshotRow.design_id) !== design.id
  ) {
    return fail(`Selected design ${design.id} current snapshot identity is inconsistent.`);
  }
  if (Number(snapshotRow.quote_revision) !== quoteIdentity.revision) {
    return fail(`Selected design ${design.id} is not priced at the current quote revision.`);
  }
  if (text(snapshotRow.selection_fingerprint) !== fingerprint) {
    return fail(`Selected design ${design.id} has a stale selection fingerprint.`);
  }
  if (text(snapshotRow.catalog_version) !== catalogVersion) {
    return fail(`Selected design ${design.id} has a stale catalog snapshot.`);
  }
  const snapshot = record(snapshotRow.retail_snapshot);
  if (
    !snapshot ||
    snapshot.priceStatus !== "authoritative" ||
    text(snapshot.selectionFingerprint) !== fingerprint ||
    text(snapshot.catalogVersion) !== catalogVersion ||
    !record(snapshot.retail)
  ) {
    return fail(`Selected design ${design.id} immutable retail snapshot is inconsistent.`);
  }
  return { snapshotRow, snapshot, fingerprint, catalogVersion };
}

/**
 * Revalidate selected designs with the same authoritative engine used for
 * filtering/pricing, then create a customer-only payload from immutable retail
 * snapshots. This function is write-free.
 */
export function prepareV2CustomerSendPayload(
  input: PrepareV2CustomerSendInput,
): PreparedV2CustomerQuote {
  const quoteIdentity = requireQuoteIdentity(input.quote);
  if (!input.lineItems.length) fail("A V2 quote must contain at least one line item.");
  if (input.lineItems.length > 40) fail("A V2 quote cannot contain more than 40 line items.");

  const selectedDesigns: V2PersistedDesign[] = [];
  const selectedVariantByLine: Record<string, string> = {};
  const seenLineIds = new Set<string>();
  const storedByDesignId = new Map<
    string,
    ReturnType<typeof requireStoredSnapshot>
  >();
  for (const line of input.lineItems) {
    if (seenLineIds.has(line.id)) fail(`Line item ${line.id} is duplicated.`);
    seenLineIds.add(line.id);
    const selectedDesignId = text(line.selected_design_id);
    if (!selectedDesignId) {
      fail(`Line item ${line.id} is missing selected_design_id.`);
    }
    const selectedMatches = input.designs.filter(
      (design) => design.id === selectedDesignId && design.line_item_id === line.id,
    );
    if (selectedMatches.length !== 1) {
      fail(`Line item ${line.id} references a selected design that does not belong to it.`);
    }
    const selected = selectedMatches[0];
    selectedDesigns.push(selected);
    selectedVariantByLine[line.id] = selected.variant;
    storedByDesignId.set(
      selected.id,
      requireStoredSnapshot(
        selected,
        line.id,
        quoteIdentity,
        input.snapshots,
      ),
    );
  }

  const selectedCatalogVersions = [...new Set(
    [...storedByDesignId.values()].map((stored) => stored.catalogVersion),
  )].sort();
  if (!sameStrings(quoteIdentity.catalogVersions, selectedCatalogVersions)) {
    fail("The quote catalog identity does not match its selected current snapshots.");
  }

  const serverDate = input.serverDate ?? quoteV2ServerCatalogDate();
  let repriced: ReturnType<typeof repriceExactQuoteBuilderForServerDate>;
  try {
    repriced = repriceExactQuoteBuilderForServerDate(
      {
        lines: input.lineItems,
        designs: selectedDesigns,
        selectedVariantByLine,
      },
      serverDate,
    );
  } catch (error) {
    fail(`Authoritative V2 repricing failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  if (!("backend" in repriced) || repriced.backend !== "v2") {
    fail("The server-authoritative V2 engine did not handle this quote.");
  }
  const hasStandardSnapshot = [...storedByDesignId.values()].some(
    (stored) => stored.catalogVersion !== "custom-override-v1",
  );
  if (!repriced.sendability.sendable && hasStandardSnapshot) {
    const reason = repriced.sendability.reasons[0]?.message;
    fail(reason ? `Authoritative V2 validation blocked sending: ${reason}` : "Authoritative V2 validation blocked sending.");
  }

  const customerLines: PreparedV2CustomerQuote["lines"] = input.lineItems.map((line) => {
    const selectedDesignId = text(line.selected_design_id);
    if (!selectedDesignId) return fail(`Line item ${line.id} is missing selected_design_id.`);
    const design = selectedDesigns.find((entry) => entry.id === selectedDesignId);
    if (!design) return fail(`Selected design ${selectedDesignId} was not loaded.`);
    const stored = storedByDesignId.get(selectedDesignId);
    if (!stored) return fail(`Selected design ${selectedDesignId} has no stored snapshot.`);
    const priced = repriced.designs.find(
      (entry) => entry.lineItemId === line.id && entry.designId === selectedDesignId,
    );
    if (stored.catalogVersion === "custom-override-v1") {
      const provenance = record(stored.snapshotRow.provenance_snapshot);
      if (provenance?.mode !== "custom_override" || provenance.internalOnly !== true) {
        return fail(`Custom Mode snapshot ${selectedDesignId} is missing internal provenance.`);
      }
      const customerPrice = projectV2CustomerRetailPrice(stored.snapshot.retail);
      if (!sameMoney(design.unit_price, customerPrice.unitPrice)) {
        return fail(`Custom Mode design ${selectedDesignId} does not match its immutable retail snapshot.`);
      }
      if (!priced) return fail(`Custom Mode design ${selectedDesignId} no longer resolves to its original V2 selection.`);
      return {
        lineItemId: line.id,
        selectedDesignId,
        selectedVariant: design.variant.trim(),
        room: text(line.room_name),
        productType: text(line.product_type),
        widthInches: decimalMeasurement(line.width_whole, line.width_fraction),
        heightInches: decimalMeasurement(line.height_whole, line.height_fraction),
        quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
        configuration: customerConfigurationFromSelection(priced.selection),
        price: customerPrice,
      };
    }
    if (!priced?.result.ok || priced.result.validationStatus !== "valid") {
      return fail(`Selected design ${selectedDesignId} did not reprice authoritatively.`);
    }
    const sendability = repriced.sendability.lines.find(
      (entry) => entry.lineItemId === line.id && entry.selectedDesignId === selectedDesignId,
    );
    if (!sendability?.sendable || sendability.stale) {
      return fail(`Selected design ${selectedDesignId} is stale or not sendable.`);
    }

    const requiredCatalogVersion = serverCatalogVersionForV2Product(
      priced.result.productId,
      serverDate,
    );
    if (
      stored.catalogVersion !== requiredCatalogVersion ||
      priced.result.catalogVersion !== requiredCatalogVersion ||
      stored.catalogVersion !== priced.result.catalogVersion
    ) {
      return fail(`Selected design ${selectedDesignId} is not priced with the current server catalog.`);
    }
    if (
      stored.fingerprint !== priced.result.selectionFingerprint ||
      stored.fingerprint !== priced.result.pricedSelectionFingerprint
    ) {
      return fail(`Selected design ${selectedDesignId} changed after authoritative pricing.`);
    }

    const customerPrice = projectV2CustomerRetailPrice(stored.snapshot.retail);
    const currentCustomerPrice = projectV2CustomerRetailPrice(priced.result);
    if (
      JSON.stringify(customerPrice) !== JSON.stringify(currentCustomerPrice) ||
      !sameMoney(
        persistedMoney(design.unit_price, `Selected design ${selectedDesignId} unit price`),
        customerPrice.unitPrice,
      ) ||
      !sameMoney(
        persistedMoney(
          stored.snapshotRow.retail_total,
          `Selected design ${selectedDesignId} snapshot retail total`,
        ),
        customerPrice.total,
      )
    ) {
      return fail(`Selected design ${selectedDesignId} retail snapshot does not match authoritative repricing.`);
    }

    return {
      lineItemId: line.id,
      selectedDesignId,
      selectedVariant: design.variant.trim(),
      room: text(line.room_name),
      productType: text(line.product_type),
      widthInches: decimalMeasurement(line.width_whole, line.width_fraction),
      heightInches: decimalMeasurement(line.height_whole, line.height_fraction),
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
      configuration: customerConfigurationFromSelection(priced.selection),
      price: customerPrice,
    };
  });

  const total = money(
    customerLines.reduce((sum, line) => sum + line.price.total, 0),
  );
  if (
    !sameMoney(
      persistedMoney(input.quote.total_amount, "Stored quote total"),
      total,
    )
  ) {
    fail("The stored quote total does not match the selected authoritative V2 designs.");
  }
  return { backend: "authoritative_v2", total, lines: customerLines };
}

export async function prepareV2CustomerSendPayloadFromDatabase(
  supabase: SupabaseClient,
  quote: AnyRow,
): Promise<PreparedV2CustomerQuote> {
  requireQuoteIdentity(quote);
  const { data: lineItems, error: lineError } = await supabase
    .from("sales_quote_line_items")
    .select("*")
    .eq("quote_id", quote.id)
    .order("sort_order", { ascending: true });
  if (lineError) fail("V2 line items could not be loaded for authoritative validation.");
  const lines = ([...(lineItems || [])] as unknown as V2PersistedLine[]).sort(
    (left, right) =>
      Number(left.sort_order) - Number(right.sort_order) ||
      left.id.localeCompare(right.id),
  );
  const selectedDesignIds = lines.map((line) => {
    const selectedDesignId = text(line.selected_design_id);
    if (!selectedDesignId) fail(`Line item ${line.id} is missing selected_design_id.`);
    return selectedDesignId;
  });
  const { data: designs, error: designError } = selectedDesignIds.length
    ? await supabase.from("sales_quote_designs").select("*").in("id", selectedDesignIds)
    : { data: [], error: null };
  if (designError) fail("V2 designs could not be loaded for authoritative validation.");
  const selectedDesigns = (designs || []) as unknown as V2PersistedDesign[];
  const snapshotIds = selectedDesigns.map((design) => {
    const snapshotId = text(design.current_v2_snapshot_id);
    if (!snapshotId) {
      fail(`Selected design ${design.id} is missing its immutable authoritative snapshot.`);
    }
    return snapshotId;
  });
  const { data: snapshots, error: snapshotError } = snapshotIds.length
    ? await supabase
        .from("sales_quote_v2_price_snapshots")
        .select(
          "id,quote_id,line_item_id,design_id,quote_revision,selection_fingerprint,catalog_version,retail_total,retail_snapshot,provenance_snapshot",
        )
        .in("id", snapshotIds)
    : { data: [], error: null };
  if (snapshotError) fail("V2 current retail snapshots could not be loaded for authoritative validation.");

  // Re-read the server-owned quote identity after loading its children. A
  // concurrent repricing or lifecycle transition invalidates this preparation
  // rather than mixing revisions. The actual production send remains disabled
  // until the dedicated atomic send transition exists.
  const { data: currentQuote, error: quoteError } = await supabase
    .from("sales_quotes")
    .select(
      "id,status,total_amount,quote_v2_backend,quote_v2_status,quote_v2_catalog_version,quote_v2_revision",
    )
    .eq("id", quote.id)
    .maybeSingle();
  if (quoteError || !currentQuote) fail("The V2 quote identity could not be reloaded before sending.");
  const initialIdentity = requireQuoteIdentity(quote);
  const currentIdentity = requireQuoteIdentity(currentQuote as AnyRow);
  if (
    initialIdentity.id !== currentIdentity.id ||
    initialIdentity.revision !== currentIdentity.revision ||
    !sameStrings(initialIdentity.catalogVersions, currentIdentity.catalogVersions) ||
    !sameMoney(
      persistedMoney(quote.total_amount, "Initial quote total"),
      persistedMoney((currentQuote as AnyRow).total_amount, "Current quote total"),
    )
  ) {
    fail("The authoritative V2 quote changed while send preparation was running.");
  }
  return prepareV2CustomerSendPayload({
    quote: currentQuote as AnyRow,
    lineItems: lines,
    designs: selectedDesigns,
    snapshots: (snapshots || []) as unknown as V2RetailSnapshotRow[],
  });
}
