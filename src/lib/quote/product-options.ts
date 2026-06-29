import {
  findPriceableProductSurcharge,
  getProductLightGuardSurcharges,
} from "./automatic-surcharges";
import { getProduct } from "./catalog";

export type QuoteDetailOption = {
  value: string;
  label: string;
};

export type QuoteDetailField = {
  id: string;
  label: string;
  type: "select" | "checkbox";
  options?: QuoteDetailOption[];
  customerVisible?: boolean;
};

const yesNo = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const noneOption = { value: "none", label: "None" };

const lightControlOptions = [
  { value: "light_filtering", label: "Light filtering" },
  { value: "room_darkening", label: "Room darkening" },
  { value: "day_night", label: "Day / night" },
];

const mountFields: QuoteDetailField[] = [
  {
    id: "mount_type",
    label: "Mount",
    type: "select",
    options: [
      { value: "inside", label: "Inside mount" },
      { value: "outside", label: "Outside mount" },
      { value: "ceiling", label: "Ceiling mount" },
      { value: "side", label: "Side mount" },
    ],
  },
];

const shadeControlFields: QuoteDetailField[] = [
  {
    id: "control_side",
    label: "Control side",
    type: "select",
    options: [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
      { value: "center", label: "Center" },
      { value: "na", label: "N/A" },
    ],
  },
  {
    id: "lift_system",
    label: "Lift / control",
    type: "select",
    options: [
      { value: "cordless", label: "Cordless" },
      { value: "continuous_cord_loop", label: "Continuous cord loop" },
      { value: "wand", label: "Wand" },
      { value: "motorized", label: "Motorized" },
      { value: "smartrelease", label: "SmartRelease" },
    ],
  },
];

const installationFields: QuoteDetailField[] = [
  { id: "hard_surface_install", label: "Hard-surface install", type: "checkbox", customerVisible: false },
  { id: "ladder_over_15ft", label: "Ladder over 15 ft", type: "checkbox", customerVisible: false },
  { id: "requires_takedown", label: "Existing treatment takedown", type: "checkbox", customerVisible: false },
];

const unitSideOptions = [
  noneOption,
  { value: "one", label: "One side" },
  { value: "two", label: "Two sides" },
];

const romanPillowCoverOptions: QuoteDetailOption[] = [
  noneOption,
  ...(["a", "b", "c"] as const).flatMap((group) =>
    [
      ["14inx14in", '14" x 14"'],
      ["16inx16in", '16" x 16"'],
      ["18inx18in", '18" x 18"'],
      ["20inx20in", '20" x 20"'],
      ["24inx24in", '24" x 24"'],
      ["10inx14in", '10" x 14"'],
      ["10inx16in", '10" x 16"'],
      ["10inx18in", '10" x 18"'],
      ["12inx22in", '12" x 22"'],
      ["14inx24in", '14" x 24"'],
      ["14inx18in", '14" x 18"'],
    ].map(([id, label]) => ({
      value: `decorative_pillow_cover_group_${group}_${id}`,
      label: `Group ${group.toUpperCase()} - ${label}`,
    })),
  ),
];

const smartDrapeVanePackOptions: QuoteDetailOption[] = [
  noneOption,
  { value: "additional_vanes_pack_of_6_length_48", label: 'Additional vanes pack of 6 - 48"' },
  { value: "additional_vanes_pack_of_6_length_60", label: 'Additional vanes pack of 6 - 60"' },
  { value: "additional_vanes_pack_of_6_length_72", label: 'Additional vanes pack of 6 - 72"' },
  { value: "additional_vanes_pack_of_6_length_84", label: 'Additional vanes pack of 6 - 84"' },
  { value: "additional_vanes_pack_of_6_length_100", label: 'Additional vanes pack of 6 - 100"' },
  { value: "additional_vanes_pack_of_6_length_120", label: 'Additional vanes pack of 6 - 120"' },
  { value: "additional_vanes_pack_of_6_length_132", label: 'Additional vanes pack of 6 - 132"' },
  { value: "additional_vanes_pack_of_6_length_144", label: 'Additional vanes pack of 6 - 144"' },
];

const valanceAdditionalFootSurchargeIds = new Set([
  "valance_additional_foot",
  "additional_valance_foot",
]);

