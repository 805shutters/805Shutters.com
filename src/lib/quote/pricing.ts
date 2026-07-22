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
import { getMotorizationGroupsForProduct } from "./product-options";

export type PriceErrorCode =
  | "PRODUCT_SELECTION_REQUIRED"
  | "PRODUCT_NOT_FOUND"
  | "PROGRAM_NOT_RESOLVED"
  | "FABRIC_UNKNOWN"
  | "INVALID_DIMENSIONS"
  | "WIDTH_EXCEEDS_MAX"
  | "HEIGHT_EXCEEDS_MAX"
  | "AREA_EXCEEDS_MAX"
  | "NA_CELL"
  | "SURCHARGE_UNKNOWN"
  | "SURCHARGE_NO_PRICE"
  | "MOTORIZATION_UNKNOWN"
  | "MOTORIZATION_NO_PRICE"
  | "CONFIGURATION_INCOMPLETE"
  | "MANUAL_PRICE_REQUIRED"
  | "CUSTOMER_RETAIL_UNDEFINED"
  | "PRODUCT_UNAVAILABLE";

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
  /**
   * Exact order widths for a documented multi-component Roller assembly.
   * When present, each component is looked up in the selected fabric grid and
   * the bases are summed. The overall width remains the assembled order width.
   */
  componentWidthsInches?: number[];
  quantity?: number;
  surcharges?: SurchargeSelection[];
  motorization?: MotorizationSelection[];
  /** Per-line discount percent (0-100), applied to the per-window retail total. */
  discountPercent?: number;
};

export type PriceLine = {
  id: string;
  label: string;
  /** Per-window amount in dollars (already multiplied by units for per-side/foot). */
  amount: number;
  /** Internal per-window cost amount when wholesale source data exists. */
  wholesaleAmount?: number;
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
  /** Grid-width cells used for a multi-component Roller assembly. */
  componentMatchedWidths?: number[];
  /** Actual square footage (sqft-priced programs only). */
  sqft?: number;
  /** Billable square footage after the minimum floor (sqft-priced programs only). */
  billableSqft?: number;
  base: number;
  /** Number of physical shade units represented by one configured window. */
  configurationUnits: number;
  /** Internal dealer/wholesale base cost. Null when the source guide exposes retail only. */
  wholesaleBase: number | null;
  surchargeLines: PriceLine[];
  /** base + all per-window surcharges, LESS any per-line discount. */
  unitPrice: number;
  /** Per-line discount percent applied (0-100). */
  discountPercent: number;
  /** Per-window discount dollars applied (retail only; never wholesale or once charges). */
  discountAmount: number;
  /** Internal dealer/wholesale unit cost. Null when the source guide exposes retail only. */
  wholesaleUnitPrice: number | null;
  quantity: number;
  /** Surcharges charged once per line regardless of quantity (e.g. freight). */
  onceTotal: number;
  /** unitPrice * quantity + onceTotal. */
  total: number;
  /** Internal dealer/wholesale line total. Null when the source guide exposes retail only. */
  wholesaleTotal: number | null;
  warnings: string[];
  /** Internal landed-cost state; customer projections must omit this field. */
  costStatus?: "complete" | "incomplete" | "unavailable";
};

export type PriceFailure = {
  ok: false;
  code: PriceErrorCode;
  error: string;
  warnings: string[];
};

export type PriceResult = PriceBreakdown | PriceFailure;

export type DealerNetCostBreakdown = {
  ok: true;
  productId: string;
  programId: string;
  matchedWidth: number | null;
  matchedHeight: number | null;
  /** Actual square footage when the source is priced per square foot. */
  sqft?: number;
  /** Source minimum applied to actual square footage. */
  billableSqft?: number;
  dealerNetUnitCost: number;
};

export type DealerNetCostResult = DealerNetCostBreakdown | PriceFailure;

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

/**
 * Price a width-graduated surcharge (e.g. a valance) in cents: look up the price
 * at the first width breakpoint >= the window width (round up). Beyond the
 * largest breakpoint, charge the top price plus the per-foot overage for each
 * whole foot over. Never under-charges off the largest listed size.
 */
