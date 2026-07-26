import { getProduct, getProgram } from "./catalog";
import type {
  CatalogPriceBasis,
  CatalogProduct,
  CatalogProgram,
} from "./catalog/types";
import {
  QUOTE_V2_PRODUCT_STATUS,
  type ProductCatalogStatus,
} from "@/lib/quote-v2/catalog";
import {
  getSourceManifestEntry,
  type SourceManifestEntry,
} from "@/lib/quote-v2/source-manifest";
import {
  wholesaleAuthorityFindings,
  type WholesaleAuthorityFinding,
} from "./lotus-authority";

export type WholesaleCostBasis =
  | "dealer_net_grid"
  | "dealer_net_sqft"
  | "dealer_factor";

export type WholesaleProvenanceStatus =
  | "complete"
  | "source_conflict"
  | "effective_date_missing"
  | "source_missing"
  | "provisional";

export type WholesaleLedgerSource = Readonly<{
  sourceId: string;
  manufacturer: string;
  fileName: string;
  title: string;
  revision: string;
  effectiveDate: string | null;
  effectiveDateEvidence: string;
  sha256: string;
  pages: readonly number[];
}>;

export type WholesaleCostSuccess = Readonly<{
  ok: true;
  productId: string;
  productName: string;
  manufacturer: string;
  programId: string;
  programName: string;
  basis: WholesaleCostBasis;
  dealerFactor: number | null;
  measuredWidth: number;
  measuredHeight: number;
  matchedWidth: number;
  matchedHeight: number | null;
  sqft?: number;
  billableSqft?: number;
  wholesaleBase: number;
  quantity: number;
  wholesaleUnitCost: number;
  wholesaleTotal: number;
  source: WholesaleLedgerSource | null;
  provenanceStatus: WholesaleProvenanceStatus;
  productStatus: ProductCatalogStatus;
  customerPriceEligible: boolean;
  authorityFindings?: readonly WholesaleAuthorityFinding[];
}>;

export type WholesaleCostFailure = Readonly<{
  ok: false;
  code:
    | "PRODUCT_NOT_FOUND"
    | "PROGRAM_NOT_RESOLVED"
    | "MANUAL_PRICE_REQUIRED"
    | "PRODUCT_UNAVAILABLE"
    | "INVALID_DIMENSIONS"
    | "INVALID_QUANTITY"
    | "WIDTH_EXCEEDS_MAX"
    | "HEIGHT_EXCEEDS_MAX"
    | "AREA_EXCEEDS_MAX"
    | "NA_CELL"
    | "COST_NOT_VERIFIED";
  error: string;
}>;

export type WholesaleCostResult = WholesaleCostSuccess | WholesaleCostFailure;

export type WholesaleLedgerProgramStatus = Readonly<{
  basis: WholesaleCostBasis | null;
  costCellCount: number;
  unavailableCellCount: number;
  totalCellCount: number;
  coverage: "complete" | "partial" | "missing";
  provenanceStatus: WholesaleProvenanceStatus;
  source: WholesaleLedgerSource | null;
  productStatus: ProductCatalogStatus;
  customerPriceEligible: boolean;
  authorityFindings: readonly WholesaleAuthorityFinding[];
}>;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function effectiveBasis(
  product: CatalogProduct,
  program: CatalogProgram,
): CatalogPriceBasis {
  return program.priceBasis ?? product.priceBasis ?? "suggested_retail";
}

function fallbackSourceId(productId: string): string | null {
  if (productId.startsWith("lotus_")) return "lotus-west-a26-v1";
  if (productId.startsWith("polar_")) {
    return "polar-shades-dealer-book-current-2026-07-18";
  }
  if (productId === "onyx_shutters") {
    return "onyx-reference-guide-2020-2021";
  }
  if (productId === "norman_shutters") return null;
  return "norman-retail-guide-2026-07";
}

