import type {
  ProductRuleStatus,
  SelectionContext,
  SelectionRecord,
  SelectionValue,
  ValidationIssue,
  ValidationSeverity,
} from "./core";
import { sourceProvenance } from "./source-manifest";
import { resolveOnyxWindowSizePricing } from "./onyx-pricing-size";

/**
 * The supplied binder is an old, undated reference guide. Its cover says
 * "2017 Reference Menu", while the file was last modified in 2020. It names a
 * generic Vinyl product, not the newer Onyx U.S. Made Vinyl program. The rules
 * below therefore preserve every restriction that can be read safely, but the
 * product intentionally remains fail-closed until a current product-specific
 * guide joins these two identities.
 */
export const ONYX_SHUTTER_RULE_STATUS: ProductRuleStatus =
  "restriction_source_incomplete";

export const ONYX_BINDER_SOURCE = sourceProvenance(
  "onyx-reference-guide-2020-2021",
);

/** User-supplied 2026 pricing evidence; this is pricing, not restriction evidence. */
export const ONYX_US_MADE_VINYL_PRICE_SOURCE = sourceProvenance(
  "onyx-price-screenshot-2026-07-20",
);

/** Redacted, customer-neutral fixture captured from the current 805 dealer portal. */
export const ONYX_US_MADE_VINYL_PORTAL_SOURCE = sourceProvenance(
  "onyx-us-made-vinyl-portal-2026-07-22",
);

export const ONYX_US_MADE_VINYL_PORTAL_FIXTURE = Object.freeze({
  widthInches: 30,
  heightInches: 72,
  frameType: "VL Outside",
  frameSides: 4,
  panelConfiguration: "L",
  portalBillableSquareFeet: 17.564,
  portalDealerCostPerBillableSquareFoot: 13.65,
  portalLinePrice: 239.749,
  portalSurcharge: 0,
  source: ONYX_US_MADE_VINYL_PORTAL_SOURCE,
});

export const ONYX_US_MADE_VINYL_PRICE = Object.freeze({
  programId: "onyx_us_made_vinyl",
  /** Historical user-supplied evidence. It is not current runtime authority while the portal conflict is open. */
  dealerCostPerSquareFoot: 13.6,
  currentPortalDealerCostPerBillableSquareFoot: 13.65,
  pricingConflict: true,
  customerRetailPerSquareFoot: null,
  retailMultiplier: null,
  legacyUserDirectedCustomerRetailPerSquareFoot: 34,
  legacyUserDirectedRetailMultiplier: 2.5,
  source: ONYX_US_MADE_VINYL_PRICE_SOURCE,
});

export const ONYX_AUTOMATION_GAPS = Object.freeze([
  "The current 805 dealer portal prices the verified U.S. Made Vinyl fixture at $13.65 per portal billable square foot and 17.564 square feet, conflicting with the supplied $13.60 opening-area evidence.",
  "The binder names generic Vinyl, not Onyx U.S. Made Vinyl, so their construction limits cannot be joined safely.",
  "The binder states no effective date and its cover identifies a 2017 reference menu.",
  "No maximum panel-area rule is published; only width and height limits are present.",
  "The binder says hinge selections exist but does not publish the hinge assortment or compatibility.",
  "Bypass, specialty, bay, and corner applications do not have complete dimensional restriction tables.",
]);

type RuleSource = { page: number; pages?: never } | { pages: readonly number[]; page?: never };

const source = (location: RuleSource) => ({
  ...ONYX_BINDER_SOURCE,
  ...location,
});

function issue(
  severity: ValidationSeverity,
  ruleId: string,
  location: RuleSource,
  selectedValues: SelectionRecord,
  explanation: string,
  derivedValues?: SelectionRecord,
): ValidationIssue {
  return {
    severity,
    ruleId,
    source: source(location),
    selectedValues,
    explanation,
    ...(derivedValues ? { derivedValues } : {}),
  };
}

function value(context: SelectionContext, ...keys: string[]): SelectionValue | undefined {
  for (const key of keys) {
    const candidate = context.configuration[key] ?? context.options[key];
    if (candidate !== undefined && candidate !== null && candidate !== "") return candidate;
  }
  return undefined;
}

function text(context: SelectionContext, ...keys: string[]): string {
  const candidate = value(context, ...keys);
  return typeof candidate === "string" ? candidate.trim() : "";
}

