import { describe, expect, it } from "vitest";
import type { SelectionContext, SelectionRecord } from "./core";
import {
  normalizeRollerRegionScope,
  resolveRollerOffering,
  resolveRollerMatrixProfile,
  rollerSheetForSelection,
  validateRollerMatrix,
} from "./roller-matrix";
import { normanRollerV2Source } from "./generated/norman-roller-v2.generated";

function context(
  configuration: SelectionRecord,
  overrides: Partial<SelectionContext> = {},
): SelectionContext {
  return {
    manufacturerId: "norman",
    productId: "roller",
    programId: "roller-cordless-pg1",
    catalogVersion: "805-v2-norman-roller-2026-08-01",
    catalogAsOf: "2026-08-01",
    widthInches: 36,
    heightInches: 60,
    quantity: 1,
    configuration: {
      mount_type: "Inside Mount",
      roller_application: "Single Shade",
      lift_system: "Cordless",
      fabric_collection: "Amelia",
      fabric_color_code: "F1484",
      roller_top_treatment: "No Top Treatment",
      roller_tube: "All Tubes",
      ...configuration,
    },
    options: {},
    ...overrides,
  };
}

describe("Norman Roller V2 exact restriction matrix", () => {
  it("resolves all 23 regional split identities only from an explicit Roller jurisdiction", () => {
    const splitOfferings = normanRollerV2Source.offerings.filter(
      (offering) => offering.regionScope !== "all_regions",
    );
    const identities = new Map<string, typeof splitOfferings>();
    for (const offering of splitOfferings) {
      const key = `${offering.collection.toLowerCase()}::${offering.colorCode.toLowerCase()}`;
      identities.set(key, [...(identities.get(key) ?? []), offering]);
    }

    expect(identities.size).toBe(23);
    expect(splitOfferings).toHaveLength(46);
    for (const offerings of identities.values()) {
      expect(offerings.map((offering) => offering.regionScope).sort()).toEqual([
        "ca_ma",
        "other_regions",
      ]);
      const selected = offerings[0];
      const base = context({
        fabric_collection: selected.collection,
        fabric_color_code: selected.colorCode,
      });
      expect(resolveRollerOffering(base)).toMatchObject({
        ok: false,
        code: "REGION_SCOPE_REQUIRED",
      });
      expect(
        resolveRollerOffering({
          ...base,
          configuration: {
            ...base.configuration,
            roller_region_scope: "continental_us",
          },
        }),
      ).toMatchObject({ ok: false, code: "REGION_SCOPE_UNKNOWN" });

      for (const regionScope of ["ca_ma", "other_regions"] as const) {
        const resolved = resolveRollerOffering({
          ...base,
          configuration: { ...base.configuration, roller_region_scope: regionScope },
        });
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) continue;
        const expected = offerings.find(
          (offering) => offering.regionScope === regionScope,
        );
        expect(resolved.offering.id).toBe(expected?.id);
        expect(resolved.offering.fabricCode).toBe(expected?.fabricCode);
        expect(resolved.regionScopeRequired).toBe(true);
      }
    }

    const garden = context({
      fabric_collection: "Garden",
      fabric_color_code: "F1516",
      roller_region_scope: "ca_ma",
    });
    expect(resolveRollerOffering(garden)).toMatchObject({
      ok: true,
      offering: { fabricCode: "AB0653-A" },
    });
    expect(resolveRollerOffering({
      ...garden,
      configuration: {
        ...garden.configuration,
        roller_region_scope: "other_regions",
      },
    })).toMatchObject({
      ok: true,
      offering: { fabricCode: "AB0653" },
    });
  });

  it("normalizes only explicit manufacturer jurisdictions and never treats a shipping zone as one", () => {
    expect(normalizeRollerRegionScope("CA/MA states only")).toBe("ca_ma");
    expect(normalizeRollerRegionScope("For all other regions")).toBe("other_regions");
    expect(normalizeRollerRegionScope("continental_us")).toBeNull();

    const resolved = resolveRollerOffering(
      context({}, { options: { shipping_region: "continental_us" } }),
    );
    expect(resolved).toMatchObject({
      ok: true,
      regionScope: "all_regions",
      regionScopeRequired: false,
    });
  });

  it("routes all 12 documented application matrices deterministically", () => {
    const cases: Array<[SelectionRecord, string]> = [
      [{ roller_application: "Single Shade" }, "Single(Non-LG360)&Common"],
      [{ roller_application: "LightGuard 360" }, "LG360&w T-post split & housing"],
      [{ roller_application: "LightGuard 360 with T-Post", roller_coupling_count: 2, coupling_arrangement: "Standard Coupled" }, "LG360 with T-Post (2 ) (Std)"],
      [{ roller_application: "LightGuard 360 with T-Post", roller_coupling_count: 2, coupling_arrangement: "Independently Operated" }, "LG360 with T-Post (2 ) (Ind)"],
      [{ roller_application: "LightGuard 360 with T-Post", roller_coupling_count: 3 }, "LG360 with T-Post (3 Shades)"],
      [{ roller_application: "LightGuard 360 with T-Post", roller_coupling_count: 4 }, "LG360 with T-Post (4 Shades)"],
      [{ roller_application: "Coupled Shades", roller_coupling_count: 2, coupling_arrangement: "Standard Coupled" }, "Standard Coupled Shade(2)"],
      [{ roller_application: "Independently Operated Coupled Shades", roller_coupling_count: 2, coupling_arrangement: "Independently Operated" }, "Independently Coupled Shade(2)"],
      [{ roller_application: "Dual Roller" }, "Dual"],
      [{ roller_application: "Single Shade", roller_top_treatment: "Cassette" }, "Cassette"],
      [{ roller_application: "Coupled Shades", roller_coupling_count: 3 }, "Coupled Shades(3)"],
      [{ roller_application: "Coupled Shades", roller_coupling_count: 4 }, "Coupled Shades(4)"],
    ];
    for (const [configuration, expected] of cases) {
      expect(rollerSheetForSelection(context(configuration))).toBe(expected);
    }
  });

  it("resolves an exact offering, source row, definition, assignment, and profile", () => {
    const resolved = resolveRollerMatrixProfile(context({}));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.offering).toMatchObject({ collection: "Amelia", colorCode: "F1484", fabricCode: "AA0346" });
    expect(resolved.definition).toMatchObject({
      sheet: "Single(Non-LG360)&Common",
      operatingSystem: "Cordless",
      usable: true,
    });
    expect(resolved.assignment.sourceCells).not.toEqual({});
    expect(resolved.profile.limits).toMatchObject({ minWidth: 9.5, minHeight: 12, maxWidth: 118, maxHeight: 144 });
  });

  it("tests exact width and height boundaries at and one sixteenth beyond each limit", () => {
    const base = context({});
    const resolved = resolveRollerMatrixProfile(base);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const { minWidth, minHeight, maxWidth, maxHeight } = resolved.profile.limits;
    expect(minWidth).toBeDefined();
    expect(minHeight).toBeDefined();
    expect(maxWidth).toBeDefined();
    expect(maxHeight).toBeDefined();
    const blocked = (candidate: SelectionContext, ruleId: string) =>
      validateRollerMatrix(candidate).some((issue) => issue.ruleId === ruleId);
    expect(blocked({ ...base, widthInches: minWidth! }, "roller.matrix.minWidth")).toBe(false);
    expect(blocked({ ...base, widthInches: minWidth! - 0.0625 }, "roller.matrix.minWidth")).toBe(true);
    expect(blocked({ ...base, widthInches: maxWidth! }, "roller.matrix.maxWidth")).toBe(false);
    expect(blocked({ ...base, widthInches: maxWidth! + 0.0625 }, "roller.matrix.maxWidth")).toBe(true);
    expect(blocked({ ...base, heightInches: minHeight! }, "roller.matrix.minHeight")).toBe(false);
    expect(blocked({ ...base, heightInches: minHeight! - 0.0625 }, "roller.matrix.minHeight")).toBe(true);
    expect(blocked({ ...base, heightInches: maxHeight! }, "roller.matrix.maxHeight")).toBe(false);
    expect(blocked({ ...base, heightInches: maxHeight! + 0.0625 }, "roller.matrix.maxHeight")).toBe(true);
  });

  it("fails closed for unknown offerings and source profiles with invalid units", () => {
    expect(
      resolveRollerMatrixProfile(context({
        roller_application: "LightGuard 360 with T-Post",
        roller_coupling_count: 2,
      })),
    ).toMatchObject({ ok: false, code: "SHEET_NOT_RESOLVED" });
    expect(resolveRollerMatrixProfile(context({ fabric_color_code: "UNKNOWN" }))).toMatchObject({
      ok: false,
      code: "OFFERING_NOT_FOUND",
    });
    expect(resolveRollerMatrixProfile(context({
      roller_application: "LightGuard 360",
      roller_top_treatment: "LightGuard 360 Housing",
      roller_tube: '1 3/4" (43mm) Tube',
      lift_system: "Motorized",
      roller_power_configuration: "Automate Low Voltage DC Motor",
    }))).toMatchObject({ ok: false, code: "SOURCE_PROFILE_UNUSABLE" });
  });

  it("requires every coupled component order width and reconciles their sum to overall order width", () => {
    const coupled = context({
      roller_application: "Coupled Shades",
      roller_coupling_count: 2,
      coupling_arrangement: "Standard Coupled",
      lift_system: "Continuous Cord Loop",
      roller_tube: '1 3/4" (43mm) Tube',
    }, { widthInches: 100 });
    expect(validateRollerMatrix(coupled).map((issue) => issue.ruleId)).toContain(
      "roller.matrix.component_widths_required",
    );

    const mismatched = {
      ...coupled,
      configuration: {
        ...coupled.configuration,
        roller_component_order_widths: [45, 50],
      },
    };
    expect(validateRollerMatrix(mismatched).map((issue) => issue.ruleId)).toContain(
      "roller.matrix.component_width_total_mismatch",
    );

    const reconciled = {
      ...coupled,
      configuration: {
        ...coupled.configuration,
        roller_component_order_widths: [50, 50],
      },
    };
    expect(validateRollerMatrix(reconciled).map((issue) => issue.ruleId)).not.toEqual(
      expect.arrayContaining([
        "roller.matrix.component_widths_required",
        "roller.matrix.component_width_total_mismatch",
      ]),
    );
  });

  it("requires the documented coupled-pair side for three-shade pair and single-area checks", () => {
    const threeShade = context({
      roller_application: "Coupled Shades",
      roller_coupling_count: 3,
      lift_system: "Continuous Cord Loop",
      roller_tube: '1 3/4" (43mm) Tube',
      roller_component_order_widths: [40, 40, 40],
    }, { widthInches: 120 });
    const withoutGrouping = validateRollerMatrix(threeShade).map((issue) => issue.ruleId);
    expect(withoutGrouping).toContain("roller.matrix.coupled_grouping_required");

    const withGrouping = validateRollerMatrix({
      ...threeShade,
      configuration: {
        ...threeShade.configuration,
        roller_coupled_grouping: "coupled_left_single_right",
      },
    }).map((issue) => issue.ruleId);
    expect(withGrouping).not.toContain("roller.matrix.coupled_grouping_required");
  });
});