function sourceEntry(
  product: CatalogProduct,
  program: CatalogProgram,
): SourceManifestEntry | null {
  const sourceId = program.sourceId ?? fallbackSourceId(product.id);
  if (!sourceId) return null;
  try {
    return getSourceManifestEntry(sourceId);
  } catch {
    return null;
  }
}

function ledgerSource(
  product: CatalogProduct,
  program: CatalogProgram,
): WholesaleLedgerSource | null {
  const source = sourceEntry(product, program);
  if (!source) return null;
  return {
    sourceId: source.id,
    manufacturer: source.manufacturer,
    fileName: source.fileName,
    title: source.title,
    revision: source.revision,
    effectiveDate: source.effectiveDate,
    effectiveDateEvidence: source.effectiveDateEvidence,
    sha256: source.sha256,
    pages: program.sourcePages ?? product.pages ?? [],
  };
}

function provenanceStatus(
  product: CatalogProduct,
  program: CatalogProgram,
  source: WholesaleLedgerSource | null,
): WholesaleProvenanceStatus {
  if (wholesaleAuthorityFindings(product.id, program.id).length > 0) {
    return "source_conflict";
  }
  if (product.provisional === true) return "provisional";
  if (!source) return "source_missing";
  return source.effectiveDate ? "complete" : "effective_date_missing";
}

function productStatus(productId: string): ProductCatalogStatus {
  return QUOTE_V2_PRODUCT_STATUS[productId] ?? "manual_quote_required";
}

function customerPriceEligible(
  product: CatalogProduct,
  program: CatalogProgram,
): boolean {
  const status = productStatus(product.id);
  const basis = effectiveBasis(product, program);
  const findings = wholesaleAuthorityFindings(product.id, program.id);
  return (
    (status === "complete" || status === "documented_limited") &&
    basis === "suggested_retail" &&
    product.customerRetailStatus !== "unverified" &&
    product.provisional !== true &&
    product.freightStatus !== "unresolved" &&
    findings.length === 0
  );
}

export function canonicalWholesaleCostPerSqft(
  product: CatalogProduct,
  program: CatalogProgram,
): { amount: number; basis: WholesaleCostBasis } | null {
  if (program.costPerSqft != null && Number.isFinite(program.costPerSqft)) {
    return {
      amount: roundMoney(program.costPerSqft),
      basis: "dealer_net_sqft",
    };
  }
  if (
    product.dealerFactor != null &&
    Number.isFinite(product.dealerFactor) &&
    program.pricePerSqft != null &&
    Number.isFinite(program.pricePerSqft)
  ) {
    return {
      amount: roundMoney(program.pricePerSqft * product.dealerFactor),
      basis: "dealer_factor",
    };
  }
  return null;
}

export function canonicalWholesaleCostAtCell(
  product: CatalogProduct,
  program: CatalogProgram,
  rowIndex: number,
  columnIndex: number,
): { amount: number; basis: WholesaleCostBasis } | null {
  const explicitCost = program.grid.costs?.[rowIndex]?.[columnIndex];
  if (explicitCost != null && Number.isFinite(explicitCost)) {
    return {
      amount: roundMoney(explicitCost),
      basis: "dealer_net_grid",
    };
  }
  const retail = program.grid.prices[rowIndex]?.[columnIndex];
  if (
    retail != null &&
    Number.isFinite(retail) &&
    product.dealerFactor != null &&
    Number.isFinite(product.dealerFactor)
  ) {
    return {
      amount: roundMoney(retail * product.dealerFactor),
      basis: "dealer_factor",
    };
  }
  return null;
}

export function canonicalWholesaleCostGrid(
  product: CatalogProduct,
  program: CatalogProgram,
): Array<Array<number | null>> {
  return program.grid.prices.map((row, rowIndex) =>
    row.map(
      (_cell, columnIndex) =>
        canonicalWholesaleCostAtCell(product, program, rowIndex, columnIndex)
          ?.amount ?? null,
    ),
  );
}

