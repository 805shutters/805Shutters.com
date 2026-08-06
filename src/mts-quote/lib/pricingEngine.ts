// Pricing engine for quote builder
// Handles price lookups and surcharge calculations

import {
  HONEYCOMB_PRICING,
  ROLLER_PRICING,
  ROMAN_PRICING,
  PERFECTSHEER_PRICING,
  VERTICAL_PRICING,
  FAUX_WOOD_PRICING,
  WOOD_BLINDS_PRICING,
  SMARTDRAPE_PRICING,
  NORMAN_SHUTTER_PROGRAMS,
  ONYX_SHUTTER_PROGRAMS,
  type PriceGrid,
  type ShutterProgram,
} from "./pricingData";
import { createShutterSquareFootGrid } from "../../lib/quote/shutter-square-foot-grid";
import {
  resolveShutterFramePricing,
  type ShutterFramePricingResolution,
} from "../../lib/quote/shutter-frame-pricing";
import {
  getHoneycombGrid,
  getRollerFabricPriceGroup,
  getRomanFabricPriceGroup,
  getVerticalFabricPriceGroup,
} from "./quoteConstants";
import { getMtsGridKeyForCatalogProgram } from "./productColorCatalog";
import { getProduct, getProgram } from "@/lib/quote/catalog";
import { isMiniBlindSizeWithinLimits } from "./miniBlindOptions";

/**
 * Round dimension UP to nearest 6"
 * Examples:
 * - 25" → 30"
 * - 30" → 30"
 * - 31" → 36"
 * - 37" → 42"
 */
export function roundUpToNearest6(inches: number): number {
  return Math.ceil(inches / 6) * 6;
}

/**
 * Convert whole + fraction to total inches
 */
export function measurementToInches(whole: number, fraction: string): number {
  const fractionMap: Record<string, number> = {
    "0": 0,
    "1/16": 0.0625,
    "1/8": 0.125,
    "3/16": 0.1875,
    "1/4": 0.25,
    "5/16": 0.3125,
    "3/8": 0.375,
    "7/16": 0.4375,
    "1/2": 0.5,
    "9/16": 0.5625,
    "5/8": 0.625,
    "11/16": 0.6875,
    "3/4": 0.75,
    "13/16": 0.8125,
    "7/8": 0.875,
    "15/16": 0.9375,
  };

  return whole + (fractionMap[fraction] || 0);
}

/**
 * Look up price in a grid
 * Automatically rounds width and height UP to the next available grid point
 */
export function lookupGridPrice(
  grid: PriceGrid,
  widthInches: number,
  heightInches: number
): number | null {
  return lookupGridPriceMatch(grid, widthInches, heightInches)?.price ?? null;
}

export interface GridPriceMatch {
  price: number;
  matchedWidth: number;
  matchedHeight: number;
}

export function lookupGridPriceMatch(
  grid: PriceGrid,
  widthInches: number,
  heightInches: number
): GridPriceMatch | null {
  const roundedWidth = grid.widths.find((width) => width >= widthInches);
  const roundedHeight = grid.heights.find((height) => height >= heightInches);

  if (roundedWidth === undefined || roundedHeight === undefined) {
    return null;
  }

  // Find indices
  const heightIndex = grid.heights.indexOf(roundedHeight);
  const widthIndex = grid.widths.indexOf(roundedWidth);

  if (heightIndex === -1 || widthIndex === -1) {
    // Out of range
    return null;
  }

  const price = grid.prices[heightIndex]?.[widthIndex];
  if (price === undefined || price <= 0) return null;

  return {
    price,
    matchedWidth: roundedWidth,
    matchedHeight: roundedHeight,
  };
}

/**
 * Calculate price for shutters by selecting the next whole-square-foot row
 * from the program's independent grid (8 sqft minimum).
 * Inputs: widthInches (number), heightInches (number), retailPriceOverride (optional $/sqft)
 * Output: total price in dollars
 *
 * Uses integer cents arithmetic for intermediate steps to avoid floating point drift.
 */
