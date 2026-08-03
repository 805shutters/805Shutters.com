import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import {
  ONYX_BINDER_SOURCE,
  ONYX_SHUTTER_RULE_STATUS,
  ONYX_US_MADE_VINYL_PRICE,
  ONYX_US_MADE_VINYL_PORTAL_FIXTURE,
  ONYX_US_MADE_VINYL_PORTAL_SOURCE,
  evaluateOnyxShutterRestrictions,
  validateOnyxShutterRestrictions,
} from "./onyx-rules";

function selection(overrides: Partial<SelectionContext> = {}): SelectionContext {
  return {
    manufacturerId: "onyx",
    productId: "onyx_shutters",
    programId: "onyx_us_made_vinyl",
    catalogVersion: "805-v2-norman-2026-07",
    catalogAsOf: "2026-07-20",
    widthInches: 31.75,
    heightInches: 61.75,
    quantity: 1,
    configuration: {
      material: "Onyx U.S. Made Vinyl",
      order_type: "standard",
      measurement_basis: "frame_to_frame",
      mount_type: "outside",
      frame_type: "L Frame",
      frame_extension_inches: 0,
      available_depth_inches: 0.4375,
      panel_configuration: "L",
      panel_widths_inches: [30],
      panel_heights_inches: [60],
      louver_size_inches: 2.5,
      color_name: "White",
      hinge_color: "White",
      tilt_type: "standard",
      hidden_tilt_notch_back_of_louver: false,
      divider_rail_count: 0,
      t_post_count: 0,
      window_application: "standard",
    },
    options: {},
    ...overrides,
  };
}

function withConfiguration(
  base: SelectionContext,
  configuration: Record<string, unknown>,
): SelectionContext {
  return {
    ...base,
    configuration: { ...base.configuration, ...configuration } as SelectionContext["configuration"],
  };
}

const matching = (issues: ReturnType<typeof validateOnyxShutterRestrictions>, ruleId: string) =>
  issues.filter((candidate) => candidate.ruleId === ruleId);

describe("Onyx source identity and safe status", () => {
  it("pins the audited binder, keeps dealer evidence, and does not call the legacy 2.5 policy MSRP", () => {
    expect(ONYX_BINDER_SOURCE.sha256).toBe(
      "eafb25916b3ff57947596206f05bae4867a7e95d6d46d9c58e2ffd030891f26b",
    );
    expect(ONYX_US_MADE_VINYL_PRICE.dealerCostPerSquareFoot).toBe(13.6);
    expect(
      ONYX_US_MADE_VINYL_PRICE.currentPortalDealerCostPerBillableSquareFoot,
    ).toBe(13.65);
    expect(ONYX_US_MADE_VINYL_PRICE.pricingConflict).toBe(true);
    expect(ONYX_US_MADE_VINYL_PORTAL_SOURCE.sha256).toBe(
      "8396fc5fadef32982a5731ce007e2b41d133de038f769d00ac44681f037f7eaf",
    );
    expect(ONYX_US_MADE_VINYL_PORTAL_FIXTURE).toMatchObject({
      widthInches: 30,
      heightInches: 72,
      frameType: "VL Outside",
      portalBillableSquareFeet: 17.564,
      portalDealerCostPerBillableSquareFoot: 13.65,
      portalLinePrice: 239.749,
      portalSurcharge: 0,
    });
    expect(
      ONYX_US_MADE_VINYL_PORTAL_FIXTURE.portalBillableSquareFeet *
        ONYX_US_MADE_VINYL_PORTAL_FIXTURE.portalDealerCostPerBillableSquareFoot,
    ).toBeCloseTo(ONYX_US_MADE_VINYL_PORTAL_FIXTURE.portalLinePrice, 3);
    expect(ONYX_US_MADE_VINYL_PRICE.retailMultiplier).toBeNull();
    expect(ONYX_US_MADE_VINYL_PRICE.customerRetailPerSquareFoot).toBeNull();
    expect(ONYX_US_MADE_VINYL_PRICE.legacyUserDirectedRetailMultiplier).toBe(2.5);
    expect(ONYX_US_MADE_VINYL_PRICE.legacyUserDirectedCustomerRetailPerSquareFoot).toBe(34);
  });

  it("keeps U.S. Made Vinyl restriction_source_incomplete and explains the product-identity gap", () => {
    const result = evaluateOnyxShutterRestrictions(selection());
    expect(result.productStatus).toBe(ONYX_SHUTTER_RULE_STATUS);
    expect(result.productStatus).toBe("restriction_source_incomplete");
    expect(matching(result.issues as ReturnType<typeof validateOnyxShutterRestrictions>, "onyx.us_made_vinyl.restriction_identity_unverified")).toHaveLength(1);
    expect(matching(result.issues as ReturnType<typeof validateOnyxShutterRestrictions>, "onyx.source.current_effective_revision_missing")).toHaveLength(1);
    expect(matching(result.issues as ReturnType<typeof validateOnyxShutterRestrictions>, "onyx.price.portal_source_conflict")).toHaveLength(1);
    expect(matching(result.issues as ReturnType<typeof validateOnyxShutterRestrictions>, "onyx.panel.maximum_area_source_incomplete")).toHaveLength(1);
  });

  it("requires the exact U.S. Made material identity and never aliases generic Vinyl", () => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), { material: "Vinyl" }),
    );
    expect(matching(issues, "onyx.us_made_vinyl.exact_material_required")).toHaveLength(1);
  });

  it("does not apply Vinyl limits to Bassia or Hybrid by guess", () => {
    const bassia = validateOnyxShutterRestrictions(
      withConfiguration(
        { ...selection(), programId: "bassia" },
        { material: "Bassia" },
      ),
    );
    expect(matching(bassia, "onyx.non_vinyl.rules_not_normalized")).toHaveLength(1);
    expect(matching(bassia, "onyx.panel.height.range.vinyl")).toHaveLength(0);
  });
});