export function wholesaleLedgerProgramStatus(
  product: CatalogProduct,
  program: CatalogProgram,
): WholesaleLedgerProgramStatus {
  const source = ledgerSource(product, program);
  const authorityFindings = wholesaleAuthorityFindings(product.id, program.id);
  const squareFootCost = canonicalWholesaleCostPerSqft(product, program);
  const gridCosts = canonicalWholesaleCostGrid(product, program);
  const cells = gridCosts.flat();
  const totalCellCount =
    program.priceAxis === "sqft" ? 1 : cells.length;
  const costCellCount =
    program.priceAxis === "sqft"
      ? Number(squareFootCost !== null)
      : cells.filter((value) => value !== null).length;
  const unavailableCellCount = Math.max(0, totalCellCount - costCellCount);
  const basis =
    squareFootCost?.basis ??
    program.grid.prices.flatMap((row, rowIndex) =>
      row.map((_cell, columnIndex) =>
        canonicalWholesaleCostAtCell(product, program, rowIndex, columnIndex),
      ),
    ).find((value) => value !== null)?.basis ??
    null;

  return {
    basis,
    costCellCount,
    unavailableCellCount,
    totalCellCount,
    coverage:
      costCellCount === 0
        ? "missing"
        : unavailableCellCount === 0
          ? "complete"
          : "partial",
    provenanceStatus: provenanceStatus(product, program, source),
    source,
    productStatus: productStatus(product.id),
    customerPriceEligible: customerPriceEligible(product, program),
    authorityFindings,
  };
}

function firstIndexAtOrAbove(values: readonly number[], requested: number): number {
  return values.findIndex((value) => value >= requested);
}

function fail(
  code: WholesaleCostFailure["code"],
  error: string,
): WholesaleCostFailure {
  return { ok: false, code, error };
}