export function calculateShutterPrice(
  program: ShutterProgram,
  widthInches: number,
  heightInches: number,
  useRetail = true,
  retailPriceOverride?: number
): number {
  // Use override if provided, otherwise use program's price
  const basePriceDollars =
    retailPriceOverride ?? (useRetail ? program.retailPrice : program.wholesalePrice);
  if (basePriceDollars == null) {
    throw new Error(`${program.name} is missing a source-backed wholesale price.`);
  }

  // Tariff modifies this product's rate before its whole-square-foot row is
  // selected. No rate is borrowed from a sibling shutter product.
  const basePriceCents = Math.round(basePriceDollars * 100);
  const tariffMultiplier = 100 + program.tariff; // e.g. 108 for 8% tariff
  const priceWithTariffCents = Math.round((basePriceCents * tariffMultiplier) / 100);
  const grid = createShutterSquareFootGrid({
    manufacturer: "Shutter",
    productId: program.name,
    programId: program.name,
    minimumBillableSquareFeet: 8,
    retailRatePerSquareFoot: priceWithTariffCents / 100,
    wholesaleRatePerSquareFoot: null,
  });
  return grid.select(widthInches, heightInches).row.retailPrice!;
}

/**
 * Calculate shutter square footage. The billable value mirrors the selected
 * whole-square-foot grid row; callers can request the unrounded measured area
 * for display/audit.
 */
export function calculateSqft(
  widthInches: number,
  heightInches: number,
  applyMinimum = true
): number {
  const sqft = (widthInches * heightInches) / 144;
  return applyMinimum ? Math.max(Math.ceil(sqft), 8) : sqft;
}

/**
 * Apply percentage surcharges
 */
export function applyPercentageSurcharges(
  basePrice: number,
  surchargePercentages: number[]
): number {
  const totalPercentage = surchargePercentages.reduce((sum, pct) => sum + pct, 0);
  return basePrice * (1 + totalPercentage / 100);
}

/**
 * Apply fixed surcharges
 */
export function applyFixedSurcharges(basePrice: number, fixedAmounts: number[]): number {
  const totalFixed = fixedAmounts.reduce((sum, amt) => sum + amt, 0);
  return basePrice + totalFixed;
}

// ========================================
// PRODUCT-SPECIFIC PRICING FUNCTIONS
// ========================================

export interface PriceLookupOptions {
  width: number; // inches
  height: number; // inches
  componentWidthsInches?: readonly number[];
  priceGroup?: string;
  productLine?: string;
  fabricGroup?: string;
  shadeType?: string;
  program?: string;
  catalogProgramId?: string;
  supplier?: string;
  retailPriceOverride?: number; // optional $/sqft override for shutters
  cellSize?: string; // for honeycomb shades
  fabric?: string; // for fabric-based routing
  slatSize?: string; // for slat-specific blind size limits
  frameType?: string;
  frameSides?: string | number;
  mountType?: string;
  measurementBasis?: string;
}

function canonicalMeasurementBasis(
  value: string | undefined,
): "window_size" | "frame_to_frame" | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (normalized.startsWith("w ") || normalized.includes("window")) return "window_size";
  if (normalized.startsWith("f ") || normalized.includes("frame")) return "frame_to_frame";
  return null;
}

function canonicalMount(value: string | undefined): "inside" | "outside" | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "im" || normalized.includes("inside")) return "inside";
  if (normalized === "om" || normalized.includes("outside")) return "outside";
  return null;
}

