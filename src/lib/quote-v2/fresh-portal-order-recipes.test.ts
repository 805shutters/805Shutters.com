import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { repriceExactQuoteBuilderForQuoteLabPreview } from "@/lib/quote-lab/exact-backend";
import recipesJson from "./fixtures/portal-parity/fresh-portal-order-recipes.json";

type MoneySummary = {
  status: "complete" | "incomplete";
  productCostCents: number;
  freightCents: number;
  processingCents: number;
  dealerCostTotalCents: number;
};

type LineExpectation = {
  lineId: string;
  ok: boolean;
  resultCode: string | null;
  customerTotalCents: number;
  wholesaleTotalCents: number | null;
  requiredValidationRuleIds: string[];
  requiredSendabilityReasonCodes: string[];
};

type RecipeLine = {
  id: string;
  productType: string;
  productId: string;
  programId: string;
  widthInches: number;
  heightInches: number;
  quantity: number;
  portalObservedSelections: Record<string, unknown>;
  design: {
    supplier: string;
    options: Record<string, unknown>;
    [key: string]: unknown;
  };
};

type RecipeGroup = {
  id: string;
  manufacturer: string;
  evidence: Array<{
    id: string;
    path: string;
    classification: string;
    sourceControlledSha256?: string;
    privateArtifactSha256?: string;
    privateArtifactByteLength?: number;
  }>;
  portalObserved: Record<string, unknown>;
  bookObserved: Record<string, unknown>;
  lines: RecipeLine[];
  expectedFreshRuntime: {
    catalogAsOf: string;
    customerTotalCents: number;
    sendable: boolean;
    costSummary: MoneySummary;
    lineResults: LineExpectation[];
  };
};

type PortalRecipeFixture = {
  schemaVersion: number;
  fixtureId: string;
  safety: {
    draftLabel: string;
    manufacturerOrdersPlaced: boolean;
    customerQuotesSent: boolean;
    productionWrites: boolean;
  };
  groups: RecipeGroup[];
};

const recipes = recipesJson as unknown as PortalRecipeFixture;

