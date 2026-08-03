import { describe, expect, it } from "vitest";
import { getProduct } from "@/lib/quote/catalog";
import type { CatalogProduct } from "@/lib/quote/catalog/types";
import { priceDesign, type PriceBreakdown } from "@/lib/quote/pricing";
import type { SelectionContext } from "./core";
import { sourceProvenance } from "./source-manifest";
import {
  buildAuthoritativePriceComponents,
  type BuildAuthoritativePriceComponentsInput,
  type PriceComponentOptionInput,
} from "./price-components";

const PRICE_BOOK_PAGE_18 = sourceProvenance(
  "norman-retail-guide-2026-07",
  { page: 18 },
);
const AUTOWAND_PAGE_8 = sourceProvenance(
  "norman-retail-guide-2026-07",
  { page: 8 },
);
const ROLLER_GUIDE = sourceProvenance("norman-roller-guide-2026-07", {
  pages: [7, 8, 9],
});

function rollerProduct(): CatalogProduct {
  const source = getProduct("roller");
  if (!source) throw new Error("Roller catalog fixture is missing.");
  return {
    ...source,
    programs: source.programs.map((program) => {
      if (
        program.id === "roller_cordless_fabric_price_group_1_pg1" ||
        program.id === "roller_cordless_fabric_price_group_2_pg2"
      ) {
        return {
          ...program,
          pricingFamilyId: "roller_cordless_fabric",
          baselineProgramId:
            "roller_cordless_fabric_price_group_1_pg1",
        };
      }
      return program;
    }),
  } as CatalogProduct;
}

function selection(programId: string, liftSystem: string): SelectionContext {
  return {
    manufacturerId: "norman",
    productId: "roller",
    programId,
    catalogVersion: "805-v2-norman-roller-2026-08-01",
    catalogAsOf: "2026-08-01",
    widthInches: 30,
    heightInches: 48,
    quantity: 1,
    configuration: {
      fabric_collection:
        programId.endsWith("pg2") ? "Amelia" : "Brook",
      fabric_color_code: programId.endsWith("pg2") ? "F1484" : "F1120",
      lift_system: liftSystem,
      roller_application: "Single Shade",
      roller_top_treatment: "No Top Treatment",
      roller_tube: liftSystem === "Motorized" ? '2" (52mm) Tube' : "All Tubes",
    },
    options: {},
  };
}

function breakdown(input: {
  productId?: string;
  programId: string;
  programName: string;
  base: number;
  wholesaleBase: number;
  surchargeLines?: PriceBreakdown["surchargeLines"];
  unitPrice: number;
  wholesaleUnitPrice: number;
}): PriceBreakdown {
  const surchargeLines = input.surchargeLines ?? [];
  return {
    ok: true,
    productId: input.productId ?? "roller",
    programId: input.programId,
    programName: input.programName,
    matchedWidth: 30,
    matchedHeight: 48,
    base: input.base,
    configurationUnits: 1,
    wholesaleBase: input.wholesaleBase,
    surchargeLines,
    unitPrice: input.unitPrice,
    discountPercent: 0,
    discountAmount: 0,
    wholesaleUnitPrice: input.wholesaleUnitPrice,
    quantity: 1,
    onceTotal: 0,
    total: input.unitPrice,
    wholesaleTotal: input.wholesaleUnitPrice,
    warnings: [],
    costStatus: "complete",
  };
}

function includedAccessories(): PriceComponentOptionInput[] {
  return [
    {
      id: "accessory:no_top_treatment",
      label: "No top treatment",
      category: "accessory",
      status: "included",
      basis: "included",
      selectionBindings: [
        { field: "roller_top_treatment", value: "No Top Treatment" },
      ],
      source: ROLLER_GUIDE,
      billingScope: "per_window",
    },
    {
      id: "accessory:fabric_covered_hem_bar",
      label: "Fabric-covered hem bar",
      category: "accessory",
      status: "included",
      basis: "included",
      selectionBindings: [{ field: "hem_bar", value: "Fabric Covered" }],
      source: ROLLER_GUIDE,
      billingScope: "per_window",
    },
    {
      id: "accessory:2in_tube",
      label: '2" (52mm) tube',
      category: "accessory",
      status: "included",
      basis: "included",
      selectionBindings: [{ field: "roller_tube", value: '2" (52mm) Tube' }],
      source: ROLLER_GUIDE,
      billingScope: "per_window",
    },
  ];
}