export function resolveShutterPricingDimensions(
  options: Pick<
    PriceLookupOptions,
    | "supplier"
    | "width"
    | "height"
    | "frameType"
    | "frameSides"
    | "mountType"
    | "measurementBasis"
  >,
): ShutterFramePricingResolution | null {
  if (options.supplier !== "Norman" && options.supplier !== "Onyx") return null;
  const measurementBasis = canonicalMeasurementBasis(options.measurementBasis);
  if (!measurementBasis) return null;
  const numericSides = Number(options.frameSides);
  const frameSides = numericSides === 3 || numericSides === 4 ? numericSides : null;
  return resolveShutterFramePricing({
    manufacturer: options.supplier,
    widthInches: options.width,
    heightInches: options.height,
    measurementBasis,
    mountType: canonicalMount(options.mountType),
    frameType: options.frameType,
    frameSides,
  });
}

function getCatalogGridKey(productType: string, options: PriceLookupOptions): string | null {
  return options.catalogProgramId
    ? getMtsGridKeyForCatalogProgram(productType, options.catalogProgramId)
    : null;
}

/**
 * Honeycomb Shades
 * Routes to correct grid based on cell size + fabric selection.
 * Fabric surcharges (RD | Sheer | Solus | FR Essentials = 20% per the July
 * 2026 guide) are applied as automatic option surcharges in the quote
 * builder, not baked into the grid price (the old fixed-$20 built-in
 * adjustment was removed with the July 2026 sync).
 */
export function getHoneycombPrice(options: PriceLookupOptions): number | null {
  const { width, height, cellSize, fabric } = options;
  const gridKey =
    getCatalogGridKey("Honeycomb Shades", options) ??
    (cellSize && fabric ? getHoneycombGrid(cellSize, fabric) : "general_3_4_double");

  const grid = HONEYCOMB_PRICING[gridKey as keyof typeof HONEYCOMB_PRICING];
  if (!grid) return null;

  return lookupGridPrice(grid, width, height);
}

/**
 * Roller Shades
 * Routes to correct grid based on fabric selection
 */
export function getRollerPrice(options: PriceLookupOptions): number | null {
  const { priceGroup, fabric, width, height } = options;
  const gridKey = getCatalogGridKey("Roller Shades", options) ?? (fabric
    ? getRollerFabricPriceGroup(fabric)
    : priceGroup?.toLowerCase().replace(" ", "") || "group1");

  const grid = ROLLER_PRICING[gridKey as keyof typeof ROLLER_PRICING];

  if (!grid) return null;

  return lookupGridPrice(grid, width, height);
}

/**
 * Roman Shades
 * Routes to correct grid based on fabric selection
 */
export function getRomanPrice(options: PriceLookupOptions): number | null {
  const { priceGroup, fabric, width, height } = options;

  const gridKey = getCatalogGridKey("Roman Shades", options) ?? (fabric
    ? getRomanFabricPriceGroup(fabric)
    : priceGroup?.toLowerCase().replace(" ", "") || "group1");

  const grid = ROMAN_PRICING[gridKey as keyof typeof ROMAN_PRICING];

  if (!grid) return null;

  return lookupGridPrice(grid, width, height);
}

/**
 * Sheer Shades (PerfectSheer)
 */
export function getPerfectSheerPrice(options: PriceLookupOptions): number | null {
  const gridKey = getCatalogGridKey("Sheer Shades", options) ?? "light_filtering";
  const grid = PERFECTSHEER_PRICING[gridKey as keyof typeof PERFECTSHEER_PRICING];
  return lookupGridPrice(grid, options.width, options.height);
}

/**
 * Vertical Blinds
 * Routes to correct grid based on fabric group selection
 */
export function getVerticalPrice(options: PriceLookupOptions): number | null {
  const { fabricGroup, width, height } = options;

  const gridKey =
    getCatalogGridKey("Vertical Blinds", options) ??
    (fabricGroup ? getVerticalFabricPriceGroup(fabricGroup) : "group1");

  const grid = VERTICAL_PRICING[gridKey as keyof typeof VERTICAL_PRICING];

  if (!grid) return null;

  return lookupGridPrice(grid, width, height);
}