describe("Onyx documented panel boundaries", () => {
  it.each([8, 30])("accepts the Vinyl single-panel width boundary %s", (width) => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), { panel_widths_inches: [width] }),
    );
    expect(matching(issues, "onyx.panel.width.range.vinyl")).toHaveLength(0);
  });

  it.each([7.999, 30.001])("blocks immediately outside the Vinyl single-panel width boundary %s", (width) => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), { panel_widths_inches: [width] }),
    );
    expect(matching(issues, "onyx.panel.width.range.vinyl")).toHaveLength(1);
  });

  it.each([8, 20])("accepts each Vinyl multiple-panel width boundary %s", (width) => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        panel_configuration: "LR",
        panel_widths_inches: [width, width],
        panel_heights_inches: [60, 60],
      }),
    );
    expect(matching(issues, "onyx.panel.width.range.vinyl")).toHaveLength(0);
  });

  it.each([7.999, 20.001])("blocks each Vinyl multiple-panel width immediately outside %s", (width) => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        panel_configuration: "LR",
        panel_widths_inches: [width, 20],
        panel_heights_inches: [60, 60],
      }),
    );
    expect(matching(issues, "onyx.panel.width.range.vinyl")).toHaveLength(1);
  });

  it.each([16, 84])("accepts the Vinyl panel-height boundary %s", (height) => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), { panel_heights_inches: [height] }),
    );
    expect(matching(issues, "onyx.panel.height.range.vinyl")).toHaveLength(0);
  });

  it.each([15.999, 84.001])("blocks immediately outside the Vinyl panel-height boundary %s", (height) => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), { panel_heights_inches: [height] }),
    );
    expect(matching(issues, "onyx.panel.height.range.vinyl")).toHaveLength(1);
  });

  it("requires one divider rail immediately above 72 inches, not at 72", () => {
    const at = validateOnyxShutterRestrictions(
      withConfiguration(selection(), { panel_heights_inches: [72], divider_rail_count: 0 }),
    );
    const above = validateOnyxShutterRestrictions(
      withConfiguration(selection(), { panel_heights_inches: [72.001], divider_rail_count: 0 }),
    );
    expect(matching(at, "onyx.divider_rail.minimum_required")).toHaveLength(0);
    expect(matching(above, "onyx.divider_rail.minimum_required")).toHaveLength(1);
  });
});

