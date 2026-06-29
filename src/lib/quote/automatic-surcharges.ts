import { findProductSurcharge, getProduct, type CatalogSurcharge } from "./catalog";

export type AutomaticSurchargeSelection = { id: string; units?: number };

export const LIGHT_GUARD_SURCHARGE_IDS = [
  "basic_light_guard",
  "premium_wood_light_guard",
  "lightguard_360",
] as const;

type DetailRecord = Record<string, unknown>;
type SurchargeSelectionSpec =
  | string
  | { id: string; units?: number }
  | Array<string | { id: string; units?: number }>;

const ROOM_DARKENING_SURCHARGE_IDS: Record<string, string[]> = {
  honeycomb: ["room_darkening"],
  perfectsheer: ["room_darkening_fabric"],
  smartdrape: ["room_darkening"],
  vertical_honeycomb: ["room_darkening_sheer_fr_essentials_fabric_surcharge"],
};

const FABRIC_SURCHARGE_DETAIL_ID = "fabric_surcharge_id";

const PRODUCT_FIELD_MAPPINGS: Record<string, Record<string, Record<string, SurchargeSelectionSpec>>> = {
  citylights_aluminum: {
    slat_size: {
      "1_2": "micro_1_2in_slats",
      "2": "2in_slats_smartprivacy_included_textured_slats",
    },
    slat_finish: {
      metallic: "metallic_slats_matte_finishes_perforated_slats",
      matte: "metallic_slats_matte_finishes_perforated_slats",
      perforated: "metallic_slats_matte_finishes_perforated_slats",
    },
  },
  faux_wood: {
    color: {
      printed: "printed_color",
    },
    valance: {
      standard: "valance_surcharge",
      designer_crown: "valance_surcharge",
      modern_curved: "valance_surcharge",
    },
    cut_out_sides: {
      one: { id: "cut_out", units: 1 },
      two: { id: "cut_out", units: 2 },
    },
  },
  honeycomb: {
    lift_system: {
      continuous_cord_loop: "continuous_cord_loop",
      smartrelease: "smartrelease",
      tdbu_td: "tdbu_td",
      smartfit: "smartfit",
      smartfit_with_frame: "smartfit_with_frame",
      smartfit_dual_shade: "smartfit_dual_shade",
      smartfit_dual_shade_with_frame: "smartfit_dual_shade_with_frame",
    },
  },
  perfectsheer: {
    valance: {
      wood: "wood_valance",
      fabric: "3_1_2in_and_4_1_2in_fabric_valance",
    },
  },
  roller: {
    lift_system: {
      smartrelease: "smartrelease",
    },
    shade_type: {
      dual: "dual_shade",
      coupled: "coupled_shade",
      lightguard_360_t_post: ["lightguard_360", "t_post_for_lg_360"],
    },
    valance: {
      square_fascia: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      plain_curved_fascia: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      curved_fascia_with_fabric: "fabric_valance_3_1_2in_4_1_2in_and_6in",
      fabric_valance_3_1_2: "fabric_valance_3_1_2in_4_1_2in_and_6in",
      fabric_valance_4_1_2: "fabric_valance_3_1_2in_4_1_2in_and_6in",
      fabric_valance_6: "fabric_valance_3_1_2in_4_1_2in_and_6in",
      fabric_valance_8: "8in_fabric_valance_and_cassette",
      modern_wood_valance_4_1_2: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      cassette: "8in_fabric_valance_and_cassette",
      // Legacy values from the previous generic selector; retained so saved quotes
      // continue to reprice against the same guide-backed surcharge tables.
      fascia: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      wood_valance: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      fabric_valance: "fabric_valance_3_1_2in_4_1_2in_and_6in",
      raceway: "raceway",
    },
    raceway: {
      yes: "raceway",
    },
    hardware_type: {
      premium: "cordless_operating_pole_premium_hardware",
    },
    hem_bar_color: {
      bronze: "premium_hem_bar",
      brushed_black: "premium_hem_bar",
      brass: "premium_hem_bar",
      matte_silver: "premium_hem_bar",
    },
  },
  roman: {
    lift_system: {
      smartrelease: "smartrelease_lift_system",
    },
    roman_style: {
      soft_fold: "soft_fold_edge_banding_border",
    },
    lining: {
      blackout: "blackout_lining",
    },
    valance: {
      fabric: "roman_fabric_valance_surcharge",
    },
    decorative_trim: {
      ribbon_banding: "ribbon_banding",
      edge_banding_border: "soft_fold_edge_banding_border",
      piping: "piping",
    },
  },
  smartdrape: {
    vane_style: {
      alternating: "alternating_colors",
      room_darkening: "room_darkening",
    },
  },
  smartprivacy_faux: {
    color: {
      printed: "printed_colors",
    },
    valance: {
      designer_crown: "valance",
      modern_curved: "valance",
    },
  },
  smartfold: {
    valance: {
      fascia_wood: "smartfold_fascia_wood_valance",
      fabric_3_1_2_4_1_2_6: "smartfold_3_1_2in_4_1_2in_and_6in_fabric_valance",
      fabric_8: "smartfold_8in_fabric_valance",
    },
  },
  wood_blinds: {
    color: {
      designer: "designer_color",
      premium: "premium_color",
    },
    valance: {
      designer_crown: "valance_surcharge_designer_crown",
      contempo: "valance_surcharge_contempo",
    },
    cut_out_sides: {
      one: { id: "cut_out", units: 1 },
      two: { id: "cut_out", units: 2 },
    },
  },
  norman_shutters: {
    color: {
      painted: "premium_colors",
      stained: "premium_colors",
      custom: "custom_color_per_order",
    },
    louver_size: {
      "1_7_8": "1_7_8in_louvers",
      "4_1_2": "4_5in_louvers",
    },
    tilt_type: {
      offset_tilt: "offset_tilt_rod",
      hidden_tilt: "clearview_tilt_rod",
      motorized_tilt: "autotilt",
    },
    panel_config: {
      double_hung: "double_hung",
      cafe: "cafe_shutters",
      bypass: "bypass_and_bifold_track_shutters",
      bifold: "bypass_and_bifold_track_shutters",
    },
    frame_upgrade: {
      l_frame_buildout: "l_frames_with_1_2in_or_1in_buildout",
      deco_extension: "deco_frames_with_1_2in_1in_or_1_1_2in_extension",
      custom_extension: "frames_with_custom_extension",
      pre_drilled: "pre_drilled_z_and_l_frames",
    },
    t_post_upgrade: {
      extension: "t_post_extension",
      custom_width: "custom_width_t_post",
      custom_angle_bay: "custom_angle_bay_post",
    },
    track_system: {
      bypass_track: "bypass_track",
      bifold_180: "bifold_180",
      floating_90_bifold: "floating_90_bifold",
      triple_track: "triple_track",
      track_only: "track_only",
      track_header_fascia: "track_w_header_and_fascia",
    },
    specialty_shape: {
      liberty_arch: "liberty_arch",
      angle_top: "angle_top",
      arch_top_picture: "arch_top_picture_window_with_horizontal_louvers",
      quarter_sunburst: "quarter_sunburst_panel_with_continuous_frame",
      horizontal_center_arch: "horizontal_center_arch_with_quarter_round_side_panels",
      sunburst_center_arch: "sunburst_center_arch_with_quarter_round_side_panels",
      all_other_shapes: "all_other_shapes",
    },
    custom_work: {
      french_door_cutout: "french_door_cutout",
    },
  },
  onyx_shutters: {
    tilt_type: {
      offset_tilt: "offset_tilt_rod",
      hidden_tilt: "hidden_tilt_rod",
    },
    panel_config: {
      double_hung: "double_hung",
      bypass: "close_by_pass_2_tracks",
      bifold: "bi_fold",
      specialty: "arch",
    },
    track_type: {
      close_bypass: "close_by_pass_2_tracks",
      open_bypass: "open_by_pass_2_tracks",
      bifold: "bi_fold",
    },
    extension: {
      less_than_1: "extension_less_than_1in",
      one_or_more: "extension_equal_to_or_greater_than_1in",
    },
    specialty_shape: {
      arch: "arch",
      sunburst: "sunburst",
      octagon: "octagon",
      hexagon: "hexagon",
      circle: "circle",
      elongated_eyebrow: "elongated_eyebrow",
      liberty_arch_panel: "liberty_arch_panel",
      racked: "racked",
    },
    custom_work: {
      custom_color: "custom_color_per_color",
      french_door_cutout: "french_door_cutout_l_frame_only",
      dishout_cut: "dishout_cut_per_cut_1_1_4in_max",
      scribe_small: "scribe_less_than_27_cubic_inches_per_piece",
      scribe_medium: "scribe_greater_than_27_and_less_than_54_cubic_inches_per_piece",
      scribe_large: "scribe_greater_than_54_cubic_inches_per_piece",
    },
  },
};