/**
 * Faux Wood Blinds
 */
export function getFauxWoodPrice(options: PriceLookupOptions): number | null {
  const { productLine = "SmartPrivacy", width, height } = options;

  if (options.supplier?.trim().toLowerCase() === "lotus") {
    if (!options.catalogProgramId) return null;
    return catalogGridBreakdown(
      { ...options, productType: "Faux Wood Blinds" },
      "lotus_faux_wood_blinds",
      options.catalogProgramId,
    ).price;
  }

  const gridKey =
    getCatalogGridKey("Faux Wood Blinds", options) ??
    (productLine.toLowerCase() === "smartprivacy" ? "smartPrivacy" : "ultimate");
  const grid = FAUX_WOOD_PRICING[gridKey as keyof typeof FAUX_WOOD_PRICING];

  if (!grid) return null;

  return lookupGridPrice(grid, width, height);
}

/**
 * Wood Blinds
 */
export function getWoodBlindPrice(options: PriceLookupOptions): number | null {
  const gridKey = getCatalogGridKey("Wood Blinds", options) ?? "ultimate";
  const grid = WOOD_BLINDS_PRICING[gridKey as keyof typeof WOOD_BLINDS_PRICING];
  return lookupGridPrice(grid, options.width, options.height);
}

/**
 * Smart Drapes
 */
export function getSmartDrapePrice(options: PriceLookupOptions): number | null {
  const gridKey = getCatalogGridKey("Smart Drapes", options) ?? "light_filtering";
  const grid = SMARTDRAPE_PRICING[gridKey as keyof typeof SMARTDRAPE_PRICING];
  return lookupGridPrice(grid, options.width, options.height);
}

/**
 * Shutters (Norman or Onyx)
 */
export function getShutterPrice(options: PriceLookupOptions): number | null {
  const { supplier, program, width, height, retailPriceOverride } = options;

  if (!supplier || !program) return null;

  let programData: ShutterProgram | undefined;

  if (supplier === "Norman") {
    programData = NORMAN_SHUTTER_PROGRAMS.find((p) => p.name === program);
  } else if (supplier === "Onyx") {
    programData = ONYX_SHUTTER_PROGRAMS.find((p) => p.name === program);
  }

  if (!programData) return null;

  const framePricing = resolveShutterPricingDimensions(options);
  if (framePricing && !framePricing.supported) return null;
  return calculateShutterPrice(
    programData,
    framePricing?.pricingWidthInches ?? width,
    framePricing?.pricingHeightInches ?? height,
    true,
    retailPriceOverride,
  );
}

// ========================================
// UNIFIED PRICING FUNCTION
// ========================================

export interface ProductPricingOptions extends PriceLookupOptions {
  productType: string;
}

export interface ProductPriceBreakdown {
  productType: string;
  price: number | null;
  gridPrice?: number;
  gridKey?: string;
  matchedWidth?: number;
  matchedHeight?: number;
  builtInAdjustment?: number;
  pricingWidth?: number;
  pricingHeight?: number;
  actualSquareFeet?: number;
  billableSquareFeet?: number;
  pricingMethod: "grid" | "square-foot" | "none";
}

function gridBreakdown(
  options: ProductPricingOptions,
  grid: PriceGrid | undefined,
  gridKey: string,
  builtInAdjustment = 0
): ProductPriceBreakdown {
  if (!grid) {
    return {
      productType: options.productType,
      price: null,
      gridKey,
      pricingMethod: "none",
    };
  }

  const match = lookupGridPriceMatch(grid, options.width, options.height);
  if (!match) {
    return {
      productType: options.productType,
      price: null,
      gridKey,
      pricingMethod: "grid",
    };
  }

  const price = match.price + builtInAdjustment;
  return {
    productType: options.productType,
    price,
    gridPrice: match.price,
    gridKey,
    matchedWidth: match.matchedWidth,
    matchedHeight: match.matchedHeight,
    builtInAdjustment,
    pricingMethod: "grid",
  };
}