function number(context: SelectionContext, ...keys: string[]): number | null {
  const candidate = value(context, ...keys);
  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  if (typeof candidate === "string" && candidate.trim()) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function boolean(context: SelectionContext, ...keys: string[]): boolean | null {
  const candidate = value(context, ...keys);
  if (typeof candidate === "boolean") return candidate;
  if (typeof candidate === "string") {
    const normalized = candidate.trim().toLowerCase();
    if (["yes", "true", "1"].includes(normalized)) return true;
    if (["no", "false", "0"].includes(normalized)) return false;
  }
  return null;
}

function numericArray(context: SelectionContext, ...keys: string[]): number[] | null {
  const candidate = value(context, ...keys);
  if (!Array.isArray(candidate)) return null;
  const converted = candidate.map((entry) =>
    typeof entry === "number"
      ? entry
      : typeof entry === "string" && entry.trim()
        ? Number(entry)
        : Number.NaN,
  );
  return converted.every(Number.isFinite) ? converted : null;
}

function requireText(
  context: SelectionContext,
  issues: ValidationIssue[],
  key: string,
  label: string,
  page: number,
): string {
  const selected = text(context, key);
  if (!selected) {
    issues.push(
      issue(
        "hard_block",
        `onyx.required.${key}`,
        { page },
        { [key]: null },
        `${label} is required before an Onyx selection can be priced or sent.`,
      ),
    );
  }
  return selected;
}

const BINDER_PROGRAM_MATERIAL = Object.freeze({
  bassia: "Bassia",
  vinyl: "Vinyl",
  hybrid: "Hybrid",
} as const);

const US_MADE_PROGRAM_IDS = new Set([
  "onyx_us_made_vinyl",
  "Onyx US Made Vinyl",
  "Onyx U.S. Made Vinyl",
]);

const SOLID_COLORS = new Set(["White", "Snow", "Swiss Coffee", "Creamy", "Butter"]);
const LOUVER_SIZES = new Set([2.5, 3.5, 4.5]);

const FRAME_MOUNTS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  "Z Frame Trim": new Set(["inside"]),
  "Z Frame Fine": new Set(["inside"]),
  "Z Frame Crown": new Set(["inside"]),
  "Z Frame Crest": new Set(["inside"]),
  "Decor Frame 2": new Set(["outside"]),
  "Decor Frame 3": new Set(["outside"]),
  "L Frame": new Set(["outside"]),
  "L Frame Bullnose": new Set(["inside", "outside"]),
  "Vinyl L Frame": new Set(["inside", "outside"]),
  "Vinyl Z Frame Small": new Set(["inside"]),
  "Vinyl Z Frame Large": new Set(["inside"]),
});

const CONFIGURATION_PANEL_COUNTS = Object.freeze({
  L: 1,
  R: 1,
  LR: 2,
  LL: 2,
  RR: 2,
  LLRR: 4,
} as const);

const CONFIGURATION_WIDTH_LIMITS = Object.freeze({
  L: { min: 8, max: 35 },
  R: { min: 8, max: 35 },
  LR: { min: 16, max: 70 },
  LL: { min: 16, max: 52 },
  RR: { min: 16, max: 52 },
  LLRR: { min: 32, max: 104 },
} as const);

type FrameDepthFamily = "inside_l" | "inside_z" | "outside_l";

function depthFamily(frameType: string, mount: string): FrameDepthFamily | null {
  if (mount === "inside" && frameType.includes("Z Frame")) return "inside_z";
  if (mount === "inside" && frameType.includes("L Frame")) return "inside_l";
  if (mount === "outside" && frameType.includes("L Frame")) return "outside_l";
  return null;
}

const BASE_DEPTH_BY_FAMILY: Readonly<
  Record<FrameDepthFamily, Readonly<Record<"2.5" | "3.5" | "4.5", number>>>
> = Object.freeze({
  inside_l: { "2.5": 2, "3.5": 2.5, "4.5": 3 },
  inside_z: { "2.5": 1 + 19 / 32, "3.5": 2 + 3 / 32, "4.5": 2 + 19 / 32 },
  outside_l: { "2.5": 7 / 16, "3.5": 15 / 16, "4.5": 1 + 7 / 16 },
});