const structuredSurchargeIdsByProduct: Record<string, string[]> = {
  citylights_aluminum: [
    "micro_1_2in_slats",
    "metallic_slats_matte_finishes_perforated_slats",
    "2in_slats_smartprivacy_included_textured_slats",
  ],
  faux_wood: ["printed_color", "valance_surcharge", "cut_out"],
  honeycomb: [
    "continuous_cord_loop",
    "smartrelease",
    "tdbu_td",
    "smartfit",
    "smartfit_with_frame",
    "smartfit_dual_shade",
    "smartfit_dual_shade_with_frame",
    "room_darkening",
  ],
  perfectsheer: [
    "room_darkening_fabric",
    "basic_light_guard",
    "premium_wood_light_guard",
    "wood_valance",
    "3_1_2in_and_4_1_2in_fabric_valance",
  ],
  roller: [
    "dual_shade",
    "coupled_shade",
    "smartrelease",
    "basic_light_guard",
    "premium_wood_light_guard",
    "lightguard_360",
    "t_post_for_lg_360",
    "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
    "fabric_valance_3_1_2in_4_1_2in_and_6in",
    "8in_fabric_valance_and_cassette",
    "raceway",
    "cordless_operating_pole_premium_hardware",
    "premium_hem_bar",
  ],
  roman: [
    "smartrelease_lift_system",
    "blackout_lining",
    "ribbon_banding",
    "soft_fold_edge_banding_border",
    "day_and_night",
    "piping",
    "roman_fabric_valance_surcharge",
    "decorative_pillow_cover_group_a_14inx14in",
    "decorative_pillow_cover_group_a_16inx16in",
    "decorative_pillow_cover_group_a_18inx18in",
    "decorative_pillow_cover_group_a_20inx20in",
    "decorative_pillow_cover_group_a_24inx24in",
    "decorative_pillow_cover_group_a_10inx14in",
    "decorative_pillow_cover_group_a_10inx16in",
    "decorative_pillow_cover_group_a_10inx18in",
    "decorative_pillow_cover_group_a_12inx22in",
    "decorative_pillow_cover_group_a_14inx24in",
    "decorative_pillow_cover_group_a_14inx18in",
    "decorative_pillow_cover_group_b_14inx14in",
    "decorative_pillow_cover_group_b_16inx16in",
    "decorative_pillow_cover_group_b_18inx18in",
    "decorative_pillow_cover_group_b_20inx20in",
    "decorative_pillow_cover_group_b_24inx24in",
    "decorative_pillow_cover_group_b_10inx14in",
    "decorative_pillow_cover_group_b_10inx16in",
    "decorative_pillow_cover_group_b_10inx18in",
    "decorative_pillow_cover_group_b_12inx22in",
    "decorative_pillow_cover_group_b_14inx24in",
    "decorative_pillow_cover_group_b_14inx18in",
    "decorative_pillow_cover_group_c_14inx14in",
    "decorative_pillow_cover_group_c_16inx16in",
    "decorative_pillow_cover_group_c_18inx18in",
    "decorative_pillow_cover_group_c_20inx20in",
    "decorative_pillow_cover_group_c_24inx24in",
    "decorative_pillow_cover_group_c_10inx14in",
    "decorative_pillow_cover_group_c_10inx16in",
    "decorative_pillow_cover_group_c_10inx18in",
    "decorative_pillow_cover_group_c_12inx22in",
    "decorative_pillow_cover_group_c_14inx24in",
    "decorative_pillow_cover_group_c_14inx18in",
  ],
  smartdrape: [
    "alternating_colors",
    "room_darkening",
    "additional_vanes_pack_of_6_length_48",
    "additional_vanes_pack_of_6_length_60",
    "additional_vanes_pack_of_6_length_72",
    "additional_vanes_pack_of_6_length_84",
    "additional_vanes_pack_of_6_length_100",
    "additional_vanes_pack_of_6_length_120",
    "additional_vanes_pack_of_6_length_132",
    "additional_vanes_pack_of_6_length_144",
  ],
  smartfold: [
    "basic_light_guard",
    "smartfold_fascia_wood_valance",
    "smartfold_3_1_2in_4_1_2in_and_6in_fabric_valance",
    "smartfold_8in_fabric_valance",
  ],
  smartprivacy_faux: ["printed_colors", "valance"],
  wood_blinds: ["designer_color", "premium_color", "valance_surcharge_designer_crown", "valance_surcharge_contempo", "cut_out"],
  norman_shutters: [
    "premium_colors",
    "l_frames_with_1_2in_or_1in_buildout",
    "deco_frames_with_1_2in_1in_or_1_1_2in_extension",
    "frames_with_custom_extension",
    "t_post_extension",
    "custom_width_t_post",
    "custom_angle_bay_post",
    "pre_drilled_z_and_l_frames",
    "1_7_8in_louvers",
    "4_5in_louvers",
    "double_hung",
    "cafe_shutters",
    "bypass_and_bifold_track_shutters",
    "bypass_track",
    "bifold_180",
    "floating_90_bifold",
    "triple_track",
    "track_only",
    "track_w_header_and_fascia",
    "offset_tilt_rod",
    "clearview_tilt_rod",
    "autotilt",
    "liberty_arch",
    "angle_top",
    "arch_top_picture_window_with_horizontal_louvers",
    "quarter_sunburst_panel_with_continuous_frame",
    "horizontal_center_arch_with_quarter_round_side_panels",
    "sunburst_center_arch_with_quarter_round_side_panels",
    "all_other_shapes",
    "custom_color_per_order",
  ],
  onyx_shutters: [
    "hidden_tilt_rod",
    "offset_tilt_rod",
    "double_hung",
    "close_by_pass_2_tracks",
    "open_by_pass_2_tracks",
    "bi_fold",
    "extension_less_than_1in",
    "extension_equal_to_or_greater_than_1in",
    "arch",
    "sunburst",
    "octagon",
    "hexagon",
    "circle",
    "elongated_eyebrow",
    "liberty_arch_panel",
    "racked",
    "custom_color_per_color",
    "french_door_cutout_l_frame_only",
    "dishout_cut_per_cut_1_1_4in_max",
    "scribe_less_than_27_cubic_inches_per_piece",
    "scribe_greater_than_27_and_less_than_54_cubic_inches_per_piece",
    "scribe_greater_than_54_cubic_inches_per_piece",
  ],
};