function cents(value: number): number {
  return Math.round(value * 100);
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function fraction(value: number): string {
  const remainder = value - Math.floor(value);
  if (remainder === 0) return "0";
  if (remainder === 0.5) return "1/2";
  throw new Error(`Unsupported recipe fraction ${remainder}.`);
}

function materialize(group: RecipeGroup) {
  const lines = group.lines.map((recipe, index): SalesQuoteLineItem => ({
    id: recipe.id,
    quote_id: group.id,
    room_name: `Portal Replay ${index + 1}`,
    product_type: recipe.productType,
    width_whole: Math.floor(recipe.widthInches),
    width_fraction: fraction(recipe.widthInches),
    height_whole: Math.floor(recipe.heightInches),
    height_fraction: fraction(recipe.heightInches),
    quantity: recipe.quantity,
    sort_order: index,
    created_at: "2026-07-22T17:30:00.000Z",
  }));

  const designs = group.lines.map((recipe): SalesQuoteDesign => {
    const { supplier, options, ...direct } = recipe.design;
    return {
      id: `${recipe.id}-design-A`,
      line_item_id: recipe.id,
      variant: "A",
      product_type: recipe.productType,
      supplier,
      unit_price: 0,
      ...direct,
      options_json: {
        quote_v2_backend: true,
        quote_lab_product_id: recipe.productId,
        catalog_product_id: recipe.productId,
        quote_lab_program_id: recipe.programId,
        catalog_program_id: recipe.programId,
        // Explicitly retain unknown selected program codes. The V2 resolver is
        // required to fail closed instead of falling back to another grid.
        fabric_program_id: recipe.programId,
        quote_v2_catalog_as_of: group.expectedFreshRuntime.catalogAsOf,
        ...options,
      },
    } as unknown as SalesQuoteDesign;
  });

  return {
    lines,
    designs,
    selectedVariantByLine: Object.fromEntries(
      lines.map((line) => [line.id, "A"]),
    ),
  };
}

function reprice(group: RecipeGroup) {
  const quote = repriceExactQuoteBuilderForQuoteLabPreview(materialize(group));
  if (!("backend" in quote) || quote.backend !== "v2") {
    throw new Error(`Recipe ${group.id} did not use the V2 backend.`);
  }
  return quote;
}

function group(id: string): RecipeGroup {
  const found = recipes.groups.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing fresh portal-order recipe ${id}.`);
  return found;
}

describe("fresh portal-order recipe integrity", () => {
  it("pins five portal groups and nine lines as non-ordering test drafts", () => {
    expect(recipes).toMatchObject({
      schemaVersion: 1,
      fixtureId: "quote-v2-fresh-portal-order-recipes-2026-07-22",
      safety: {
        draftLabel: "CODEX PRICING TEST — DO NOT ORDER",
        manufacturerOrdersPlaced: false,
        customerQuotesSent: false,
        productionWrites: false,
      },
    });
    expect(recipes.groups.map((entry) => entry.manufacturer)).toEqual([
      "Norman",
      "Norman",
      "Polar",
      "Lotus",
      "Onyx",
    ]);
    expect(recipes.groups.flatMap((entry) => entry.lines)).toHaveLength(9);
  });

  it("hash-locks every source-controlled receipt separately from private artifacts", () => {
    const evidence = recipes.groups.flatMap((entry) => entry.evidence);
    for (const item of evidence) {
      if (!item.sourceControlledSha256) continue;
      expect(sha256(path.join(process.cwd(), item.path)), item.id).toBe(
        item.sourceControlledSha256,
      );
      if (item.privateArtifactSha256) {
        expect(item.privateArtifactSha256, item.id).toMatch(/^[a-f0-9]{64}$/);
        expect(item.privateArtifactByteLength, item.id).toBeGreaterThan(0);
        expect(item.privateArtifactSha256, item.id).not.toBe(
          item.sourceControlledSha256,
        );
      }
    }
    expect(evidence.filter((item) => item.sourceControlledSha256)).toHaveLength(
      5,
    );
    expect(evidence.filter((item) => item.privateArtifactSha256)).toHaveLength(
      4,
    );
  });

  it.each(recipes.groups.map((entry) => [entry.id, entry] as const))(
    "%s reproduces the expected fresh V2 allow/block and money contract",
    (_id, recipeGroup) => {
      const quote = reprice(recipeGroup);
      expect(cents(quote.total)).toBe(
        recipeGroup.expectedFreshRuntime.customerTotalCents,
      );
      expect(quote.customerQuote).toMatchObject({
        total: quote.total,
        sendable: recipeGroup.expectedFreshRuntime.sendable,
      });
      expect(quote.sendability.sendable).toBe(
        recipeGroup.expectedFreshRuntime.sendable,
      );
      expect(quote.costSummary.status).toBe(
        recipeGroup.expectedFreshRuntime.costSummary.status,
      );
      expect(cents(quote.costSummary.productCost)).toBe(
        recipeGroup.expectedFreshRuntime.costSummary.productCostCents,
      );
      expect(cents(quote.costSummary.freightHandling)).toBe(
        recipeGroup.expectedFreshRuntime.costSummary.freightCents,
      );
      expect(cents(quote.costSummary.processingFee)).toBe(
        recipeGroup.expectedFreshRuntime.costSummary.processingCents,
      );
      expect(cents(quote.costSummary.dealerCostTotal)).toBe(
        recipeGroup.expectedFreshRuntime.costSummary.dealerCostTotalCents,
      );

      for (const expected of recipeGroup.expectedFreshRuntime.lineResults) {
        const priced = quote.designs.find(
          (candidate) => candidate.lineItemId === expected.lineId,
        );
        const sendability = quote.sendability.lines.find(
          (candidate) => candidate.lineItemId === expected.lineId,
        );
        if (!priced || !sendability) {
          throw new Error(`Missing runtime evidence for ${expected.lineId}.`);
        }

        expect(priced.selection).toMatchObject({
          productId: recipeGroup.lines.find(
            (line) => line.id === expected.lineId,
          )?.productId,
          programId: recipeGroup.lines.find(
            (line) => line.id === expected.lineId,
          )?.programId,
          widthInches: recipeGroup.lines.find(
            (line) => line.id === expected.lineId,
          )?.widthInches,
          heightInches: recipeGroup.lines.find(
            (line) => line.id === expected.lineId,
          )?.heightInches,
          quantity: recipeGroup.lines.find(
            (line) => line.id === expected.lineId,
          )?.quantity,
        });
        expect(priced.result.ok).toBe(expected.ok);
        expect(priced.result.ok ? null : priced.result.code).toBe(
          expected.resultCode,
        );
        expect(cents(priced.result.ok ? priced.result.total : 0)).toBe(
          expected.customerTotalCents,
        );
        expect(
          priced.result.validationIssues.map((issue) => issue.ruleId),
        ).toEqual(expect.arrayContaining(expected.requiredValidationRuleIds));
        expect(sendability.reasons.map((reason) => reason.code)).toEqual(
          expect.arrayContaining(expected.requiredSendabilityReasonCodes),
        );
        expect(
          priced.costResult.ok ? cents(priced.costResult.wholesaleTotal) : null,
        ).toBe(expected.wholesaleTotalCents);
      }
    },
  );
});

describe("fresh portal-order source reconciliations", () => {
  it("keeps Norman SmartRelease component math and current-account cost exact", () => {
    const recipe = group("fresh-norman-smartrelease-current-account");
    const quote = reprice(recipe);
    const result = quote.designs[0].result;
    if (!result.ok) throw new Error(result.error);

    expect(
      result.components
        .filter((entry) => entry.customerAmount !== 0)
        .map((entry) => [entry.category, cents(entry.customerAmount)]),
    ).toEqual([
      ["base_grid", 25400],
      ["operating_system", 8900],
      ["accessory", 700],
    ]);
    expect(cents(result.base)).toBe(25400);
    expect(cents(result.unitPrice - result.base)).toBe(9600);
    expect(cents(result.total)).toBe(35000);
    expect(cents(result.internalCost?.productCostTotal ?? 0)).toBe(11550);
    expect(cents(result.internalCost?.landedCostTotal ?? 0)).toBe(14331);
  });

  it("replays RR002 at the verified .33 policy and rejects the superseded .30 cost", () => {
    const recipe = group("fresh-norman-rr002-current-policy");
    const quote = reprice(recipe);
    const result = quote.designs[0].result;
    if (!result.ok) throw new Error(result.error);

    expect(cents(result.total)).toBe(45100);
    expect(result.internalCost?.effectiveDealerFactor).toBe(0.33);
    expect(cents(result.internalCost?.productCostTotal ?? 0)).toBe(14883);
    expect(cents(result.internalCost?.landedCostTotal ?? 0)).toBe(17731);
    expect(cents(result.internalCost?.productCostTotal ?? 0)).not.toBe(13530);
  });

  it("preserves every Polar 166382 choice and quarantines the portal/book conflict", () => {
    const recipe = group("fresh-polar-quote-166382");
    const quote = reprice(recipe);

    expect(recipe.portalObserved).toMatchObject({
      customerRetail: { unitTotalCents: 90500, subtotalCents: 271500 },
      dealer: { unitCents: 40725, merchandiseCents: 122175 },
    });
    expect(recipe.bookObserved).toMatchObject({
      unitCustomerRetailCents: 96100,
      customerRetailCents: 288300,
      portalDifferenceCents: 16800,
      portalDifferenceBasisPoints: 619,
    });
    expect(quote.total).toBe(0);

    for (const priced of quote.designs) {
      expect(priced.selection.configuration).toMatchObject({
        valance: "None",
        fabric_collection: "SunTex 90 10%",
        operating_system: "Manual Gear/Crank",
        track_type: "Standard Non-Zipper Tracks",
        fabric_orientation: "Railroad",
        seaming: "Seam",
        railroad_and_seam: true,
      });
      expect(
        priced.result.validationIssues.map((issue) => issue.ruleId),
      ).toContain("polar.elite.portal_book_price_conflict");
    }
  });

  it("retains all three Lotus portal lines without inventing customer retail", () => {
    const recipe = group("fresh-lotus-three-product-cart");
    const quote = reprice(recipe);
    const [aluminum, faux, stockVertical] = quote.designs;

    expect(recipe.portalObserved).toMatchObject({
      customerRetail: null,
      dealer: {
        lineTotalsCents: {
          CAMX3560W: 2784,
          CFCX4872W: 10500,
          VS4372SCWH: 2342,
        },
        cartTotalCents: 15626,
      },
    });
    expect(recipe.bookObserved).toMatchObject({
      customerRetailCents: null,
      lineTotalsCents: {
        CAMX3560W: 2784,
        CFCX4872W: 5397,
        VS4372SCWH: 2342,
      },
      conflicts: [
        {
          sku: "CFCX4872W",
          portalCents: 10500,
          bookCents: 5397,
          differenceCents: 5103,
        },
      ],
    });
    expect(aluminum.result.ok ? null : aluminum.result.code).toBe(
      "CUSTOMER_RETAIL_UNDEFINED",
    );
    expect(faux.result.ok ? null : faux.result.code).toBe(
      "CUSTOMER_RETAIL_UNDEFINED",
    );
    expect(stockVertical.result.ok ? null : stockVertical.result.code).toBe(
      "PROGRAM_NOT_RESOLVED",
    );
    expect(quote.total).toBe(0);
  });

  it("replays Onyx 30x72 with the actual 3.5-inch louver and blocks the live-source conflict", () => {
    const recipe = group("fresh-onyx-live-us-made-vinyl");
    const quote = reprice(recipe);
    const priced = quote.designs[0];

    expect(recipe.portalObserved).toMatchObject({
      customerRetail: null,
      dealer: {
        portalAreaThousandthsSqft: 17564,
        rawLinePriceMills: 239749,
        lineTotalCents: 23975,
        taxCents: 2338,
        grandTotalCents: 26313,
      },
    });
    expect(priced.selection.configuration).toMatchObject({
      material: "Onyx U.S. Made Vinyl",
      mount_type: "outside",
      measurement_basis: "window_size",
      frame_type: "Vinyl L Frame",
      frame_sides: 4,
      louver_size_inches: 3.5,
      color_name: "White",
      panel_config: "L",
    });
    expect(priced.result.ok).toBe(false);
    expect(priced.result.validationIssues.map((issue) => issue.ruleId)).toEqual(
      expect.arrayContaining([
        "onyx.us_made_vinyl.restriction_identity_unverified",
        "onyx.price.portal_source_conflict",
        "onyx.source.current_effective_revision_missing",
        "onyx.panel.maximum_area_source_incomplete",
      ]),
    );
    expect(quote.total).toBe(0);
  });
});