export function lookupWholesaleLedgerCost(input: Readonly<{
  productId: string;
  programId: string;
  widthInches: number;
  heightInches: number;
  quantity?: number;
}>): WholesaleCostResult {
  const product = getProduct(input.productId);
  if (!product) {
    return fail("PRODUCT_NOT_FOUND", `Unknown product '${input.productId}'.`);
  }
  const program = getProgram(product, input.programId);
  if (!program) {
    return fail(
      "PROGRAM_NOT_RESOLVED",
      `Program '${input.programId}' is not part of ${product.name}.`,
    );
  }
  const basis = effectiveBasis(product, program);
  if (basis === "manual_required") {
    return fail(
      "MANUAL_PRICE_REQUIRED",
      `${program.name} requires an authoritative manual source cost.`,
    );
  }
  if (basis === "unavailable") {
    return fail(
      "PRODUCT_UNAVAILABLE",
      `${program.name} is unavailable in the pinned source.`,
    );
  }

  const width = Number(input.widthInches);
  const height = Number(input.heightInches);
  if (!Number.isFinite(width) || width <= 0) {
    return fail("INVALID_DIMENSIONS", "Width must be a positive number.");
  }
  if (!Number.isFinite(height) || height <= 0) {
    return fail("INVALID_DIMENSIONS", "Height must be a positive number.");
  }
  if (program.minWidth != null && width < program.minWidth) {
    return fail(
      "INVALID_DIMENSIONS",
      `Width ${width}" is below the ${program.minWidth}" minimum for ${program.name}.`,
    );
  }
  if (program.minHeight != null && height < program.minHeight) {
    return fail(
      "INVALID_DIMENSIONS",
      `Height ${height}" is below the ${program.minHeight}" minimum for ${program.name}.`,
    );
  }
  if (program.maxWidth != null && width > program.maxWidth) {
    return fail(
      "WIDTH_EXCEEDS_MAX",
      `Width ${width}" exceeds the ${program.maxWidth}" maximum for ${program.name}.`,
    );
  }
  if (program.maxHeight != null && height > program.maxHeight) {
    return fail(
      "HEIGHT_EXCEEDS_MAX",
      `Height ${height}" exceeds the ${program.maxHeight}" maximum for ${program.name}.`,
    );
  }
  const sqft = program.priceAxis === "sqft" ? (width * height) / 144 : undefined;
  if (
    sqft !== undefined &&
    program.maxAreaSqft != null &&
    sqft > program.maxAreaSqft
  ) {
    return fail(
      "AREA_EXCEEDS_MAX",
      `${sqft.toFixed(1)} sq ft exceeds the ${program.maxAreaSqft} sq ft maximum for ${program.name}.`,
    );
  }

  let matchedWidth = width;
  let matchedHeight: number | null =
    program.priceAxis === "width" ? null : height;
  let wholesaleBase: number;
  let costBasis: WholesaleCostBasis;
  let billableSqft: number | undefined;

  if (program.priceAxis === "sqft") {
    const cost = canonicalWholesaleCostPerSqft(product, program);
    if (!cost) {
      return fail(
        "COST_NOT_VERIFIED",
        `${program.name} has no canonical wholesale cost per square foot.`,
      );
    }
    billableSqft = Math.max(sqft ?? 0, program.minSqft ?? 0);
    wholesaleBase = roundMoney(billableSqft * cost.amount);
    costBasis = cost.basis;
  } else {
    const widthIndex =
      program.priceAxis === "height"
        ? 0
        : firstIndexAtOrAbove(program.grid.widths, width);
    const heightIndex =
      program.priceAxis === "width"
        ? 0
        : firstIndexAtOrAbove(program.grid.heights, height);
    if (widthIndex < 0) {
      return fail(
        "WIDTH_EXCEEDS_MAX",
        `Width ${width}" exceeds the largest source cell for ${program.name}.`,
      );
    }
    if (heightIndex < 0) {
      return fail(
        "HEIGHT_EXCEEDS_MAX",
        `Height ${height}" exceeds the largest source cell for ${program.name}.`,
      );
    }
    matchedWidth =
      program.priceAxis === "height"
        ? width
        : program.grid.widths[widthIndex];
    matchedHeight =
      program.priceAxis === "width"
        ? null
        : program.grid.heights[heightIndex];
    const cost = canonicalWholesaleCostAtCell(
      product,
      program,
      heightIndex,
      widthIndex,
    );
    if (!cost) {
      const note = program.grid.cellNotes?.[heightIndex]?.[widthIndex];
      return fail(
        "NA_CELL",
        `${program.name} has no wholesale cost at the matched source cell${note ? ` (${note})` : ""}.`,
      );
    }
    wholesaleBase = cost.amount;
    costBasis = cost.basis;
  }

  const quantity = Number(input.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return fail("INVALID_QUANTITY", "Quantity must be a positive whole number.");
  }
  const source = ledgerSource(product, program);
  const authorityFindings = wholesaleAuthorityFindings(product.id, program.id);
  return {
    ok: true,
    productId: product.id,
    productName: product.name,
    manufacturer: product.manufacturer ?? "Unknown manufacturer",
    programId: program.id,
    programName: program.name,
    basis: costBasis,
    dealerFactor: product.dealerFactor ?? null,
    measuredWidth: width,
    measuredHeight: height,
    matchedWidth,
    matchedHeight,
    ...(sqft === undefined ? {} : { sqft }),
    ...(billableSqft === undefined ? {} : { billableSqft }),
    wholesaleBase,
    quantity,
    wholesaleUnitCost: wholesaleBase,
    wholesaleTotal: roundMoney(wholesaleBase * quantity),
    source,
    provenanceStatus: provenanceStatus(product, program, source),
    productStatus: productStatus(product.id),
    customerPriceEligible: customerPriceEligible(product, program),
    authorityFindings,
  };
}
