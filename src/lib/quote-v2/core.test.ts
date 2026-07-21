import { describe, expect, it } from "vitest";
import {
  canonicalizeSelectionContext,
  catalogIsActiveAsOf,
  createSelectionFingerprint,
  evaluateSendability,
  hasHardBlock,
  isProductRuleStatusSendable,
  selectCatalogAsOf,
  type SelectionContext,
  type ValidationIssue,
} from "./core";

const baseSelection: SelectionContext = {
  manufacturerId: "norman",
  productId: "roller-shade",
  programId: "price-group-1",
  catalogVersion: "norman-2026-07",
  catalogAsOf: "2026-07-20",
  widthInches: 72.5,
  heightInches: 84,
  quantity: 1,
  configuration: {
    application: "single",
    fabric: {
      collectionId: "maui",
      fabricCode: "AB0001",
      colorCode: "F0001",
    },
    motorized: false,
  },
  options: {
    topTreatment: "none",
    surchargeIds: ["oversize"],
  },
};

const source = {
  sourceId: "fixture",
  fileName: "fixture.pdf",
  revision: "1",
  effectiveDate: "2026-07-01" as const,
  sha256: "a".repeat(64),
  page: 5,
};

function issue(
  severity: ValidationIssue["severity"],
  ruleId = "fixture.rule",
): ValidationIssue {
  return {
    severity,
    ruleId,
    source,
    selectedValues: { widthInches: 72.5 },
    explanation: "Fixture explanation.",
  };
}

describe("selection fingerprints", () => {
  it("is deterministic across object insertion order", () => {
    const reordered: SelectionContext = {
      ...baseSelection,
      configuration: {
        motorized: false,
        fabric: {
          colorCode: "F0001",
          fabricCode: "AB0001",
          collectionId: "maui",
        },
        application: "single",
      },
      options: {
        surchargeIds: ["oversize"],
        topTreatment: "none",
      },
    };

    expect(canonicalizeSelectionContext(reordered)).toBe(
      canonicalizeSelectionContext(baseSelection),
    );
    expect(createSelectionFingerprint(reordered)).toBe(
      createSelectionFingerprint(baseSelection),
    );
    expect(createSelectionFingerprint(baseSelection)).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
  });

  it("changes for every price-affecting category", () => {
    const original = createSelectionFingerprint(baseSelection);
    const changes: SelectionContext[] = [
      { ...baseSelection, widthInches: 72.51 },
      { ...baseSelection, heightInches: 85 },
      { ...baseSelection, quantity: 2 },
      { ...baseSelection, catalogVersion: "norman-2026-08" },
      { ...baseSelection, catalogAsOf: "2026-08-01" },
      {
        ...baseSelection,
        configuration: { ...baseSelection.configuration, motorized: true },
      },
      {
        ...baseSelection,
        options: { ...baseSelection.options, topTreatment: "cassette" },
      },
    ];

    for (const changed of changes) {
      expect(createSelectionFingerprint(changed)).not.toBe(original);
    }
  });

  it("rejects values JSON cannot represent safely", () => {
    expect(() =>
      canonicalizeSelectionContext({
        ...baseSelection,
        widthInches: Number.NaN,
      }),
    ).toThrow(/Non-finite/);

    const invalid = {
      ...baseSelection,
      configuration: { unsafe: undefined },
    } as unknown as SelectionContext;
    expect(() => canonicalizeSelectionContext(invalid)).toThrow(/Unsupported/);
  });
});

describe("product status and sendability", () => {
  it("allows only complete and documented-limited product rules", () => {
    expect(isProductRuleStatusSendable("complete")).toBe(true);
    expect(isProductRuleStatusSendable("documented_limited")).toBe(true);
    expect(isProductRuleStatusSendable("manual_quote_required")).toBe(false);
    expect(isProductRuleStatusSendable("restriction_source_incomplete")).toBe(
      false,
    );
    expect(isProductRuleStatusSendable("unavailable")).toBe(false);
  });

  it("does not block warnings or completed auto-derivations", () => {
    const fingerprint = createSelectionFingerprint(baseSelection);
    const result = evaluateSendability({
      productStatus: "documented_limited",
      issues: [issue("warning"), issue("auto_derive")],
      selectedDesignId: "design-a",
      priceStatus: "authoritative",
      selectionFingerprint: fingerprint,
      pricedSelectionFingerprint: fingerprint,
      catalogVersion: "norman-2026-07",
      pricedCatalogVersion: "norman-2026-07",
    });

    expect(hasHardBlock(result.blockingIssues)).toBe(false);
    expect(result).toMatchObject({ sendable: true, reasons: [] });
  });

  it("fails closed for status, selection, price, catalog, and hard blocks", () => {
    const result = evaluateSendability({
      productStatus: "restriction_source_incomplete",
      issues: [issue("hard_block", "roller.max-width")],
      selectedDesignId: null,
      priceStatus: "stale",
      selectionFingerprint: "sha256:current",
      pricedSelectionFingerprint: "sha256:old",
      catalogVersion: "norman-2026-08",
      pricedCatalogVersion: "norman-2026-07",
    });

    expect(result.sendable).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "product_status_not_sendable",
      "missing_selected_design",
      "price_not_authoritative",
      "selection_fingerprint_mismatch",
      "catalog_version_mismatch",
      "hard_block",
    ]);
    expect(result.blockingIssues.map((item) => item.ruleId)).toEqual([
      "roller.max-width",
    ]);
  });
});

describe("catalog as-of selection", () => {
  const catalogs = [
    {
      catalogVersion: "roller-2026-07",
      effectiveFrom: "2026-07-01" as const,
      effectiveUntil: "2026-08-01" as const,
    },
    {
      catalogVersion: "roller-2026-08",
      effectiveFrom: "2026-08-01" as const,
    },
  ];

  it("uses inclusive starts and exclusive ends with an injected date", () => {
    expect(catalogIsActiveAsOf(catalogs[0], "2026-07-31")).toBe(true);
    expect(catalogIsActiveAsOf(catalogs[0], "2026-08-01")).toBe(false);
    expect(selectCatalogAsOf(catalogs, "2026-07-31")?.catalogVersion).toBe(
      "roller-2026-07",
    );
    expect(selectCatalogAsOf(catalogs, "2026-08-01")?.catalogVersion).toBe(
      "roller-2026-08",
    );
  });

  it("returns undefined before the first catalog and accepts UTC Date inputs", () => {
    expect(selectCatalogAsOf(catalogs, "2026-06-30")).toBeUndefined();
    expect(
      selectCatalogAsOf(
        catalogs,
        new Date("2026-08-01T23:59:59.000Z"),
      )?.catalogVersion,
    ).toBe("roller-2026-08");
  });

  it("rejects invalid windows, invalid dates, and ambiguous releases", () => {
    expect(() => selectCatalogAsOf(catalogs, "2026-02-30")).toThrow(
      /valid calendar date/,
    );
    expect(() =>
      catalogIsActiveAsOf(
        {
          catalogVersion: "invalid",
          effectiveFrom: "2026-08-01",
          effectiveUntil: "2026-08-01",
        },
        "2026-08-01",
      ),
    ).toThrow(/must be after/);
    expect(() =>
      selectCatalogAsOf(
        [
          { catalogVersion: "a", effectiveFrom: "2026-08-01" },
          { catalogVersion: "b", effectiveFrom: "2026-08-01" },
        ],
        "2026-08-01",
      ),
    ).toThrow(/Ambiguous/);
  });
});