const CHECKBOX_SURCHARGE_ID_CANDIDATES: Record<string, string[]> = {
  shim: ["shim"],
  aluminum_shim: ["aluminum_shim"],
  keystone: ["keystone"],
  magnetic_hold_down: ["magnetic_hold_down"],
  side_mount_bracket: ["side_mount_bracket", "side_mount_bracket_available_in_2in_only"],
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSelected(value: unknown): boolean {
  return value === true || value === "true" || value === "yes" || value === "on";
}

export function isPriceableCatalogSurcharge(surcharge: CatalogSurcharge): boolean {
  return surcharge.value != null || surcharge.widthGraduated != null;
}

export function findPriceableProductSurcharge(productId: string, surchargeId: string): CatalogSurcharge | null {
  const product = getProduct(productId);
  if (!product) return null;
  const surcharge = findProductSurcharge(product, surchargeId);
  return surcharge && isPriceableCatalogSurcharge(surcharge) ? surcharge : null;
}

export function resolveAutomaticCheckboxSurcharge(productId: string, detailId: string): CatalogSurcharge | null {
  for (const surchargeId of CHECKBOX_SURCHARGE_ID_CANDIDATES[detailId] ?? [detailId]) {
    const surcharge = findPriceableProductSurcharge(productId, surchargeId);
    if (surcharge) return surcharge;
  }
  return null;
}

export function getProductLightGuardSurcharges(productId: string): CatalogSurcharge[] {
  return LIGHT_GUARD_SURCHARGE_IDS
    .map((id) => findPriceableProductSurcharge(productId, id))
    .filter(Boolean) as CatalogSurcharge[];
}

export function deriveAutomaticSurcharges(productId: string, details: DetailRecord | null | undefined): AutomaticSurchargeSelection[] {
  const product = getProduct(productId);
  if (!product) return [];
  const source = details && typeof details === "object" && !Array.isArray(details) ? details : {};
  const seen = new Set<string>();
  const selections: AutomaticSurchargeSelection[] = [];

  const add = (surchargeId: string | null | undefined, units?: number) => {
    if (!surchargeId || seen.has(surchargeId)) return;
    if (!findPriceableProductSurcharge(productId, surchargeId)) return;
    seen.add(surchargeId);
    selections.push(units == null ? { id: surchargeId } : { id: surchargeId, units });
  };

  const addSelection = (selection: SurchargeSelectionSpec | null | undefined) => {
    if (!selection) return;
    const values = Array.isArray(selection) ? selection : [selection];
    for (const value of values) {
      if (typeof value === "string") {
        add(value);
      } else {
        add(value.id, value.units);
      }
    }
  };

  const lightGuard = text(source.light_guard);
  if (lightGuard && lightGuard !== "none" && (LIGHT_GUARD_SURCHARGE_IDS as readonly string[]).includes(lightGuard)) {
    add(lightGuard);
  }

  const fabricSurcharge = text(source[FABRIC_SURCHARGE_DETAIL_ID]);
  if (fabricSurcharge) add(fabricSurcharge);

  for (const [detailId, value] of Object.entries(source)) {
    if (!isSelected(value)) continue;
    add(resolveAutomaticCheckboxSurcharge(productId, detailId)?.id);
  }

  if (text(source.light_control) === "room_darkening") {
    for (const surchargeId of ROOM_DARKENING_SURCHARGE_IDS[productId] ?? []) add(surchargeId);
  }

  const fieldMappings = PRODUCT_FIELD_MAPPINGS[productId] ?? {};
  for (const [fieldId, options] of Object.entries(fieldMappings)) {
    const selected = text(source[fieldId]);
    if (selected) addSelection(options[selected]);
  }

  for (const value of Object.values(source)) {
    const selected = text(value);
    if (!selected || selected === "none" || selected === "no") continue;
    add(selected);
  }

  return selections;
}
