// Pure pricing engine for Norman window treatments.
//
// Design principles (every one is a fix for a real bug in the legacy MTS engine):
//   1. NO silent failures. Out-of-grid, NA cells, unknown fabric, and exceeded
//      max dimensions return an explicit error code, never a $0 / cheapest-grid /
//      null price that looks like a real quote.
//   2. Single source of truth. Price is always computed from the catalog; nothing
//      is read back from a stored snapshot that can drift.
//   3. Integer-cents math, rounded exactly once, so totals never accumulate float
//      drift across surcharges and quantities.
//   4. Round UP to the next grid cell (you cannot order between catalog sizes).

import {
  getProduct,
  getProgram,
  getProgramForFabric,
  findProductSurcharge,
  catalog,
} from "./catalog";
import type { CatalogProduct, CatalogProgram } from "./catalog/types";
import { squareFeet } from "./measurements";

export type PriceErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "PROGRAM_NOT_RESOLVED"
  | "FABRIC_UNKNOWN"
  | "INVALID_DIMENSIONS"
  | "WIDTH_EXCEEDS_MAX"
  | "HEIGHT_EXCEEDS_MAX"
  | "AREA_EXCEEDS_MAX"
  | "NA_CELL"
  | "SURCHARGE_UNKNOWN"
  | "MOTORIZATION_UNKNOWN";

export type SurchargeSelection = {
  id: string;
  /** Multiplier for per-side / per-foot surcharges (e.g. 2 sides, 3 extra feet). Default 1. */
  units?: number;
};

export type MotorizationSelection = {
  groupId: string;
  optionId: string;
  /** Quantity of this motor component per window. Default 1. */
  units?: number;
};

export type PriceInput = {
  productId: string;
  /** Explicit program id. If omitted, resolved from `fabric` (fabric-priced products). */
  programId?: string;
  /** Fabric name; routes to a price-group program when programId is not given. */
  fabric?: string;
  widthInches: number;
  heightInches: number;
  quantity?: number;
  surcharges?: SurchargeSelection[];
  motorization?: MotorizationSelection[];
};

export type PriceLine = {
  id: string;
  label: string;
  /** Per-window amount in dollars (already multiplied by units for per-side/foot). */
  amount: number;
  kind: "percent" | "flat";
  detail?: string;
};

export type PriceBreakdown = {
  ok: true;
  productId: string;
  programId: string;
  programName: string;
  /** Grid cell the measurement rounded up to. */
  matchedWidth: number;
  matchedHeight: number | null;
  /** Actual square footage (sqft-priced programs only). */
  sqft?: number;
  /** Billable square footage after the minimum floor (sqft-priced programs only). */
  billableSqft?: number;
  base: number;
  surchargeLines: PriceLine[];
  /** base + all per-window surcharges. */
  unitPrice: number;
  quantity: number;
  /** Surcharges charged once per line regardless of quantity (e.g. freight). */
  onceTotal: number;
  /** unitPrice * quantity + onceTotal. */
  total: number;
  warnings: string[];
};

export type PriceFailure = {
  ok: false;
  code: PriceErrorCode;
  error: string;
  warnings: string[];
};

export type PriceResult = PriceBreakdown | PriceFailure;