function widthGraduatedCents(
  g: { widths: number[]; prices: Array<number | null>; additionalFootRate: number },
  widthInches: number,
): number | null {
  const wi = roundUpIndex(g.widths, widthInches);
  if (wi >= 0) {
    const price = g.prices[wi];
    return price == null ? null : toCents(price);
  }
  const last = g.widths.length - 1;
  const lastPrice = g.prices[last];
  if (lastPrice == null) return null;
  const extraFeet = Math.max(0, Math.ceil((widthInches - g.widths[last]) / 12));
  return toCents(lastPrice) + toCents(g.additionalFootRate) * extraFeet;
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
  // Single-program product: only one priceable program. (sqft programs price off
  // pricePerSqft with an empty grid, so gate them the same way lookupBaseCents does.)
  const priceable = product.programs.filter((p) =>
    p.priceAxis === "sqft"
      ? (p.priceBasis ?? product.priceBasis) === "dealer_net"
        ? p.costPerSqft != null
        : p.pricePerSqft != null
      : p.grid.prices.length > 0 && p.grid.widths.length > 0,
  );
  if (priceable.length === 1) return priceable[0];
  return fail(
    "PROGRAM_NOT_RESOLVED",
    `'${product.name}' has ${priceable.length} programs; specify programId or fabric.`,
    warnings,
  );
}

type BaseLookup = {
  cents: number;
  wholesaleCents: number | null;
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
    const wholesaleCents =
      prog.costPerSqft == null
        ? null
        : Math.round(billableSqft * toCents(prog.costPerSqft));
    return { cents, wholesaleCents, matchedWidth: widthInches, matchedHeight: heightInches, sqft, billableSqft };
  }

  const wi = roundUpIndex(prog.grid.widths, widthInches);
  if (wi < 0) {
    return fail("WIDTH_EXCEEDS_MAX", `Width ${widthInches}" exceeds the largest size (${prog.grid.widths[prog.grid.widths.length - 1]}") for ${prog.name}.`, warnings);
  }
  const matchedWidth = prog.grid.widths[wi];

  if (prog.priceAxis === "width") {
    const v = prog.grid.prices[0]?.[wi];
    if (v == null) return fail("NA_CELL", `${prog.name} is not available at width ${matchedWidth}".`, warnings);
    return { cents: toCents(v), wholesaleCents: null, matchedWidth, matchedHeight: null };
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
  return { cents: toCents(v), wholesaleCents: null, matchedWidth, matchedHeight };
}

/** Internal-only lookup for supplier cost books. This result is never returned by customer APIs. */
export function priceDealerNetDesign(input: PriceInput): DealerNetCostResult {
  const warnings: string[] = [];
  const product = getProduct(input.productId);
  if (!product) return fail("PRODUCT_NOT_FOUND", `Unknown product '${input.productId}'`, warnings);
  const resolved = resolveProgram(product, input, warnings);
  if ("ok" in resolved) return resolved;
  const program = resolved;
  if (program.priceBasis === "manual_required") {
    return fail("MANUAL_PRICE_REQUIRED", `${program.name} requires a manual source price.`, warnings);
  }
  const width = Number(input.widthInches);
  const height = Number(input.heightInches);
  if (!Number.isFinite(width) || width <= 0) {
    return fail("INVALID_DIMENSIONS", "Width must be a positive number.", warnings);
  }
  if (program.priceAxis !== "width" && (!Number.isFinite(height) || height <= 0)) {
    return fail("INVALID_DIMENSIONS", "Height must be a positive number.", warnings);
  }
  if (program.priceAxis === "sqft") {
    if (program.costPerSqft == null) {
      return fail(
        "CUSTOMER_RETAIL_UNDEFINED",
        `${program.name} has no dealer-net cost per square foot.`,
        warnings,
      );
    }
    const sqft = squareFeet(width, height);
    const billableSqft = Math.max(sqft, program.minSqft ?? 0);
    return {
      ok: true,
      productId: product.id,
      programId: program.id,
      matchedWidth: width,
      matchedHeight: height,
      sqft,
      billableSqft,
      dealerNetUnitCost: fromCents(
        Math.round(billableSqft * toCents(program.costPerSqft)),
      ),
    };
  }
  const costs = program.grid.costs;
  if (!costs?.length) {
    return fail("CUSTOMER_RETAIL_UNDEFINED", `${program.name} has no dealer-net cost grid.`, warnings);
  }
  let widthIndex = 0;
  let heightIndex = 0;
  let matchedWidth: number | null = null;
  let matchedHeight: number | null = null;
  if (program.priceAxis !== "height") {
    widthIndex = roundUpIndex(program.grid.widths, width);
    if (widthIndex < 0) {
      return fail("WIDTH_EXCEEDS_MAX", `Width ${width}" exceeds the largest source size for ${program.name}.`, warnings);
    }
    matchedWidth = program.grid.widths[widthIndex];
  }
  if (program.priceAxis !== "width") {
    heightIndex = roundUpIndex(program.grid.heights, height);
    if (heightIndex < 0) {
      return fail("HEIGHT_EXCEEDS_MAX", `Height ${height}" exceeds the largest source size for ${program.name}.`, warnings);
    }
    matchedHeight = program.grid.heights[heightIndex];
  }
  const value = program.priceAxis === "height"
    ? costs[heightIndex]?.[0]
    : program.priceAxis === "width"
      ? costs[0]?.[widthIndex]
      : costs[heightIndex]?.[widthIndex];
  if (value == null) {
    const note = program.grid.cellNotes?.[heightIndex]?.[widthIndex];
    return fail(
      "NA_CELL",
      `${program.name} is not priced at the matched source cell${note ? ` (${note})` : ""}.`,
      warnings,
    );
  }
  return {
    ok: true,
    productId: product.id,
    programId: program.id,
    matchedWidth,
    matchedHeight,
    dealerNetUnitCost: fromCents(toCents(value)),
  };
}

