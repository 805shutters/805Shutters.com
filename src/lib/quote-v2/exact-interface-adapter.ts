import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { getProduct } from "@/lib/quote/catalog";
import type {
  ISODate,
  SelectionContext,
  SelectionRecord,
  SelectionValue,
} from "./core";
import { quoteV2CatalogVersionFor } from "./catalog";

const INTERNAL_OPTION_KEYS = new Set([
  "authoritative_price_status",
  "authoritative_price_error",
  "authoritative_price_breakdown",
  "authoritative_cost_breakdown",
  "authoritative_once_total",
  "authoritative_v2_snapshot",
  "priced_selection_fingerprint",
  "priced_catalog_version",
  "manual_price_override",
  "sent_price_snapshot",
  "base_price",
  "surcharge_total",
  "pricing_method",
  "pricing_grid_key",
  "pricing_grid_price",
  "pricing_grid_width",
  "pricing_grid_height",
  "pricing_built_in_adjustment",
  "discount_source_price",
  "discount_amount",
  "quote_v2_catalog_version",
  "quote_v2_catalog_as_of",
  "quote_v2_backend",
  // Cross-line match confirmations are derived by the authoritative backend
  // after it compares both selected quote-line snapshots. A browser payload
  // must never be able to self-authorize this evidence.
  "side_by_side_matches",
]);

const PRICE_OPTION_KEYS = new Set([
  "discount_percent",
  "surcharges",
  "shipping_region",
  "dealer_program",
  "schedule_discount_percent",
  "expedited",
]);

export const EXACT_INTERFACE_V2_FRACTIONS = Object.freeze({
  "0": 0,
  "1/16": 1 / 16,
  "1/8": 1 / 8,
  "3/16": 3 / 16,
  "1/4": 1 / 4,
  "5/16": 5 / 16,
  "3/8": 3 / 8,
  "7/16": 7 / 16,
  "1/2": 1 / 2,
  "9/16": 9 / 16,
  "5/8": 5 / 8,
  "11/16": 11 / 16,
  "3/4": 3 / 4,
  "13/16": 13 / 16,
  "7/8": 7 / 8,
  "15/16": 15 / 16,
} as const);

export class ExactInterfaceV2InputError extends RangeError {
  readonly code = "INVALID_EXACT_INTERFACE_V2_INPUT";

  constructor(
    readonly field: string,
    readonly selectedValue: unknown,
    explanation: string,
  ) {
    super(`${field}: ${explanation}`);
    this.name = "ExactInterfaceV2InputError";
  }
}

function finiteNumericInput(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Strict V2 quantity parser. It never repairs, floors, or defaults input. */
export function authoritativeV2Quantity(value: unknown): number {
  const parsed = finiteNumericInput(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < 1) {
    throw new ExactInterfaceV2InputError(
      "quantity",
      value,
      "must be a positive whole number; V2 does not default or clamp invalid quantities",
    );
  }
  return parsed;
}

/**
 * Strict V2 measurement parser for the existing whole-plus-sixteenths UI.
 * Equivalent-but-unsupported text such as 2/4 is rejected so malformed or
 * injected tokens cannot collapse onto an already priced fingerprint.
 */
export function authoritativeV2Measurement(
  whole: unknown,
  fraction: unknown,
  dimension: "width" | "height",
): number {
  const wholeNumber = finiteNumericInput(whole);
  if (wholeNumber === null || !Number.isInteger(wholeNumber) || wholeNumber < 0) {
    throw new ExactInterfaceV2InputError(
      `${dimension}_whole`,
      whole,
      "must be a nonnegative whole number",
    );
  }
  const fractionToken = typeof fraction === "string" ? fraction.trim() : "";
  if (!Object.prototype.hasOwnProperty.call(EXACT_INTERFACE_V2_FRACTIONS, fractionToken)) {
    throw new ExactInterfaceV2InputError(
      `${dimension}_fraction`,
      fraction,
      "must be one of the existing interface's supported sixteenth-inch tokens",
    );
  }
  const measured =
    wholeNumber +
    EXACT_INTERFACE_V2_FRACTIONS[
      fractionToken as keyof typeof EXACT_INTERFACE_V2_FRACTIONS
    ];
  if (measured <= 0) {
    throw new ExactInterfaceV2InputError(
      dimension,
      { whole, fraction },
      "must be greater than zero",
    );
  }
  return measured;
}

function jsonValue(value: unknown): SelectionValue | undefined {
  if (value === null || ["string", "boolean"].includes(typeof value)) {
    return value as SelectionValue;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const items = value.map(jsonValue);
    return items.some((item) => item === undefined) ? undefined : (items as SelectionValue[]);
  }
  if (value && typeof value === "object") {
    const record: Record<string, SelectionValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalized = jsonValue(item);
      if (normalized !== undefined) record[key] = normalized;
    }
    return record;
  }
  return undefined;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(options: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const found = stringValue(options[key]);
    if (found) return found;
  }
  return null;
}

function finiteValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function leadingNumberArray(
  options: Record<string, unknown>,
  keyForIndex: (index: number) => string,
  maximum: number,
): number[] | undefined {
  const values: number[] = [];
  for (let index = 1; index <= maximum; index += 1) {
    const value = finiteValue(options[keyForIndex(index)]);
    if (value === null) break;
    values.push(value);
  }
  return values.length > 0 ? values : undefined;
}

function canonicalOnyxMaterial(value: unknown): string | null {
  const selected = stringValue(value);
  if (!selected) return null;
  if (/onyx\s+(?:u\.?s\.?|us)\s+made\s+vinyl/i.test(selected)) {
    return "Onyx U.S. Made Vinyl";
  }
  if (/^vlo\s+hybrid$/i.test(selected)) return "Hybrid";
  if (/^(?:painted|stained)\s+basswood$/i.test(selected)) return "Bassia";
  return selected;
}

function canonicalOnyxMount(value: unknown): string | null {
  const selected = stringValue(value)?.toLowerCase();
  if (!selected) return null;
  if (selected === "im" || selected.includes("inside")) return "inside";
  if (selected === "om" || selected.includes("outside")) return "outside";
  return selected;
}

function onyxFrameSides(value: unknown): 3 | 4 | null {
  const numeric = finiteValue(value);
  if (numeric === 3 || numeric === 4) return numeric;
  const selected = stringValue(value)?.trim().toLowerCase();
  if (
    selected === "3" ||
    selected === "three" ||
    selected === "3-sided" ||
    selected === "3 sided"
  ) return 3;
  if (
    selected === "4" ||
    selected === "four" ||
    selected === "4-sided" ||
    selected === "4 sided"
  ) return 4;
  return null;
}

