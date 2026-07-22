import { describe, expect, it } from "vitest";
import { listProducts } from "@/lib/quote/catalog";
import type { CatalogProduct, CatalogProgram } from "@/lib/quote/catalog/types";
import { priceDealerNetDesign, priceDesign } from "@/lib/quote/pricing";
import { quoteLabProductType } from "./builder";
import { compareManufacturers } from "./manufacturer-comparison";

const products = listProducts();
const sharedCategories = new Set(
  [...new Set(products.map((product) => quoteLabProductType(product.id)).filter(Boolean))]
    .filter((category) => new Set(
      products
        .filter((product) => quoteLabProductType(product.id) === category)
        .map((product) => product.manufacturer ?? "Norman"),
    ).size > 1),
);
const sharedProducts = products.filter((product) => sharedCategories.has(quoteLabProductType(product.id)));

function isDealerNet(product: CatalogProduct, program: CatalogProgram): boolean {
  return product.priceBasis === "dealer_net" || program.priceBasis === "dealer_net";
}

function matrixFor(product: CatalogProduct, program: CatalogProgram): (number | null)[][] {
  return isDealerNet(product, program) ? (program.grid.costs ?? []) : program.grid.prices;
}

function dimensionsAt(program: CatalogProgram, rowIndex: number, columnIndex: number) {
  if (program.priceAxis === "height") {
    return { widthInches: 1, heightInches: program.grid.heights[rowIndex] };
  }
  if (program.priceAxis === "width") {
    return { widthInches: program.grid.widths[columnIndex], heightInches: 48 };
  }
  return {
    widthInches: program.grid.widths[columnIndex],
    heightInches: program.grid.heights[rowIndex],
  };
}

function directPrice(product: CatalogProduct, program: CatalogProgram, widthInches: number, heightInches: number, quantity = 1) {
  const input = { productId: product.id, programId: program.id, widthInches, heightInches, quantity };
  return isDealerNet(product, program) ? priceDealerNetDesign(input) : priceDesign(input);
}

function firstPricedCell(product: CatalogProduct, program: CatalogProgram) {
  const matrix = matrixFor(product, program);
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < matrix[rowIndex].length; columnIndex += 1) {
      if (matrix[rowIndex][columnIndex] != null) return { rowIndex, columnIndex };
    }
  }
  return null;
}