function catalogGridBreakdown(
  options: ProductPricingOptions,
  productId: string,
  programId: string
): ProductPriceBreakdown {
  const product = getProduct(productId);
  const program = product ? getProgram(product, programId) : undefined;
  const gridKey = getMtsGridKeyForCatalogProgram(options.productType, programId) ?? programId;

  if (!program || program.priceAxis !== "wh") {
    return { productType: options.productType, price: null, gridKey, pricingMethod: "none" };
  }

  const widthIndex = program.grid.widths.findIndex((width) => width >= options.width);
  const heightIndex = program.grid.heights.findIndex((height) => height >= options.height);
  if (widthIndex < 0 || heightIndex < 0) {
    return { productType: options.productType, price: null, gridKey, pricingMethod: "grid" };
  }

  const price = program.grid.prices[heightIndex]?.[widthIndex];
  if (price === null || price === undefined || price <= 0) {
    return { productType: options.productType, price: null, gridKey, pricingMethod: "grid" };
  }

  return {
    productType: options.productType,
    price,
    gridPrice: price,
    gridKey,
    matchedWidth: program.grid.widths[widthIndex],
    matchedHeight: program.grid.heights[heightIndex],
    pricingMethod: "grid",
  };
}

function catalogComponentGridBreakdown(
  options: ProductPricingOptions,
  productId: string,
  programId: string,
): ProductPriceBreakdown {
  const componentWidths = options.componentWidthsInches?.filter(
    (width) => Number.isFinite(width) && width > 0,
  );
  if (!componentWidths?.length) {
    return catalogGridBreakdown(options, productId, programId);
  }

  const components = componentWidths.map((width) =>
    catalogGridBreakdown(
      { ...options, width, componentWidthsInches: undefined },
      productId,
      programId,
    ),
  );
  if (components.some((component) => component.price === null)) {
    return {
      productType: options.productType,
      price: null,
      gridKey: programId,
      pricingMethod: "grid",
    };
  }

  const price =
    Math.round(
      components.reduce((sum, component) => sum + (component.price ?? 0), 0) * 100,
    ) / 100;
  const matchedWidths = components.flatMap((component) =>
    component.matchedWidth === undefined ? [] : [component.matchedWidth],
  );
  const matchedHeights = components.flatMap((component) =>
    component.matchedHeight === undefined ? [] : [component.matchedHeight],
  );
  return {
    productType: options.productType,
    price,
    gridPrice: price,
    gridKey: programId,
    ...(matchedWidths.length ? { matchedWidth: Math.max(...matchedWidths) } : {}),
    ...(matchedHeights.length ? { matchedHeight: Math.max(...matchedHeights) } : {}),
    pricingMethod: "grid",
  };
}

