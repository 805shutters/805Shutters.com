import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { createSelectionFingerprint } from "./core";
import {
  EXACT_INTERFACE_V2_FRACTIONS,
  ExactInterfaceV2InputError,
  selectionContextFromExactInterface,
} from "./exact-interface-adapter";
import { validateOnyxShutterRestrictions } from "./onyx-rules";

const line = {
  id: "line-1",
  quote_id: "quote-1",
  room_name: "Living Room",
  product_type: "Roller Shades",
  width_whole: 35,
  width_fraction: "1/2",
  height_whole: 60,
  height_fraction: "0",
  quantity: 2,
  sort_order: 0,
  created_at: "2026-07-20T00:00:00.000Z",
} satisfies SalesQuoteLineItem;

const design = {
  supplier: "Norman",
  shade_type: "Single",
  lift_system: "Cordless",
  valance: "No Top Treatment",
  fabric: "Amelia",
  options_json: {
    fabric_color_collection: "Amelia",
    fabric_color_code: "F1484",
    fabric_color_name: "Mist Gray",
    roller_application: "Single",
    roller_tube: '1.5"',
    discount_percent: 10,
    authoritative_price_breakdown: { stale: true },
    pricing_grid_price: 999,
    quote_v2_catalog_as_of: "2026-08-01",
  },
} satisfies Partial<SalesQuoteDesign>;