function autoWandInput(): BuildAuthoritativePriceComponentsInput {
  const programId = "roller_cordless_fabric_price_group_2_pg2";
  const sourceResult = breakdown({
    programId,
    programName: "Cordless Fabric - Price Group 2",
    base: 328,
    wholesaleBase: 98.4,
    surchargeLines: [
      {
        id: "motor:autowand:autowand",
        label: "Autowand",
        amount: 166,
        wholesaleAmount: 49.8,
        kind: "flat",
      },
    ],
    unitPrice: 494,
    wholesaleUnitPrice: 148.2,
  });
  const retailResult = breakdown({
    programId,
    programName: "Cordless Fabric - Price Group 2",
    base: 246,
    wholesaleBase: 98.4,
    surchargeLines: [
      {
        id: "motor:autowand:autowand",
        label: "Autowand",
        amount: 124.5,
        wholesaleAmount: 49.8,
        kind: "flat",
      },
    ],
    unitPrice: 370.5,
    wholesaleUnitPrice: 148.2,
  });
  return {
    selection: selection(programId, "Motorized"),
    sourceResult,
    retailResult,
    product: rollerProduct(),
    baseline: {
      programId: "roller_cordless_fabric_price_group_1_pg1",
      matchedWidth: 30,
      matchedHeight: 48,
      catalogAmount: 298,
      wholesaleAmount: 89.4,
      customerAmount: 223.5,
      source: PRICE_BOOK_PAGE_18,
    },
    selectedProgramSource: PRICE_BOOK_PAGE_18,
    contractSource: PRICE_BOOK_PAGE_18,
    accessories: includedAccessories(),
    operatingSystem: {
      id: "operating:autowand",
      label: "AutoWand operating system",
      category: "operating_system",
      status: "priced",
      basis: "flat",
      selectionBindings: [
        { field: "lift_system", value: "Motorized" },
        { field: "roller_power_configuration", value: "AutoWand" },
      ],
      source: AUTOWAND_PAGE_8,
      priceLineId: "motor:autowand:autowand",
      billingScope: "per_window",
    },
    canonicalMotorization: [
      {
        groupId: "autowand",
        optionId: "autowand",
        role: "base_motor",
        units: 1,
      },
    ],
  };
}