export function getProductPriceBreakdown(options: ProductPricingOptions): ProductPriceBreakdown {
  const { productType } = options;

  switch (productType) {
    case "Honeycomb Shades": {
      const gridKey =
        getCatalogGridKey(productType, options) ??
        (options.cellSize && options.fabric
          ? getHoneycombGrid(options.cellSize, options.fabric)
          : "general_3_4_double");
      // Fabric surcharges are automatic option surcharges (20% per the July
      // 2026 guide) — no built-in grid adjustment.
      return gridBreakdown(
        options,
        HONEYCOMB_PRICING[gridKey as keyof typeof HONEYCOMB_PRICING],
        gridKey
      );
    }
    case "Roller Shades": {
      const gridKey = getCatalogGridKey(productType, options) ?? (options.fabric
        ? getRollerFabricPriceGroup(options.fabric)
        : options.priceGroup?.toLowerCase().replace(" ", "") || "group1");
      return gridBreakdown(
        options,
        ROLLER_PRICING[gridKey as keyof typeof ROLLER_PRICING],
        gridKey
      );
    }
    case "Roman Shades": {
      const gridKey = getCatalogGridKey(productType, options) ?? (options.fabric
        ? getRomanFabricPriceGroup(options.fabric)
        : options.priceGroup?.toLowerCase().replace(" ", "") || "group1");
      return gridBreakdown(options, ROMAN_PRICING[gridKey as keyof typeof ROMAN_PRICING], gridKey);
    }
    case "Sheer Shades": {
      const gridKey = getCatalogGridKey(productType, options) ?? "light_filtering";
      return gridBreakdown(
        options,
        PERFECTSHEER_PRICING[gridKey as keyof typeof PERFECTSHEER_PRICING],
        gridKey
      );
    }
    case "Mini Blinds": {
      if (!isMiniBlindSizeWithinLimits(options.width, options.height, options.slatSize)) {
        return {
          productType,
          price: null,
          gridKey: "citylights_aluminum",
          pricingMethod: "grid",
        };
      }
      return catalogGridBreakdown(
        options,
        "citylights_aluminum",
        options.catalogProgramId || "citylights_aluminum_1in_slats_cordless_pgusa"
      );
    }
    case "Vertical Blinds": {
      const gridKey =
        getCatalogGridKey(productType, options) ??
        (options.fabricGroup ? getVerticalFabricPriceGroup(options.fabricGroup) : "group1");
      return gridBreakdown(
        options,
        VERTICAL_PRICING[gridKey as keyof typeof VERTICAL_PRICING],
        gridKey
      );
    }
    case "Faux Wood Blinds": {
      if (options.supplier?.trim().toLowerCase() === "lotus") {
        return options.catalogProgramId
          ? catalogComponentGridBreakdown(
              options,
              "lotus_faux_wood_blinds",
              options.catalogProgramId,
            )
          : {
              productType,
              price: null,
              gridKey: "PROGRAM_UNKNOWN",
              pricingMethod: "none",
            };
      }
      const gridKey =
        getCatalogGridKey(productType, options) ??
        (options.productLine?.toLowerCase() === "ultimate" ? "ultimate" : "smartPrivacy");
      return gridBreakdown(
        options,
        FAUX_WOOD_PRICING[gridKey as keyof typeof FAUX_WOOD_PRICING],
        gridKey
      );
    }
    case "Wood Blinds": {
      const gridKey = getCatalogGridKey(productType, options) ?? "ultimate";
      return gridBreakdown(
        options,
        WOOD_BLINDS_PRICING[gridKey as keyof typeof WOOD_BLINDS_PRICING],
        gridKey
      );
    }
    case "Smart Drapes": {
      const gridKey = getCatalogGridKey(productType, options) ?? "light_filtering";
      return gridBreakdown(
        options,
        SMARTDRAPE_PRICING[gridKey as keyof typeof SMARTDRAPE_PRICING],
        gridKey
      );
    }
    case "Shutters": {
      const price = getShutterPrice(options);
      const framePricing = resolveShutterPricingDimensions(options);
      const pricingWidth = framePricing?.pricingWidthInches ?? options.width;
      const pricingHeight = framePricing?.pricingHeightInches ?? options.height;
      const actualSquareFeet =
        price === null ? undefined : calculateSqft(pricingWidth, pricingHeight, false);
      const billableSquareFeet =
        price === null ? undefined : calculateSqft(pricingWidth, pricingHeight, true);
      return {
        productType,
        price,
        ...(price !== null
          ? {
              pricingWidth,
              pricingHeight,
              actualSquareFeet,
              billableSquareFeet,
            }
          : {}),
        pricingMethod: price === null ? "none" : "square-foot",
      };
    }
    default:
      return {
        productType,
        price: null,
        pricingMethod: "none",
      };
  }
}

/**
 * Get base price for any product type
 */
export function getProductPrice(options: ProductPricingOptions): number | null {
  return getProductPriceBreakdown(options).price;
}