function automaticSurchargeFields(productId: string, existingFieldIds = new Set<string>()): QuoteDetailField[] {
  const fields: QuoteDetailField[] = [];
  const product = getProduct(productId);
  if (!product) return fields;
  const represented = new Set(structuredSurchargeIdsByProduct[productId] ?? []);
  const lightGuardOptions = getProductLightGuardSurcharges(productId).map((surcharge) => ({
    value: surcharge.id,
    label: surcharge.name,
  }));
  for (const option of lightGuardOptions) represented.add(option.value);
  if (lightGuardOptions.length > 0 && !existingFieldIds.has("light_guard")) {
    fields.push({
      id: "light_guard",
      label: "Light guard",
      type: "select",
      options: [noneOption, ...lightGuardOptions],
    });
  }
  for (const surcharge of product.surcharges) {
    if (!findPriceableProductSurcharge(productId, surcharge.id)) continue;
    if (represented.has(surcharge.id) || valanceAdditionalFootSurchargeIds.has(surcharge.id)) continue;
    if (existingFieldIds.has(surcharge.id)) continue;
    fields.push({ id: surcharge.id, label: surcharge.name, type: "checkbox" });
  }
  return fields;
}

const shutterFields: QuoteDetailField[] = [
  {
    id: "frame_type",
    label: "Frame",
    type: "select",
    options: [
      { value: "inside_mount_l_frame", label: "Inside mount L frame" },
      { value: "outside_mount_l_frame", label: "Outside mount L frame" },
      { value: "z_frame", label: "Z frame" },
      { value: "deco_frame", label: "Deco frame" },
      { value: "direct_mount", label: "Direct mount" },
      { value: "track", label: "Track" },
    ],
  },
  {
    id: "louver_size",
    label: "Louver",
    type: "select",
    options: [
      { value: "1_7_8", label: "1 7/8 in" },
      { value: "2_1_2", label: "2 1/2 in" },
      { value: "3_1_2", label: "3 1/2 in" },
      { value: "4_1_2", label: "4 1/2 in" },
    ],
  },
  {
    id: "tilt_type",
    label: "Tilt",
    type: "select",
    options: [
      { value: "front_tilt", label: "Front tilt rod" },
      { value: "offset_tilt", label: "Offset tilt rod" },
      { value: "hidden_tilt", label: "Hidden / clearview tilt" },
      { value: "motorized_tilt", label: "Motorized tilt" },
    ],
  },
  {
    id: "color",
    label: "Color",
    type: "select",
    options: [
      { value: "white", label: "White" },
      { value: "silk_white", label: "Silk white" },
      { value: "pearl", label: "Pearl" },
      { value: "painted", label: "Painted color" },
      { value: "stained", label: "Stained color" },
      { value: "custom", label: "Custom color" },
    ],
  },
  {
    id: "hinge_color",
    label: "Hinge color",
    type: "select",
    options: [
      { value: "white", label: "White" },
      { value: "brass", label: "Brass" },
      { value: "nickel", label: "Nickel" },
      { value: "bronze", label: "Bronze" },
      { value: "black", label: "Black" },
      { value: "hidden", label: "Hidden" },
    ],
  },
  {
    id: "panel_config",
    label: "Panel configuration",
    type: "select",
      options: [
        { value: "single_left", label: "Single panel left" },
        { value: "single_right", label: "Single panel right" },
        { value: "left_right", label: "Left / right pair" },
        { value: "double_hung", label: "Double hung" },
        { value: "cafe", label: "Cafe shutters" },
        { value: "bypass", label: "Bypass track" },
        { value: "bifold", label: "Bifold track" },
        { value: "specialty", label: "Specialty shape" },
      ],
  },
  { id: "divider_rail", label: "Divider rail", type: "select", options: yesNo },
  { id: "t_post", label: "T-post", type: "select", options: yesNo },
  {
    id: "extension",
    label: "Extension / buildout",
    type: "select",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
      { value: "less_than_1", label: 'Extension less than 1"' },
      { value: "one_or_more", label: 'Extension 1" or more' },
    ],
  },
  {
    id: "frame_upgrade",
    label: "Frame upgrade",
    type: "select",
    options: [
      noneOption,
      { value: "l_frame_buildout", label: 'L frame with 1/2" or 1" buildout' },
      { value: "deco_extension", label: 'Deco frame with 1/2", 1", or 1 1/2" extension' },
      { value: "custom_extension", label: "Frame with custom extension" },
      { value: "pre_drilled", label: "Pre-drilled Z / L frame" },
    ],
  },
  {
    id: "t_post_upgrade",
    label: "T-post upgrade",
    type: "select",
    options: [
      noneOption,
      { value: "extension", label: "T-post extension" },
      { value: "custom_width", label: "Custom-width T-post" },
      { value: "custom_angle_bay", label: "Custom angle bay post" },
    ],
  },
  {
    id: "track_system",
    label: "Track system",
    type: "select",
    options: [
      noneOption,
      { value: "bypass_track", label: "Bypass track" },
      { value: "bifold_180", label: "Bifold 180" },
      { value: "floating_90_bifold", label: "Floating 90 bifold" },
      { value: "triple_track", label: "Triple track" },
      { value: "track_only", label: "Track only" },
      { value: "track_header_fascia", label: "Track with header and fascia" },
    ],
  },
  {
    id: "specialty_shape",
    label: "Specialty shape",
    type: "select",
    options: [
      noneOption,
      { value: "liberty_arch", label: "Liberty arch" },
      { value: "angle_top", label: "Angle top" },
      { value: "arch_top_picture", label: "Arch top picture window with horizontal louvers" },
      { value: "quarter_sunburst", label: "Quarter sunburst panel with continuous frame" },
      { value: "horizontal_center_arch", label: "Horizontal center arch with quarter-round side panels" },
      { value: "sunburst_center_arch", label: "Sunburst center arch with quarter-round side panels" },
      { value: "all_other_shapes", label: "All other shapes" },
      { value: "arch", label: "Arch" },
      { value: "sunburst", label: "Sunburst" },
      { value: "octagon", label: "Octagon" },
      { value: "hexagon", label: "Hexagon" },
      { value: "circle", label: "Circle" },
      { value: "elongated_eyebrow", label: "Elongated eyebrow" },
      { value: "liberty_arch_panel", label: "Liberty arch panel" },
      { value: "racked", label: "Racked" },
    ],
  },
  ...installationFields,
];