export function priceDesign(input: PriceInput): PriceResult {
  const warnings: string[] = [];

  if (!input.productId) return fail("PRODUCT_SELECTION_REQUIRED", "Select a manufacturer and product before pricing this line.", warnings);
  const product = getProduct(input.productId);
  if (!product) return fail("PRODUCT_NOT_FOUND", `Unknown product '${input.productId}'`, warnings);
  if (product.priceBasis === "manual_required") {
    return fail("MANUAL_PRICE_REQUIRED", `${product.name} requires a manual price because the source does not provide a complete retail grid.`, warnings);
  }
  if (product.priceBasis === "unavailable") {
    return fail("PRODUCT_UNAVAILABLE", `${product.name} has no usable product or pricing section in the source.`, warnings);
  }
  if (product.freightStatus === "unresolved") {
    warnings.push("Freight/packaging and residential or out-of-area delivery amounts are not defined; landed cost and margin are incomplete.");
  }
  if (product.freightStatus === "order_level") {
    warnings.push("Norman net freight and oversize charges are calculated at the complete quote level.");
  }

  const progOrFail = resolveProgram(product, input, warnings);
  if ("ok" in progOrFail) return progOrFail; // PriceFailure has ok:false
  const prog = progOrFail;
  if (prog.priceBasis === "manual_required") {
    return fail("MANUAL_PRICE_REQUIRED", `${prog.name} requires a manual price because the source does not provide a usable price.`, warnings);
  }
  if (product.priceBasis === "dealer_net" || prog.priceBasis === "dealer_net") {
    return fail("CUSTOMER_RETAIL_UNDEFINED", `${product.name} publishes dealer-net pricing only; customer retail is undefined.`, warnings);
  }

  const W = Number(input.widthInches);
  const H = Number(input.heightInches);
  if (!Number.isFinite(W) || W <= 0) {
    return fail("INVALID_DIMENSIONS", `Width must be a positive number (got ${input.widthInches}).`, warnings);
  }
  const needsHeight = prog.priceAxis !== "width";
  if (needsHeight && (!Number.isFinite(H) || H <= 0)) {
    return fail("INVALID_DIMENSIONS", `Height must be a positive number (got ${input.heightInches}).`, warnings);
  }
  const componentWidths = input.componentWidthsInches;
  if (componentWidths !== undefined) {
    if (
      product.id !== "roller" ||
      !Array.isArray(componentWidths) ||
      componentWidths.length < 2 ||
      componentWidths.length > 4 ||
      componentWidths.some(
        (width) => !Number.isFinite(Number(width)) || Number(width) <= 0,
      )
    ) {
      return fail(
        "CONFIGURATION_INCOMPLETE",
        "Multi-component Roller pricing requires two to four positive component order widths.",
        warnings,
      );
    }
    const componentWidthTotal = componentWidths.reduce(
      (sum, width) => sum + Number(width),
      0,
    );
    if (Math.abs(componentWidthTotal - W) > 0.000_001) {
      return fail(
        "CONFIGURATION_INCOMPLETE",
        `Roller component widths total ${componentWidthTotal}\", but the assembled order width is ${W}\".`,
        warnings,
      );
    }
  }
  const pricedWidths = componentWidths?.map(Number) ?? [W];
  const belowMinimumWidth =
    prog.minWidth == null
      ? undefined
      : pricedWidths.find((width) => width < prog.minWidth!);
  if (belowMinimumWidth !== undefined) {
    return fail("INVALID_DIMENSIONS", `Width ${belowMinimumWidth}\" is below the ${prog.minWidth}\" minimum for ${prog.name}.`, warnings);
  }
  if (needsHeight && prog.minHeight != null && H < prog.minHeight) {
    return fail("INVALID_DIMENSIONS", `Height ${H}\" is below the ${prog.minHeight}\" minimum for ${prog.name}.`, warnings);
  }

  // Hard max-dimension limits (can be tighter than the grid extent).
  const aboveMaximumWidth =
    prog.maxWidth == null
      ? undefined
      : pricedWidths.find((width) => width > prog.maxWidth!);
  if (aboveMaximumWidth !== undefined) {
    return fail("WIDTH_EXCEEDS_MAX", `Width ${aboveMaximumWidth}" exceeds the ${prog.maxWidth}" max for ${prog.name}.`, warnings);
  }
  if (needsHeight && prog.maxHeight != null && H > prog.maxHeight) {
    return fail("HEIGHT_EXCEEDS_MAX", `Height ${H}" exceeds the ${prog.maxHeight}" max for ${prog.name}.`, warnings);
  }
  if (needsHeight && prog.maxAreaSqft != null) {
    const oversizedArea = pricedWidths
      .map((width) => squareFeet(width, H))
      .find((sqft) => sqft > prog.maxAreaSqft!);
    if (oversizedArea !== undefined) {
      return fail("AREA_EXCEEDS_MAX", `${oversizedArea.toFixed(1)} sq ft exceeds the ${prog.maxAreaSqft} sq ft max for ${prog.name}.`, warnings);
    }
  }

  const surchargeIds = new Set((input.surcharges ?? []).map((item) => item.id));
  const hasVortex = surchargeIds.has("vortex_36_96") || surchargeIds.has("vortex_108_plus");
  if (hasVortex) {
    if ((H <= 96 && !surchargeIds.has("vortex_36_96")) || (H > 96 && !surchargeIds.has("vortex_108_plus"))) {
      return fail("SURCHARGE_UNKNOWN", `Select the Vortex price tier that matches the shade height.`, warnings);
    }
    if (product.id === "polar_titan_patio" && W > 197) {
      return fail("INVALID_DIMENSIONS", `Titan Vortex is not available above 197\" wide.`, warnings);
    }
    if (product.id === "polar_mega_exterior") {
      const widths = [204,216,228,240,252,264,276,288,300];
      const maxHeights = [192,184,176,168,160,152,144,136,128];
      const wi = roundUpIndex(widths, W);
      if (wi < 0 || H > maxHeights[wi]) {
        return fail("INVALID_DIMENSIONS", `Mega Vortex is not available at ${W}\" x ${H}\"; the source limit at this rounded width is ${wi < 0 ? "undefined" : `${maxHeights[wi]}\" high`}.`, warnings);
      }
    }
  }

  const baseLookups: BaseLookup[] = [];
  for (const pricedWidth of pricedWidths) {
    const lookup = lookupBaseCents(prog, pricedWidth, H, warnings);
    if ("ok" in lookup) return lookup;
    baseLookups.push(lookup);
  }
  const baseLookup = baseLookups[0];
  let configurationUnits = 1;
  for (const sel of input.surcharges ?? []) {
    const surcharge = findProductSurcharge(product, sel.id);
    if (!surcharge) continue;
    const units = Math.max(1, Math.round(Number(sel.units) || 1));
    const multiplier = surcharge.baseQuantityFromUnits === "units"
      ? units
      : surcharge.baseQuantityFromUnits === "units_plus_one"
        ? units + 1
        : surcharge.baseQuantityMultiplier ?? 1;
    configurationUnits = Math.max(configurationUnits, multiplier);
  }
  if (componentWidths && configurationUnits !== componentWidths.length) {
    return fail(
      "CONFIGURATION_INCOMPLETE",
      `The priced Roller configuration represents ${configurationUnits} shades, but ${componentWidths.length} component widths were supplied.`,
      warnings,
    );
  }
  const dealerFactor = product.dealerFactor;
  const baseCents = componentWidths
    ? baseLookups.reduce((sum, lookup) => sum + lookup.cents, 0)
    : baseLookup.cents * configurationUnits;
  const sourceWholesaleBaseCents = baseLookups.some(
    (lookup) => lookup.wholesaleCents == null,
  )
    ? null
    : componentWidths
      ? baseLookups.reduce(
          (sum, lookup) => sum + (lookup.wholesaleCents ?? 0),
          0,
        )
      : (baseLookup.wholesaleCents ?? 0) * configurationUnits;
  const wholesaleBaseCents = sourceWholesaleBaseCents ?? (dealerFactor == null ? null : Math.round(baseCents * dealerFactor));
  const matchedWidth = componentWidths
    ? Math.max(...baseLookups.map((lookup) => lookup.matchedWidth))
    : baseLookup.matchedWidth;
  const matchedHeight = baseLookup.matchedHeight;
  const actualSqft = componentWidths
    ? baseLookups.reduce((sum, lookup) => sum + (lookup.sqft ?? 0), 0) || undefined
    : baseLookup.sqft;
  const billableSqft = componentWidths
    ? baseLookups.reduce((sum, lookup) => sum + (lookup.billableSqft ?? 0), 0) || undefined
    : baseLookup.billableSqft;

  // Surcharges
  const surchargeLines: PriceLine[] = [];
  let perWindowCents = 0;
  let onceCents = 0;
  let wholesalePerWindowCents = 0;
  let wholesaleOnceCents = 0;

  for (const sel of input.surcharges ?? []) {
    const sc = findProductSurcharge(product, sel.id);
    if (!sc) {
      return fail("SURCHARGE_UNKNOWN", `Surcharge '${sel.id}' is not valid for ${product.name}.`, warnings);
    }
    let amountCents: number;
    let wholesaleAmountCents: number | null = null;
    let detail: string | undefined;
    if (sc.widthGraduated) {
      // Valance-style charge priced by window width (round up), plus a per-foot
      // overage beyond the largest listed width.
      const graduatedCents = widthGraduatedCents(sc.widthGraduated, W);
      if (graduatedCents == null) {
        return fail("NA_CELL", `${sc.name} is not available at width ${W}".`, warnings);
      }
      amountCents = graduatedCents;
      if (dealerFactor != null) wholesaleAmountCents = Math.round(amountCents * (sc.dealerFactor ?? dealerFactor));
      detail = `by width (${W}")`;
      surchargeLines.push({ id: sc.id, label: sc.name, amount: fromCents(amountCents), ...(wholesaleAmountCents == null ? {} : { wholesaleAmount: fromCents(wholesaleAmountCents) }), kind: sc.kind, detail });
      perWindowCents += amountCents;
      if (wholesaleAmountCents != null) wholesalePerWindowCents += wholesaleAmountCents;
      continue;
    }
    if (sc.heightGraduated) {
      const hi = roundUpIndex(sc.heightGraduated.heights, H);
      const heightPrice = hi < 0 ? null : sc.heightGraduated.prices[hi];
      if (heightPrice == null) return fail("NA_CELL", `${sc.name} is not available at height ${H}\".`, warnings);
      amountCents = toCents(heightPrice);
      if (dealerFactor != null) wholesaleAmountCents = Math.round(amountCents * (sc.dealerFactor ?? dealerFactor));
      detail = `by height (${H}")`;
      surchargeLines.push({ id: sc.id, label: sc.name, amount: fromCents(amountCents), ...(wholesaleAmountCents == null ? {} : { wholesaleAmount: fromCents(wholesaleAmountCents) }), kind: sc.kind, detail });
      perWindowCents += amountCents;
      if (wholesaleAmountCents != null) wholesalePerWindowCents += wholesaleAmountCents;
      continue;
    }
    if (sc.value == null) {
      // A selected surcharge with no priceable value must NOT be silently dropped
      // (that under-bills the customer). Fail loudly so it gets priced or removed.
      return fail("SURCHARGE_NO_PRICE", `Surcharge '${sc.name}' has no catalog price. Remove it or add a price before quoting.`, warnings);
    }
    if (sc.kind === "percent") {
      let percentBaseCents = baseCents;
      if (sc.percentOfSurchargeId) {
        const target = surchargeLines.find((line) => line.id === sc.percentOfSurchargeId);
        if (!target) return fail("SURCHARGE_NO_PRICE", `${sc.name} requires ${sc.percentOfSurchargeId} to be selected first.`, warnings);
        percentBaseCents = toCents(target.amount);
      }
      amountCents = Math.round((percentBaseCents * sc.value) / 100);
      if (wholesaleBaseCents != null) {
        if (sc.percentOfSurchargeId) {
          const target = surchargeLines.find((line) => line.id === sc.percentOfSurchargeId);
          wholesaleAmountCents = target?.wholesaleAmount == null ? null : Math.round((toCents(target.wholesaleAmount) * sc.value) / 100);
        } else {
          wholesaleAmountCents = Math.round((wholesaleBaseCents * sc.value) / 100);
        }
      }
      detail = `${sc.value}% of base`;
    } else if (sc.per === "sqft") {
      const sqft = actualSqft ?? (needsHeight ? squareFeet(W, H) : 0);
      amountCents = Math.round(toCents(sc.value) * sqft);
      if (wholesaleBaseCents != null) wholesaleAmountCents = Math.round(amountCents * (sc.dealerFactor ?? dealerFactor ?? 1));
      detail = `$${sc.value}/sq ft x ${sqft.toFixed(1)}`;
    } else {
      // Sides (cut-outs) and feet (additional valance foot) are billed per whole
      // unit — never a fractional count (which would yield a fractional charge).
      const automaticUnits = sc.autoUnits === "width_foot" ? Math.ceil(W / 12) : sc.autoUnits === "height_foot" ? Math.ceil(H / 12) : null;
      const units = sc.per === "once"
        ? 1
        : automaticUnits ?? Math.max(1, Math.round(Number(sel.units) || 1));
      amountCents = toCents(sc.value) * units;
      if (sc.minimumCharge != null) amountCents = Math.max(amountCents, toCents(sc.minimumCharge));
      if (wholesaleBaseCents != null) wholesaleAmountCents = Math.round(amountCents * (sc.dealerFactor ?? dealerFactor ?? 1));
      if (units > 1) detail = `${sc.value} x ${units} ${sc.per}s`;
    }
    surchargeLines.push({
      id: sc.id,
      label: sc.name,
      amount: fromCents(amountCents),
      ...(wholesaleAmountCents == null ? {} : { wholesaleAmount: fromCents(wholesaleAmountCents) }),
      kind: sc.kind,
      detail,
    });
    if (sc.per === "once") {
      onceCents += amountCents;
      if (wholesaleAmountCents != null) wholesaleOnceCents += wholesaleAmountCents;
    } else {
      perWindowCents += amountCents;
      if (wholesaleAmountCents != null) wholesalePerWindowCents += wholesaleAmountCents;
    }
  }

  // Motorization (flat per-window add-ons)
  const allowedMotorizationGroups = new Set(getMotorizationGroupsForProduct(product.id));
  for (const sel of input.motorization ?? []) {
    if (!allowedMotorizationGroups.has(sel.groupId)) {
      return fail("MOTORIZATION_UNKNOWN", `Motorization group '${sel.groupId}' is not valid for ${product.name}.`, warnings);
    }
    const group = catalog.motorization[sel.groupId];
    const opt = group?.options.find((o) => o.id === sel.optionId);
    if (!opt) {
      return fail("MOTORIZATION_UNKNOWN", `Motorization '${sel.groupId}/${sel.optionId}' not found.`, warnings);
    }
    // Per-product motor pricing (Norman 2026 Retail Guide p7): when a priceByProduct map is
    // present and this product is a key, it is authoritative (null = NA -> fail loudly, never
    // silently fall back). Products not addressed by the map keep the legacy flat `price`.
    let motorPrice: number | null = opt.price;
    if (opt.priceByProduct && product.id in opt.priceByProduct) {
      const mapped = opt.priceByProduct[product.id];
      if (mapped == null) {
        return fail("MOTORIZATION_UNKNOWN", `Motorization '${opt.name}' is not available for ${product.name}.`, warnings);
      }
      motorPrice = mapped;
    }
    if (motorPrice == null) {
      return fail("MOTORIZATION_NO_PRICE", `Motorization '${opt.name}' has no catalog price for ${product.name}.`, warnings);
    }
    const selectedUnits = Math.max(1, Math.round(Number(sel.units) || 1));
    const needsTwoMotors =
      surchargeIds.has("dual_shade") ||
      (product.id === "roman" && surchargeIds.has("day_and_night"));
    const isMotorDrive =
      (sel.groupId === "smart_motorization" && opt.id === "motor") ||
      (sel.groupId === "autowand" && opt.id === "autowand") ||
      (sel.groupId === "automate_home" && (
        opt.id.startsWith("motor_") || opt.id === "low_voltage_dc_motor"
      ));
    const units = selectedUnits * (needsTwoMotors && isMotorDrive ? 2 : 1);
    const amountCents = toCents(motorPrice) * units;
    const wholesaleAmountCents = wholesaleBaseCents == null ? null : Math.round(amountCents * (dealerFactor ?? 1));
    surchargeLines.push({
      id: `motor:${sel.groupId}:${opt.id}`,
      label: opt.name,
      amount: fromCents(amountCents),
      ...(wholesaleAmountCents == null ? {} : { wholesaleAmount: fromCents(wholesaleAmountCents) }),
      kind: "flat",
      detail: units > 1 ? `${motorPrice} x ${units}` : undefined,
    });
    perWindowCents += amountCents;
    if (wholesaleAmountCents != null) wholesalePerWindowCents += wholesaleAmountCents;
  }

  const quantity = normalizeQuantity(input.quantity);
  const unitCents = baseCents + perWindowCents;
  // Per-line discount: applies to the per-window RETAIL (base + surcharges +
  // motorization) only — never to once charges (e.g. freight) or to wholesale/cost.
  const discountPercent = Math.min(100, Math.max(0, Number(input.discountPercent) || 0));
  const discountCents = Math.round((unitCents * discountPercent) / 100);
  const discountedUnitCents = unitCents - discountCents;
  const totalCents = discountedUnitCents * quantity + onceCents;
  const wholesaleUnitCents = wholesaleBaseCents == null ? null : wholesaleBaseCents + wholesalePerWindowCents;
  const wholesaleTotalCents =
    wholesaleUnitCents == null ? null : wholesaleUnitCents * quantity + wholesaleOnceCents;

  return {
    ok: true,
    productId: product.id,
    programId: prog.id,
    programName: prog.name,
    matchedWidth,
    matchedHeight,
    ...(componentWidths
      ? { componentMatchedWidths: baseLookups.map((lookup) => lookup.matchedWidth) }
      : {}),
    sqft: actualSqft,
    billableSqft,
    base: fromCents(baseCents),
    configurationUnits,
    wholesaleBase: wholesaleBaseCents == null ? null : fromCents(wholesaleBaseCents),
    surchargeLines,
    unitPrice: fromCents(discountedUnitCents),
    discountPercent,
    discountAmount: fromCents(discountCents),
    wholesaleUnitPrice: wholesaleUnitCents == null ? null : fromCents(wholesaleUnitCents),
    quantity,
    onceTotal: fromCents(onceCents),
    total: fromCents(totalCents),
    wholesaleTotal: wholesaleTotalCents == null ? null : fromCents(wholesaleTotalCents),
    warnings,
    costStatus:
      product.freightStatus === "unresolved" || product.freightStatus === "order_level"
        ? "incomplete"
        : wholesaleTotalCents == null
          ? "unavailable"
          : "complete",
  };
}