function canonicalOnyxMeasurementBasis(value: unknown): string | null {
  const selected = stringValue(value)?.toLowerCase();
  if (!selected) return null;
  if (selected.startsWith("f ") || selected.includes("frame to frame")) {
    return "frame_to_frame";
  }
  if (selected.startsWith("w ") || selected.includes("window size")) return "window_size";
  return selected.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function canonicalOnyxOrderType(value: unknown): string | null {
  const selected = stringValue(value)?.toLowerCase();
  if (!selected) return null;
  if (selected.includes("regular") || selected === "standard") return "standard";
  if (selected.includes("by pass") || selected.includes("bypass")) return "bypass";
  if (selected.includes("bi fold") || selected.includes("bifold")) return "bifold";
  if (selected.includes("french")) return "french_door";
  if (selected.includes("specialty")) return "specialty";
  if (selected.includes("double hung")) return "double_hung";
  return selected.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function canonicalOnyxFrameType(value: unknown): string | null {
  const selected = stringValue(value);
  if (!selected) return null;
  const normalized = selected.trim();
  const aliases: Record<string, string> = {
    "VZ Small": "Vinyl Z Frame Small",
    "VZ Large": "Vinyl Z Frame Large",
    "Decor 2": "Decor Frame 2",
    "Decor 3": "Decor Frame 3",
    "Z Fine": "Z Frame Fine",
    "Z Crown": "Z Frame Crown",
    "Z Trim": "Z Frame Trim",
    "Z Crest": "Z Frame Crest",
    "L Outside": "L Frame",
    "L Inside": "L Frame",
    "VL Outside": "Vinyl L Frame",
    "VL Inside": "Vinyl L Frame",
    "L Bullnose Outside": "L Frame Bullnose",
    "L Bullnose Inside": "L Frame Bullnose",
  };
  return aliases[normalized] ?? normalized;
}

function canonicalOnyxLouverSize(value: unknown): number | null {
  const selected = stringValue(value);
  if (!selected) return finiteValue(value);
  const mixed = selected.match(/(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = selected.match(/^(\d+)\/(\d+)/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const decimal = selected.match(/\d+(?:\.\d+)?/);
  return decimal ? Number(decimal[0]) : null;
}

function canonicalOnyxTilt(value: unknown): string | null {
  const selected = stringValue(value);
  if (!selected) return null;
  if (/offset/i.test(selected)) return "offset";
  if (/hidden|^H[123]\b/i.test(selected)) return "hidden";
  if (/standard|front center|^C\b/i.test(selected)) return "standard";
  return selected.toLowerCase();
}

function canonicalOnyxColor(value: unknown): string | null {
  const selected = stringValue(value);
  if (!selected) return null;
  return selected.replace(/^\d+_/, "").replaceAll("_", " ").trim();
}

function yesNoBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const selected = stringValue(value)?.toLowerCase();
  if (["yes", "true", "1"].includes(selected ?? "")) return true;
  if (["no", "false", "0", "none"].includes(selected ?? "")) return false;
  return undefined;
}

function normalizedOptions(options: Record<string, unknown>, mode: "configuration" | "pricing"): SelectionRecord {
  const entries: Array<[string, SelectionValue]> = [];
  for (const [key, value] of Object.entries(options)) {
    if (INTERNAL_OPTION_KEYS.has(key)) continue;
    if (mode === "configuration" ? PRICE_OPTION_KEYS.has(key) : !PRICE_OPTION_KEYS.has(key)) continue;
    const normalized = jsonValue(value);
    if (normalized !== undefined) {
      entries.push([key, normalized]);
    } else if (mode === "pricing" && key === "schedule_discount_percent") {
      // Presence is price-affecting. Preserve a malformed runtime value as an
      // explicit invalid sentinel so it cannot collapse onto the absent-value
      // standard schedule during validation/fingerprinting.
      entries.push([key, null]);
    }
  }
  return Object.fromEntries(entries);
}

function alias(
  record: Record<string, SelectionValue>,
  key: string,
  value: unknown,
): void {
  const normalized = jsonValue(value);
  if (normalized !== undefined && normalized !== null && normalized !== "") record[key] = normalized;
}

export type ExactInterfaceSelectionOptions = {
  productId: string;
  programId: string | null;
  catalogAsOf?: ISODate;
  catalogVersion?: string;
};

/** Convert the familiar existing builder payload into the complete V2 contract. */
export function selectionContextFromExactInterface(
  line: SalesQuoteLineItem,
  design: Partial<SalesQuoteDesign>,
  input: ExactInterfaceSelectionOptions,
): SelectionContext {
  const sourceOptions = (design.options_json as Record<string, unknown> | undefined) ?? {};
  const configuration: Record<string, SelectionValue> = {
    ...normalizedOptions(sourceOptions, "configuration"),
  };
  const directFields: Array<keyof SalesQuoteDesign> = [
    "supplier",
    "material",
    "louver_size",
    "tilt_type",
    "hinge_color",
    "panel_config",
    "mount_type",
    "shade_type",
    "lift_system",
    "valance",
    "fabric",
    "motor_type",
    "remote_type",
  ];
  for (const field of directFields) alias(configuration, field, design[field]);
  alias(configuration, "hard_surface_install", design.hard_surface_install);
  alias(configuration, "ladder_over_15ft", design.ladder_over_15ft);
  alias(configuration, "requires_takedown", design.requires_takedown);

  alias(
    configuration,
    "fabric_collection",
    firstString(
      sourceOptions,
      "fabric_color_collection",
      "roman_fabric_category",
      "fabric_group",
    ) ?? design.fabric,
  );
  alias(configuration, "fabric_color_code", firstString(sourceOptions, "fabric_color_code"));
  alias(
    configuration,
    "fabric_color_name",
    firstString(sourceOptions, "fabric_color_name", "vertical_color"),
  );
  alias(
    configuration,
    "cell_size",
    input.productId === "honeycomb"
      ? firstString(sourceOptions, "honeycomb_actual_cell_size", "cell_size")
      : firstString(sourceOptions, "cell_size"),
  );
  alias(configuration, "application", firstString(sourceOptions, "honeycomb_application", "application"));
  alias(configuration, "honeycomb_operating_system", design.lift_system);
  alias(
    configuration,
    "roller_application",
    firstString(sourceOptions, "roller_application") ?? design.shade_type,
  );
  alias(
    configuration,
    "roller_top_treatment",
    firstString(sourceOptions, "top_treatment_class", "roller_top_treatment") ?? design.valance,
  );
  alias(
    configuration,
    "roller_tube",
    firstString(sourceOptions, "tube_class", "roller_tube", "tube"),
  );
  alias(
    configuration,
    "roller_coupling_count",
    sourceOptions.roller_coupling_count ?? sourceOptions.coupled_shade_count ?? sourceOptions.lightguard_360_shade_count,
  );
  alias(
    configuration,
    "roller_power_configuration",
    firstString(sourceOptions, "roller_power_configuration", "power_configuration"),
  );
  alias(configuration, "fold_style", firstString(sourceOptions, "fold_style"));
  alias(configuration, "lining", firstString(sourceOptions, "lining"));
  alias(configuration, "fabric_orientation", firstString(sourceOptions, "fabric_orientation"));
  alias(
    configuration,
    "rear_fabric_collection",
    firstString(
      sourceOptions,
      "rear_fabric_collection",
      "back_fabric_color_collection",
      "back_fabric_collection",
      "back_fabric",
    ),
  );
  alias(
    configuration,
    "rear_fabric_color_code",
    firstString(sourceOptions, "rear_fabric_color_code", "back_fabric_color_code", "back_color"),
  );
  alias(
    configuration,
    "rear_fabric_color_name",
    firstString(sourceOptions, "rear_fabric_color_name", "back_fabric_color_name"),
  );
  alias(
    configuration,
    "rear_fabric_color_id",
    firstString(sourceOptions, "rear_fabric_color_id", "back_fabric_color_id"),
  );
  alias(
    configuration,
    "rear_fabric_class",
    firstString(
      sourceOptions,
      "rear_fabric_class",
      "back_fabric_color_type",
      "back_fabric_color_collection",
      "back_fabric",
    ),
  );
  alias(
    configuration,
    "rear_cell_size",
    firstString(sourceOptions, "rear_cell_size", "back_cell_size"),
  );
  const firstPanelWidth = finiteValue(sourceOptions.common_valance_panel_1_width);
  const secondPanelWidth = finiteValue(sourceOptions.common_valance_panel_2_width);
  alias(
    configuration,
    "common_valance_panel_widths",
    sourceOptions.common_valance_panel_widths ??
      (firstPanelWidth !== null && secondPanelWidth !== null
        ? [firstPanelWidth, secondPanelWidth]
        : undefined),
  );
  alias(configuration, "common_valance_gap", sourceOptions.common_valance_gap);
  alias(
    configuration,
    "fabric_join_acknowledgment",
    firstString(sourceOptions, "fabric_join_acknowledgment", "seaming"),
  );
  alias(
    configuration,
    "frame_type",
    firstString(sourceOptions, "frame_type", "honeycomb_frame_type"),
  );
  alias(
    configuration,
    "t_post_count",
    sourceOptions.frame_t_post_count ?? sourceOptions.honeycomb_t_post_count,
  );
  alias(
    configuration,
    "t_post_positions_inches",
    leadingNumberArray(sourceOptions, (index) => `frame_t_post_${index}_location`, 3),
  );
  alias(
    configuration,
    "honeycomb_panel_net_widths",
    sourceOptions.honeycomb_panel_net_widths ??
      leadingNumberArray(sourceOptions, (index) => `honeycomb_panel_${index}_net_width`, 4),
  );
  alias(
    configuration,
    "honeycomb_panel_net_heights",
    sourceOptions.honeycomb_panel_net_heights ??
      leadingNumberArray(sourceOptions, (index) => `honeycomb_panel_${index}_net_height`, 4),
  );
  alias(
    configuration,
    "leg_height_inches",
    sourceOptions.leg_height_inches ?? sourceOptions.specialty_leg_height,
  );
  alias(
    configuration,
    "left_leg_height_inches",
    sourceOptions.left_leg_height_inches ?? sourceOptions.specialty_left_leg_height,
  );
  alias(
    configuration,
    "right_leg_height_inches",
    sourceOptions.right_leg_height_inches ?? sourceOptions.specialty_right_leg_height,
  );
  alias(configuration, "non_operable", yesNoBoolean(sourceOptions.non_operable));
  alias(
    configuration,
    "stacking_configuration",
    firstString(sourceOptions, "stacking_configuration", "vertical_stacking", "split_splice"),
  );
  alias(configuration, "vertical_left_width_inches", sourceOptions.vertical_left_width_inches);
  alias(configuration, "vertical_right_width_inches", sourceOptions.vertical_right_width_inches);
  alias(configuration, "lotus_program_code", sourceOptions.lotus_program_code);
  alias(
    configuration,
    "lotus_configuration_version",
    sourceOptions.lotus_configuration_version,
  );
  alias(configuration, "lotus_finish", sourceOptions.lotus_finish);
  alias(configuration, "lotus_blind_count", sourceOptions.lotus_blind_count);
  alias(
    configuration,
    "lotus_blind_widths_inches",
    sourceOptions.lotus_blind_widths_inches ??
      leadingNumberArray(
        sourceOptions,
        (index) => `lotus_blind_${index}_width_inches`,
        3,
      ),
  );
  alias(
    configuration,
    "faux_configuration_version",
    sourceOptions.faux_configuration_version,
  );
  alias(configuration, "faux_blind_count", sourceOptions.faux_blind_count);
  alias(
    configuration,
    "faux_blind_widths_inches",
    sourceOptions.faux_blind_widths_inches ??
      leadingNumberArray(
        sourceOptions,
        (index) => `faux_blind_${index}_width_inches`,
        3,
      ),
  );

  if (input.productId === "onyx_shutters") {
    alias(configuration, "material", canonicalOnyxMaterial(design.material));
    alias(
      configuration,
      "mount_type",
      canonicalOnyxMount(sourceOptions.onyx_mount ?? design.mount_type),
    );
    alias(
      configuration,
      "measurement_basis",
      canonicalOnyxMeasurementBasis(sourceOptions.size_type),
    );
    alias(
      configuration,
      "order_type",
      canonicalOnyxOrderType(sourceOptions.onyx_order_type ?? sourceOptions.shutter_type),
    );
    alias(configuration, "frame_source_code", stringValue(sourceOptions.frame_type));
    alias(configuration, "frame_type", canonicalOnyxFrameType(sourceOptions.frame_type));
    // The normalized browser payload is not authoritative for this numeric
    // enum. Keep only a canonical three- or four-sided selection.
    delete configuration.frame_sides;
    alias(configuration, "frame_sides", onyxFrameSides(sourceOptions.frame_sides));
    alias(configuration, "panel_configuration", design.panel_config);
    alias(configuration, "louver_size_inches", canonicalOnyxLouverSize(design.louver_size));
    alias(configuration, "tilt_type", canonicalOnyxTilt(design.tilt_type));
    alias(
      configuration,
      "hidden_tilt_notch_back_of_louver",
      /^H2\b/i.test(stringValue(design.tilt_type) ?? ""),
    );
    alias(configuration, "color_name", canonicalOnyxColor(sourceOptions.color));
    alias(configuration, "hinge_color", design.hinge_color);
    alias(configuration, "frame_extension_inches", sourceOptions.frame_extension_inches);
    alias(configuration, "available_depth_inches", sourceOptions.available_depth_inches);
    alias(
      configuration,
      "opening_diagonal_difference_inches",
      sourceOptions.opening_diagonal_difference_inches,
    );
    alias(
      configuration,
      "panel_widths_inches",
      sourceOptions.panel_widths_inches ??
        leadingNumberArray(sourceOptions, (index) => `onyx_panel_${index}_width_inches`, 4),
    );
    alias(
      configuration,
      "panel_heights_inches",
      sourceOptions.panel_heights_inches ??
        leadingNumberArray(sourceOptions, (index) => `onyx_panel_${index}_height_inches`, 4),
    );
    alias(configuration, "offset_tilt_distance_inches", sourceOptions.offset_tilt_distance_inches);
    alias(
      configuration,
      "tilt_rod_section_lengths_inches",
      sourceOptions.tilt_rod_section_lengths_inches ??
        leadingNumberArray(sourceOptions, (index) => `onyx_tilt_section_${index}_inches`, 12),
    );
    const explicitTPostCount = finiteValue(sourceOptions.onyx_t_post_count);
    const tPostSelection = firstString(sourceOptions, "t_post");
    const derivedTPostCount =
      explicitTPostCount ??
      (tPostSelection === "None"
        ? 0
        : tPostSelection === "T1"
          ? 1
          : tPostSelection === "T2"
            ? 2
            : null);
    alias(configuration, "t_post_count", derivedTPostCount);
    alias(
      configuration,
      "t_post_positions_inches",
      sourceOptions.t_post_positions_inches ??
        leadingNumberArray(
          sourceOptions,
          (index) => `onyx_t_post_${index}_position_inches`,
          3,
        ),
    );
    const dividerSelected = yesNoBoolean(sourceOptions.divider_rail);
    alias(
      configuration,
      "divider_rail_count",
      sourceOptions.divider_rail_count ??
        (dividerSelected === true ? 1 : dividerSelected === false ? 0 : undefined),
    );
    const dividerLocation = firstString(sourceOptions, "divider_rail_location");
    alias(
      configuration,
      "divider_rail_location_mode",
      dividerLocation === "Center"
        ? "factory_even"
        : dividerLocation === "Custom"
          ? "custom"
          : dividerLocation,
    );
    const dividerPosition = finiteValue(sourceOptions.divider_rail_height);
    alias(
      configuration,
      "divider_rail_positions_inches",
      sourceOptions.divider_rail_positions_inches ??
        (dividerPosition === null ? undefined : [dividerPosition]),
    );
    alias(configuration, "flat_mounting_area_inches", sourceOptions.flat_mounting_area_inches);
    alias(configuration, "hardware_clearance_inches", sourceOptions.hardware_clearance_inches);
    alias(configuration, "french_door_cutout", yesNoBoolean(sourceOptions.french_door_cutout));
    alias(
      configuration,
      "handle_center_from_bottom_inches",
      sourceOptions.handle_center_from_bottom_inches,
    );
    alias(
      configuration,
      "lock_center_from_bottom_inches",
      sourceOptions.lock_center_from_bottom_inches,
    );
    alias(configuration, "horizontal_t_post", yesNoBoolean(sourceOptions.horizontal_t_post));
    alias(configuration, "window_application", firstString(sourceOptions, "window_application"));
  }
  if (input.productId === "norman_shutters") {
    alias(
      configuration,
      "mount_type",
      canonicalOnyxMount(sourceOptions.shutter_mount_type ?? design.mount_type),
    );
    alias(
      configuration,
      "measurement_basis",
      canonicalOnyxMeasurementBasis(sourceOptions.size_type),
    );
    delete configuration.frame_sides;
    alias(configuration, "frame_sides", onyxFrameSides(sourceOptions.frame_sides));
  }
  const sideBySidePosition = firstString(sourceOptions, "side_by_side_position");
  const normalizedSideBySide = sideBySidePosition
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (
    sideBySidePosition &&
    normalizedSideBySide !== "none" &&
    normalizedSideBySide !== "not side by side"
  ) {
    alias(configuration, "side_by_side", true);
    alias(configuration, "side_by_side_position", sideBySidePosition);
    alias(
      configuration,
      "side_by_side_match_line_id",
      firstString(
        sourceOptions,
        "side_by_side_match_line_id",
        "side_by_side_reference_line_id",
      ),
    );
    alias(
      configuration,
      "side_by_side_wand_orientation",
      firstString(sourceOptions, "draw_direction", "control_side", "control_type"),
    );
  } else if (sideBySidePosition) {
    alias(configuration, "side_by_side", false);
  }
  alias(
    configuration,
    "draw_direction",
    firstString(sourceOptions, "draw_direction", "control_side", "control_type"),
  );

  const measuredWidthInches = authoritativeV2Measurement(
    line.width_whole,
    line.width_fraction,
    "width",
  );
  const measuredHeightInches = authoritativeV2Measurement(
    line.height_whole,
    line.height_fraction,
    "height",
  );
  // SelectionContext always preserves the customer opening. Source-backed
  // pricing footprints are derived inside the authoritative engine, never in
  // the browser-payload adapter.
  const widthInches = measuredWidthInches;
  const heightInches = measuredHeightInches;
  // Honeycomb side-by-side rules compare the exact measured height from the
  // immutable line snapshot; this is not a user-entered confirmation flag.
  alias(configuration, "shade_height", heightInches);

  // Catalog authority belongs to the caller/server. Values stored in the
  // browser payload are snapshots only and must never select a pricing book.
  const catalogAsOf = input.catalogAsOf ?? "2026-07-20";
  const catalogManufacturer = getProduct(input.productId)?.manufacturer;
  return {
    manufacturerId:
      catalogManufacturer?.trim().toLowerCase() ??
      "unknown-catalog-manufacturer",
    productId: input.productId,
    programId: input.programId,
    catalogVersion:
      input.catalogVersion ?? quoteV2CatalogVersionFor(input.productId, catalogAsOf),
    catalogAsOf,
    widthInches,
    heightInches,
    quantity: authoritativeV2Quantity(line.quantity),
    configuration,
    options: normalizedOptions(sourceOptions, "pricing"),
  };
}