const productDetails: Record<string, QuoteDetailField[]> = {
  norman_shutters: shutterFields,
  onyx_shutters: [
    {
      id: "onyx_order_type",
      label: "Order type",
      type: "select",
      options: [
        { value: "standard", label: "Standard" },
        { value: "rush", label: "Rush" },
        { value: "reorder", label: "Reorder" },
      ],
    },
    {
      id: "onyx_mount",
      label: "Mount",
      type: "select",
      options: [
        { value: "inside", label: "Inside mount" },
        { value: "outside", label: "Outside mount" },
        { value: "l_frame", label: "L frame" },
        { value: "z_frame", label: "Z frame" },
      ],
    },
    ...shutterFields,
    {
      id: "track_type",
      label: "Track type",
      type: "select",
      options: [
        { value: "none", label: "None" },
        { value: "close_bypass", label: "Close bypass" },
        { value: "open_bypass", label: "Open bypass" },
        { value: "bifold", label: "Bifold" },
      ],
    },
    {
      id: "custom_work",
      label: "Custom work",
      type: "select",
      options: [
        noneOption,
        { value: "custom_color", label: "Custom color" },
        { value: "french_door_cutout", label: "French door cutout" },
        { value: "dishout_cut", label: 'Dishout cut (1 1/4" max)' },
        { value: "scribe_small", label: "Scribe under 27 cubic inches" },
        { value: "scribe_medium", label: "Scribe 27-54 cubic inches" },
        { value: "scribe_large", label: "Scribe over 54 cubic inches" },
      ],
    },
  ],
  roller: [
    ...mountFields,
    {
      id: "window_type",
      label: "Window type",
      type: "select",
      options: [
        { value: "single", label: "Single" },
        { value: "corner", label: "Corner" },
        { value: "bay", label: "Bay" },
      ],
    },
    {
      id: "shade_type",
      label: "Shade type",
      type: "select",
      options: [
        { value: "standard", label: "Single Shade" },
        { value: "coupled", label: "Coupled Shades*" },
        { value: "dual", label: "Dual Shades*" },
        { value: "common_valance", label: "Common Valance" },
        { value: "lightguard_360_t_post", label: "LightGuard 360 with T-Post*" },
      ],
    },
    {
      id: "control_side",
      label: "Control side",
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
        { value: "center", label: "Center" },
        { value: "na", label: "N/A" },
      ],
    },
    {
      id: "lift_system",
      label: "Lift system",
      type: "select",
      options: [
        { value: "cordless", label: "PrecisionLift Cordless" },
        { value: "continuous_cord_loop", label: "Continuous Cord Loop" },
        { value: "motorized", label: "Motorized*" },
        { value: "smartrelease", label: "SmartRelease*" },
      ],
    },
    {
      id: "valance",
      label: "Valance",
      type: "select",
      options: [
        { value: "none", label: "No Valance" },
        { value: "square_fascia", label: "Square Fascia*" },
        { value: "plain_curved_fascia", label: "Plain Curved Fascia*" },
        { value: "curved_fascia_with_fabric", label: "Curved Fascia with Fabric*" },
        { value: "fabric_valance_3_1_2", label: '3 1/2" Fabric Valance*' },
        { value: "fabric_valance_4_1_2", label: '4 1/2" Fabric Valance*' },
        { value: "fabric_valance_6", label: '6" Fabric Valance*' },
        { value: "fabric_valance_8", label: '8" Fabric Valance*' },
        { value: "modern_wood_valance_4_1_2", label: '4 1/2" Modern Wood Valance*' },
        { value: "cassette", label: "Cassette*" },
      ],
    },
    {
      id: "fabric_roll",
      label: "Fabric roll",
      type: "select",
      options: [
        { value: "standard", label: "Standard" },
        { value: "reverse", label: "Reverse" },
      ],
    },
    { id: "raceway", label: "Raceway", type: "select", options: yesNo },
    {
      id: "hardware_type",
      label: "Hardware type",
      type: "select",
      options: [
        { value: "general", label: "General" },
        { value: "premium", label: "Premium*" },
      ],
    },
    {
      id: "hardware_color",
      label: "Hardware color",
      type: "select",
      options: [
        { value: "default", label: "Default" },
        { value: "white", label: "White" },
        { value: "cottage_white", label: "Cottage White" },
        { value: "black", label: "Black" },
        { value: "bianca", label: "Bianca" },
        { value: "silver", label: "Silver" },
      ],
    },
    {
      id: "hem_bar",
      label: "Hem bar",
      type: "select",
      options: [
        { value: "plain", label: "Plain" },
        { value: "fabric_wrapped", label: "Fabric-Wrapped" },
      ],
    },
    {
      id: "hem_bar_color",
      label: "Hem bar color",
      type: "select",
      options: [
        { value: "default", label: "Default" },
        { value: "white", label: "White" },
        { value: "cottage_white", label: "Cottage White" },
        { value: "black", label: "Black" },
        { value: "anodized_silver", label: "Anodized Silver" },
        { value: "bianca", label: "Bianca" },
        { value: "bronze", label: "Bronze*" },
        { value: "brushed_black", label: "Brushed Black*" },
        { value: "brass", label: "Brass*" },
        { value: "matte_silver", label: "Matte Silver*" },
      ],
    },
    { id: "bottomrail", label: "Hem bar / bottomrail", type: "select", options: yesNo },
    ...installationFields,
  ],
  roman: [
    ...mountFields,
    ...shadeControlFields,
    {
      id: "roman_style",
      label: "Roman style",
      type: "select",
      options: [
        { value: "flat", label: "Flat" },
        { value: "soft_fold", label: "Soft fold" },
        { value: "relaxed", label: "Relaxed" },
      ],
    },
    {
      id: "lining",
      label: "Lining",
      type: "select",
      options: [
        { value: "privacy", label: "Privacy lining" },
        { value: "blackout", label: "Blackout lining" },
        { value: "unlined", label: "Unlined" },
      ],
    },
    {
      id: "valance",
      label: "Valance",
      type: "select",
      options: [
        noneOption,
        { value: "fabric", label: "Fabric valance*" },
      ],
    },
    {
      id: "decorative_trim",
      label: "Decorative trim",
      type: "select",
      options: [
        noneOption,
        { value: "ribbon_banding", label: "Ribbon banding*" },
        { value: "edge_banding_border", label: "Edge banding / border*" },
        { value: "piping", label: "Piping*" },
      ],
    },
    { id: "day_and_night", label: "Day & Night*", type: "checkbox" },
    {
      id: "decorative_pillow_cover",
      label: "Decorative pillow cover",
      type: "select",
      options: romanPillowCoverOptions,
    },
    ...installationFields,
  ],
  honeycomb: [
    ...mountFields,
    {
      id: "control_side",
      label: "Control side",
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
        { value: "center", label: "Center" },
        { value: "na", label: "N/A" },
      ],
    },
    {
      id: "lift_system",
      label: "Lift / control",
      type: "select",
      options: [
        { value: "cordless", label: "Cordless" },
        { value: "continuous_cord_loop", label: "Continuous Cord Loop*" },
        { value: "smartrelease", label: "SmartRelease*" },
        { value: "tdbu_td", label: "TDBU / TD*" },
        { value: "smartfit", label: "SmartFit*" },
        { value: "smartfit_with_frame", label: "SmartFit with Frame*" },
        { value: "smartfit_dual_shade", label: "SmartFit Dual Shade*" },
        { value: "smartfit_dual_shade_with_frame", label: "SmartFit Dual Shade with Frame*" },
        { value: "motorized", label: "Motorized" },
      ],
    },
    {
      id: "light_control",
      label: "Light control",
      type: "select",
      options: lightControlOptions,
    },
    {
      id: "cell_size",
      label: "Cell size",
      type: "select",
      options: [
        { value: "3_8", label: "3/8 in" },
        { value: "1_2", label: "1/2 in double" },
        { value: "9_16", label: "9/16 in" },
        { value: "3_4", label: "3/4 in" },
        { value: "1_1_4", label: "1 1/4 in single" },
      ],
    },
    ...installationFields,
  ],
  vertical_honeycomb: [
    ...mountFields,
    {
      id: "stack_option",
      label: "Stack",
      type: "select",
      options: [
        { value: "left", label: "Left stack" },
        { value: "right", label: "Right stack" },
        { value: "split", label: "Split stack" },
      ],
    },
    { id: "light_control", label: "Light control", type: "select", options: lightControlOptions },
    ...installationFields,
  ],
  perfectsheer: [
    ...mountFields,
    ...shadeControlFields,
    { id: "light_control", label: "Light control", type: "select", options: [{ value: "light_filtering", label: "Light filtering" }, { value: "room_darkening", label: "Room darkening" }] },
    { id: "valance", label: "Valance", type: "select", options: [{ value: "standard", label: "Standard" }, { value: "wood", label: "Wood" }, { value: "fabric", label: "Fabric" }] },
    ...installationFields,
  ],
  smartdrape: [
    ...mountFields,
    {
      id: "stack_option",
      label: "Stack",
      type: "select",
      options: [
        { value: "left", label: "Left stack" },
        { value: "right", label: "Right stack" },
        { value: "split", label: "Split stack" },
      ],
    },
    {
      id: "vane_style",
      label: "Vane style",
      type: "select",
      options: [
        { value: "standard", label: "Standard" },
        { value: "alternating", label: "Alternating colors" },
        { value: "room_darkening", label: "Room darkening" },
      ],
    },
    {
      id: "additional_vanes",
      label: "Additional vanes",
      type: "select",
      options: smartDrapeVanePackOptions,
    },
    ...shadeControlFields,
    ...installationFields,
  ],
  smartfold: [
    ...mountFields,
    ...shadeControlFields,
    { id: "fabric_category", label: "Fabric category", type: "select", options: [{ value: "light_filtering", label: "Light filtering" }, { value: "room_darkening", label: "Room darkening" }] },
    {
      id: "valance",
      label: "Valance",
      type: "select",
      options: [
        noneOption,
        { value: "fascia_wood", label: "Fascia / Wood Valance*" },
        { value: "fabric_3_1_2_4_1_2_6", label: '3 1/2", 4 1/2" & 6" Fabric Valance*' },
        { value: "fabric_8", label: '8" Fabric Valance*' },
      ],
    },
    ...installationFields,
  ],
  synchrony_vertical: [
    ...mountFields,
    {
      id: "stack_option",
      label: "Stack",
      type: "select",
      options: [
        { value: "left", label: "Left stack" },
        { value: "right", label: "Right stack" },
        { value: "split", label: "Split stack" },
      ],
    },
    ...shadeControlFields,
    ...installationFields,
  ],
  faux_wood: [
    ...mountFields,
    { id: "slat_size", label: "Slat size", type: "select", options: [{ value: "2", label: "2 in" }, { value: "2_1_2", label: "2 1/2 in" }] },
    { id: "color", label: "Color", type: "select", options: [{ value: "white", label: "White" }, { value: "printed", label: "Printed color" }, { value: "stained", label: "Stained look" }] },
    {
      id: "valance",
      label: "Valance",
      type: "select",
      options: [
        noneOption,
        { value: "designer_crown", label: "Designer Crown Valance*" },
        { value: "modern_curved", label: "Modern Curved Valance*" },
      ],
    },
    { id: "cut_out_sides", label: "Cut-out", type: "select", options: unitSideOptions },
    ...shadeControlFields,
    ...installationFields,
  ],
  smartprivacy_faux: [
    ...mountFields,
    { id: "slat_size", label: "Slat size", type: "select", options: [{ value: "2", label: "2 in" }, { value: "2_1_2", label: "2 1/2 in" }] },
    { id: "color", label: "Color", type: "select", options: [{ value: "white", label: "White" }, { value: "printed", label: "Printed color" }, { value: "stained", label: "Stained look" }] },
    {
      id: "valance",
      label: "Valance",
      type: "select",
      options: [
        noneOption,
        { value: "designer_crown", label: "Designer Crown Valance*" },
        { value: "modern_curved", label: "Modern Curved Valance*" },
      ],
    },
    ...shadeControlFields,
    ...installationFields,
  ],
  wood_blinds: [
    ...mountFields,
    { id: "slat_size", label: "Slat size", type: "select", options: [{ value: "2", label: "2 in" }, { value: "2_1_2", label: "2 1/2 in" }] },
    { id: "color", label: "Color", type: "select", options: [{ value: "designer", label: "Designer color" }, { value: "premium", label: "Premium color" }, { value: "stained", label: "Stained" }] },
    {
      id: "valance",
      label: "Valance",
      type: "select",
      options: [
        noneOption,
        { value: "designer_crown", label: "Designer Crown Valance*" },
        { value: "contempo", label: "Contempo Valance*" },
      ],
    },
    { id: "cut_out_sides", label: "Cut-out", type: "select", options: unitSideOptions },
    ...shadeControlFields,
    ...installationFields,
  ],
  citylights_aluminum: [
    ...mountFields,
    { id: "slat_size", label: "Slat size", type: "select", options: [{ value: "1_2", label: "1/2 in" }, { value: "1", label: "1 in" }, { value: "2", label: "2 in" }] },
    { id: "slat_finish", label: "Slat finish", type: "select", options: [{ value: "standard", label: "Standard" }, { value: "metallic", label: "Metallic" }, { value: "matte", label: "Matte" }, { value: "perforated", label: "Perforated" }] },
    { id: "privacy", label: "Privacy*", type: "checkbox" },
    ...shadeControlFields,
    ...installationFields,
  ],
  palladian_shelf: [
    {
      id: "shelf_type",
      label: "Shelf type",
      type: "select",
      options: [
        { value: "standard", label: "Standard" },
        { value: "deep", label: "Deep" },
      ],
    },
    { id: "color", label: "Color", type: "select", options: [{ value: "white", label: "White" }, { value: "painted", label: "Painted" }, { value: "custom", label: "Custom" }] },
  ],
};