describe("exhaustive shared-manufacturer pricing audit", () => {
  it("matches every priced source grid cell and blocks every null cell", () => {
    let pricedCells = 0;
    let blockedCells = 0;
    let ruleBlockedCells = 0;

    for (const product of sharedProducts) {
      for (const program of product.programs) {
        if (program.priceAxis === "sqft") continue;
        const matrix = matrixFor(product, program);
        for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
          for (let columnIndex = 0; columnIndex < matrix[rowIndex].length; columnIndex += 1) {
            const sourceAmount = matrix[rowIndex][columnIndex];
            const dimensions = dimensionsAt(program, rowIndex, columnIndex);
            const result = directPrice(product, program, dimensions.widthInches, dimensions.heightInches, 3);
            const label = `${product.id}/${program.id} cell ${rowIndex},${columnIndex}`;

            if (sourceAmount == null) {
              blockedCells += 1;
              expect(result.ok, `${label} must remain blocked`).toBe(false);
              continue;
            }

            pricedCells += 1;
            const areaSqft = (dimensions.widthInches * dimensions.heightInches) / 144;
            const blockedByPublishedRule =
              (program.minWidth != null && dimensions.widthInches < program.minWidth) ||
              (program.minHeight != null && dimensions.heightInches < program.minHeight) ||
              (program.maxWidth != null && dimensions.widthInches > program.maxWidth) ||
              (program.maxHeight != null && dimensions.heightInches > program.maxHeight) ||
              (program.maxAreaSqft != null && areaSqft > program.maxAreaSqft);
            if (blockedByPublishedRule) {
              ruleBlockedCells += 1;
              expect(result.ok, `${label} must be blocked by its published size rule`).toBe(false);
              continue;
            }
            expect(result.ok, `${label} must price`).toBe(true);
            if (!result.ok) continue;
            if ("dealerNetUnitCost" in result) {
              expect(result.dealerNetUnitCost, label).toBe(sourceAmount);
              expect(result.matchedWidth, label).toBe(program.priceAxis === "height" ? null : dimensions.widthInches);
              expect(result.matchedHeight, label).toBe(program.priceAxis === "width" ? null : dimensions.heightInches);
            } else if ("base" in result) {
              expect(result.base, label).toBe(sourceAmount);
              expect(result.unitPrice, label).toBe(sourceAmount);
              expect(result.total, label).toBe(Math.round(sourceAmount * 3 * 100) / 100);
              if (product.dealerFactor != null) {
                const expectedDealerUnit = Math.round(Math.round(sourceAmount * 100) * product.dealerFactor) / 100;
                expect(result.wholesaleUnitPrice, `${label} dealer factor`).toBe(expectedDealerUnit);
                expect(result.wholesaleTotal, `${label} dealer quantity`).toBe(Math.round(expectedDealerUnit * 3 * 100) / 100);
              }
            }
          }
        }
      }
    }

    expect(pricedCells).toBeGreaterThan(13_000);
    expect(blockedCells).toBeGreaterThanOrEqual(70);
    expect(ruleBlockedCells).toBeGreaterThan(0);
  });

  it("rounds between-grid measurements upward for every applicable priced cell", () => {
    let roundedCells = 0;

    for (const product of sharedProducts) {
      for (const program of product.programs) {
        if (program.priceAxis === "sqft") continue;
        const matrix = matrixFor(product, program);
        for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
          for (let columnIndex = 0; columnIndex < matrix[rowIndex].length; columnIndex += 1) {
            const sourceAmount = matrix[rowIndex][columnIndex];
            if (sourceAmount == null) continue;
            if (program.priceAxis !== "height" && columnIndex === 0) continue;
            if (program.priceAxis !== "width" && rowIndex === 0) continue;

            const exact = dimensionsAt(program, rowIndex, columnIndex);
            const widthInches = program.priceAxis === "height"
              ? exact.widthInches
              : program.grid.widths[columnIndex - 1] + 0.01;
            const heightInches = program.priceAxis === "width"
              ? exact.heightInches
              : program.grid.heights[rowIndex - 1] + 0.01;
            const result = directPrice(product, program, widthInches, heightInches);
            const label = `${product.id}/${program.id} rounds to ${rowIndex},${columnIndex}`;
            const areaSqft = (widthInches * heightInches) / 144;
            if (
              (program.minWidth != null && widthInches < program.minWidth) ||
              (program.minHeight != null && heightInches < program.minHeight) ||
              (program.maxWidth != null && widthInches > program.maxWidth) ||
              (program.maxHeight != null && heightInches > program.maxHeight) ||
              (program.maxAreaSqft != null && areaSqft > program.maxAreaSqft)
            ) {
              expect(result.ok, `${label} must remain blocked by its size rule`).toBe(false);
              continue;
            }
            expect(result.ok, label).toBe(true);
            if (!result.ok) continue;
            roundedCells += 1;
            if ("dealerNetUnitCost" in result) {
              expect(result.dealerNetUnitCost, label).toBe(sourceAmount);
            } else if ("base" in result) {
              expect(result.base, label).toBe(sourceAmount);
            }
            expect(result.matchedWidth, label).toBe(program.priceAxis === "height" ? null : exact.widthInches);
            expect(result.matchedHeight, label).toBe(program.priceAxis === "width" ? null : exact.heightInches);
          }
        }
      }
    }

    expect(roundedCells).toBeGreaterThan(9_000);
  });

  it("verifies square-foot programs, minimum billable area, and large quantities", () => {
    let sqftPrograms = 0;
    for (const product of sharedProducts) {
      for (const program of product.programs.filter((candidate) => candidate.priceAxis === "sqft")) {
        sqftPrograms += 1;
        for (const [widthInches, heightInches] of [[12, 12], [36, 60], [96, 96]]) {
          const dealerNet = isDealerNet(product, program);
          const result = dealerNet
            ? priceDealerNetDesign({ productId: product.id, programId: program.id, widthInches, heightInches, quantity: 40 })
            : priceDesign({ productId: product.id, programId: program.id, widthInches, heightInches, quantity: 40 });
          expect(result.ok, `${product.id}/${program.id} sqft`).toBe(true);
          if (!result.ok) continue;
          const sqft = (widthInches * heightInches) / 144;
          const billableSqft = Math.max(sqft, program.minSqft ?? 0);
          if ("dealerNetUnitCost" in result) {
            const expectedCost = Math.round(billableSqft * Math.round((program.costPerSqft ?? 0) * 100)) / 100;
            expect(result.dealerNetUnitCost).toBe(expectedCost);
          } else {
            const expectedUnit = Math.round(billableSqft * Math.round((program.pricePerSqft ?? 0) * 100)) / 100;
            expect(result.unitPrice).toBe(expectedUnit);
            expect(result.total).toBe(Math.round(expectedUnit * 40 * 100) / 100);
            if (program.costPerSqft != null) {
              const expectedCost = Math.round(billableSqft * Math.round(program.costPerSqft * 100)) / 100;
              expect(result.wholesaleUnitPrice).toBe(expectedCost);
              expect(result.wholesaleTotal).toBe(Math.round(expectedCost * 40 * 100) / 100);
            }
          }
        }
      }
    }
    expect(sqftPrograms).toBe(13);
  });

  it("matches the comparison projection to direct pricing for every shared program", () => {
    let comparedPrograms = 0;
    for (const product of sharedProducts) {
      for (const program of product.programs) {
        if (program.priceBasis === "manual_required") {
          const comparison = compareManufacturers({
            productType: quoteLabProductType(product.id)!,
            widthInches: 30,
            heightInches: 48,
            quantity: 2,
            selectedProductId: product.id,
          });
          const row = comparison.products.find((candidate) => candidate.productId === product.id)
            ?.programs.find((candidate) => candidate.programId === program.id);
          expect(row?.status, `${product.id}/${program.id}`).toBe("manual_required");
          comparedPrograms += 1;
          continue;
        }

        const cell = firstPricedCell(product, program);
        const dimensions = program.priceAxis === "sqft"
          ? { widthInches: 36, heightInches: 60 }
          : cell
            ? dimensionsAt(program, cell.rowIndex, cell.columnIndex)
            : null;
        if (!dimensions) continue;
        const quantity = 7;
        const comparison = compareManufacturers({
          productType: quoteLabProductType(product.id)!,
          ...dimensions,
          quantity,
          selectedProductId: product.id,
        });
        const projectedProduct = comparison.products.find((candidate) => candidate.productId === product.id);
        const row = projectedProduct?.programs.find((candidate) => candidate.programId === program.id);
        const direct = directPrice(product, program, dimensions.widthInches, dimensions.heightInches, quantity);
        expect(projectedProduct?.selected, product.id).toBe(true);
        expect(row, `${product.id}/${program.id} comparison row`).toBeDefined();
        expect(row?.status, `${product.id}/${program.id} status`).toBe(direct.ok ? "priced" : "unavailable");
        if (direct.ok && "dealerNetUnitCost" in direct) {
          expect(row?.customerRetail).toBeNull();
          expect(row?.dealerCost).toEqual({
            unit: direct.dealerNetUnitCost,
            total: Math.round(direct.dealerNetUnitCost * quantity * 100) / 100,
          });
        } else if (direct.ok && "unitPrice" in direct) {
          expect(row?.customerRetail).toEqual({ unit: direct.unitPrice, total: direct.total });
          expect(row?.dealerCost).toEqual(
            direct.wholesaleUnitPrice == null || direct.wholesaleTotal == null
              ? null
              : { unit: direct.wholesaleUnitPrice, total: direct.wholesaleTotal },
          );
        }
        comparedPrograms += 1;
      }
    }
    expect(comparedPrograms).toBeGreaterThan(75);
  });

  it("enforces every published minimum, maximum, and oversize boundary", () => {
    let boundaries = 0;
    for (const product of sharedProducts) {
      for (const program of product.programs) {
        if (program.priceBasis === "manual_required") continue;
        const cell = firstPricedCell(product, program);
        const valid = program.priceAxis === "sqft"
          ? { widthInches: 36, heightInches: 60 }
          : cell
            ? dimensionsAt(program, cell.rowIndex, cell.columnIndex)
            : null;
        if (!valid) continue;

        if (program.minWidth != null && program.minWidth > 0) {
          const result = directPrice(product, program, Math.max(0.01, program.minWidth - 0.01), valid.heightInches);
          expect(result.ok, `${product.id}/${program.id} min width`).toBe(false);
          boundaries += 1;
        }
        if (program.minHeight != null && program.minHeight > 0 && program.priceAxis !== "width") {
          const result = directPrice(product, program, valid.widthInches, Math.max(0.01, program.minHeight - 0.01));
          expect(result.ok, `${product.id}/${program.id} min height`).toBe(false);
          boundaries += 1;
        }
        const maxWidth = program.maxWidth ?? (program.priceAxis === "height" ? null : program.grid.widths.at(-1));
        if (maxWidth != null) {
          const result = directPrice(product, program, maxWidth + 0.01, valid.heightInches);
          expect(result.ok, `${product.id}/${program.id} max width`).toBe(false);
          boundaries += 1;
        }
        const maxHeight = program.maxHeight ?? (program.priceAxis === "width" ? null : program.grid.heights.at(-1));
        if (maxHeight != null) {
          const result = directPrice(product, program, valid.widthInches, maxHeight + 0.01);
          expect(result.ok, `${product.id}/${program.id} max height`).toBe(false);
          boundaries += 1;
        }
        if (program.maxAreaSqft != null) {
          const side = Math.sqrt(program.maxAreaSqft * 144) + 0.01;
          const result = directPrice(product, program, side, side);
          expect(result.ok, `${product.id}/${program.id} max area`).toBe(false);
          boundaries += 1;
        }
      }
    }
    expect(boundaries).toBeGreaterThan(120);
  });

  it("labels provisional and source-unavailable products", () => {
    const shutters = compareManufacturers({
      productType: "Shutters",
      widthInches: 36,
      heightInches: 60,
      quantity: 1,
      selectedProductId: "norman_shutters",
    });
    expect(shutters.products.every((product) => product.provisional)).toBe(true);

    const rollers = compareManufacturers({
      productType: "Roller Shades",
      widthInches: 36,
      heightInches: 60,
      quantity: 1,
    });
    expect(rollers.products.find((product) => product.productId === "polar_exterior_clutch_unavailable")).toMatchObject({
      priceBasis: "unavailable",
      programs: [],
    });
  });
});