describe("authoritative V2 price components", () => {
  it("separates the exact 30x48 Amelia AutoWand price into all authoritative stages", () => {
    const result = buildAuthoritativePriceComponents(autoWandInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 298,
          wholesaleAmount: 89.4,
          customerAmount: 223.5,
        }),
        expect.objectContaining({
          category: "fabric_upgrade",
          status: "priced",
          catalogAmount: 30,
          wholesaleAmount: 9,
          customerAmount: 22.5,
        }),
        expect.objectContaining({
          id: "operating:autowand",
          category: "operating_system",
          motorRole: "base_motor",
          catalogAmount: 166,
          wholesaleAmount: 49.8,
          customerAmount: 124.5,
        }),
      ]),
    );
    expect(
      result.components.filter((component) => component.category === "accessory"),
    ).toHaveLength(3);
    expect(
      result.components
        .filter((component) => component.category === "accessory")
        .every(
          (component) =>
            component.status === "included" && component.customerAmount === 0,
        ),
    ).toBe(true);
    expect(result.totals).toMatchObject({
      catalogPerWindow: 494,
      wholesalePerWindow: 148.2,
      customerPerWindow: 370.5,
    });
  });

  it("records PG1 fabric, accessories, and Cordless operation as explicit zero-dollar entries", () => {
    const programId = "roller_cordless_fabric_price_group_1_pg1";
    const sourceResult = breakdown({
      programId,
      programName: "Cordless Fabric - Price Group 1",
      base: 298,
      wholesaleBase: 89.4,
      unitPrice: 298,
      wholesaleUnitPrice: 89.4,
    });
    const retailResult = breakdown({
      programId,
      programName: "Cordless Fabric - Price Group 1",
      base: 223.5,
      wholesaleBase: 89.4,
      unitPrice: 223.5,
      wholesaleUnitPrice: 89.4,
    });
    const result = buildAuthoritativePriceComponents({
      selection: selection(programId, "Cordless"),
      sourceResult,
      retailResult,
      product: rollerProduct(),
      baseline: {
        programId,
        matchedWidth: 30,
        matchedHeight: 48,
        catalogAmount: 298,
        wholesaleAmount: 89.4,
        customerAmount: 223.5,
        source: PRICE_BOOK_PAGE_18,
      },
      selectedProgramSource: PRICE_BOOK_PAGE_18,
      contractSource: PRICE_BOOK_PAGE_18,
      accessories: [
        {
          id: "accessory:none",
          label: "Accessories — none selected",
          category: "accessory",
          status: "included",
          basis: "included",
          selectionBindings: [{ field: "accessories", value: "none" }],
          source: ROLLER_GUIDE,
          billingScope: "per_window",
        },
      ],
      operatingSystem: {
        id: "operating:cordless",
        label: "Cordless operating system — included",
        category: "operating_system",
        status: "included",
        basis: "included",
        selectionBindings: [{ field: "lift_system", value: "Cordless" }],
        source: PRICE_BOOK_PAGE_18,
        billingScope: "per_window",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "fabric_upgrade",
          status: "included",
          customerAmount: 0,
        }),
        expect.objectContaining({
          id: "accessory:none",
          status: "included",
          customerAmount: 0,
        }),
        expect.objectContaining({
          id: "operating:cordless",
          status: "included",
          customerAmount: 0,
        }),
      ]),
    );
    expect(result.totals.customerPerWindow).toBe(223.5);
  });

  it("uses an engine-supplied self-baseline for a standalone program with no price group", () => {
    const product = getProduct("lotus_mini_blinds");
    const programId = "lotus_amx_1in_aluminum_custom";
    if (!product) throw new Error("Lotus mini-blind catalog fixture is missing.");
    const lotusSource = sourceProvenance("lotus-west-a26-v1", { page: 97 });
    const sourceResult = breakdown({
      productId: product.id,
      programId,
      programName: "1-inch Aluminum Mini Blind - Custom Cut",
      base: 35.02,
      wholesaleBase: 35.02,
      unitPrice: 35.02,
      wholesaleUnitPrice: 35.02,
    });
    const retailResult = breakdown({
      productId: product.id,
      programId,
      programName: "1-inch Aluminum Mini Blind - Custom Cut",
      base: 87.55,
      wholesaleBase: 35.02,
      unitPrice: 87.55,
      wholesaleUnitPrice: 35.02,
    });
    const result = buildAuthoritativePriceComponents({
      selection: {
        manufacturerId: "lotus",
        productId: product.id,
        programId,
        catalogVersion: "805-v2-standalone-test",
        catalogAsOf: "2026-08-01",
        widthInches: 30,
        heightInches: 48,
        quantity: 1,
        configuration: { lift_system: "Cordless" },
        options: {},
      },
      sourceResult,
      retailResult,
      product,
      baseline: {
        programId,
        matchedWidth: 30,
        matchedHeight: 48,
        catalogAmount: 35.02,
        wholesaleAmount: 35.02,
        customerAmount: 87.55,
        source: lotusSource,
      },
      selectedProgramSource: lotusSource,
      contractSource: lotusSource,
      accessories: [
        {
          id: "accessory:none",
          label: "Accessories — none selected",
          category: "accessory",
          status: "included",
          basis: "included",
          selectionBindings: [{ field: "accessories", value: "none" }],
          source: lotusSource,
          billingScope: "per_window",
        },
      ],
      operatingSystem: {
        id: "operating:cordless",
        label: "Cordless operating system — included",
        category: "operating_system",
        status: "included",
        basis: "included",
        selectionBindings: [{ field: "lift_system", value: "Cordless" }],
        source: lotusSource,
        billingScope: "per_window",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 35.02,
          wholesaleAmount: 35.02,
          customerAmount: 87.55,
        }),
        expect.objectContaining({
          category: "fabric_upgrade",
          label: "Fabric upgrade — not applicable",
          status: "included",
          catalogAmount: 0,
          wholesaleAmount: 0,
          customerAmount: 0,
        }),
      ]),
    );
  });

  it.skip("retires standalone Polar grids from the launch path", () => {
    const cases = [
      {
        productId: "polar_drapery_track",
        programId: "pinch_split_white",
        widthInches: 48,
        heightInches: 48,
        page: 74,
      },
      {
        productId: "polar_awning_premium_pro",
        programId: "standard",
        widthInches: 120,
        heightInches: 83,
        page: 165,
      },
    ] as const;

    for (const testCase of cases) {
      const product = getProduct(testCase.productId);
      if (!product) throw new Error(`${testCase.productId} catalog fixture is missing.`);
      const sourceResult = priceDesign({
        productId: testCase.productId,
        programId: testCase.programId,
        widthInches: testCase.widthInches,
        heightInches: testCase.heightInches,
      });
      if (!sourceResult.ok || sourceResult.wholesaleBase == null) {
        throw new Error(`${testCase.productId} source grid did not price.`);
      }
      const source = sourceProvenance(
        "polar-shades-dealer-book-current-2026-07-18",
        { page: testCase.page },
      );
      const result = buildAuthoritativePriceComponents({
        selection: {
          manufacturerId: "polar",
          productId: testCase.productId,
          programId: testCase.programId,
          catalogVersion: "805-v2-polar-standalone-test",
          catalogAsOf: "2026-07-22",
          widthInches: testCase.widthInches,
          heightInches: testCase.heightInches,
          quantity: 1,
          configuration: { lift_system: "Standard" },
          options: {},
        },
        sourceResult,
        retailResult: sourceResult,
        product,
        baseline: {
          programId: testCase.programId,
          matchedWidth: sourceResult.matchedWidth,
          matchedHeight: sourceResult.matchedHeight,
          catalogAmount: sourceResult.base,
          wholesaleAmount: sourceResult.wholesaleBase,
          customerAmount: sourceResult.base,
          source,
        },
        selectedProgramSource: source,
        contractSource: source,
        accessories: [
          {
            id: "accessory:none",
            label: "Accessories — none selected",
            category: "accessory",
            status: "included",
            basis: "included",
            selectionBindings: [{ field: "accessories", value: "none" }],
            source,
            billingScope: "per_window",
          },
        ],
        operatingSystem: {
          id: "operating:standard",
          label: "Standard operation — included",
          category: "operating_system",
          status: "included",
          basis: "included",
          selectionBindings: [{ field: "lift_system", value: "Standard" }],
          source,
          billingScope: "per_window",
        },
      });

      expect(result.ok, testCase.productId).toBe(true);
      if (!result.ok) continue;
      expect(result.components).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `base_grid:${testCase.programId}`,
          customerAmount: sourceResult.base,
        }),
        expect.objectContaining({
          id: `fabric_upgrade:${testCase.programId}`,
          label: "Fabric upgrade — not applicable",
          status: "included",
          customerAmount: 0,
        }),
      ]));
    }
  });

  it("uses exactly one explicit product-level pricing family when program fields are absent", () => {
    const input = autoWandInput();
    const baselineProgramId =
      "roller_cordless_fabric_price_group_1_pg1";
    const selectedProgramId =
      "roller_cordless_fabric_price_group_2_pg2";
    const product = {
      ...input.product,
      pricingFamilies: [
        {
          id: "roller_cordless_fabric",
          baselineProgramId,
          memberProgramIds: [baselineProgramId, selectedProgramId],
        },
      ],
      programs: input.product?.programs.map((program) =>
        program.id === baselineProgramId || program.id === selectedProgramId
          ? {
              ...program,
              pricingFamilyId: undefined,
              baselineProgramId: undefined,
            }
          : program,
      ),
    } as CatalogProduct;

    const result = buildAuthoritativePriceComponents({
      ...input,
      product,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `base_grid:${baselineProgramId}`,
          customerAmount: 223.5,
        }),
        expect.objectContaining({
          id: `fabric_upgrade:${selectedProgramId}`,
          customerAmount: 22.5,
        }),
      ]),
    );
  });

  it("fails closed when product-level pricing-family membership is ambiguous", () => {
    const input = autoWandInput();
    const baselineProgramId =
      "roller_cordless_fabric_price_group_1_pg1";
    const selectedProgramId =
      "roller_cordless_fabric_price_group_2_pg2";
    const product = {
      ...input.product,
      pricingFamilies: [
        {
          id: "roller_cordless_fabric",
          baselineProgramId,
          memberProgramIds: [baselineProgramId, selectedProgramId],
        },
        {
          id: "invalid_duplicate_family",
          baselineProgramId,
          memberProgramIds: [baselineProgramId, selectedProgramId],
        },
      ],
      programs: input.product?.programs.map((program) =>
        program.id === baselineProgramId || program.id === selectedProgramId
          ? {
              ...program,
              pricingFamilyId: undefined,
              baselineProgramId: undefined,
            }
          : program,
      ),
    } as CatalogProduct;

    const result = buildAuthoritativePriceComponents({
      ...input,
      product,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.ruleId)).toContain(
      "price_components.baseline_metadata_ambiguous",
    );
  });

  it("classifies non-base motor selections as explicit accessory components", () => {
    const input = autoWandInput();
    const sourcePowerLine = {
      id: "motor:autowand:charging_kit",
      label: "AutoWand charging kit",
      amount: 45,
      wholesaleAmount: 13.5,
      kind: "flat" as const,
    };
    const retailPowerLine = {
      ...sourcePowerLine,
      amount: 33.75,
    };
    const result = buildAuthoritativePriceComponents({
      ...input,
      sourceResult: {
        ...input.sourceResult,
        surchargeLines: [
          ...input.sourceResult.surchargeLines,
          sourcePowerLine,
        ],
        unitPrice: 539,
        total: 539,
        wholesaleUnitPrice: 161.7,
        wholesaleTotal: 161.7,
      },
      retailResult: {
        ...input.retailResult,
        surchargeLines: [
          ...input.retailResult.surchargeLines,
          retailPowerLine,
        ],
        unitPrice: 404.25,
        total: 404.25,
        wholesaleUnitPrice: 161.7,
        wholesaleTotal: 161.7,
      },
      canonicalMotorization: [
        ...(input.canonicalMotorization ?? []),
        {
          groupId: "autowand",
          optionId: "charging_kit",
          role: "power_supply",
          units: 1,
        },
      ],
      motorSources: {
        "motor:autowand:charging_kit": AUTOWAND_PAGE_8,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "motor:autowand:charging_kit",
          category: "accessory",
          motorRole: "power_supply",
          catalogAmount: 45,
          wholesaleAmount: 13.5,
          customerAmount: 33.75,
        }),
      ]),
    );
  });

  it("accepts and records identical ordered grid cells for a coupled assembly", () => {
    const input = autoWandInput();
    if (!input.baseline) throw new Error("AutoWand baseline fixture is missing.");
    const componentMatchedWidths = [24, 30];
    const result = buildAuthoritativePriceComponents({
      ...input,
      sourceResult: {
        ...input.sourceResult,
        componentMatchedWidths,
        configurationUnits: 2,
      },
      retailResult: {
        ...input.retailResult,
        componentMatchedWidths,
        configurationUnits: 2,
      },
      baseline: {
        ...input.baseline,
        componentMatchedWidths,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.components.find((component) => component.category === "base_grid")
        ?.selectionBindings,
    ).toEqual(
      expect.arrayContaining([
        {
          field: "component_matched_widths",
          value: componentMatchedWidths,
        },
      ]),
    );
  });

  it("fails closed when coupled baseline grid cells differ in order", () => {
    const input = autoWandInput();
    if (!input.baseline) throw new Error("AutoWand baseline fixture is missing.");
    const result = buildAuthoritativePriceComponents({
      ...input,
      sourceResult: {
        ...input.sourceResult,
        componentMatchedWidths: [24, 30],
        configurationUnits: 2,
      },
      retailResult: {
        ...input.retailResult,
        componentMatchedWidths: [24, 30],
        configurationUnits: 2,
      },
      baseline: {
        ...input.baseline,
        componentMatchedWidths: [30, 24],
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "hard_block",
          ruleId: "price_components.baseline_component_cells_mismatch",
          selectedValues: {
            selectedComponentMatchedWidths: [24, 30],
            baselineComponentMatchedWidths: [30, 24],
          },
        }),
      ]),
    );
  });

  it("fails closed when component totals do not equal the authoritative retail result", () => {
    const input = autoWandInput();
    const result = buildAuthoritativePriceComponents({
      ...input,
      retailResult: {
        ...input.retailResult,
        unitPrice: 370.49,
        total: 370.49,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "hard_block",
          ruleId: "price_components.customer_sum_mismatch",
        }),
      ]),
    );
  });

  it("fails closed instead of inferring missing baseline metadata", () => {
    const input = autoWandInput();
    const product = {
      ...input.product,
      programs: input.product?.programs.map((program) =>
        program.id === input.selection.programId
          ? {
              ...program,
              pricingFamilyId: undefined,
              baselineProgramId: undefined,
            }
          : program,
      ),
    } as CatalogProduct;
    const result = buildAuthoritativePriceComponents({
      ...input,
      product,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.ruleId)).toContain(
      "price_components.baseline_metadata_missing",
    );
  });

  it("fails closed when a represented option has no immutable provenance", () => {
    const input = autoWandInput();
    const result = buildAuthoritativePriceComponents({
      ...input,
      accessories: input.accessories.map((accessory, index) =>
        index === 0 ? { ...accessory, source: null } : accessory,
      ),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "hard_block",
          ruleId: "price_components.provenance_missing",
          selectedValues: { componentId: "accessory:no_top_treatment" },
        }),
      ]),
    );
  });
});