const shadeMotorizationGroups = ["automate_home", "autowand", "smart_motorization"];

const productMotorizationGroups: Record<string, string[]> = {
  honeycomb: shadeMotorizationGroups,
  perfectsheer: shadeMotorizationGroups,
  roller: shadeMotorizationGroups,
  roman: shadeMotorizationGroups,
  smartdrape: shadeMotorizationGroups,
  smartfold: shadeMotorizationGroups,
  synchrony_vertical: shadeMotorizationGroups,
  vertical_honeycomb: shadeMotorizationGroups,
};

export function getDetailFieldsForProduct(productId: string): QuoteDetailField[] {
  const base = productDetails[productId] ?? [];
  const seen = new Set(base.map((field) => field.id));
  const automatic = automaticSurchargeFields(productId, seen);
  return automatic.length ? [...base, ...automatic] : base;
}

export function getMotorizationGroupsForProduct(productId: string): string[] {
  return productMotorizationGroups[productId] ?? [];
}

export function detailDisplayValue(productId: string, fieldId: string, value: unknown): string | null {
  const field = getDetailFieldsForProduct(productId).find((f) => f.id === fieldId);
  if (!field) return null;
  if (field.type === "checkbox") {
    return value === true ? field.label : null;
  }
  if (typeof value !== "string" || !value) return null;
  const option = field.options?.find((o) => o.value === value);
  return `${field.label}: ${option?.label ?? value}`;
}

