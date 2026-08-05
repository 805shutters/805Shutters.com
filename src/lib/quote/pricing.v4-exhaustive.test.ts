import { describe, expect, it } from "vitest";
import { catalog, listProducts } from "./catalog";
import type { CatalogProduct, CatalogProgram } from "./catalog/types";
import { getMotorizationGroupsForProduct } from "./product-options";
import {
  priceDealerNetDesign,
  priceDesign,
  type PriceInput,
  type PriceResult,
} from "./pricing";

const products = listProducts();

function effectiveBasis(product: CatalogProduct, program: CatalogProgram) {
  return program.priceBasis ?? product.priceBasis ?? "suggested_retail";
}

function sourceMatrix(product: CatalogProduct, program: CatalogProgram) {
  return effectiveBasis(product, program) === "dealer_net"
    ? program.grid.costs ?? program.grid.prices
    : program.grid.prices;
}

function dimensionsAt(
  program: CatalogProgram,
  rowIndex: number,
  columnIndex: number,
) {
  if (program.priceAxis === "height") {
    return {
      widthInches: Math.max(program.minWidth ?? 1, 1),
      heightInches: program.grid.heights[rowIndex],
    };
  }
  if (program.priceAxis === "width") {
    return {
      widthInches: program.grid.widths[columnIndex],
      heightInches: Math.max(program.minHeight ?? 48, 48),
    };
  }
  return {
    widthInches: program.grid.widths[columnIndex],
    heightInches: program.grid.heights[rowIndex],
  };
}

function blockedByPublishedRule(
  program: CatalogProgram,
  widthInches: number,
  heightInches: number,
) {
  const areaSqft = (widthInches * heightInches) / 144;
  return (
    (program.minWidth != null && widthInches < program.minWidth) ||
    (program.minHeight != null &&
      program.priceAxis !== "width" &&
      heightInches < program.minHeight) ||
    (program.maxWidth != null && widthInches > program.maxWidth) ||
    (program.maxHeight != null &&
      program.priceAxis !== "width" &&
      heightInches > program.maxHeight) ||
    (program.maxAreaSqft != null &&
      program.priceAxis !== "width" &&
      areaSqft > program.maxAreaSqft)
  );
}

function directPrice(
  product: CatalogProduct,
  program: CatalogProgram,
  input: Omit<PriceInput, "productId" | "programId">,
) {
  const completeInput = {
    productId: product.id,
    programId: program.id,
    ...input,
  };
  return effectiveBasis(product, program) === "dealer_net"
    ? priceDealerNetDesign(completeInput)
    : priceDesign(completeInput);
}

function firstSuccessfulInput(
  product: CatalogProduct,
  program: CatalogProgram,
): PriceInput | null {
  if (program.priceAxis === "sqft") {
    const input = {
      productId: product.id,
      programId: program.id,
      widthInches: Math.max(program.minWidth ?? 36, 36),
      heightInches: Math.max(program.minHeight ?? 60, 60),
    };
    return directPrice(product, program, input).ok ? input : null;
  }

  const matrix = sourceMatrix(product, program);
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    for (
      let columnIndex = 0;
      columnIndex < (matrix[rowIndex]?.length ?? 0);
      columnIndex += 1
    ) {
      if (matrix[rowIndex][columnIndex] == null) continue;
      const dimensions = dimensionsAt(program, rowIndex, columnIndex);
      const input = {
        productId: product.id,
        programId: program.id,
        ...dimensions,
      };
      if (directPrice(product, program, input).ok) return input;
    }
  }
  return null;
}

function expectFiniteNonNegative(
  result: PriceResult,
  label: string,
  enforceNonNegativeMargin = true,
) {
  expect(result.ok, label).toBe(true);
  if (!result.ok) return;
  for (const [field, amount] of [
    ["base", result.base],
    ["unitPrice", result.unitPrice],
    ["total", result.total],
    ["onceTotal", result.onceTotal],
  ] as const) {
    expect(Number.isFinite(amount), `${label} ${field}`).toBe(true);
    expect(amount, `${label} ${field}`).toBeGreaterThanOrEqual(0);
  }
  if (result.wholesaleUnitPrice != null) {
    expect(Number.isFinite(result.wholesaleUnitPrice), `${label} wholesale`).toBe(
      true,
    );
    if (enforceNonNegativeMargin) {
      expect(
        result.unitPrice,
        `${label} retail >= wholesale`,
      ).toBeGreaterThanOrEqual(result.wholesaleUnitPrice);
    }
  }
}

