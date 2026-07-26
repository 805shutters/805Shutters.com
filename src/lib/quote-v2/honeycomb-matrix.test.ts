import { describe, expect, it } from "vitest";
import type { SelectionContext, SelectionRecord } from "./core";
import {
  HONEYCOMB_DIMENSION_PROFILES,
  HONEYCOMB_FRAME_PROFILES,
  HONEYCOMB_TWO_ON_ONE_PROFILES,
  evaluateHoneycombDimensionLimits,
  normalizeHoneycombCellSize,
  normalizeHoneycombFabricClass,
  resolveHoneycombMatrixProfile,
  validateHoneycombMatrix,
} from "./honeycomb-matrix";

const STEP = 1 / 16;

function selection(
  configuration: SelectionRecord = {},
  overrides: Partial<SelectionContext> = {},
): SelectionContext {
  return {
    manufacturerId: "norman",
    productId: "honeycomb",
    programId: "honeycomb_3_8in_cordless_single_and_3_4in_single",
    catalogVersion: "805-v2-norman-2026-07",
    catalogAsOf: "2026-07-20",
    widthInches: 36,
    heightInches: 60,
    quantity: 1,
    configuration: {
      application: "Standard Horizontal",
      lift_system: "SmartRise Cordless",
      mount_type: "Inside Mount",
      cell_size: '3/8" Single Cell',
      fabric_collection: "Light Filtering",
      ...configuration,
    },
    options: {},
    ...overrides,
  };
}

function ruleIds(context: SelectionContext): string[] {
  return validateHoneycombMatrix(context).map((issue) => issue.ruleId);
}