function validateProgramAndMaterial(
  context: SelectionContext,
  issues: ValidationIssue[],
): "Vinyl" | "Bassia" | "Hybrid" | null {
  const programId = context.programId?.trim() ?? "";
  const material = requireText(context, issues, "material", "Exact Onyx material", 3);

  if (!programId) {
    issues.push(
      issue(
        "hard_block",
        "onyx.program.required",
        { pages: [3, 13] },
        { programId: null },
        "An exact Onyx program is required; a material label may not be inferred from a price row.",
      ),
    );
    return null;
  }

  if (US_MADE_PROGRAM_IDS.has(programId)) {
    if (material !== "Onyx U.S. Made Vinyl") {
      issues.push(
        issue(
          "hard_block",
          "onyx.us_made_vinyl.exact_material_required",
          { page: 3 },
          { programId, material },
          'The U.S. Made program requires the exact material identity "Onyx U.S. Made Vinyl".',
        ),
      );
    }
    issues.push(
      issue(
        "hard_block",
        "onyx.us_made_vinyl.restriction_identity_unverified",
        { page: 3 },
        { programId, material },
        "The supplied binder documents only generic Vinyl. It does not establish that Onyx U.S. Made Vinyl has the same construction or restrictions.",
      ),
    );
    return "Vinyl";
  }

  const expectedMaterial = BINDER_PROGRAM_MATERIAL[
    programId as keyof typeof BINDER_PROGRAM_MATERIAL
  ];
  if (!expectedMaterial) {
    issues.push(
      issue(
        "hard_block",
        "onyx.program.not_in_binder",
        { page: 3 },
        { programId, material },
        "The selected program is not an exact product identity in the supplied Onyx binder.",
      ),
    );
    return null;
  }
  if (material !== expectedMaterial) {
    issues.push(
      issue(
        "hard_block",
        "onyx.program.material_mismatch",
        { page: 3 },
        { programId, material, expectedMaterial },
        "The selected material does not match the exact binder product identity.",
      ),
    );
  }
  return expectedMaterial;
}

function validateFrameAndDepth(context: SelectionContext, issues: ValidationIssue[]): void {
  const mount = requireText(context, issues, "mount_type", "Mount type", 4);
  const frameType = requireText(context, issues, "frame_type", "Frame type", 4);
  const measurementBasis = requireText(
    context,
    issues,
    "measurement_basis",
    "Measurement basis",
    10,
  );
  const windowSizePricing = resolveOnyxWindowSizePricing(context);
  if (measurementBasis === "window_size") {
    if (windowSizePricing.frameSides === null) {
      issues.push(
        issue(
          "hard_block",
          "onyx.required.frame_sides",
          { page: 13 },
          { frame_sides: null },
          "Three-sided or four-sided frame pricing must be selected for a window-size Onyx quote.",
        ),
      );
    }
    if (!windowSizePricing.supported) {
      issues.push(
        issue(
          "hard_block",
          "onyx.measurement.window_size_pricing_unsupported",
          { page: 13 },
          {
            measurement_basis: measurementBasis,
            mount_type: mount || null,
            frame_type: frameType || null,
            frame_sides: windowSizePricing.frameSides,
            reason: windowSizePricing.reason,
          },
          "The pinned binder does not document a window-size pricing footprint for this exact mount, frame, and side count. Enter final frame-to-frame dimensions instead.",
        ),
      );
    } else {
      issues.push(
        issue(
          "auto_derive",
          "onyx.measurement.window_size_pricing_dimensions",
          { page: 13 },
          {
            measured_width_inches: context.widthInches,
            measured_height_inches: context.heightInches,
            mount_type: mount,
            frame_type: frameType,
            frame_sides: windowSizePricing.frameSides,
          },
          "The authoritative engine derives the internal Onyx pricing footprint from the measured opening and the binder's exact window-size table.",
          {
            pricing_width_inches: windowSizePricing.pricingWidthInches,
            pricing_height_inches: windowSizePricing.pricingHeightInches,
            width_addition_inches: windowSizePricing.widthAdditionInches,
            height_addition_inches: windowSizePricing.heightAdditionInches,
          },
        ),
      );
    }
  } else if (measurementBasis && measurementBasis !== "frame_to_frame") {
    issues.push(
      issue(
        "hard_block",
        "onyx.measurement.frame_to_frame_required",
        { pages: [10, 13] },
        { measurement_basis: measurementBasis },
        "Automated restriction checks require final frame-to-frame dimensions or the exact documented window-size selection.",
      ),
    );
  }

  if (mount && !["inside", "outside"].includes(mount)) {
    issues.push(
      issue(
        "hard_block",
        "onyx.mount.unsupported",
        { page: 4 },
        { mount_type: mount },
        "Mount type must be the exact binder value inside or outside.",
      ),
    );
  }
  const allowedMounts = FRAME_MOUNTS[frameType];
  if (frameType && (!allowedMounts || !allowedMounts.has(mount))) {
    issues.push(
      issue(
        "hard_block",
        "onyx.frame.mount_incompatible",
        { page: 4 },
        { frame_type: frameType, mount_type: mount },
        "The selected frame and mount combination is not shown in the supplied binder.",
      ),
    );
  }

  const extension = number(context, "frame_extension_inches");
  if (extension === null) {
    issues.push(
      issue(
        "hard_block",
        "onyx.required.frame_extension_inches",
        { page: 4 },
        { frame_extension_inches: null },
        "Frame extension must be selected explicitly, including zero.",
      ),
    );
  } else if (extension < 0 || extension > 2) {
    issues.push(
      issue(
        "hard_block",
        "onyx.frame.extension.range",
        { page: 4 },
        { frame_extension_inches: extension },
        'The binder permits custom frame extensions only from 0 through 2 inches.',
      ),
    );
  }

  const louver = number(context, "louver_size_inches");
  if (louver === null || !LOUVER_SIZES.has(louver)) return;
  const family = depthFamily(frameType, mount);
  if (!family) {
    if (frameType && mount) {
      issues.push(
        issue(
          "hard_block",
          "onyx.depth.profile_not_documented",
          { page: 5 },
          { frame_type: frameType, mount_type: mount, louver_size_inches: louver },
          "The binder does not publish a louver-clearance diagram for this frame profile, so depth may not be guessed.",
        ),
      );
    }
    return;
  }
  const availableDepth = number(context, "available_depth_inches");
  if (availableDepth === null) {
    issues.push(
      issue(
        "hard_block",
        "onyx.required.available_depth_inches",
        { pages: [5, 9] },
        { available_depth_inches: null },
        "Available depth is required for the documented louver-clearance check.",
      ),
    );
    return;
  }
  const hiddenNotch = boolean(context, "hidden_tilt_notch_back_of_louver") === true;
  const requiredDepth =
    BASE_DEPTH_BY_FAMILY[family][String(louver) as "2.5" | "3.5" | "4.5"] +
    (hiddenNotch ? 0.25 : 0);
  if (availableDepth < requiredDepth) {
    issues.push(
      issue(
        "hard_block",
        "onyx.depth.minimum",
        { page: 5 },
        {
          frame_type: frameType,
          mount_type: mount,
          louver_size_inches: louver,
          available_depth_inches: availableDepth,
          hidden_tilt_notch_back_of_louver: hiddenNotch,
          required_depth_inches: requiredDepth,
        },
        `Available depth is below the documented ${requiredDepth}-inch clearance requirement.`,
      ),
    );
  }

  const outOfSquare = number(context, "opening_diagonal_difference_inches");
  if (mount === "inside" && outOfSquare === null) {
    issues.push(
      issue(
        "hard_block",
        "onyx.required.opening_diagonal_difference_inches",
        { page: 9 },
        { opening_diagonal_difference_inches: null },
        "Inside mounts require the measured diagonal difference.",
      ),
    );
  } else if (mount === "inside" && outOfSquare !== null && outOfSquare > 3 / 8) {
    issues.push(
      issue(
        "hard_block",
        "onyx.mount.inside.out_of_square",
        { page: 9 },
        { opening_diagonal_difference_inches: outOfSquare },
        'An opening more than 3/8 inch out of square must use an outside mount.',
      ),
    );
  }
}