describe("Onyx documented frame, depth, and tilt boundaries", () => {
  it("auto-derives the exact four-sided inside window-size pricing footprint", () => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        measurement_basis: "window_size",
        mount_type: "inside",
        frame_type: "Z Frame Fine",
        frame_sides: 4,
        available_depth_inches: 2,
        opening_diagonal_difference_inches: 0,
      }),
    );
    expect(matching(issues, "onyx.measurement.window_size_pricing_unsupported")).toHaveLength(0);
    expect(matching(issues, "onyx.measurement.frame_to_frame_required")).toHaveLength(0);
    expect(matching(issues, "onyx.measurement.window_size_pricing_dimensions")).toMatchObject([
      {
        severity: "auto_derive",
        source: { sourceId: "onyx-reference-guide-2020-2021", page: 13 },
        derivedValues: {
          pricing_width_inches: 33.75,
          pricing_height_inches: 63.75,
          width_addition_inches: 2,
          height_addition_inches: 2,
        },
      },
    ]);
  });

  it("uses the documented three-sided height addition", () => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        measurement_basis: "window_size",
        mount_type: "inside",
        frame_type: "Z Frame Crown",
        frame_sides: 3,
        available_depth_inches: 2.5,
        opening_diagonal_difference_inches: 0,
      }),
    );
    expect(matching(issues, "onyx.measurement.window_size_pricing_dimensions")).toMatchObject([
      {
        derivedValues: {
          pricing_width_inches: 36,
          pricing_height_inches: 63.875,
          width_addition_inches: 4.25,
          height_addition_inches: 2.125,
        },
      },
    ]);
  });

  it("requires a frame-side count and accepts profile-derived window-size frames", () => {
    const missingSides = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        measurement_basis: "window_size",
        mount_type: "inside",
        frame_type: "Z Frame Fine",
      }),
    );
    expect(matching(missingSides, "onyx.required.frame_sides")).toHaveLength(1);
    expect(matching(missingSides, "onyx.measurement.window_size_pricing_unsupported")).toHaveLength(1);

    const undocumented = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        measurement_basis: "window_size",
        mount_type: "inside",
        frame_type: "Vinyl Z Frame Small",
        frame_sides: 4,
      }),
    );
    expect(matching(undocumented, "onyx.required.frame_sides")).toHaveLength(0);
    expect(matching(undocumented, "onyx.measurement.window_size_pricing_unsupported")).toHaveLength(0);
    expect(matching(undocumented, "onyx.measurement.window_size_pricing_dimensions")).toHaveLength(1);
  });

  it("accepts the documented three-sided outside window-size formula", () => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        measurement_basis: "window_size",
        mount_type: "outside",
        frame_type: "Decor Frame 2",
        frame_sides: 3,
      }),
    );
    expect(matching(issues, "onyx.measurement.window_size_pricing_unsupported")).toHaveLength(0);
    expect(matching(issues, "onyx.measurement.frame_to_frame_required")).toHaveLength(0);
    expect(matching(issues, "onyx.measurement.window_size_pricing_dimensions")).toMatchObject([
      {
        derivedValues: {
          pricing_width_inches: 37.25,
          pricing_height_inches: 64.5,
          width_addition_inches: 5.5,
          height_addition_inches: 2.75,
        },
      },
    ]);
  });

  it("allows exactly 2 inches of extension and blocks immediately above it", () => {
    const at = validateOnyxShutterRestrictions(
      withConfiguration(selection(), { frame_extension_inches: 2 }),
    );
    const above = validateOnyxShutterRestrictions(
      withConfiguration(selection(), { frame_extension_inches: 2.001 }),
    );
    expect(matching(at, "onyx.frame.extension.range")).toHaveLength(0);
    expect(matching(above, "onyx.frame.extension.range")).toHaveLength(1);
  });

  it("enforces the exact 3.5-inch inside-Z depth and the hidden-notch quarter inch", () => {
    const required = 2 + 3 / 32;
    const at = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        mount_type: "inside",
        frame_type: "Z Frame Fine",
        louver_size_inches: 3.5,
        available_depth_inches: required,
        opening_diagonal_difference_inches: 0.375,
      }),
    );
    const below = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        mount_type: "inside",
        frame_type: "Z Frame Fine",
        louver_size_inches: 3.5,
        available_depth_inches: required - 0.001,
        opening_diagonal_difference_inches: 0.375,
      }),
    );
    const hiddenBelow = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        mount_type: "inside",
        frame_type: "Z Frame Fine",
        louver_size_inches: 3.5,
        available_depth_inches: required + 0.249,
        opening_diagonal_difference_inches: 0.375,
        hidden_tilt_notch_back_of_louver: true,
      }),
    );
    expect(matching(at, "onyx.depth.minimum")).toHaveLength(0);
    expect(matching(below, "onyx.depth.minimum")).toHaveLength(1);
    expect(matching(hiddenBelow, "onyx.depth.minimum")).toHaveLength(1);
  });

  it("permits 3/8-inch out-of-square inside mounting and blocks immediately above", () => {
    const at = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        mount_type: "inside",
        frame_type: "Z Frame Fine",
        available_depth_inches: 2,
        opening_diagonal_difference_inches: 0.375,
      }),
    );
    const above = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        mount_type: "inside",
        frame_type: "Z Frame Fine",
        available_depth_inches: 2,
        opening_diagonal_difference_inches: 0.376,
      }),
    );
    expect(matching(at, "onyx.mount.inside.out_of_square")).toHaveLength(0);
    expect(matching(above, "onyx.mount.inside.out_of_square")).toHaveLength(1);
  });

  it("accepts hidden tilt sections at 40 inches and blocks immediately above", () => {
    const at = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        tilt_type: "hidden",
        tilt_rod_section_lengths_inches: [40, 20],
      }),
    );
    const above = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        tilt_type: "hidden",
        tilt_rod_section_lengths_inches: [40.001, 19.999],
      }),
    );
    expect(matching(at, "onyx.tilt.hidden.section_length.maximum")).toHaveLength(0);
    expect(matching(above, "onyx.tilt.hidden.section_length.maximum")).toHaveLength(1);
  });
});