describe("Norman Honeycomb authoritative dimension matrix", () => {
  it("normalizes all six source cell sizes and exact fabric families", () => {
    expect([
      normalizeHoneycombCellSize('3/8" Single Cell'),
      normalizeHoneycombCellSize('9/16" Single'),
      normalizeHoneycombCellSize('1/2" Double'),
      normalizeHoneycombCellSize('3/4" Single'),
      normalizeHoneycombCellSize('3/4" Double'),
      normalizeHoneycombCellSize('1 1/4" Single'),
    ]).toEqual([
      "3_8_single",
      "9_16_single",
      "1_2_double",
      "3_4_single",
      "3_4_double",
      "1_1_4_single",
    ]);
    expect(normalizeHoneycombFabricClass("Designer Fabric (RD) (Ashton)")).toBe(
      "designer_ashton",
    );
    expect(
      normalizeHoneycombFabricClass("Designer Fabric (LF) (Silverbrook)"),
    ).toBe("designer_lf");
    expect(normalizeHoneycombFabricClass("FR Essentials")).toBe(
      "fr_essentials",
    );
  });

  it("tests min, just below min, max, and just above max for every normalized NET-size row", () => {
    expect(HONEYCOMB_DIMENSION_PROFILES.length).toBeGreaterThanOrEqual(30);
    for (const profile of HONEYCOMB_DIMENSION_PROFILES) {
      const { minWidth, maxWidth, minHeight, maxHeight, maxAreaSqFt } =
        profile.limits;
      expect(
        evaluateHoneycombDimensionLimits(profile.limits, minWidth, minHeight),
      ).not.toContain("min_width");
      expect(
        evaluateHoneycombDimensionLimits(
          profile.limits,
          minWidth - STEP,
          minHeight,
        ),
      ).toContain("min_width");
      expect(
        evaluateHoneycombDimensionLimits(profile.limits, maxWidth, minHeight),
      ).not.toContain("max_width");
      expect(
        evaluateHoneycombDimensionLimits(
          profile.limits,
          maxWidth + STEP,
          minHeight,
        ),
      ).toContain("max_width");
      expect(
        evaluateHoneycombDimensionLimits(profile.limits, minWidth, minHeight),
      ).not.toContain("min_height");
      expect(
        evaluateHoneycombDimensionLimits(
          profile.limits,
          minWidth,
          minHeight - STEP,
        ),
      ).toContain("min_height");
      expect(
        evaluateHoneycombDimensionLimits(profile.limits, minWidth, maxHeight),
      ).not.toContain("max_height");
      expect(
        evaluateHoneycombDimensionLimits(
          profile.limits,
          minWidth,
          maxHeight + STEP,
        ),
      ).toContain("max_height");
      if (maxAreaSqFt !== undefined) {
        const boundaryHeight = 144;
        const boundaryWidth = maxAreaSqFt;
        expect(
          evaluateHoneycombDimensionLimits(
            profile.limits,
            boundaryWidth,
            boundaryHeight,
          ),
        ).not.toContain("max_area");
        expect(
          evaluateHoneycombDimensionLimits(
            profile.limits,
            boundaryWidth + STEP,
            boundaryHeight,
          ),
        ).toContain("max_area");
      }
    }
  });

  it("tests every frame-to-frame numeric boundary for 0 through 3 T-posts", () => {
    for (const frame of HONEYCOMB_FRAME_PROFILES) {
      for (let tPosts = 0; tPosts <= 3; tPosts += 1) {
        const minWidth = frame.minWidthsByTPostCount[tPosts];
        const maxWidth = frame.maxWidthsByTPostCount[tPosts];
        for (const minHeight of [frame.minHeight, frame.minDualHeight]) {
          const limits = {
            minWidth,
            maxWidth,
            minHeight,
            maxHeight: frame.maxHeight,
          };
          expect(
            evaluateHoneycombDimensionLimits(limits, minWidth, minHeight),
          ).toEqual([]);
          expect(
            evaluateHoneycombDimensionLimits(
              limits,
              minWidth - STEP,
              minHeight,
            ),
          ).toContain("min_width");
          expect(
            evaluateHoneycombDimensionLimits(
              limits,
              maxWidth + STEP,
              minHeight,
            ),
          ).toContain("max_width");
          expect(
            evaluateHoneycombDimensionLimits(
              limits,
              minWidth,
              minHeight - STEP,
            ),
          ).toContain("min_height");
          expect(
            evaluateHoneycombDimensionLimits(
              limits,
              minWidth,
              frame.maxHeight + STEP,
            ),
          ).toContain("max_height");
        }
      }
    }
  });

  it("tests every 2-on-1 whole-unit dimension envelope at and immediately outside each boundary", () => {
    for (const profile of HONEYCOMB_TWO_ON_ONE_PROFILES) {
      const limits = {
        minWidth: profile.minWidth,
        maxWidth: profile.maxWidth,
        minHeight: profile.minHeight,
        maxHeight: profile.maxHeight,
      };
      expect(
        evaluateHoneycombDimensionLimits(
          limits,
          profile.minWidth,
          profile.minHeight,
        ),
      ).toEqual([]);
      expect(
        evaluateHoneycombDimensionLimits(
          limits,
          profile.minWidth - STEP,
          profile.minHeight,
        ),
      ).toContain("min_width");
      expect(
        evaluateHoneycombDimensionLimits(
          limits,
          profile.maxWidth + STEP,
          profile.minHeight,
        ),
      ).toContain("max_width");
      expect(
        evaluateHoneycombDimensionLimits(
          limits,
          profile.minWidth,
          profile.minHeight - STEP,
        ),
      ).toContain("min_height");
      expect(
        evaluateHoneycombDimensionLimits(
          limits,
          profile.minWidth,
          profile.maxHeight + STEP,
        ),
      ).toContain("max_height");
      expect(profile.maxPerShadeWidth + STEP).toBeGreaterThan(
        profile.maxPerShadeWidth,
      );
      expect(profile.maxPerShadeAreaSqFt + 1 / 144).toBeGreaterThan(
        profile.maxPerShadeAreaSqFt,
      );
    }
  });

  it("resolves exact source rows, prioritizing fabric-specific Solus and FR rows", () => {
    expect(resolveHoneycombMatrixProfile(selection())).toMatchObject({
      ok: true,
      profile: { id: "smartrise-small" },
    });
    expect(
      resolveHoneycombMatrixProfile(
        selection({
          cell_size: '3/4" Single Cell',
          fabric_collection: "Solus",
        }),
      ),
    ).toMatchObject({ ok: true, profile: { id: "smartrise-solus" } });
    expect(
      resolveHoneycombMatrixProfile(
        selection({
          cell_size: '3/8" Single Cell',
          fabric_collection: "Flame Resistant (LF)",
        }),
      ),
    ).toMatchObject({ ok: true, profile: { id: "smartrise-fr-3-8" } });
  });

  it("fails closed for unknown/incompatible configurations and resolves only exact motorized evidence", () => {
    expect(
      resolveHoneycombMatrixProfile(selection({ cell_size: "mystery" })),
    ).toMatchObject({ ok: false, code: "CELL_REQUIRED" });
    expect(
      resolveHoneycombMatrixProfile(
        selection({
          application: "SmartFit for Sloped Windows",
          lift_system: "SmartFit",
          cell_size: '3/4" Single Cell',
        }),
      ),
    ).toMatchObject({ ok: false, code: "SYSTEM_CELL_INELIGIBLE" });
    expect(
      resolveHoneycombMatrixProfile(
        selection({
          lift_system: "Norman Smart Motorized Bottom Up",
        }),
      ),
    ).toMatchObject({ ok: false, code: "MOTORIZATION_SOURCE_INCOMPLETE" });
    expect(
      resolveHoneycombMatrixProfile(
        selection({
          lift_system: "Norman Smart Motorized Bottom Up",
          motor_type:
            "Norman Smart Rechargeable Battery with Wireless Charging Wand",
          motor_position: "Right",
          hub_required: false,
        }),
      ),
    ).toMatchObject({
      ok: true,
      profile: {
        id: "norman-smart-bottom-up",
        sourceId: "norman-motorization-guide-2026-07",
        limits: { minWidth: 24, maxWidth: 120, maxAreaSqFt: 90 },
      },
    });
    expect(
      ruleIds(selection({ fabric_collection: "Unknown collection" })),
    ).toContain("honeycomb.matrix.fabric_class_required");
  });

  it("enforces every page-5 conditional boundary at one sixteenth", () => {
    const smartRise = (w: number, h: number) =>
      ruleIds(selection({}, { widthInches: w, heightInches: h }));
    expect(smartRise(24.9375, 86)).not.toContain(
      "honeycomb.matrix.smartrise_tall_min_width",
    );
    expect(smartRise(24.9375, 86.0625)).toContain(
      "honeycomb.matrix.smartrise_tall_min_width",
    );
    expect(smartRise(25, 86.0625)).not.toContain(
      "honeycomb.matrix.smartrise_tall_min_width",
    );

    const tdbu = (w: number, h: number) =>
      ruleIds(
        selection(
          { lift_system: "Cordless TDBU", cell_size: '9/16" Single Cell' },
          { widthInches: w, heightInches: h },
        ),
      );
    expect(tdbu(29.9375, 86)).not.toContain(
      "honeycomb.matrix.tdbu_tall_min_width",
    );
    expect(tdbu(29.9375, 86.0625)).toContain(
      "honeycomb.matrix.tdbu_tall_min_width",
    );
    expect(tdbu(30, 86.0625)).not.toContain(
      "honeycomb.matrix.tdbu_tall_min_width",
    );

    const cordLoopTd = (w: number, h: number) =>
      ruleIds(
        selection(
          { lift_system: "Cord Loop TD" },
          { widthInches: w, heightInches: h },
        ),
      );
    expect(cordLoopTd(29.9375, 72)).not.toContain(
      "honeycomb.matrix.cord_loop_td_day_night_tall_min_width",
    );
    expect(cordLoopTd(29.9375, 72.0625)).toContain(
      "honeycomb.matrix.cord_loop_td_day_night_tall_min_width",
    );
    expect(cordLoopTd(30, 72.0625)).not.toContain(
      "honeycomb.matrix.cord_loop_td_day_night_tall_min_width",
    );

    const woven = (w: number, h: number) =>
      ruleIds(
        selection(
          {
            lift_system: "Woven Cordless",
            cell_size: '3/4" Single Cell',
            fabric_collection: "Windsong AB0632",
          },
          { widthInches: w, heightInches: h },
        ),
      );
    expect(woven(19.0625, 62.0625)).not.toContain(
      "honeycomb.matrix.woven_narrow_max_height",
    );
    expect(woven(19, 62)).not.toContain(
      "honeycomb.matrix.woven_narrow_max_height",
    );
    expect(woven(19, 62.0625)).toContain(
      "honeycomb.matrix.woven_narrow_max_height",
    );
  });

  it("requires exact Day & Night positions and enforces prohibited/prescribed pairs", () => {
    const base = {
      lift_system: "Cordless Day & Night",
      fabric_collection: "Sheer",
      rear_fabric_collection: "Light Filtering",
      rear_cell_size: '3/8" Single Cell',
    };
    expect(ruleIds(selection(base))).toContain(
      "honeycomb.matrix.day_night.layer_position_required",
    );
    expect(
      ruleIds(selection({ ...base, day_night_top_layer: "front" })),
    ).not.toEqual(
      expect.arrayContaining([
        "honeycomb.matrix.day_night.layer_position_required",
        "honeycomb.matrix.day_night.top_only_fabric",
      ]),
    );
    expect(
      ruleIds(selection({ ...base, day_night_top_layer: "rear" })),
    ).toContain("honeycomb.matrix.day_night.top_only_fabric");
    expect(
      ruleIds(
        selection({
          ...base,
          rear_fabric_collection: "Sheer",
          day_night_top_layer: "front",
        }),
      ),
    ).toContain("honeycomb.matrix.day_night.sheer_pair");
  });

  it("enforces SmartFit slope and framed panel evidence without deriving panel sizes", () => {
    const sloped = selection({
      application: "SmartFit for Sloped Windows",
      lift_system: "SmartFit",
      slope_angle_degrees: 45,
    });
    expect(ruleIds(sloped)).not.toContain("honeycomb.matrix.slope_angle");
    expect(
      ruleIds({
        ...sloped,
        configuration: {
          ...sloped.configuration,
          slope_angle_degrees: 44.9375,
        },
      }),
    ).toContain("honeycomb.matrix.slope_angle");
    expect(
      ruleIds({
        ...sloped,
        configuration: {
          ...sloped.configuration,
          slope_angle_degrees: 90.0625,
        },
      }),
    ).toContain("honeycomb.matrix.slope_angle");

    const framed = selection(
      {
        application: "SmartFit with Frame",
        lift_system: "SmartFit",
        frame_type: "Vintage L Frame (1/4 Light Block)",
        t_post_count: 0,
      },
      { widthInches: 40, heightInches: 70 },
    );
    expect(ruleIds(framed)).toContain(
      "honeycomb.matrix.frame.panel_net_sizes_required",
    );
    expect(
      ruleIds({
        ...framed,
        configuration: {
          ...framed.configuration,
          honeycomb_panel_net_widths: [38],
          honeycomb_panel_net_heights: [68],
        },
      }),
    ).not.toContain("honeycomb.matrix.frame.panel_net_sizes_required");
  });

  it("enforces Specialty Shape ratios and exact numeric leg boundaries", () => {
    const perfect = selection(
      {
        application: "Specialty Shape",
        specialty_shape: "Perfect Arch",
        non_operable: true,
      },
      { widthInches: 40, heightInches: 20 },
    );
    expect(ruleIds(perfect)).not.toContain(
      "honeycomb.matrix.specialty.perfect_arch_ratio",
    );
    expect(ruleIds({ ...perfect, heightInches: 20.0625 })).toContain(
      "honeycomb.matrix.specialty.perfect_arch_ratio",
    );

    const elongated = selection(
      {
        application: "Specialty Shape",
        specialty_shape: "Elongated Eyebrow",
        non_operable: true,
        left_leg_height_inches: 1,
        right_leg_height_inches: 1,
      },
      { widthInches: 40, heightInches: 21 },
    );
    expect(ruleIds(elongated)).not.toContain(
      "honeycomb.matrix.specialty.elongated_eyebrow_legs",
    );
    expect(
      ruleIds({
        ...elongated,
        configuration: {
          ...elongated.configuration,
          left_leg_height_inches: 0.9375,
          right_leg_height_inches: 0.9375,
        },
      }),
    ).toContain("honeycomb.matrix.specialty.elongated_eyebrow_legs");
    expect(
      ruleIds({
        ...elongated,
        configuration: {
          ...elongated.configuration,
          right_leg_height_inches: 1.0625,
        },
      }),
    ).toContain("honeycomb.matrix.specialty.elongated_eyebrow_legs");
  });

  it("uses the documented 24-inch Vertical minimum, custom-split limits, and splice formula", () => {
    const vertical = selection(
      {
        application: "Patio Door Vertical",
        lift_system: "Patio Door Vertical",
        cell_size: '3/4" Single Cell',
        stacking_configuration: "Custom Split",
        vertical_left_width_inches: 15,
        vertical_right_width_inches: 115,
      },
      { widthInches: 130, heightInches: 24 },
    );
    expect(ruleIds(vertical)).not.toEqual(
      expect.arrayContaining([
        "honeycomb.matrix.vertical.min_height",
        "honeycomb.matrix.vertical.custom_split_left_width",
        "honeycomb.matrix.vertical.custom_split_total",
      ]),
    );
    expect(ruleIds({ ...vertical, heightInches: 23.9375 })).toContain(
      "honeycomb.matrix.vertical.min_height",
    );
    expect(
      ruleIds({
        ...vertical,
        configuration: {
          ...vertical.configuration,
          vertical_left_width_inches: 14.9375,
          vertical_right_width_inches: 115.0625,
        },
      }),
    ).toContain("honeycomb.matrix.vertical.custom_split_left_width");
    expect(
      validateHoneycombMatrix(vertical).find(
        (entry) =>
          entry.ruleId === "honeycomb.matrix.vertical.headrail_splice_derived",
      )?.severity,
    ).toBe("auto_derive");
  });

  it("enforces exact horizontal and vertical cut-out boundaries", () => {
    const cutout = (
      shadeWidth: number,
      cutoutWidth: number,
      cutoutHeight: number,
    ) =>
      ruleIds(
        selection(
          {
            cutout: true,
            cutout_width_inches: cutoutWidth,
            cutout_height_inches: cutoutHeight,
          },
          { widthInches: shadeWidth, heightInches: 60 },
        ),
      );
    expect(cutout(16, 0.125, 0.875)).toContain(
      "honeycomb.matrix.cutout.cordless_width_ineligible",
    );
    expect(cutout(16.0625, 0.75, 0.875)).not.toEqual(
      expect.arrayContaining([
        "honeycomb.matrix.cutout.width",
        "honeycomb.matrix.cutout.height",
      ]),
    );
    expect(cutout(16.0625, 0.8125, 0.875)).toContain(
      "honeycomb.matrix.cutout.width",
    );
    expect(cutout(23.5625, 1, 58)).not.toEqual(
      expect.arrayContaining([
        "honeycomb.matrix.cutout.width",
        "honeycomb.matrix.cutout.height",
      ]),
    );
    expect(cutout(23.5625, 1.0625, 58.0625)).toEqual(
      expect.arrayContaining([
        "honeycomb.matrix.cutout.width",
        "honeycomb.matrix.cutout.height",
      ]),
    );

    const vertical = selection(
      {
        application: "Patio Door Vertical",
        lift_system: "Patio Door Vertical",
        cell_size: '3/4" Single Cell',
        stacking_configuration: "Traveling Center Stack",
        cutout: true,
        cutout_type: "Baseboard",
        cutout_height_inches: 6,
        vertical_cutout_rail: "movable",
      },
      { widthInches: 80, heightInches: 80 },
    );
    expect(ruleIds(vertical)).not.toEqual(
      expect.arrayContaining([
        "honeycomb.matrix.cutout.vertical_height",
        "honeycomb.matrix.cutout.vertical_rail",
      ]),
    );
    expect(
      ruleIds({
        ...vertical,
        configuration: {
          ...vertical.configuration,
          cutout_height_inches: 6.0625,
          vertical_cutout_rail: "stationary",
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        "honeycomb.matrix.cutout.vertical_height",
        "honeycomb.matrix.cutout.vertical_rail",
      ]),
    );
  });

  it("attaches immutable July 2026 page provenance to every issue", () => {
    const issues = validateHoneycombMatrix(selection({}, { widthInches: 1 }));
    expect(issues.length).toBeGreaterThan(0);
    for (const entry of issues) {
      expect(entry.source).toMatchObject({
        sourceId: "norman-honeycomb-guide-2026-07",
        fileName: "Honeycomb Shade Guide (1).pdf",
        revision: "July 2026",
        effectiveDate: "2026-07-01",
        sha256:
          "94cba8c6b2bc7c73e134d8bfd4a4ccfbfba82392d220bfb6ec0bd5f4d210495b",
      });
      expect(entry.source.page ?? entry.source.pages).toBeTruthy();
    }
  });
});
