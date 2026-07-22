/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isServerMarkedV2SalesQuote } from "@/lib/crm/sales-quote-v2-send-guard";
import { repriceExactQuoteBuilderForServerDate } from "@/lib/quote-lab/exact-backend";
import {
  QUOTE_V2_CATALOG_VERSION,
  QUOTE_V2_ROLLER_PREVIEW_VERSION,
} from "@/lib/quote-v2/catalog";
import type {
  SalesQuoteDesign,
  SalesQuoteLineItem,
} from "@mts/types/quote";

type AnyRow = Record<string, any>;
type V2PersistedLine = SalesQuoteLineItem & {
  selected_design_id?: string | null;
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
    price: V2CustomerRetailPrice;
  }>;
};

type PrepareV2CustomerSendInput = {
  quote: AnyRow;
  lineItems: V2PersistedLine[];
  designs: SalesQuoteDesign[];
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

function currentServerDate(): string {
  return new Date().toISOString().slice(0, 10);
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
  if (typeof source.sqft === "number" && Number.isFinite(source.sqft)) {
    projected.sqft = source.sqft;
  }
  if (typeof source.billableSqft === "number" && Number.isFinite(source.billableSqft)) {
    projected.billableSqft = source.billableSqft;
  }
  return projected;
}

function requireStoredSnapshot(design: SalesQuoteDesign) {
  const options = record(design.options_json);
  if (!options || options.quote_v2_backend !== true) {
    return fail(`Selected design ${design.id} is not authoritatively marked V2.`);
  }
  if (options.authoritative_price_status !== "authoritative") {
    return fail(`Selected design ${design.id} does not have an authoritative price.`);
  }
  const snapshot = record(options.authoritative_v2_snapshot);
  if (!snapshot || snapshot.priceStatus !== "authoritative") {
    return fail(`Selected design ${design.id} is missing its immutable authoritative snapshot.`);
  }
  const fingerprint = text(snapshot.selectionFingerprint);
  const catalogVersion = text(snapshot.catalogVersion);
  const pricedFingerprint = text(options.priced_selection_fingerprint);
  const pricedCatalogVersion = text(options.priced_catalog_version);
  if (!fingerprint || !pricedFingerprint || fingerprint !== pricedFingerprint) {
    return fail(`Selected design ${design.id} has a stale selection fingerprint.`);
  }
  if (!catalogVersion || !pricedCatalogVersion || catalogVersion !== pricedCatalogVersion) {
    return fail(`Selected design ${design.id} has a stale catalog snapshot.`);
  }
  return { options, snapshot, fingerprint, catalogVersion };
}

/**
 * Revalidate selected designs with the same authoritative engine used for
 * filtering/pricing, then create a customer-only payload from immutable retail
 * snapshots. This function is write-free.
 */
export function prepareV2CustomerSendPayload(
  input: PrepareV2CustomerSendInput,
): PreparedV2CustomerQuote {
  if (!isServerMarkedV2SalesQuote(input.quote)) {
    return fail("The quote row is not authoritatively marked V2.");
  }
  if (!input.lineItems.length) fail("A V2 quote must contain at least one line item.");

  const selectedDesigns: SalesQuoteDesign[] = [];
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
    storedByDesignId.set(selected.id, requireStoredSnapshot(selected));
  }

  const serverDate = input.serverDate ?? currentServerDate();
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
  if (!repriced.sendability.sendable) {
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
      !sameMoney(design.unit_price, customerPrice.unitPrice)
    ) {
      return fail(`Selected design ${selectedDesignId} retail snapshot does not match authoritative repricing.`);
    }

    return {
      lineItemId: line.id,
      selectedDesignId,
      selectedVariant: design.variant,
      room: text(line.room_name),
      productType: text(line.product_type),
      widthInches: decimalMeasurement(line.width_whole, line.width_fraction),
      heightInches: decimalMeasurement(line.height_whole, line.height_fraction),
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
      price: customerPrice,
    };
  });

  const total = money(
    customerLines.reduce((sum, line) => sum + line.price.total, 0),
  );
  if (!sameMoney(input.quote.total_amount, total)) {
    fail("The stored quote total does not match the selected authoritative V2 designs.");
  }
  return { backend: "authoritative_v2", total, lines: customerLines };
}

export async function prepareV2CustomerSendPayloadFromDatabase(
  supabase: SupabaseClient,
  quote: AnyRow,
): Promise<PreparedV2CustomerQuote> {
  const { data: lineItems, error: lineError } = await supabase
    .from("sales_quote_line_items")
    .select("*")
    .eq("quote_id", quote.id)
    .order("sort_order", { ascending: true });
  if (lineError) fail("V2 line items could not be loaded for authoritative validation.");
  const lines = (lineItems || []) as unknown as V2PersistedLine[];
  const lineIds = lines.map((line) => line.id).filter(Boolean);
  const { data: designs, error: designError } = lineIds.length
    ? await supabase.from("sales_quote_designs").select("*").in("line_item_id", lineIds)
    : { data: [], error: null };
  if (designError) fail("V2 designs could not be loaded for authoritative validation.");
  return prepareV2CustomerSendPayload({
    quote,
    lineItems: lines,
    designs: (designs || []) as unknown as SalesQuoteDesign[],
  });
}