describe("V4 all-product exhaustive source reconciliation", () => {
  it("matches every priceable cell across every manufacturer and product", () => {
    let exactPricedCells = 0;
    let explicitNullCells = 0;
    let publishedRuleBlocks = 0;

    for (const product of products) {
      if (product.manufacturer === "Polar" || product.id.startsWith("polar_")) continue;
      for (const program of product.programs) {
        if (program.priceAxis === "sqft") continue;
        const basis = effectiveBasis(product, program);
        if (basis === "manual_required" || basis === "unavailable") continue;
        const matrix = sourceMatrix(product, program);

        for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
          for (
            let columnIndex = 0;
            columnIndex < (matrix[rowIndex]?.length ?? 0);
            columnIndex += 1
          ) {
            const expected = matrix[rowIndex][columnIndex];
            const dimensions = dimensionsAt(program, rowIndex, columnIndex);
            const result = directPrice(product, program, {
              ...dimensions,
              quantity: 3,
            });
            const label = `${product.manufacturer ?? "Unknown"}/${product.id}/${program.id} [${rowIndex},${columnIndex}]`;

            if (expected == null) {
              explicitNullCells += 1;
              expect(result.ok, `${label} null source cell`).toBe(false);
              continue;
            }
            if (
              blockedByPublishedRule(
                program,
                dimensions.widthInches,
                dimensions.heightInches,
              )
            ) {
              publishedRuleBlocks += 1;
              expect(result.ok, `${label} published restriction`).toBe(false);
              continue;
            }

            expect(result.ok, label).toBe(true);
            if (!result.ok) continue;
            exactPricedCells += 1;
            if ("dealerNetUnitCost" in result) {
              expect(result.dealerNetBaseCost, label).toBe(expected);
              expect(result.dealerNetTotalCost, `${label} quantity`).toBe(
                Math.round(expected * 3 * 100) / 100,
              );
            } else {
              expect(result.base, label).toBe(expected);
              expect(result.total, `${label} quantity`).toBe(
                Math.round(expected * 3 * 100) / 100,
              );
              if (result.wholesaleUnitPrice != null) {
                expect(result.unitPrice, `${label} margin`).toBeGreaterThanOrEqual(
                  result.wholesaleUnitPrice,
                );
              }
            }
          }
        }
      }
    }

    expect(exactPricedCells).toBeGreaterThan(5_000);
    expect(explicitNullCells).toBeGreaterThanOrEqual(70);
    expect(publishedRuleBlocks).toBeGreaterThan(0);
  });

  it("rounds every between-grid measurement upward across all products", () => {
    let roundedCells = 0;

    for (const product of products) {
      if (product.manufacturer === "Polar" || product.id.startsWith("polar_")) continue;
      for (const program of product.programs) {
        if (program.priceAxis === "sqft") continue;
        const basis = effectiveBasis(product, program);
        if (basis === "manual_required" || basis === "unavailable") continue;
        const matrix = sourceMatrix(product, program);

        for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
          for (
            let columnIndex = 0;
            columnIndex < (matrix[rowIndex]?.length ?? 0);
            columnIndex += 1
          ) {
            const expected = matrix[rowIndex][columnIndex];
            if (expected == null) continue;
            if (program.priceAxis !== "height" && columnIndex === 0) continue;
            if (program.priceAxis !== "width" && rowIndex === 0) continue;
            const exact = dimensionsAt(program, rowIndex, columnIndex);
            const widthInches =
              program.priceAxis === "height"
                ? exact.widthInches
                : program.grid.widths[columnIndex - 1] + 0.001;
            const heightInches =
              program.priceAxis === "width"
                ? exact.heightInches
                : program.grid.heights[rowIndex - 1] + 0.001;
            if (blockedByPublishedRule(program, widthInches, heightInches)) {
              continue;
            }

            const result = directPrice(product, program, {
              widthInches,
              heightInches,
            });
            const label = `${product.id}/${program.id} rounds to [${rowIndex},${columnIndex}]`;
            expect(result.ok, label).toBe(true);
            if (!result.ok) continue;
            roundedCells += 1;
            expect(
              "dealerNetUnitCost" in result
                ? result.dealerNetBaseCost
                : result.base,
              label,
            ).toBe(expected);
            expect(result.matchedWidth, label).toBe(
              program.priceAxis === "height" ? null : exact.widthInches,
            );
            expect(result.matchedHeight, label).toBe(
              program.priceAxis === "width" ? null : exact.heightInches,
            );
          }
        }
      }
    }

    expect(roundedCells).toBeGreaterThan(4_000);
  });

  it(
    "contains no Polar continuation-table width headers in retail price cells",
    () => {
      const polar = products.find(
        (product) => product.id === "polar_interior_roller",
      );
      expect(polar).toBeDefined();
      if (!polar) return;

      const corruptedPrograms = polar.programs.filter((program) => {
        const heightIndex = program.grid.heights.indexOf(156);
        if (heightIndex < 0) return false;
        const sourceRow = sourceMatrix(polar, program)[heightIndex] ?? [];
        return program.grid.widths
          .slice(15)
          .every((width, offset) => sourceRow[14 + offset] === width);
      });

      // The continuation page starts with 156", 168", ... 288". The importer
      // currently interprets that header as the 156-inch-height price row.
      expect(corruptedPrograms.map((program) => program.id)).toEqual([]);
    },
  );

  it("checks representative quantity, discount, wholesale, and money invariants", () => {
    let representativePrograms = 0;
    let wholesalePrograms = 0;
    const discountedBelowCost: string[] = [];

    for (const product of products) {
      if (product.manufacturer === "Polar" || product.id.startsWith("polar_")) continue;
      for (const program of product.programs) {
        if (effectiveBasis(product, program) !== "suggested_retail") continue;
        const input = firstSuccessfulInput(product, program);
        if (!input) continue;
        const label = `${product.id}/${program.id}`;
        const single = priceDesign(input);
        const quantity = priceDesign({ ...input, quantity: 37 });
        const discounted = priceDesign({
          ...input,
          quantity: 37,
          discountPercent: 17,
        });
        expectFiniteNonNegative(single, `${label} single`);
        expectFiniteNonNegative(quantity, `${label} quantity`);
        expectFiniteNonNegative(discounted, `${label} discount`, false);
        if (!single.ok || !quantity.ok || !discounted.ok) continue;

        expect(quantity.total, `${label} linear quantity`).toBe(
          Math.round(single.unitPrice * 37 * 100) / 100,
        );
        expect(discounted.total, `${label} discounted total`).toBe(
          Math.round(discounted.unitPrice * 37 * 100) / 100,
        );
        expect(discounted.unitPrice, `${label} discount direction`).toBeLessThanOrEqual(
          single.unitPrice,
        );
        if (
          single.wholesaleUnitPrice != null &&
          discounted.wholesaleUnitPrice != null
        ) {
          wholesalePrograms += 1;
          if (discounted.unitPrice < discounted.wholesaleUnitPrice) {
            discountedBelowCost.push(label);
          }
          expect(
            discounted.wholesaleUnitPrice,
            `${label} discount never reduces cost`,
          ).toBe(single.wholesaleUnitPrice);
        }
        representativePrograms += 1;
      }
    }

    expect(representativePrograms).toBeGreaterThan(60);
    expect(wholesalePrograms).toBeGreaterThan(50);
    expect(discountedBelowCost).toEqual([]);
  });

  it("prices or explicitly blocks every product-level upcharge", () => {
    let pricedUpcharges = 0;
    let explicitlyBlockedUpcharges = 0;

    for (const product of products) {
      const priceableProgram = product.programs.find(
        (program) =>
          effectiveBasis(product, program) === "suggested_retail" &&
          firstSuccessfulInput(product, program) !== null,
      );
      if (!priceableProgram) continue;
      const input = firstSuccessfulInput(product, priceableProgram);
      if (!input) continue;

      for (const surcharge of product.surcharges) {
        const result = priceDesign({
          ...input,
          surcharges: [{ id: surcharge.id, units: 2 }],
        });
        const label = `${product.id}/${surcharge.id}`;
        if (!result.ok) {
          explicitlyBlockedUpcharges += 1;
          expect(
            [
              "SURCHARGE_NO_PRICE",
              "SURCHARGE_UNKNOWN",
              "NA_CELL",
              "INVALID_DIMENSIONS",
            ],
            label,
          ).toContain(result.code);
          continue;
        }

        pricedUpcharges += 1;
        const line = result.surchargeLines.find(
          (candidate) => candidate.id === surcharge.id,
        );
        expect(line, `${label} must not be silently dropped`).toBeDefined();
        expect(Number.isFinite(line?.amount), `${label} finite`).toBe(true);
        expect(line?.amount, `${label} non-negative`).toBeGreaterThanOrEqual(0);
        expect(result.total, `${label} included in total`).toBeGreaterThanOrEqual(
          result.base,
        );
      }
    }

    expect(pricedUpcharges).toBeGreaterThan(150);
    expect(explicitlyBlockedUpcharges).toBeGreaterThan(0);
  });

  it("tests every mapped motor option without allowing silent fallback", () => {
    let pricedMotorOptions = 0;
    let unavailableMotorOptions = 0;

    for (const product of products) {
      const priceableProgram = product.programs.find(
        (program) =>
          effectiveBasis(product, program) === "suggested_retail" &&
          firstSuccessfulInput(product, program) !== null,
      );
      if (!priceableProgram) continue;
      const input = firstSuccessfulInput(product, priceableProgram);
      if (!input) continue;

      for (const groupId of getMotorizationGroupsForProduct(product.id)) {
        const group = catalog.motorization[groupId];
        if (!group) continue;
        for (const option of group.options) {
          const result = priceDesign({
            ...input,
            motorization: [{ groupId, optionId: option.id }],
          });
          const mapped =
            option.priceByProduct && product.id in option.priceByProduct
              ? option.priceByProduct[product.id]
              : option.price;
          const label = `${product.id}/${groupId}/${option.id}`;
          if (mapped == null) {
            unavailableMotorOptions += 1;
            expect(result.ok, label).toBe(false);
            if (!result.ok) {
              expect(
                ["MOTORIZATION_UNKNOWN", "MOTORIZATION_NO_PRICE"],
                label,
              ).toContain(result.code);
            }
            continue;
          }
          pricedMotorOptions += 1;
          expect(result.ok, label).toBe(true);
          if (!result.ok) continue;
          expect(
            result.surchargeLines.find(
              (line) => line.id === `motor:${groupId}:${option.id}`,
            )?.amount,
            label,
          ).toBe(mapped);
        }
      }
    }

    expect(pricedMotorOptions).toBeGreaterThan(100);
    expect(unavailableMotorOptions).toBeGreaterThan(0);
  });

  it("fails loudly for every manual, unavailable, and unknown selection", () => {
    let manualPrograms = 0;
    let unavailablePrograms = 0;

    for (const product of products) {
      if (product.priceBasis === "manual_required") {
        manualPrograms += 1;
        expect(
          priceDesign({
            productId: product.id,
            widthInches: 36,
            heightInches: 60,
          }),
        ).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
      }
      if (product.priceBasis === "unavailable") {
        unavailablePrograms += 1;
        expect(
          priceDesign({
            productId: product.id,
            widthInches: 36,
            heightInches: 60,
          }),
        ).toMatchObject({ ok: false, code: "PRODUCT_UNAVAILABLE" });
      }
      for (const program of product.programs) {
        const basis = effectiveBasis(product, program);
        if (basis !== "manual_required" && basis !== "unavailable") continue;
        const result = priceDesign({
          productId: product.id,
          programId: program.id,
          widthInches: 36,
          heightInches: 60,
        });
        expect(result.ok, `${product.id}/${program.id}`).toBe(false);
        if (basis === "manual_required") manualPrograms += 1;
        else unavailablePrograms += 1;
      }
    }

    expect(
      priceDesign({
        productId: "not-a-real-manufacturer-product",
        programId: "not-real",
        widthInches: 36,
        heightInches: 60,
      }),
    ).toMatchObject({ ok: false, code: "PRODUCT_NOT_FOUND" });
    expect(manualPrograms).toBeGreaterThan(0);
    // Tension Shades are quote-only. Exterior Clutch has no usable source
    // pricing and must remain explicitly unavailable rather than inheriting
    // the Tension Shade manual-quote exception.
    expect(unavailablePrograms).toBe(1);
  });
});