function validatePanelGeometry(context: SelectionContext, issues: ValidationIssue[]): void {
  const panelConfiguration = requireText(
    context,
    issues,
    "panel_configuration",
    "Panel configuration",
    6,
  ) as keyof typeof CONFIGURATION_PANEL_COUNTS;
  const panelCount = CONFIGURATION_PANEL_COUNTS[panelConfiguration];
  if (!panelCount) {
    if (panelConfiguration) {
      issues.push(
        issue(
          "hard_block",
          "onyx.panel.configuration_not_documented",
          { page: 6 },
          { panel_configuration: panelConfiguration },
          "Only L, R, LR, LL, RR, and LLRR have dimensional evidence in the supplied binder.",
        ),
      );
    }
    return;
  }

  const widths = numericArray(context, "panel_widths_inches");
  if (!widths || widths.length !== panelCount) {
    issues.push(
      issue(
        "hard_block",
        "onyx.panel.widths.required",
        { page: 6 },
        { panel_configuration: panelConfiguration, panel_widths_inches: widths },
        `Exactly ${panelCount} actual panel width${panelCount === 1 ? " is" : "s are"} required.`,
      ),
    );
  } else {
    const perPanelMax = panelCount === 1 ? 30 : 20;
    widths.forEach((panelWidth, index) => {
      if (panelWidth < 8 || panelWidth > perPanelMax) {
        issues.push(
          issue(
            "hard_block",
            "onyx.panel.width.range.vinyl",
            { page: 6 },
            { panel_index: index + 1, panel_width_inches: panelWidth, panel_count: panelCount },
            `Vinyl ${panelCount === 1 ? "single" : "multiple"}-panel width must be from 8 through ${perPanelMax} inches.`,
          ),
        );
      }
    });
    const totalPanelWidth = widths.reduce((sum, panelWidth) => sum + panelWidth, 0);
    const limits = CONFIGURATION_WIDTH_LIMITS[panelConfiguration];
    if (totalPanelWidth < limits.min || totalPanelWidth > limits.max) {
      issues.push(
        issue(
          "hard_block",
          "onyx.panel.configuration_width.range",
          { page: 6 },
          { panel_configuration: panelConfiguration, total_panel_width_inches: totalPanelWidth },
          `Panel configuration ${panelConfiguration} must total from ${limits.min} through ${limits.max} inches before the frame.`,
        ),
      );
    }
  }

  const heights = numericArray(context, "panel_heights_inches");
  if (!heights || heights.length !== panelCount) {
    issues.push(
      issue(
        "hard_block",
        "onyx.panel.heights.required",
        { page: 6 },
        { panel_configuration: panelConfiguration, panel_heights_inches: heights },
        `Exactly ${panelCount} actual panel height${panelCount === 1 ? " is" : "s are"} required.`,
      ),
    );
  } else {
    heights.forEach((panelHeight, index) => {
      if (panelHeight < 16 || panelHeight > 84) {
        issues.push(
          issue(
            "hard_block",
            "onyx.panel.height.range.vinyl",
            { page: 6 },
            { panel_index: index + 1, panel_height_inches: panelHeight },
            "Vinyl panel height must be from 16 through 84 inches.",
          ),
        );
      }
    });
  }
}