// ---------- money helpers (integer cents) ----------

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}
function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function normalizeQuantity(q: number | null | undefined): number {
  const n = Number(q);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function fail(code: PriceErrorCode, error: string, warnings: string[]): PriceFailure {
  return { ok: false, code, error, warnings };
}

/**
 * Index of the first grid header >= value (round UP to the next orderable size).
 * If value is below the smallest header, returns 0 (smallest size).
 * If value exceeds the largest header, returns -1 (out of grid).
 */
export function roundUpIndex(headers: number[], value: number): number {
  for (let i = 0; i < headers.length; i += 1) {
    if (headers[i] >= value) return i;
  }
  return -1;
}

function resolveProgram(
  product: CatalogProduct,
  input: PriceInput,
  warnings: string[],
): CatalogProgram | PriceFailure {
  if (input.programId) {
    const prog = getProgram(product, input.programId);
    if (!prog) return fail("PROGRAM_NOT_RESOLVED", `Program '${input.programId}' not found on '${product.id}'`, warnings);
    return prog;
  }
  if (input.fabric && product.fabricRouting) {
    const prog = getProgramForFabric(product, input.fabric);
    if (!prog) {
      return fail(
        "FABRIC_UNKNOWN",
        `Fabric '${input.fabric}' is not in the ${product.name} price guide. Pick a listed fabric — the legacy system silently priced unknown fabrics at the cheapest group.`,
        warnings,
      );
    }
    return prog;
  }
  // Single-program product: only one priceable program.
  const priceable = product.programs.filter((p) => p.grid.prices.length > 0 && p.grid.widths.length > 0);
  if (priceable.length === 1) return priceable[0];
  return fail(
    "PROGRAM_NOT_RESOLVED",
    `'${product.name}' has ${priceable.length} programs; specify programId or fabric.`,
    warnings,
  );
}

type BaseLookup = {
  cents: number;
  matchedWidth: number;
  matchedHeight: number | null;
  sqft?: number;
  billableSqft?: number;
};

function lookupBaseCents(
  prog: CatalogProgram,
  widthInches: number,
  heightInches: number,
  warnings: string[],
): BaseLookup | PriceFailure {
  // Per-square-foot programs (shutters): base = max(sqft, minSqft) * pricePerSqft.
  if (prog.priceAxis === "sqft") {
    if (prog.pricePerSqft == null) {
      return fail("PROGRAM_NOT_RESOLVED", `${prog.name} is missing pricePerSqft.`, warnings);
    }
    const sqft = squareFeet(widthInches, heightInches);
    const billableSqft = Math.max(sqft, prog.minSqft ?? 0);
    const cents = Math.round(billableSqft * toCents(prog.pricePerSqft));
    return { cents, matchedWidth: widthInches, matchedHeight: heightInches, sqft, billableSqft };
  }

  const wi = roundUpIndex(prog.grid.widths, widthInches);
  if (wi < 0) {
    return fail("WIDTH_EXCEEDS_MAX", `Width ${widthInches}" exceeds the largest size (${prog.grid.widths[prog.grid.widths.length - 1]}") for ${prog.name}.`, warnings);
  }
  const matchedWidth = prog.grid.widths[wi];

  if (prog.priceAxis === "width") {
    const v = prog.grid.prices[0]?.[wi];
    if (v == null) return fail("NA_CELL", `${prog.name} is not available at width ${matchedWidth}".`, warnings);
    return { cents: toCents(v), matchedWidth, matchedHeight: null };
  }

  const hi = roundUpIndex(prog.grid.heights, heightInches);
  if (hi < 0) {
    return fail("HEIGHT_EXCEEDS_MAX", `Height ${heightInches}" exceeds the largest size (${prog.grid.heights[prog.grid.heights.length - 1]}") for ${prog.name}.`, warnings);
  }
  const matchedHeight = prog.grid.heights[hi];
  const v = prog.grid.prices[hi]?.[wi];
  if (v == null) {
    return fail("NA_CELL", `${prog.name} is not available (NA) at ${matchedWidth}" x ${matchedHeight}".`, warnings);
  }
  return { cents: toCents(v), matchedWidth, matchedHeight };
}

export function priceDesign(input: PriceInput): PriceResult {
  const warnings: string[] = [];

  const product = getProduct(input.productId);
  if (!product) return fail("PRODUCT_NOT_FOUND", `Unknown product '${input.productId}'`, warnings);

  const progOrFail = resolveProgram(product, input, warnings);
  if ("ok" in progOrFail) return progOrFail; // PriceFailure has ok:false
  const prog = progOrFail;

  const W = Number(input.widthInches);
  const H = Number(input.heightInches);
  if (!Number.isFinite(W) || W <= 0) {
    return fail("INVALID_DIMENSIONS", `Width must be a positive number (got ${input.widthInches}).`, warnings);
  }
  const needsHeight = prog.priceAxis !== "width";
  if (needsHeight && (!Number.isFinite(H) || H <= 0)) {
    return fail("INVALID_DIMENSIONS", `Height must be a positive number (got ${input.heightInches}).`, warnings);
  }

  // Hard max-dimension limits (can be tighter than the grid extent).
  if (prog.maxWidth != null && W > prog.maxWidth) {
    return fail("WIDTH_EXCEEDS_MAX", `Width ${W}" exceeds the ${prog.maxWidth}" max for ${prog.name}.`, warnings);
  }
  if (needsHeight && prog.maxHeight != null && H > prog.maxHeight) {
    return fail("HEIGHT_EXCEEDS_MAX", `Height ${H}" exceeds the ${prog.maxHeight}" max for ${prog.name}.`, warnings);
  }
  if (needsHeight && prog.maxAreaSqft != null) {
    const sqft = squareFeet(W, H);
    if (sqft > prog.maxAreaSqft) {
      return fail("AREA_EXCEEDS_MAX", `${sqft.toFixed(1)} sq ft exceeds the ${prog.maxAreaSqft} sq ft max for ${prog.name}.`, warnings);
    }
  }

  const baseLookup = lookupBaseCents(prog, W, H, warnings);
  if ("ok" in baseLookup) return baseLookup;
  const { cents: baseCents, matchedWidth, matchedHeight, sqft: actualSqft, billableSqft } = baseLookup;

  // Surcharges
  const surchargeLines: PriceLine[] = [];
  let perWindowCents = 0;
  let onceCents = 0;

  for (const sel of input.surcharges ?? []) {
    const sc = findProductSurcharge(product, sel.id);
    if (!sc) {
      return fail("SURCHARGE_UNKNOWN", `Surcharge '${sel.id}' is not valid for ${product.name}.`, warnings);
    }
    if (sc.value == null) {
      warnings.push(`Surcharge '${sc.name}' has no catalog price and was skipped.`);
      continue;
    }
    let amountCents: number;
    let detail: string | undefined;
    if (sc.kind === "percent") {
      amountCents = Math.round((baseCents * sc.value) / 100);
      detail = `${sc.value}% of base`;
    } else if (sc.per === "sqft") {
      const sqft = actualSqft ?? (needsHeight ? squareFeet(W, H) : 0);
      amountCents = Math.round(toCents(sc.value) * sqft);
      detail = `$${sc.value}/sq ft x ${sqft.toFixed(1)}`;
    } else {
      const units = sc.per === "side" || sc.per === "foot" ? Math.max(1, Number(sel.units) || 1) : 1;
      amountCents = toCents(sc.value) * units;
      if (units > 1) detail = `${sc.value} x ${units} ${sc.per}s`;
    }
    surchargeLines.push({ id: sc.id, label: sc.name, amount: fromCents(amountCents), kind: sc.kind, detail });
    if (sc.per === "once") onceCents += amountCents;
    else perWindowCents += amountCents;
  }

  // Motorization (flat per-window add-ons)
  for (const sel of input.motorization ?? []) {
    const group = catalog.motorization[sel.groupId];
    const opt = group?.options.find((o) => o.id === sel.optionId);
    if (!opt) {
      return fail("MOTORIZATION_UNKNOWN", `Motorization '${sel.groupId}/${sel.optionId}' not found.`, warnings);
    }
    if (opt.price == null) {
      warnings.push(`Motorization '${opt.name}' has no catalog price and was skipped.`);
      continue;
    }
    const units = Math.max(1, Number(sel.units) || 1);
    const amountCents = toCents(opt.price) * units;
    surchargeLines.push({
      id: `motor:${sel.groupId}:${opt.id}`,
      label: opt.name,
      amount: fromCents(amountCents),
      kind: "flat",
      detail: units > 1 ? `${opt.price} x ${units}` : undefined,
    });
    perWindowCents += amountCents;
  }

  const quantity = normalizeQuantity(input.quantity);
  const unitCents = baseCents + perWindowCents;
  const totalCents = unitCents * quantity + onceCents;

  return {
    ok: true,
    productId: product.id,
    programId: prog.id,
    programName: prog.name,
    matchedWidth,
    matchedHeight,
    sqft: actualSqft,
    billableSqft,
    base: fromCents(baseCents),
    surchargeLines,
    unitPrice: fromCents(unitCents),
    quantity,
    onceTotal: fromCents(onceCents),
    total: fromCents(totalCents),
    warnings,
  };
}