export function isCustomerVisibleDetail(productId: string, fieldId: string): boolean {
  const field = getDetailFieldsForProduct(productId).find((f) => f.id === fieldId);
  return field?.customerVisible !== false;
}

/**
 * Shutter "auto-variant" tiers (the A/B/C tabs). When a shutter window is added,
 * these three material tiers are auto-created as priced design alternatives so the
 * customer gets a value / premium / specialty comparison. Mapped to the ACTUAL
 * catalog programs (catalog/shutters-mts.catalog.json):
 *   Norman: Woodlore (composite, value) / Normandy (real hardwood, premium) /
 *           Woodlore Aquashield (moisture-proof composite, baths & kitchens)
 *   Onyx:   Vinyl (value) / Poly composite (mid) / Basswood (real wood, premium)
 * Tunable: change programId/label here to change the offered tiers.
 */
export type ShutterVariant = { variant: string; label: string; programId: string };

export const SHUTTER_VARIANTS: Record<string, ShutterVariant[]> = {
  norman_shutters: [
    { variant: "A", label: "Composite", programId: "woodlore" },
    { variant: "B", label: "Hardwood", programId: "normandy_painted" },
    { variant: "C", label: "Moisture-proof", programId: "woodlore_aquashield" },
  ],
  onyx_shutters: [
    { variant: "A", label: "Vinyl", programId: "vinyl" },
    { variant: "B", label: "Poly composite", programId: "poly_composite" },
    { variant: "C", label: "Wood (basswood)", programId: "stained_basswood" },
  ],
};

/** The auto-variant tiers for a shutter product, or null if it isn't a variant shutter. */
export function shutterVariantsFor(productId: string): ShutterVariant[] | null {
  return SHUTTER_VARIANTS[productId] ?? null;
}