function validateColorTiltAndRails(context: SelectionContext, issues: ValidationIssue[]): void {
  const color = requireText(context, issues, "color_name", "Exact color", 5);
  if (color && !SOLID_COLORS.has(color)) {
    issues.push(
      issue(
        "hard_block",
        "onyx.vinyl.color_not_documented",
        { page: 5 },
        { color_name: color },
        "Only the five named solid colors are documented for Vinyl; request-only colors require manual verification.",
      ),
    );
  }

  const hingeColor = requireText(context, issues, "hinge_color", "Exact hinge color", 3);
  if (hingeColor) {
    issues.push(
      issue(
        "hard_block",
        "onyx.hinge.assortment_source_incomplete",
        { page: 3 },
        { hinge_color: hingeColor },
        "The binder says hinge selections exist but does not list their identities or compatibility.",
      ),
    );
  }

  const louver = number(context, "louver_size_inches");
  if (louver === null) {
    issues.push(
      issue(
        "hard_block",
        "onyx.required.louver_size_inches",
        { page: 5 },
        { louver_size_inches: null },
        "Exact louver size is required.",
      ),
    );
  } else if (!LOUVER_SIZES.has(louver)) {
    issues.push(
      issue(
        "hard_block",
        "onyx.louver.size_not_documented",
        { page: 5 },
        { louver_size_inches: louver },
        "The binder documents only 2.5-, 3.5-, and 4.5-inch louvers.",
      ),
    );
  }

  const tilt = requireText(context, issues, "tilt_type", "Tilt rod type", 5);
  if (tilt && !["standard", "offset", "hidden"].includes(tilt)) {
    issues.push(
      issue(
        "hard_block",
        "onyx.tilt.type_not_documented",
        { page: 5 },
        { tilt_type: tilt },
        "The binder documents Standard, Offset, and Hidden tilt categories but does not map H1/H2/H3 codes.",
      ),
    );
  }
  if (tilt === "offset" && number(context, "offset_tilt_distance_inches") === null) {
    issues.push(
      issue(
        "auto_derive",
        "onyx.tilt.offset.default_location",
        { page: 5 },
        { offset_tilt_distance_inches: null },
        "The binder default is 2 inches from the louver ends on the hinged side.",
        { offset_tilt_distance_inches: 2 },
      ),
    );
  }
  if (tilt === "hidden") {
    const sections = numericArray(context, "tilt_rod_section_lengths_inches");
    if (!sections || sections.length === 0) {
      issues.push(
        issue(
          "hard_block",
          "onyx.tilt.hidden.section_lengths_required",
          { page: 5 },
          { tilt_rod_section_lengths_inches: sections },
          "Hidden tilt requires every actual tilt-rod section length so the 40-inch split rule can be enforced.",
        ),
      );
    } else {
      sections.forEach((sectionLength, index) => {
        if (sectionLength <= 0 || sectionLength > 40) {
          issues.push(
            issue(
              "hard_block",
              "onyx.tilt.hidden.section_length.maximum",
              { page: 5 },
              { section_index: index + 1, section_length_inches: sectionLength },
              "Every hidden tilt-rod section must be positive and no longer than 40 inches.",
            ),
          );
        }
      });
    }
  }

  const railCount = number(context, "divider_rail_count");
  if (railCount === null || !Number.isInteger(railCount) || railCount < 0) {
    issues.push(
      issue(
        "hard_block",
        "onyx.divider_rail.count_required",
        { page: 6 },
        { divider_rail_count: railCount },
        "Divider-rail count must be an explicit nonnegative whole number.",
      ),
    );
    return;
  }
  const tallestPanel = Math.max(...(numericArray(context, "panel_heights_inches") ?? [0]));
  const minimumRails = tallestPanel > 100 ? 2 : tallestPanel > 72 ? 1 : 0;
  if (railCount < minimumRails) {
    issues.push(
      issue(
        "hard_block",
        "onyx.divider_rail.minimum_required",
        { page: 6 },
        { panel_height_inches: tallestPanel, divider_rail_count: railCount, required_count: minimumRails },
        `A ${tallestPanel}-inch panel requires at least ${minimumRails} divider rail${minimumRails === 1 ? "" : "s"}.`,
      ),
    );
  } else if (tallestPanel > 60 && tallestPanel <= 72 && railCount === 0) {
    issues.push(
      issue(
        "warning",
        "onyx.divider_rail.recommended",
        { page: 6 },
        { panel_height_inches: tallestPanel, divider_rail_count: railCount },
        "One divider rail is recommended above 60 inches, but is not required until the panel exceeds 72 inches.",
      ),
    );
  }
  if (railCount > 0) {
    const locationMode = requireText(
      context,
      issues,
      "divider_rail_location_mode",
      "Divider-rail location mode",
      6,
    );
    if (locationMode && !["factory_even", "custom"].includes(locationMode)) {
      issues.push(
        issue(
          "hard_block",
          "onyx.divider_rail.location_mode",
          { page: 6 },
          { divider_rail_location_mode: locationMode },
          "Divider rails must use the factory-even placement or exact custom positions.",
        ),
      );
    }
    if (locationMode === "custom") {
      const positions = numericArray(context, "divider_rail_positions_inches");
      if (!positions || positions.length !== railCount || positions.some((position) => position <= 0 || position >= tallestPanel)) {
        issues.push(
          issue(
            "hard_block",
            "onyx.divider_rail.custom_positions",
            { page: 6 },
            { divider_rail_count: railCount, divider_rail_positions_inches: positions },
            "Custom rail positions must contain one valid bottom-to-midpoint measurement for every rail.",
          ),
        );
      }
    }
  }
}

