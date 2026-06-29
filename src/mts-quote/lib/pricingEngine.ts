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
import { findHoneycombFabricOption } from "./fabricCatalog";
import {
  getHoneycombGrid,
  getRollerFabricPriceGroup,
  getRomanFabricPriceGroup,
  getVerticalFabricPriceGroup,
} from "./quoteConstants";
import { getMtsGridKeyForCatalogProgram } from "./productColorCatalog";

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
 * Calculate price for shutters (per square foot with min 8 sqft)
 * Formula: actualSqft * retailPrice * (1 + tariff/100)
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
  // sqft = (width * height) / 144, minimum 8 sqft
  const sqft = (widthInches * heightInches) / 144;
  const actualSqft = Math.max(sqft, 8);

  // Use override if provided, otherwise use program's price
  const basePriceDollars =
    retailPriceOverride ?? (useRetail ? program.retailPrice : program.wholesalePrice);

  // Convert to cents for integer arithmetic
  const basePriceCents = Math.round(basePriceDollars * 100);
  const tariffMultiplier = 100 + program.tariff; // e.g. 108 for 8% tariff
  const priceWithTariffCents = Math.round((basePriceCents * tariffMultiplier) / 100);

  // Total in cents, then convert to dollars at the end
  const totalCents = Math.round(actualSqft * priceWithTariffCents);
  return totalCents / 100;
}

/**
 * Calculate square footage from dimensions (with minimum 8 sqft for shutters)
 */
export function calculateSqft(
  widthInches: number,
  heightInches: number,
  applyMinimum = true
): number {
  const sqft = (widthInches * heightInches) / 144;
  return applyMinimum ? Math.max(sqft, 8) : sqft;
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
}

/**
 * Detect fabric surcharge from fabric name
 */
function getFabricSurcharge(fabric?: string): number {
  if (!fabric) return 0;

  const honeycombFabric = findHoneycombFabricOption(fabric);
  if (
    honeycombFabric?.lightControl === "Room Darkening" ||
    honeycombFabric?.lightControl === "Blackout" ||
    honeycombFabric?.lightControl === "Designer RD" ||
    honeycombFabric?.lightControl === "Solus"
  ) {
    return 20;
  }

  const fabricLower = fabric.toLowerCase();
  const fabricUpper = fabric.toUpperCase();

  // Check for Room Darkening
  if (
    fabricLower.includes("room darkening") ||
    fabricUpper.includes(" RD") ||
    fabric.endsWith(" RD")
  ) {
    return 20;
  }

  // Check for Blackout
  if (fabricLower.includes("blackout") || fabricUpper.includes(" BO") || fabric.endsWith(" BO")) {
    return 20;
  }

  // Check for Sheer
  if (fabricLower.includes("sheer") || fabricLower.includes("whisper")) {
    return 20;
  }

  // Check for Solus (if applicable)
  if (fabricLower.includes("solus")) {
    return 20;
  }

  // Check for FR Essentials
  if (fabricLower.includes("fr essentials") || fabricLower.includes("flame resistant")) {
    return 20;
  }

  return 0;
}

function getCatalogGridKey(productType: string, options: PriceLookupOptions): string | null {
  return options.catalogProgramId
    ? getMtsGridKeyForCatalogProgram(productType, options.catalogProgramId)
    : null;
}

/**
 * Honeycomb Shades
 * Routes to correct grid based on cell size + fabric selection
 * Automatically applies fabric-specific surcharges
 */
export function getHoneycombPrice(options: PriceLookupOptions): number | null {
  const { width, height, cellSize, fabric } = options;
  const gridKey =
    getCatalogGridKey("Honeycomb Shades", options) ??
    (cellSize && fabric ? getHoneycombGrid(cellSize, fabric) : "general_3_4_double");

  const grid = HONEYCOMB_PRICING[gridKey as keyof typeof HONEYCOMB_PRICING];
  if (!grid) return null;

  const basePrice = lookupGridPrice(grid, width, height);
  if (basePrice === null) return null;

  // Apply fabric surcharge automatically
  const fabricSurcharge = getFabricSurcharge(fabric);
  return basePrice + fabricSurcharge;
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

  return calculateShutterPrice(programData, width, height, true, retailPriceOverride);
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

export function getProductPriceBreakdown(options: ProductPricingOptions): ProductPriceBreakdown {
  const { productType } = options;

  switch (productType) {
    case "Honeycomb Shades": {
      const gridKey =
        getCatalogGridKey(productType, options) ??
        (options.cellSize && options.fabric
          ? getHoneycombGrid(options.cellSize, options.fabric)
          : "general_3_4_double");
      const builtInAdjustment = getFabricSurcharge(options.fabric);
      return gridBreakdown(
        options,
        HONEYCOMB_PRICING[gridKey as keyof typeof HONEYCOMB_PRICING],
        gridKey,
        builtInAdjustment
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
      return {
        productType,
        price,
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