describe("Onyx special applications fail closed", () => {
  it("enforces Double Hung panel/T-post rules", () => {
    const invalid = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        order_type: "double_hung",
        panel_configuration: "LLRR",
        panel_widths_inches: [20, 20, 20, 20],
        panel_heights_inches: [60, 60, 60, 60],
        horizontal_t_post: false,
      }),
    );
    expect(matching(invalid, "onyx.double_hung.panel_count")).toHaveLength(1);
    expect(matching(invalid, "onyx.double_hung.width.maximum")).toHaveLength(1);
    expect(matching(invalid, "onyx.double_hung.horizontal_t_post_required")).toHaveLength(1);
  });

  it("validates known two-panel Bi Fold width but still requires manual manufacturer verification", () => {
    const atMinimum = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        order_type: "bifold",
        panel_configuration: "LR",
        panel_widths_inches: [12, 12],
        panel_heights_inches: [60, 60],
      }),
    );
    const below = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        order_type: "bifold",
        panel_configuration: "LR",
        panel_widths_inches: [11.999, 12],
        panel_heights_inches: [60, 60],
      }),
    );
    expect(matching(atMinimum, "onyx.bifold.width.range")).toHaveLength(0);
    expect(matching(atMinimum, "onyx.bifold.restriction_source_incomplete")).toHaveLength(1);
    expect(matching(below, "onyx.bifold.width.range")).toHaveLength(1);
  });

  it("blocks every specialty shape because the binder has no complete dimensions", () => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), { order_type: "specialty", specialty_shape: "arch" }),
    );
    expect(matching(issues, "onyx.specialty.manual_quote_required")).toHaveLength(1);
  });

  it("enforces French Door clearance and L-frame cutout rules, then remains incomplete", () => {
    const issues = validateOnyxShutterRestrictions(
      withConfiguration(selection(), {
        order_type: "french_door",
        frame_type: "Z Frame Fine",
        mount_type: "inside",
        available_depth_inches: 2,
        opening_diagonal_difference_inches: 0,
        flat_mounting_area_inches: 1.75,
        hardware_clearance_inches: 1.749,
        french_door_cutout: true,
        handle_center_from_bottom_inches: 36,
        lock_center_from_bottom_inches: 30,
      }),
    );
    expect(matching(issues, "onyx.french_door.flat_area.minimum")).toHaveLength(0);
    expect(matching(issues, "onyx.french_door.cutout.l_frame_only")).toHaveLength(1);
    expect(matching(issues, "onyx.french_door.extension_source_incomplete")).toHaveLength(1);
  });
});