function validateApplication(context: SelectionContext, issues: ValidationIssue[]): void {
  const orderType = requireText(context, issues, "order_type", "Order type", 8);
  const panelConfiguration = text(context, "panel_configuration") as keyof typeof CONFIGURATION_PANEL_COUNTS;
  const panelCount = CONFIGURATION_PANEL_COUNTS[panelConfiguration] ?? 0;
  const totalPanelWidth = (numericArray(context, "panel_widths_inches") ?? []).reduce(
    (sum, width) => sum + width,
    0,
  );

  if (orderType === "double_hung") {
    if (![1, 2].includes(panelCount)) {
      issues.push(
        issue(
          "hard_block",
          "onyx.double_hung.panel_count",
          { page: 8 },
          { panel_configuration: panelConfiguration, panel_count: panelCount },
          "Double Hung is available only as a single-panel or two-panel configuration.",
        ),
      );
    }
    if (totalPanelWidth > 70) {
      issues.push(
        issue(
          "hard_block",
          "onyx.double_hung.width.maximum",
          { page: 8 },
          { total_panel_width_inches: totalPanelWidth },
          "Double Hung maximum panel width is 70 inches before the frame.",
        ),
      );
    }
    if (boolean(context, "horizontal_t_post") !== true) {
      issues.push(
        issue(
          "hard_block",
          "onyx.double_hung.horizontal_t_post_required",
          { page: 8 },
          { horizontal_t_post: boolean(context, "horizontal_t_post") },
          "Double Hung requires a horizontal T-post.",
        ),
      );
    }
  } else if (orderType === "bifold") {
    const limits = panelCount === 2 ? { min: 24, max: 52 } : panelCount === 4 ? { min: 48, max: 104 } : null;
    if (!limits) {
      issues.push(
        issue(
          "hard_block",
          "onyx.bifold.panel_count",
          { page: 8 },
          { panel_count: panelCount },
          "Bi Fold track shutters are documented only for two or four panels.",
        ),
      );
    } else if (totalPanelWidth < limits.min || totalPanelWidth > limits.max) {
      issues.push(
        issue(
          "hard_block",
          "onyx.bifold.width.range",
          { page: 8 },
          { panel_count: panelCount, total_panel_width_inches: totalPanelWidth },
          `${panelCount}-panel Bi Fold width must be from ${limits.min} through ${limits.max} inches before the frame.`,
        ),
      );
    }
    issues.push(
      issue(
        "hard_block",
        "onyx.bifold.restriction_source_incomplete",
        { pages: [8, 12] },
        { order_type: orderType },
        "The binder does not publish complete Bi Fold height, depth, and configuration restrictions; manual manufacturer verification is required.",
      ),
    );
  } else if (orderType === "bypass") {
    issues.push(
      issue(
        "hard_block",
        "onyx.bypass.restriction_source_incomplete",
        { pages: [8, 12] },
        { order_type: orderType },
        "The binder publishes 3.5-inch track depths but no complete Bypass width and height restriction matrix.",
      ),
    );
  } else if (orderType === "french_door") {
    const frameType = text(context, "frame_type");
    const cutout = boolean(context, "french_door_cutout") === true;
    const flatArea = number(context, "flat_mounting_area_inches");
    const hardwareClearance = number(context, "hardware_clearance_inches");
    if (flatArea === null || flatArea < 1.75) {
      issues.push(
        issue(
          "hard_block",
          "onyx.french_door.flat_area.minimum",
          { page: 10 },
          { flat_mounting_area_inches: flatArea },
          "French Door installation requires at least 1.75 inches of flat mounting area.",
        ),
      );
    }
    if (hardwareClearance === null) {
      issues.push(
        issue(
          "hard_block",
          "onyx.french_door.hardware_clearance_required",
          { pages: [8, 10] },
          { hardware_clearance_inches: null },
          "French Door hardware clearance is required.",
        ),
      );
    } else if (hardwareClearance < 1.75 && !cutout) {
      issues.push(
        issue(
          "hard_block",
          "onyx.french_door.cutout_required",
          { page: 8 },
          { hardware_clearance_inches: hardwareClearance, french_door_cutout: cutout },
          "Hardware clearance under 1.75 inches requires a French Door cutout.",
        ),
      );
    }
    if (cutout && !frameType.includes("L Frame")) {
      issues.push(
        issue(
          "hard_block",
          "onyx.french_door.cutout.l_frame_only",
          { page: 8 },
          { french_door_cutout: cutout, frame_type: frameType },
          "French Door cutouts are available for L Frame only.",
        ),
      );
    }
    if (cutout && (number(context, "handle_center_from_bottom_inches") === null || number(context, "lock_center_from_bottom_inches") === null)) {
      issues.push(
        issue(
          "hard_block",
          "onyx.french_door.hardware_centers_required",
          { page: 10 },
          {
            handle_center_from_bottom_inches: number(context, "handle_center_from_bottom_inches"),
            lock_center_from_bottom_inches: number(context, "lock_center_from_bottom_inches"),
          },
          "A cutout requires exact handle-center and lock-center measurements from the shutter bottom.",
        ),
      );
    }
    issues.push(
      issue(
        "hard_block",
        "onyx.french_door.extension_source_incomplete",
        { page: 10 },
        { order_type: orderType },
        "The binder says the factory adds louver-dependent extension but does not publish those extension values.",
      ),
    );
  } else if (orderType === "specialty") {
    issues.push(
      issue(
        "hard_block",
        "onyx.specialty.manual_quote_required",
        { page: 7 },
        { order_type: orderType, specialty_shape: text(context, "specialty_shape") || null },
        "Specialty shapes require a template or detailed drawing and the binder publishes no complete dimensional limits.",
      ),
    );
  } else if (orderType && orderType !== "standard") {
    issues.push(
      issue(
        "hard_block",
        "onyx.order_type.not_documented",
        { pages: [7, 8] },
        { order_type: orderType },
        "The selected Onyx order type is not documented by the supplied binder.",
      ),
    );
  }

  const tPostCount = number(context, "t_post_count");
  if (tPostCount === null || !Number.isInteger(tPostCount) || tPostCount < 0) {
    issues.push(
      issue(
        "hard_block",
        "onyx.t_post.count_required",
        { page: 10 },
        { t_post_count: tPostCount },
        "T-post count must be an explicit nonnegative whole number.",
      ),
    );
  } else if (tPostCount > 0) {
    const positions = numericArray(context, "t_post_positions_inches");
    if (!positions || positions.length !== tPostCount || positions.some((position) => position <= 0 || position >= context.widthInches)) {
      issues.push(
        issue(
          "hard_block",
          "onyx.t_post.positions_required",
          { page: 10 },
          { t_post_count: tPostCount, t_post_positions_inches: positions },
          "Every T-post requires an exact position measured from the documented reference edge.",
        ),
      );
    }
  }

  const application = text(context, "window_application") || "standard";
  if (["bay", "corner"].includes(application)) {
    issues.push(
      issue(
        "hard_block",
        "onyx.window_application.manual_quote_required",
        { page: 11 },
        { window_application: application },
        "Bay and corner shutters require factory deductions/spacers that are not fully quantified in the binder.",
      ),
    );
  }
}

