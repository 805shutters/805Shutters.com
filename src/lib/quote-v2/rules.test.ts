import { describe, expect, it } from "vitest";
import {
  QUOTE_V2_CATALOG_VERSION,
  QUOTE_V2_ROLLER_PREVIEW_VERSION,
} from "./catalog";
import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { productRuleStatusForSelection, validateSelection } from "./rules";
import { normanHoneycombV2Source } from "./generated/norman-honeycomb-v2.generated";

function selection(
  productId: string,
  configuration: SelectionRecord,
  overrides: Partial<SelectionContext> = {},
): SelectionContext {
  const programByProduct: Record<string, string> = {
    roller: "roller_cordless_fabric_price_group_2_pg2",
    roman: "roman_cordless_usa_price_group_2_pg2",
    honeycomb: "honeycomb_3_8in_cordless_single_and_3_4in_single",
    synchrony_vertical:
      "synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1",
    vertical_honeycomb: "honeycomb_vertical",
  };
  const catalogAsOf = productId === "roller" ? "2026-08-01" : "2026-07-20";
  return {
    manufacturerId: "norman",
    productId,
    programId: programByProduct[productId] ?? `${productId}-test-program`,
    catalogVersion:
      productId === "roller"
        ? QUOTE_V2_ROLLER_PREVIEW_VERSION
        : QUOTE_V2_CATALOG_VERSION,
    catalogAsOf,
    widthInches: 36,
    heightInches: 60,
    quantity: 1,
    configuration,
    options: {},
    ...overrides,
  };
}

function hardBlocks(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.filter((entry) => entry.severity === "hard_block");
}

function ruleIds(context: SelectionContext): string[] {
  return validateSelection(context).map((entry) => entry.ruleId);
}

const rollerConfiguration: SelectionRecord = {
  mount_type: "Inside Mount",
  roller_region_scope: "ca_ma",
  roller_application: "Single",
  lift_system: "Cordless",
  fabric_collection: "Amelia",
  fabric_color_code: "F1484",
  roller_top_treatment: "No Top Treatment",
  roller_tube: "All Tubes",
};

const romanConfiguration: SelectionRecord = {
  mount_type: "Inside Mount",
  shade_type: "Single",
  lift_system: "Cordless",
  fold_style: "Flat Fold without Seams",
  fabric_collection: "Alma",
  fabric_color_code: "F1621",
  lining: "Translucent",
  fabric_orientation: "Standard",
  seaming: "No Seams",
};

const honeycombConfiguration: SelectionRecord = {
  mount_type: "Inside Mount",
  cell_size: '3/8" Single Cell',
  lift_system: "SmartRise Cordless",
  fabric_color_code: "C7015K",
  fabric_collection: "Light Filtering",
  application: "Standard Horizontal",
};

const verticalConfiguration: SelectionRecord = {
  mount_type: "Inside Mount",
  mount_depth_inches: 3.75,
  fabric_collection: "Classic",
  fabric_color_name: "Pure White",
  stack_option: "Left",
  draw_direction: "Left Wand",
};