describe("V2 exact-interface adapter", () => {
  it("captures complete manufacturer configuration and separates priced options", () => {
    const context = selectionContextFromExactInterface(line, design, {
      productId: "roller",
      programId: "roller_cordless_fabric_price_group_1_pg1",
      catalogAsOf: "2026-08-01",
    });
    expect(context).toMatchObject({
      productId: "roller",
      widthInches: 35.5,
      heightInches: 60,
      quantity: 2,
      catalogAsOf: "2026-08-01",
      catalogVersion: "805-v2-norman-roller-2026-08-01",
      configuration: {
        roller_application: "Single",
        roller_top_treatment: "No Top Treatment",
        roller_tube: '1.5"',
        fabric_collection: "Amelia",
        fabric_color_code: "F1484",
      },
      options: { discount_percent: 10 },
    });
    expect(context.configuration).not.toHaveProperty("authoritative_price_breakdown");
    expect(context.configuration).not.toHaveProperty("pricing_grid_price");
  });

  it("invalidates the fingerprint for every price-affecting dimension, fabric, lift, and option change", () => {
    const base = selectionContextFromExactInterface(line, design, {
      productId: "roller",
      programId: "roller_cordless_fabric_price_group_1_pg1",
    });
    const fingerprints = [
      base,
      { ...base, widthInches: base.widthInches + 0.0625 },
      { ...base, configuration: { ...base.configuration, fabric_color_code: "F1485" } },
      { ...base, configuration: { ...base.configuration, lift_system: "Continuous Cord Loop" } },
      { ...base, options: { ...base.options, discount_percent: 20 } },
    ].map(createSelectionFingerprint);
    expect(new Set(fingerprints)).toHaveLength(fingerprints.length);
  });

  it("accepts every existing sixteenth token and whole-number quantity without normalization", () => {
    for (const [fraction, decimal] of Object.entries(EXACT_INTERFACE_V2_FRACTIONS)) {
      const context = selectionContextFromExactInterface(
        { ...line, width_whole: 35, width_fraction: fraction, quantity: 3 },
        design,
        {
          productId: "roller",
          programId: "roller_cordless_fabric_price_group_1_pg1",
        },
      );
      expect(context.widthInches).toBe(35 + decimal);
      expect(context.quantity).toBe(3);
    }
  });

  it.each([
    { quantity: 0 as unknown, label: "zero" },
    { quantity: -1 as unknown, label: "negative" },
    { quantity: 1.5 as unknown, label: "fractional" },
    { quantity: Number.NaN as unknown, label: "NaN" },
    { quantity: "not-a-number" as unknown, label: "non-numeric" },
  ])("rejects $label quantity before a V2 selection can be fingerprinted", ({ quantity }) => {
    const adapt = () =>
      selectionContextFromExactInterface(
        { ...line, quantity } as unknown as SalesQuoteLineItem,
        design,
        {
          productId: "roller",
          programId: "roller_cordless_fabric_price_group_1_pg1",
        },
      );
    expect(adapt).toThrow(ExactInterfaceV2InputError);
    expect(adapt).toThrow(/quantity/);
  });

  it.each(["1/0", "2/4", "1/3", "16/16", "0/1", "bogus", ""])(
    "rejects unsupported fraction token %j instead of collapsing it onto the whole-number fingerprint",
    (widthFraction) => {
      const valid = selectionContextFromExactInterface(line, design, {
        productId: "roller",
        programId: "roller_cordless_fabric_price_group_1_pg1",
      });
      const validFingerprint = createSelectionFingerprint(valid);
      let invalidFingerprint: string | null = null;
      expect(() => {
        const invalid = selectionContextFromExactInterface(
          { ...line, width_fraction: widthFraction },
          design,
          {
            productId: "roller",
            programId: "roller_cordless_fabric_price_group_1_pg1",
          },
        );
        invalidFingerprint = createSelectionFingerprint(invalid);
      }).toThrow(ExactInterfaceV2InputError);
      expect(invalidFingerprint).toBeNull();
      expect(validFingerprint).toMatch(/^sha256:/);
    },
  );

  it("does not invalidate a selection when its immutable snapshot pointers are persisted", () => {
    const base = selectionContextFromExactInterface(line, design, {
      productId: "roller",
      programId: "roller_cordless_fabric_price_group_1_pg1",
    });
    const persisted = selectionContextFromExactInterface(line, {
      ...design,
      options_json: {
        ...design.options_json,
        priced_selection_fingerprint: `sha256:${"a".repeat(64)}`,
        priced_catalog_version: "805-v2-norman-roller-2026-08-01",
      },
    }, {
      productId: "roller",
      programId: "roller_cordless_fabric_price_group_1_pg1",
    });
    expect(createSelectionFingerprint(persisted)).toBe(
      createSelectionFingerprint(base),
    );
  });

  it("maps V2-only contextual fields from the unchanged design-card payload", () => {
    const context = selectionContextFromExactInterface(line, {
      ...design,
      options_json: {
        ...design.options_json,
        top_treatment_class: "Square Fascia",
        tube_class: '2"',
        power_configuration: "Automate Li-ion",
        back_fabric_color_collection: "Solitude",
        back_fabric_color_code: "F2001",
        common_valance_panel_1_width: "40.25",
        common_valance_panel_2_width: 42.5,
        common_valance_gap: 0.5,
        seaming: "Vertical Seams",
        honeycomb_frame_type: "Four-sided Frame",
        side_by_side_position: "Left",
        side_by_side_match_line_id: "line-2",
        side_by_side_matches: {
          mount_type: true,
          lift_system: true,
          fabric_color: true,
          shade_height: true,
          cell_size: true,
        },
        draw_direction: "Left Draw",
      },
    }, {
      productId: "roller",
      programId: "roller_cordless_fabric_price_group_1_pg1",
    });

    expect(context.configuration).toMatchObject({
      roller_top_treatment: "Square Fascia",
      roller_tube: '2"',
      roller_power_configuration: "Automate Li-ion",
      rear_fabric_collection: "Solitude",
      rear_fabric_color_code: "F2001",
      common_valance_panel_widths: [40.25, 42.5],
      fabric_join_acknowledgment: "Vertical Seams",
      frame_type: "Four-sided Frame",
      side_by_side: true,
      side_by_side_match_line_id: "line-2",
      side_by_side_wand_orientation: "Left Draw",
      shade_height: 60,
    });
    expect(context.configuration).not.toHaveProperty("side_by_side_matches");
  });

  it("does not misread the explicit Not Side-by-Side UI value as enabled", () => {
    const context = selectionContextFromExactInterface(line, {
      ...design,
      options_json: {
        ...design.options_json,
        side_by_side_position: "Not Side-by-Side",
      },
    }, {
      productId: "synchrony_vertical",
      programId: "synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1",
    });
    expect(context.configuration.side_by_side).toBe(false);
    expect(context.configuration).not.toHaveProperty("side_by_side_wand_orientation");
  });

  it("canonicalizes every documented Honeycomb geometry field from the existing card", () => {
    const context = selectionContextFromExactInterface(line, {
      supplier: "Norman",
      lift_system: "SmartFit Dual Shade",
      fabric: "Solitude",
      options_json: {
        honeycomb_application: "SmartFit with Frame",
        cell_size: "SmartFit with Frame",
        honeycomb_actual_cell_size: '3/4" Single Cell',
        back_fabric: "Classic LF",
        back_fabric_color_collection: "Classic LF",
        back_fabric_color_code: "C7001",
        back_fabric_color_name: "Cloud",
        back_fabric_color_id: "honeycomb:classic-lf:c7001",
        back_fabric_color_type: "Light Filtering",
        rear_cell_size: '3/4" Single Cell',
        honeycomb_frame_type: "Beaded L Frame",
        frame_t_post_count: "1",
        frame_t_post_1_location: "42.25",
        honeycomb_panel_1_net_width: "40.125",
        honeycomb_panel_1_net_height: 72,
        honeycomb_panel_2_net_width: 41.875,
        honeycomb_panel_2_net_height: "72",
        specialty_leg_height: "14",
        specialty_left_leg_height: "14.25",
        specialty_right_leg_height: 14.25,
        non_operable: "Yes",
        split_splice: "Center Opening - Custom Split",
        vertical_left_width_inches: 60,
        vertical_right_width_inches: "64",
      },
    }, {
      productId: "honeycomb",
      programId: "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1",
    });

    expect(context.configuration).toMatchObject({
      honeycomb_operating_system: "SmartFit Dual Shade",
      cell_size: '3/4" Single Cell',
      rear_fabric_collection: "Classic LF",
      rear_fabric_color_code: "C7001",
      rear_fabric_color_name: "Cloud",
      rear_fabric_color_id: "honeycomb:classic-lf:c7001",
      rear_fabric_class: "Light Filtering",
      rear_cell_size: '3/4" Single Cell',
      t_post_count: "1",
      t_post_positions_inches: [42.25],
      honeycomb_panel_net_widths: [40.125, 41.875],
      honeycomb_panel_net_heights: [72, 72],
      leg_height_inches: "14",
      left_leg_height_inches: "14.25",
      right_leg_height_inches: 14.25,
      non_operable: true,
      stacking_configuration: "Center Opening - Custom Split",
      vertical_left_width_inches: 60,
      vertical_right_width_inches: "64",
    });
  });

  it("preserves an explicit Honeycomb T-post count of zero", () => {
    const context = selectionContextFromExactInterface(line, {
      supplier: "Norman",
      lift_system: "SmartFit Shade",
      fabric: "Solitude",
      options_json: {
        honeycomb_application: "SmartFit with Frame",
        cell_size: "SmartFit with Frame",
        honeycomb_actual_cell_size: '3/4" Single Cell',
        frame_t_post_count: 0,
        honeycomb_panel_1_net_width: 35.5,
        honeycomb_panel_1_net_height: 60,
      },
    }, {
      productId: "honeycomb",
      programId: "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1",
    });

    expect(context.configuration).toMatchObject({
      t_post_count: 0,
      honeycomb_panel_net_widths: [35.5],
      honeycomb_panel_net_heights: [60],
    });
  });

  it("canonicalizes the familiar Onyx labels into the fail-closed rule contract", () => {
    const context = selectionContextFromExactInterface(line, {
      supplier: "Onyx",
      material: "Onyx US Made Vinyl",
      louver_size: '3 1/2"',
      tilt_type: "H2 - Hidden Tiltrod Notch On Louver",
      hinge_color: "Match",
      panel_config: "LR",
      options_json: {
        onyx_order_type: "Regular",
        size_type: "F - Frame to Frame",
        onyx_mount: "IM",
        frame_type: "VZ Small",
        color: "107_Swiss Coffee",
        frame_extension_inches: "0.5",
        available_depth_inches: 2.75,
        opening_diagonal_difference_inches: "0.25",
        onyx_panel_1_width_inches: "18",
        onyx_panel_2_width_inches: 18,
        onyx_panel_1_height_inches: 72,
        onyx_panel_2_height_inches: "72",
        onyx_tilt_section_1_inches: 36,
        onyx_tilt_section_2_inches: "36",
        onyx_t_post_count: "1",
        onyx_t_post_1_position_inches: "18",
        divider_rail: "Yes",
        divider_rail_location: "Custom",
        divider_rail_height: "36",
      },
    }, {
      productId: "onyx_shutters",
      programId: "onyx_us_made_vinyl",
    });

    expect(context.configuration).toMatchObject({
      material: "Onyx U.S. Made Vinyl",
      order_type: "standard",
      measurement_basis: "frame_to_frame",
      mount_type: "inside",
      frame_type: "Vinyl Z Frame Small",
      panel_configuration: "LR",
      louver_size_inches: 3.5,
      tilt_type: "hidden",
      hidden_tilt_notch_back_of_louver: true,
      color_name: "Swiss Coffee",
      frame_extension_inches: "0.5",
      available_depth_inches: 2.75,
      opening_diagonal_difference_inches: "0.25",
      panel_widths_inches: [18, 18],
      panel_heights_inches: [72, 72],
      tilt_rod_section_lengths_inches: [36, 36],
      t_post_count: 1,
      t_post_positions_inches: [18],
      divider_rail_count: 1,
      divider_rail_location_mode: "custom",
      divider_rail_positions_inches: [36],
    });
    expect(
      validateOnyxShutterRestrictions(context)
        .filter((issue) => issue.ruleId.startsWith("onyx.required."))
        .map((issue) => issue.ruleId),
    ).toEqual([]);
  });
});