/**
 * Source-provenanced mechanical checks for Onyx shutters.
 *
 * This function intentionally returns hard blocks even for a geometrically
 * valid U.S. Made Vinyl selection. The missing current product-identity and
 * maximum-area evidence means it is unsafe to upgrade the product to
 * `documented_limited` from this binder alone.
 */
export function validateOnyxShutterRestrictions(
  context: SelectionContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (context.productId !== "onyx_shutters") {
    return [
      issue(
        "hard_block",
        "onyx.product.identity",
        { page: 3 },
        { productId: context.productId },
        "The Onyx rule set may only evaluate productId onyx_shutters.",
      ),
    ];
  }

  if (!new Set(["onyx", "onyx_shutters", "Onyx", "Onyx Shutters"]).has(context.manufacturerId)) {
    issues.push(
      issue(
        "hard_block",
        "onyx.manufacturer.identity",
        { page: 1 },
        { manufacturerId: context.manufacturerId },
        "The selection must carry an exact Onyx manufacturer identity.",
      ),
    );
  }

  const materialClass = validateProgramAndMaterial(context, issues);
  validateFrameAndDepth(context, issues);
  if (materialClass === "Vinyl") {
    validatePanelGeometry(context, issues);
    validateColorTiltAndRails(context, issues);
    validateApplication(context, issues);
  } else {
    issues.push(
      issue(
        "hard_block",
        "onyx.non_vinyl.rules_not_normalized",
        { pages: [3, 6] },
        { programId: context.programId, material: text(context, "material") || null },
        "This module normalizes only the binder's Vinyl mechanical limits; Bassia and Hybrid require their own source reconciliation.",
      ),
    );
  }

  if (!Number.isFinite(context.widthInches) || context.widthInches <= 0) {
    issues.push(
      issue(
        "hard_block",
        "onyx.dimension.width.positive",
        { page: 6 },
        { widthInches: context.widthInches },
        "Frame-to-frame width must be positive.",
      ),
    );
  }
  if (!Number.isFinite(context.heightInches) || context.heightInches <= 0) {
    issues.push(
      issue(
        "hard_block",
        "onyx.dimension.height.positive",
        { page: 6 },
        { heightInches: context.heightInches },
        "Frame-to-frame height must be positive.",
      ),
    );
  }

  if (US_MADE_PROGRAM_IDS.has(context.programId ?? "")) {
    issues.push({
      severity: "hard_block",
      ruleId: "onyx.price.portal_source_conflict",
      source: ONYX_US_MADE_VINYL_PORTAL_SOURCE,
      selectedValues: {
        programId: context.programId,
        supplied_dealer_cost_per_sqft:
          ONYX_US_MADE_VINYL_PRICE.dealerCostPerSquareFoot,
        portal_dealer_cost_per_billable_sqft:
          ONYX_US_MADE_VINYL_PORTAL_FIXTURE.portalDealerCostPerBillableSquareFoot,
        portal_billable_sqft:
          ONYX_US_MADE_VINYL_PORTAL_FIXTURE.portalBillableSquareFeet,
        portal_line_price:
          ONYX_US_MADE_VINYL_PORTAL_FIXTURE.portalLinePrice,
      },
      explanation:
        "Current portal price and billable-area behavior conflict with the supplied pricing screenshot. U.S. Made Vinyl remains unpriceable until Onyx confirms the active rate and frame-area formula.",
    });
  }
  issues.push(
    issue(
      "hard_block",
      "onyx.source.current_effective_revision_missing",
      { pages: [1, 3] },
      { catalogAsOf: context.catalogAsOf, catalogVersion: context.catalogVersion },
      "The supplied file has no effective date and identifies an old 2017 reference menu; current sendability cannot be inferred.",
    ),
  );
  issues.push(
    issue(
      "hard_block",
      "onyx.panel.maximum_area_source_incomplete",
      { page: 6 },
      {
        panel_widths_inches: numericArray(context, "panel_widths_inches"),
        panel_heights_inches: numericArray(context, "panel_heights_inches"),
      },
      "The binder publishes panel width and height limits but no maximum-area rule; V2 will not invent one.",
    ),
  );

  return issues;
}

export interface OnyxRestrictionEvaluation {
  productStatus: ProductRuleStatus;
  issues: readonly ValidationIssue[];
}

export function evaluateOnyxShutterRestrictions(
  context: SelectionContext,
): OnyxRestrictionEvaluation {
  return {
    productStatus: ONYX_SHUTTER_RULE_STATUS,
    issues: validateOnyxShutterRestrictions(context),
  };
}