describe("Quote V2 authoritative manufacturer rules", () => {
  it("rejects an undocumented Norman dealer schedule", () => {
    const context = selection("honeycomb", honeycombConfiguration);
    expect(
      ruleIds({ ...context, options: { schedule_discount_percent: 29 } }),
    ).toContain("common.dealer_program.unsupported");
  });

  it.each([null, "", "   ", "not-a-number", true, [], {}])(
    "rejects a present malformed dealer schedule %#",
    (schedule) => {
      const context = selection("honeycomb", honeycombConfiguration);
      expect(
        ruleIds({
          ...context,
          options: { schedule_discount_percent: schedule },
        }),
      ).toContain("common.dealer_program.unsupported");
    },
  );

  it("defaults only an absent schedule and accepts numeric UI strings", () => {
    const context = selection("honeycomb", honeycombConfiguration);
    expect(ruleIds({ ...context, options: {} })).not.toContain(
      "common.dealer_program.unsupported",
    );
    expect(
      ruleIds({
        ...context,
        options: { schedule_discount_percent: "28.5" },
      }),
    ).not.toContain("common.dealer_program.unsupported");
  });

  it("rejects the future Roller appendix before August 1 and allows an injected preview date", () => {
    const before = selection("roller", rollerConfiguration, {
      catalogAsOf: "2026-07-31",
      catalogVersion: QUOTE_V2_CATALOG_VERSION,
    });
    expect(ruleIds(before)).toContain("roller.appendix.effective_date");

    const preview = selection("roller", rollerConfiguration, { catalogAsOf: "2026-08-01" });
    expect(ruleIds(preview)).not.toContain("roller.appendix.effective_date");
  });

  it("enforces Maui limits from the exact source matrix rather than a hard-coded fabric guess", () => {
    const striped = {
      ...rollerConfiguration,
      lift_system: "SmartRelease",
      roller_tube: '1 3/4" (43mm) Tube',
      fabric_collection: "Maui",
      fabric_color_code: "F1543",
    };
    expect(ruleIds(selection("roller", striped, { widthInches: 94.5 }))).not.toContain(
      "roller.matrix.maxWidth",
    );
    expect(ruleIds(selection("roller", striped, { widthInches: 94.5625 }))).toContain(
      "roller.matrix.maxWidth",
    );

    const natural = {
      ...striped,
      roller_tube: '2" (52mm) Tube',
      fabric_color_code: "F1548",
    };
    expect(ruleIds(selection("roller", natural, { widthInches: 120, heightInches: 94.5 }))).not.toContain(
      "roller.matrix.maxAreaSqft",
    );
    expect(ruleIds(selection("roller", natural, { widthInches: 120, heightInches: 94.5625 }))).toContain(
      "roller.matrix.maxAreaSqft",
    );
    expect(ruleIds(selection("roller", natural, { widthInches: 120.0625 }))).toContain(
      "roller.matrix.maxWidth",
    );
  });

  it("requires complete Roller application, top-treatment, tube, and motor-power evidence", () => {
    const incomplete = selection("roller", {
      mount_type: "Inside Mount",
      roller_application: "Coupled Shades",
      lift_system: "Motorized",
      fabric_collection: "Amelia",
      fabric_color_code: "F1484",
    });
    expect(ruleIds(incomplete)).toEqual(
      expect.arrayContaining([
        "roller.required.roller_top_treatment",
        "roller.required.roller_tube",
        "roller.application.component_count",
        "roller.motor.required",
        "roller.motor.power.required",
      ]),
    );

    const mismatchedMotor = {
      ...rollerConfiguration,
      lift_system: "Motorized",
      roller_power_configuration: "Automate ARC Motor",
      motor_type: "Low Voltage DC Motor",
    };
    expect(ruleIds(selection("roller", mismatchedMotor))).toContain(
      "roller.motor.price_configuration_mismatch",
    );
    expect(
      ruleIds(selection("roller", {
        ...mismatchedMotor,
        motor_type: "Motor (Rechargeable Battery Pack)",
      })),
    ).toContain("roller.motorization.canonical_required");

    const canonical = ruleIds(selection("roller", {
      ...mismatchedMotor,
      motor_type: "stale legacy value ignored by canonical contract",
      motorization_selections: [
        {
          groupId: "automate_home",
          optionId: "motor_rechargeable_battery_pack",
          role: "base_motor",
          units: 1,
        },
      ],
    }));
    expect(canonical).not.toContain("roller.motor.price_configuration_mismatch");
    expect(canonical).not.toContain("roller.motorization.canonical_required");
    expect(canonical).not.toContain("roller.motorization.power_motor_mismatch");
  });

  it("enforces Roman Day & Night exact rear identity and 3:1 ratio", () => {
    const dayNight = { ...romanConfiguration, shade_type: "Day & Night" };
    expect(ruleIds(selection("roman", dayNight))).toContain(
      "roman.day_night.rear_exact_color_required",
    );

    const validRear = {
      ...dayNight,
      rear_fabric_collection: "Amelia",
      rear_fabric_color_code: "F1484",
    };
    expect(ruleIds(selection("roman", validRear, { widthInches: 30, heightInches: 90 }))).not.toContain(
      "roman.day_night.max_ratio",
    );
    expect(ruleIds(selection("roman", validRear, { widthInches: 30, heightInches: 90.0625 }))).toContain(
      "roman.day_night.max_ratio",
    );

    const excludedRear = {
      ...dayNight,
      rear_fabric_collection: "Maui",
      rear_fabric_color_code: "F1543",
    };
    expect(ruleIds(selection("roman", excludedRear))).toContain(
      "roman.day_night.rear_color_ineligible",
    );

    const narrowRear = {
      ...dayNight,
      rear_fabric_collection: "Java",
      rear_fabric_color_code: "F0858",
    };
    expect(
      ruleIds(selection("roman", narrowRear, { widthInches: 78 })),
    ).not.toContain("roman.day_night.rear_fabric.max_width");
    expect(
      ruleIds(selection("roman", narrowRear, { widthInches: 78.0625 })),
    ).toContain("roman.day_night.rear_fabric.max_width");
  });

  it("enforces Roman orientation, seaming, and exact banding identities", () => {
    expect(
      ruleIds(selection("roman", {
        ...romanConfiguration,
        fold_style: "Flat Fold with Batten Back",
        fabric_orientation: "Railroaded",
        seaming: "Vertical Seams",
      })),
    ).toContain("roman.seaming.orientation_conflict");

    const edgeBase = {
      ...romanConfiguration,
      fold_style: "Edge Banded",
      fabric_collection: "Alma",
      fabric_color_code: "F1621",
      banding_color: "F1621 Dusk Blue",
    };
    expect(ruleIds(selection("roman", edgeBase))).toContain(
      "roman.edge_banding.same_as_base",
    );
    expect(
      ruleIds(selection("roman", { ...edgeBase, banding_color: "F1622 Coronet Blue" })),
    ).not.toContain("roman.edge_banding.same_as_base");

    const narrowFabric = {
      ...romanConfiguration,
      fabric_collection: "Belgian Linen",
      fabric_color_code: "F1051",
      fabric_orientation: "Standard / Non-Railroaded",
      seaming: "No Seams",
    };
    expect(
      ruleIds(selection("roman", narrowFabric, {
        widthInches: 60,
        programId: "roman_cordless_usa_price_group_3_pg3",
      })),
    ).toContain("roman.fabric.orientation_ack_required");
  });

  it("requires an exact Roman headrail before applying continuous-loop width limits", () => {
    const continuous = {
      ...romanConfiguration,
      lift_system: "Continuous Cord Loop",
    };
    expect(ruleIds(selection("roman", continuous))).toContain(
      "roman.continuous_loop.headrail_required",
    );
    expect(
      ruleIds(selection("roman", { ...continuous, headrail_size: '1 1/2" Headrail' })),
    ).not.toContain("roman.continuous_loop.headrail_required");
  });

  it("quarantines Caroline F1090 and fails closed on incomplete Roman motorization evidence", () => {
    const f1090 = { ...romanConfiguration, fabric_collection: "Caroline", fabric_color_code: "F1090" };
    expect(ruleIds(selection("roman", f1090))).toContain("roman.fabric.f1090.quarantined");

    const motorized = selection("roman", { ...romanConfiguration, lift_system: "Motorized" });
    expect(productRuleStatusForSelection(motorized)).toBe("documented_limited");
    expect(ruleIds(motorized)).toContain("roman.motorization.power_source_required");
  });

  it("requires actual Common Valance panels and enforces gap and total width boundaries", () => {
    const common = { ...romanConfiguration, shade_type: "Common Valance" };
    expect(ruleIds(selection("roman", common))).toEqual(
      expect.arrayContaining([
        "roman.common_valance.two_panel_widths_required",
        "roman.common_valance.gap_range",
      ]),
    );

    const valid = {
      ...common,
      common_valance_panel_widths: [71.9375, 71.9375],
      common_valance_gap: 0.125,
    };
    expect(ruleIds(selection("roman", valid, { widthInches: 144 }))).not.toContain(
      "roman.common_valance.max_total_width",
    );
    const over = { ...valid, common_valance_panel_widths: [72, 72] };
    expect(ruleIds(selection("roman", over))).toContain("roman.common_valance.max_total_width");
  });

  it("enforces the corrected Honeycomb 9/16 TDBU height and tall-width boundaries", () => {
    const tdbu = {
      ...honeycombConfiguration,
      cell_size: '9/16" Single Cell',
      lift_system: "Cordless TDBU",
    };
    expect(ruleIds(selection("honeycomb", tdbu, { widthInches: 30, heightInches: 96 }))).not.toContain(
      "honeycomb.matrix.tdbu-9-16.max_height",
    );
    expect(ruleIds(selection("honeycomb", tdbu, { widthInches: 30, heightInches: 96.0625 }))).toContain(
      "honeycomb.matrix.tdbu-9-16.max_height",
    );

    expect(ruleIds(selection("honeycomb", honeycombConfiguration, { widthInches: 24.9375, heightInches: 87 }))).toContain(
      "honeycomb.matrix.smartrise_tall_min_width",
    );
    expect(ruleIds(selection("honeycomb", honeycombConfiguration, { widthInches: 25, heightInches: 87 }))).not.toContain(
      "honeycomb.matrix.smartrise_tall_min_width",
    );
  });

  it("rejects stale Honeycomb fabrics, invalid Day & Night pairs, 2-on-1 SmartRelease, and prohibited cutouts", () => {
    const whispers = selection("honeycomb", {
      ...honeycombConfiguration,
      fabric_collection: "Whispers",
      fabric_color_code: "C9999",
    });
    expect(productRuleStatusForSelection(whispers)).toBe("unavailable");
    expect(ruleIds(whispers)).toContain("honeycomb.fabric.whispers.unavailable");

    const dayNight = selection("honeycomb", {
      ...honeycombConfiguration,
      lift_system: "Cordless Day & Night",
      rear_fabric_collection: "Light Filtering",
      rear_cell_size: '9/16" Single Cell',
      rear_fabric_color_code: "C9999",
    });
    expect(ruleIds(dayNight)).toContain("honeycomb.day_night.invalid_pair");

    const smartRelease = selection("honeycomb", {
      ...honeycombConfiguration,
      lift_system: "SmartRelease",
      shade_type: "2 on 1",
    });
    expect(ruleIds(smartRelease)).toContain("honeycomb.matrix.two_on_one.configuration_ineligible");

    const cutout = selection("honeycomb", {
      ...honeycombConfiguration,
      lift_system: "Cordless TDBU",
      cutout: true,
    });
    expect(ruleIds(cutout)).toContain("honeycomb.matrix.cutout.configuration_ineligible");
  });

  it("fails closed for products without an explicit audited V2 restriction status", () => {
    expect(
      productRuleStatusForSelection(
        selection("future_manufacturer_product", honeycombConfiguration),
      ),
    ).toBe("restriction_source_incomplete");
  });

  it("keeps Lotus FLX manufacturer identity separate and never infers a missing center split", () => {
    const base = selection(
      "lotus_faux_wood_blinds",
      {
        supplier: "Lotus",
        mount_type: "Outside Mount",
        lotus_configuration_version: "lotus-faux-v2",
        lotus_program_code: "FLX",
        product_line: "FLX",
        slat_size: '2"',
        color: "Bright White",
        lotus_finish: "Smooth",
        lotus_blind_count: 3,
        lotus_blind_widths_inches: [23],
      },
      {
        manufacturerId: "lotus",
        programId: "lotus_flx_2in_bright_white_custom",
        widthInches: 94.375,
        heightInches: 70.25,
      },
    );
    expect(productRuleStatusForSelection(base)).toBe("documented_limited");
    expect(ruleIds(base)).toContain(
      "lotus.faux.split.three_widths_required",
    );
    expect(ruleIds(base)).toContain(
      "lotus.faux.authority.needs_effective_date_and_fitment",
    );

    const complete = {
      ...base,
      configuration: {
        ...base.configuration,
        lotus_blind_widths_inches: [23, 48.375, 23],
      },
    };
    expect(ruleIds(complete)).not.toContain(
      "lotus.faux.split.three_widths_required",
    );
    expect(hardBlocks(validateSelection(complete))).toHaveLength(0);

    const mixedManufacturer = {
      ...complete,
      configuration: {
        ...complete.configuration,
        product_line: "SmartPrivacy",
      },
    };
    expect(ruleIds(mixedManufacturer)).toContain(
      "lotus.faux.program.product_line_mismatch",
    );
  });

  it("records three Norman faux-wood blinds per opening without deriving the center", () => {
    const context = selection(
      "smartprivacy_faux",
      {
        mount_type: "Side Mount",
        product_line: "SmartPrivacy",
        slat_size: '2"',
        color: "Pure White",
        faux_configuration_version: "faux-wood-v2",
        faux_blind_count: 3,
        faux_blind_widths_inches: [23],
      },
      {
        programId:
          "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
        widthInches: 94.125,
        heightInches: 70.25,
      },
    );
    expect(ruleIds(context)).toContain(
      "faux.split.three_widths_required",
    );
    expect(
      ruleIds({
        ...context,
        configuration: {
          ...context.configuration,
          faux_blind_widths_inches: [23, 48.125, 23],
        },
      }),
    ).not.toContain("faux.split.three_widths_required");
  });

  it("uses collection plus color identity and exact application inventories for Honeycomb", () => {
    expect(
      ruleIds(selection("honeycomb", {
        ...honeycombConfiguration,
        fabric_collection: "Wrong Collection",
      })),
    ).toContain("honeycomb.fabric.unknown_identity");

    expect(
      ruleIds(selection("honeycomb", {
        ...honeycombConfiguration,
        fabric_collection: "Designer Fabric (LF) (Silverbrook)",
        fabric_color_code: "C7207K",
        cell_size: '3/8" Single Cell',
      })),
    ).toContain("honeycomb.fabric.cell_ineligible");

    expect(
      ruleIds(selection("honeycomb", {
        ...honeycombConfiguration,
        fabric_collection: "Sheer",
        fabric_color_code: "C5004",
      })),
    ).toContain("honeycomb.sheer.day_night_only");

    expect(
      ruleIds(selection("honeycomb", {
        ...honeycombConfiguration,
        application: "SmartFit with Frame",
        lift_system: "SmartFit with Frame",
        cell_size: '3/8" Single Cell',
        frame_type: "Beaded L Frame",
      })),
    ).not.toContain("honeycomb.fabric.cell_ineligible");

    expect(
      ruleIds(selection("honeycomb", {
        ...honeycombConfiguration,
        application: "SmartFit for Sloped Windows with Frame",
        lift_system: "SmartFit for Sloped Windows with Frame",
        cell_size: '3/8" Single Cell',
        frame_type: "Beaded L Frame",
        slope_angle_degrees: 45,
      })),
    ).not.toContain("honeycomb.matrix.slope.angle");

    expect(
      ruleIds(selection("honeycomb", {
        ...honeycombConfiguration,
        application: "SmartFit with Frame",
        lift_system: "SmartFit with Frame",
        cell_size: '3/8" Single Cell',
        frame_type: "",
      })),
    ).toContain("honeycomb.matrix.frame.type_required");

    const specialty = {
      ...honeycombConfiguration,
      application: "Specialty Shapes",
      lift_system: "",
    };
    expect(ruleIds(selection("honeycomb", specialty))).not.toContain(
      "honeycomb.required.lift_system",
    );

    const verticalIds = new Set(
      normanHoneycombV2Source.verticalColors.map(
        (row) => `${row.family}\u0000${row.customerColorCode}`,
      ),
    );
    const excluded = normanHoneycombV2Source.activeColors.find(
      (row) => !verticalIds.has(`${row.family}\u0000${row.customerColorCode}`),
    );
    expect(excluded).toBeDefined();
    if (!excluded) return;
    expect(
      ruleIds(selection("honeycomb", {
        ...honeycombConfiguration,
        application: "Patio Door Vertical",
        fabric_collection: excluded.family,
        fabric_color_code: excluded.customerColorCode,
        cell_size: excluded.cellSizes[0],
      })),
    ).toContain("honeycomb.fabric.application_ineligible");

    const patioDoor = selection("honeycomb", {
      ...honeycombConfiguration,
      application: "Patio Door Vertical",
      lift_system: "Patio Door Vertical",
      cell_size: '3/4" Single Cell',
      stacking_configuration: "One Way",
    });
    expect(productRuleStatusForSelection(patioDoor)).toBe("documented_limited");
    expect(ruleIds({ ...patioDoor, heightInches: 23.9375 })).toContain(
      "honeycomb.matrix.vertical.min_height",
    );
    expect(ruleIds({ ...patioDoor, heightInches: 24 })).not.toContain(
      "honeycomb.matrix.vertical.min_height",
    );
  });

  it("keeps the legacy separate Vertical Honeycomb product manual and enforces the documented 146-inch maximum", () => {
    const context = selection("vertical_honeycomb", {
      ...honeycombConfiguration,
      application: "Patio Door Vertical",
      lift_system: "Patio Door Vertical",
      cell_size: '3/4" Single Cell',
      stacking_configuration: "One Way",
    }, { widthInches: 146.0625 });
    expect(productRuleStatusForSelection(context)).toBe("manual_quote_required");
    expect(ruleIds(context)).toContain("honeycomb.matrix.vertical.max_width");
    expect(ruleIds(context)).not.toContain("honeycomb.vertical.minimum_height_undocumented");
  });

  it("enforces every Synchrony dimension boundary and active color identity", () => {
    for (const [width, blocked] of [[18, false], [17.9375, true], [100, false], [100.0625, true]] as const) {
      expect(ruleIds(selection("synchrony_vertical", verticalConfiguration, { widthInches: width })).includes("vertical.dimension.width")).toBe(blocked);
    }
    for (const [height, blocked] of [[36, false], [35.9375, true], [108, false], [108.0625, true]] as const) {
      expect(ruleIds(selection("synchrony_vertical", verticalConfiguration, { heightInches: height })).includes("vertical.dimension.height")).toBe(blocked);
    }
    expect(ruleIds(selection("synchrony_vertical", { ...verticalConfiguration, fabric_collection: "Willow", fabric_color_name: "Cloud" }))).toContain(
      "vertical.color.inactive_or_unknown",
    );
  });

  it("derives exact Synchrony deductions, bracket count, center support, and wand drop without hard-blocking recommendations", () => {
    const context = selection("synchrony_vertical", verticalConfiguration, { widthInches: 78, heightInches: 96.0625 });
    const issues = validateSelection(context);
    expect(hardBlocks(issues)).toHaveLength(0);
    expect(issues.find((entry) => entry.ruleId === "vertical.inside_mount.deductions")?.derivedValues).toEqual({
      finishedWidthInches: 77.625,
      finishedHeightInches: 95.875,
    });
    expect(issues.find((entry) => entry.ruleId === "vertical.bracket_count")?.derivedValues).toEqual({
      bracketCount: 3,
      centerSupportRequired: true,
    });
    expect(issues.find((entry) => entry.ruleId === "vertical.wand_drop")?.derivedValues).toEqual({ wandDropInches: 61 });
    expect(issues.find((entry) => entry.ruleId === "vertical.inside_mount.depth_class")?.derivedValues).toEqual({
      insideMountClass: "fully_flushed",
    });
    expect(
      ruleIds(selection("synchrony_vertical", { ...verticalConfiguration, mount_depth_inches: 2.75 })),
    ).toContain("vertical.inside_mount.minimum_depth");
  });
});
