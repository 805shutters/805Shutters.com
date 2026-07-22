import type {
  ProductRuleStatus,
  SelectionContext,
  SelectionRecord,
  SelectionValue,
  ValidationIssue,
  ValidationSeverity,
} from "./core";
import {
  QUOTE_V2_PRODUCT_STATUS,
  expectedHoneycombProgramId,
  findHoneycombColor,
  findRomanFrontColor,
  findRomanRearColor,
  getRomanRearMaxWidth,
  findRollerColor,
  findSynchronyVerticalColor,
  isRecognizedQuoteV2Catalog,
  normalizeIdentity,
} from "./catalog";
import { sourceProvenance, type SourceManifestId } from "./source-manifest";
import { validateRollerMatrix } from "./roller-matrix";
import { expectedRollerMotorForPowerConfiguration } from "./roller-motor";
import { canonicalMotorizationSelectionsFromConfiguration } from "./roller-motor-contract";
import { normanHoneycombV2Source } from "./generated/norman-honeycomb-v2.generated";
import { validateHoneycombMatrix } from "./honeycomb-matrix";
import { validateOnyxShutterRestrictions } from "./onyx-rules";
import { validateNormanShadeMotorization } from "./norman-shade-motorization";

type RuleSource = {
  sourceId: SourceManifestId;
  page?: number;
  pages?: readonly number[];
  sheet?: string;
  range?: string;
};

const HONEYCOMB_GUIDE: RuleSource = {
  sourceId: "norman-honeycomb-guide-2026-07",
};
const HONEYCOMB_COLORS: RuleSource = {
  sourceId: "norman-honeycomb-color-coordination-2026-07",
  sheet: "Fabric List",
};
const ROLLER_GUIDE: RuleSource = {
  sourceId: "norman-roller-guide-2026-07",
};
const ROLLER_LIMITS: RuleSource = {
  sourceId: "norman-roller-minmax-appendix-2026-08",
};
const ROMAN_GUIDE: RuleSource = {
  sourceId: "norman-roman-guide-2026-05",
};
const VERTICAL_GUIDE: RuleSource = {
  sourceId: "norman-vertical-blinds-guide-2026-06",
};
const POLAR_DEALER_BOOK: RuleSource = {
  sourceId: "polar-shades-dealer-book-current-2026-07-18",
};

function programMatchesGroup(programId: string | null, priceGroup: string): boolean {
  const groupNumber = priceGroup.match(/(\d+)/)?.[1];
  return Boolean(groupNumber && normalizeIdentity(programId).endsWith(`pg${groupNumber}`));
}

function issue(
  severity: ValidationSeverity,
  ruleId: string,
  source: RuleSource,
  selectedValues: SelectionRecord,
  explanation: string,
  derivedValues?: SelectionRecord,
): ValidationIssue {
  const { sourceId, ...location } = source;
  return {
    severity,
    ruleId,
    source: sourceProvenance(sourceId, location),
    selectedValues,
    explanation,
    ...(derivedValues ? { derivedValues } : {}),
  };
}

function configValue(context: SelectionContext, ...keys: string[]): SelectionValue | undefined {
  for (const key of keys) {
    const value = context.configuration[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function optionValue(context: SelectionContext, ...keys: string[]): SelectionValue | undefined {
  for (const key of keys) {
    const value = context.options[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function text(value: SelectionValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: SelectionValue | undefined): string {
  return normalizeIdentity(text(value));
}

function yes(value: SelectionValue | undefined): boolean {
  return value === true || ["yes", "true", "1"].includes(normalized(value));
}

function finiteNumber(value: SelectionValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function values(context: SelectionContext, keys: string[]): SelectionRecord {
  return Object.fromEntries(
    keys.map((key) => [key, context.configuration[key] ?? context.options[key] ?? null]),
  );
}

function requireText(
  context: SelectionContext,
  issues: ValidationIssue[],
  rulePrefix: string,
  fields: ReadonlyArray<{ key: string; label: string }>,
  source: RuleSource,
): void {
  for (const field of fields) {
    if (text(configValue(context, field.key))) continue;
    issues.push(
      issue(
        "hard_block",
        `${rulePrefix}.required.${field.key}`,
        source,
        { [field.key]: null },
        `${field.label} is required before this configuration can be priced or sent.`,
      ),
    );
  }
}

function validateCommon(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (
    !isRecognizedQuoteV2Catalog(
      context.productId,
      context.catalogAsOf,
      context.catalogVersion,
    )
  ) {
    issues.push(
      issue(
        "hard_block",
        "common.catalog.unrecognized_version",
        { sourceId: "norman-retail-guide-2026-07" },
        {
          productId: context.productId,
          catalogAsOf: context.catalogAsOf,
          catalogVersion: context.catalogVersion,
        },
        "The requested catalog identity is not the server-selected catalog for this product and effective date.",
      ),
    );
  }
  if (!Number.isFinite(context.widthInches) || context.widthInches <= 0) {
    issues.push(
      issue(
        "hard_block",
        "common.dimension.width.positive",
        { sourceId: "norman-retail-guide-2026-07" },
        { widthInches: context.widthInches },
        "Width must be a positive documented measurement.",
      ),
    );
  }
  if (!Number.isFinite(context.heightInches) || context.heightInches <= 0) {
    issues.push(
      issue(
        "hard_block",
        "common.dimension.height.positive",
        { sourceId: "norman-retail-guide-2026-07" },
        { heightInches: context.heightInches },
        "Height must be a positive documented measurement.",
      ),
    );
  }
  if (!Number.isInteger(context.quantity) || context.quantity < 1) {
    issues.push(
      issue(
        "hard_block",
        "common.quantity.positive_integer",
        { sourceId: "norman-retail-guide-2026-07" },
        { quantity: context.quantity },
        "Quantity must be a positive whole number.",
      ),
    );
  }
  if (!context.programId) {
    issues.push(
      issue(
        "hard_block",
        "common.program.required",
        { sourceId: "norman-retail-guide-2026-07" },
        { programId: null },
        "An exact catalog price program is required; V2 never falls back to the first or cheapest grid.",
      ),
    );
  }
  const hasSchedulePercent = Object.prototype.hasOwnProperty.call(
    context.options,
    "schedule_discount_percent",
  );
  const rawSchedulePercent = context.options.schedule_discount_percent;
  const schedulePercent = finiteNumber(rawSchedulePercent);
  if (
    hasSchedulePercent &&
    (schedulePercent === null || ![28.5, 30].includes(schedulePercent))
  ) {
    issues.push(
      issue(
        "hard_block",
        "common.dealer_program.unsupported",
        { sourceId: "norman-retail-guide-2026-07", page: 4 },
        {
          schedule_discount_percent:
            rawSchedulePercent === undefined ? null : rawSchedulePercent,
        },
        "A supplied dealer schedule must be the exact documented 30 or 28.5 selection. Only a truly absent value defaults to standard.",
      ),
    );
  }
  return issues;
}

/**
 * The only current Polar portal/list-price conflict is proven for three exact
 * Elite configurations. Keep the quarantine as narrow as the evidence: do not
 * infer that every Group 4 size or fabric has the same portal/book mismatch.
 */
function validatePolarElitePortalConflict(
  context: SelectionContext,
): ValidationIssue[] {
  if (context.programId !== "group_4" || context.heightInches !== 67) return [];

  const widthIsObserved = [88, 92, 85.5].includes(context.widthInches);
  const fabric = normalized(
    configValue(context, "fabric_collection", "fabric", "material"),
  );
  const operation = normalized(
    configValue(context, "operating_system", "lift_system", "operation"),
  );
  const track = normalized(
    configValue(context, "track_type", "guides", "guide_type"),
  );
  const exactObservedConfiguration =
    widthIsObserved &&
    fabric.replaceAll(" ", "").includes("suntex90") &&
    (operation.includes("manual") || operation.includes("gearcrank")) &&
    track.includes("standard") &&
    (track.includes("nonzipper") || track.includes("track"));

  if (!exactObservedConfiguration) return [];

  return [
    issue(
      "hard_block",
      "polar.elite.portal_book_price_conflict",
      { ...POLAR_DEALER_BOOK, page: 97 },
      {
        widthInches: context.widthInches,
        heightInches: context.heightInches,
        programId: context.programId,
        fabric: text(configValue(context, "fabric_collection", "fabric", "material")),
        operation: text(
          configValue(context, "operating_system", "lift_system", "operation"),
        ),
        track_type: text(
          configValue(context, "track_type", "guides", "guide_type"),
        ),
      },
      "The exact saved Polar portal quote lists this Elite selection at $905 per unit, while the pinned dealer book produces $961; the option stays quarantined until Polar resolves the source conflict.",
    ),
  ];
}

function validateRoller(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requireText(
    context,
    issues,
    "roller",
    [
      { key: "mount_type", label: "Mount type" },
      { key: "roller_application", label: "Roller application" },
      { key: "lift_system", label: "Operating system" },
      { key: "fabric_collection", label: "Fabric collection" },
      { key: "fabric_color_code", label: "Exact fabric color" },
      { key: "roller_top_treatment", label: "Top treatment" },
      { key: "roller_tube", label: "Roller tube" },
    ],
    { ...ROLLER_GUIDE, pages: [7, 8, 9] },
  );

  if (context.catalogAsOf < "2026-08-01") {
    issues.push(
      issue(
        "hard_block",
        "roller.appendix.effective_date",
        { ...ROLLER_LIMITS, sheet: "Revision Log" },
        { catalogAsOf: context.catalogAsOf },
        "The selected Roller MinMax appendix is future-dated and cannot be production-active before August 1, 2026. Use an injected preview date only in the protected test environment.",
      ),
    );
  }

  const collection = text(configValue(context, "fabric_collection"));
  const colorCode = text(configValue(context, "fabric_color_code"));
  const fabric = findRollerColor(collection, colorCode);
  if (collection && colorCode && !fabric) {
    issues.push(
      issue(
        "hard_block",
        "roller.fabric.unknown_identity",
        { ...ROLLER_LIMITS, sheet: "Fabric Code List" },
        { fabric_collection: collection, fabric_color_code: colorCode },
        "This collection and color-code identity is not active in the pinned Roller catalog.",
      ),
    );
  }
  if (fabric && context.programId !== fabric.programId) {
    issues.push(
      issue(
        "hard_block",
        "roller.program.fabric_mismatch",
        { sourceId: "norman-retail-guide-2026-07", page: 14 },
        {
          fabric_collection: collection,
          fabric_color_code: colorCode,
          selectedProgramId: context.programId,
          expectedProgramId: fabric.programId,
        },
        "The selected Roller price program does not match the exact catalog fabric/color price group.",
      ),
    );
  }

  const application = normalized(configValue(context, "roller_application", "shade_type"));
  const coupledCount = finiteNumber(configValue(context, "roller_coupling_count", "coupled_shade_count"));
  if ((application.includes("coupled") || application.includes("t post")) && ![2, 3, 4].includes(coupledCount ?? 0)) {
    issues.push(
      issue(
        "hard_block",
        "roller.application.component_count",
        { ...ROLLER_LIMITS, sheet: "Revision Log" },
        { roller_application: application, roller_coupling_count: coupledCount },
        "Coupled and T-post applications require the exact physical shade count (2, 3, or 4).",
      ),
    );
  }

  const lift = normalized(configValue(context, "lift_system"));
  const canonicalMotorization =
    canonicalMotorizationSelectionsFromConfiguration(context.configuration);
  const selectedLegacyMotor = text(
    configValue(context, "motor_type", "roller_motor"),
  );
  if (lift.includes("motor") && !selectedLegacyMotor && !canonicalMotorization) {
    issues.push(
      issue(
        "hard_block",
        "roller.motor.required",
        { ...ROLLER_GUIDE, pages: [40, 41] },
        { lift_system: lift, motor_type: null },
        "Motorized Roller shades require an exact motor and power configuration.",
      ),
    );
  }
  if (lift.includes("motor") && !canonicalMotorization) {
    issues.push(
      issue(
        "hard_block",
        "roller.motorization.canonical_required",
        { sourceId: "norman-retail-guide-2026-07", pages: [7, 8, 28] },
        { motorization_selections: null },
        "Motorized Roller shades require canonical group, option, role, and unit identities before authoritative pricing.",
      ),
    );
  } else if (canonicalMotorization) {
    issues.push(...canonicalMotorization.issues);
  }
  if (lift.includes("motor") && !text(configValue(context, "roller_power_configuration"))) {
    issues.push(
      issue(
        "hard_block",
        "roller.motor.power.required",
        { ...ROLLER_GUIDE, pages: [40, 41] },
        { roller_power_configuration: null },
        "Select the documented Roller power configuration before pricing.",
      ),
    );
  }
  if (lift.includes("motor")) {
    const powerConfiguration = text(
      configValue(context, "roller_power_configuration"),
    );
    const selectedMotor = selectedLegacyMotor;
    const expectedMotor = expectedRollerMotorForPowerConfiguration(powerConfiguration);
    if (powerConfiguration && !expectedMotor) {
      issues.push(
        issue(
          "hard_block",
          "roller.motor.power.unsupported",
          { ...ROLLER_GUIDE, pages: [40, 41] },
          { roller_power_configuration: powerConfiguration },
          "The selected Roller power configuration does not have an exact source-backed motor charge mapping.",
        ),
      );
    } else if (
      !canonicalMotorization &&
      expectedMotor &&
      normalizeIdentity(selectedMotor) !== normalizeIdentity(expectedMotor)
    ) {
      issues.push(
        issue(
          "hard_block",
          "roller.motor.price_configuration_mismatch",
          { sourceId: "norman-retail-guide-2026-07", page: 28 },
          {
            roller_power_configuration: powerConfiguration,
            selectedMotor: selectedMotor || null,
            expectedMotor,
          },
          "The priced Roller motor must match the motor required by the validated power configuration.",
        ),
      );
    }
  }

  issues.push(...validateRollerMatrix(context));

  return issues;
}

function validateRoman(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requireText(
    context,
    issues,
    "roman",
    [
      { key: "mount_type", label: "Mount type" },
      { key: "shade_type", label: "Shade type" },
      { key: "lift_system", label: "Control type" },
      { key: "fold_style", label: "Shade style" },
      { key: "fabric_collection", label: "Front fabric collection" },
      { key: "fabric_color_code", label: "Exact front fabric color" },
      { key: "lining", label: "Lining" },
      { key: "fabric_orientation", label: "Fabric orientation" },
      { key: "seaming", label: "Seaming" },
    ],
    { ...ROMAN_GUIDE, pages: [9, 10, 11] },
  );

  const collection = text(configValue(context, "fabric_collection", "roman_fabric_category"));
  const colorCode = text(configValue(context, "fabric_color_code"));
  const fabric = findRomanFrontColor(collection, colorCode);
  if (collection && colorCode && !fabric) {
    issues.push(
      issue(
        "hard_block",
        "roman.front_fabric.unknown_identity",
        { ...ROMAN_GUIDE, pages: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33] },
        { fabric_collection: collection, fabric_color_code: colorCode },
        "The exact front collection and color code is not active in the pinned Roman catalog.",
      ),
    );
  }
  if (fabric && !programMatchesGroup(context.programId, fabric.priceGroup)) {
    issues.push(
      issue(
        "hard_block",
        "roman.program.fabric_mismatch",
        { sourceId: "norman-retail-guide-2026-07", page: 24 },
        {
          fabric_collection: collection,
          fabric_color_code: colorCode,
          selectedProgramId: context.programId,
          expectedPriceGroup: fabric.priceGroup,
        },
        "The selected Roman price program does not match the July price group for this exact fabric/color.",
      ),
    );
  }
  if (colorCode.toUpperCase() === "F1090") {
    issues.push(
      issue(
        "hard_block",
        "roman.fabric.f1090.quarantined",
        { ...ROMAN_GUIDE, page: 26 },
        { fabric_collection: collection, fabric_color_code: colorCode },
        "Caroline F1090 is quarantined because the guide and dealer catalog disagree on style eligibility.",
      ),
    );
  }

  const shadeType = normalized(configValue(context, "shade_type"));
  const lift = normalized(configValue(context, "lift_system"));
  const motorized = lift.includes("motor");

  const isDayNight = shadeType === "day night";
  const isCommonValance = shadeType === "common valance";
  const area = (context.widthInches * context.heightInches) / 144;
  let minWidth = 12;
  let maxWidth = 96;
  let minHeight = 24;
  let maxHeight = motorized ? 102 : 96;
  let maxArea = 52;
  if (lift === "cordless") {
    minWidth = 20;
    maxArea = 40;
  } else if (lift.includes("continuous") || lift.includes("cord loop")) {
    const headrail = normalized(configValue(context, "headrail_size"));
    if (!headrail) {
      issues.push(
        issue(
          "hard_block",
          "roman.continuous_loop.headrail_required",
          { ...ROMAN_GUIDE, pages: [11, 12] },
          { lift_system: text(configValue(context, "lift_system")), headrail_size: null },
          "Continuous Cord Loop requires the exact 1 1/2-inch or 2-inch headrail before its width limit can be validated.",
        ),
      );
    }
    maxWidth = headrail.includes("1.5") || headrail.includes("1 1 2") ? 50 : 96;
    maxArea = context.widthInches <= 50 ? 33 : 64;
  } else if (lift.includes("smartrelease") || lift.includes("smart release")) {
    maxArea = 52;
  }

  if (!motorized) {
    if (context.widthInches < minWidth || context.widthInches > maxWidth) {
      issues.push(
        issue(
          "hard_block",
          "roman.dimension.width",
          { ...ROMAN_GUIDE, pages: [11, 12] },
          { widthInches: context.widthInches, minWidthInches: minWidth, maxWidthInches: maxWidth, lift_system: lift },
          `Roman width must be between ${minWidth} and ${maxWidth} inches for the selected control/headrail configuration.`,
        ),
      );
    }
    if (context.heightInches < minHeight || context.heightInches > maxHeight) {
      issues.push(
        issue(
          "hard_block",
          "roman.dimension.height",
          { ...ROMAN_GUIDE, pages: [11, 12] },
          { heightInches: context.heightInches, minHeightInches: minHeight, maxHeightInches: maxHeight, lift_system: lift },
          `Roman height must be between ${minHeight} and ${maxHeight} inches for the selected control.`,
        ),
      );
    }
    if (area > maxArea) {
      issues.push(
        issue(
          "hard_block",
          "roman.dimension.area",
          { ...ROMAN_GUIDE, pages: [11, 12] },
          { areaSqft: area, maxAreaSqft: maxArea, lift_system: lift },
          `Roman area exceeds the ${maxArea}-square-foot limit for this configuration.`,
        ),
      );
    }
  }

  if (isDayNight) {
    const rearCollection = text(configValue(context, "rear_fabric_collection"));
    const rearCode = text(configValue(context, "rear_fabric_color_code"));
    if (!rearCollection || !rearCode) {
      issues.push(
        issue(
          "hard_block",
          "roman.day_night.rear_exact_color_required",
          { ...ROMAN_GUIDE, pages: [34, 35, 36, 37, 38, 39, 40, 41] },
          { rear_fabric_collection: rearCollection || null, rear_fabric_color_code: rearCode || null },
          "Day & Night requires the exact rear Roller collection and color, not only a fabric family.",
        ),
      );
    } else if (!findRomanRearColor(rearCollection, rearCode)) {
      issues.push(
        issue(
          "hard_block",
          "roman.day_night.rear_color_ineligible",
          { ...ROMAN_GUIDE, pages: [34, 35, 36, 37, 38, 39, 40, 41] },
          { rear_fabric_collection: rearCollection, rear_fabric_color_code: rearCode },
          "The selected rear color is excluded from Roman Day & Night use.",
        ),
      );
    } else {
      const rearMaxWidth = getRomanRearMaxWidth(rearCollection, rearCode);
      if (rearMaxWidth !== null && context.widthInches > rearMaxWidth) {
        issues.push(
          issue(
            "hard_block",
            "roman.day_night.rear_fabric.max_width",
            { ...ROMAN_GUIDE, pages: [34, 35, 36, 37, 38, 39, 40, 41] },
            {
              rear_fabric_collection: rearCollection,
              rear_fabric_color_code: rearCode,
              widthInches: context.widthInches,
              maxWidthInches: rearMaxWidth,
            },
            `The selected rear Roller fabric cannot exceed ${rearMaxWidth} inches wide in a Roman Day & Night shade.`,
          ),
        );
      }
    }
    if (context.heightInches / context.widthInches > 3) {
      issues.push(
        issue(
          "hard_block",
          "roman.day_night.max_ratio",
          { ...ROMAN_GUIDE, page: 12 },
          { widthInches: context.widthInches, heightInches: context.heightInches, maxHeightToWidthRatio: 3 },
          "Roman Day & Night height-to-width ratio cannot exceed 3:1.",
        ),
      );
    }
  }

  const fold = normalized(configValue(context, "fold_style"));
  const orientation = normalized(configValue(context, "fabric_orientation"));
  const seaming = normalized(configValue(context, "seaming"));
  const isRailroaded =
    orientation.includes("railroad") && !orientation.includes("non railroad");
  if (isRailroaded && seaming.includes("vertical")) {
    issues.push(
      issue(
        "hard_block",
        "roman.seaming.orientation_conflict",
        { ...ROMAN_GUIDE, page: 12 },
        { fabric_orientation: orientation, seaming },
        "A railroaded Roman fabric can use no seams or horizontal seams, not vertical seams.",
      ),
    );
  }
  if (!isRailroaded && seaming.includes("horizontal")) {
    issues.push(
      issue(
        "hard_block",
        "roman.seaming.orientation_conflict",
        { ...ROMAN_GUIDE, page: 12 },
        { fabric_orientation: orientation, seaming },
        "A standard non-railroaded Roman fabric can use no seams or vertical seams, not horizontal seams.",
      ),
    );
  }
  if (
    isRailroaded &&
    !fold.includes("batten back") &&
    !fold.includes("soft fold") &&
    colorCode.toUpperCase() !== "F1082" &&
    colorCode.toUpperCase() !== "F1083"
  ) {
    issues.push(
      issue(
        "hard_block",
        "roman.railroad.style_exclusion",
        { ...ROMAN_GUIDE, page: 12 },
        { fabric_orientation: orientation, fold_style: fold, fabric_color_code: colorCode },
        "Railroading is limited to Flat Fold with Batten Back and Soft Fold, except the documented AC0401 Sheer Elegance colors.",
      ),
    );
  }
  if (
    fabric &&
    fold &&
    !fabric.styles.some((style) => normalizeIdentity(style) === fold)
  ) {
    issues.push(
      issue(
        "hard_block",
        "roman.fabric.style_ineligible",
        { ...ROMAN_GUIDE, pages: [7, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33] },
        { fabric_collection: collection, fabric_color_code: colorCode, fold_style: fold },
        "The selected exact front fabric is not offered in this Roman shade style.",
      ),
    );
  }
  if ((isDayNight || isCommonValance) && (fold.includes("edge banded") || fold.includes("ribbon banded"))) {
    issues.push(
      issue(
        "hard_block",
        "roman.banding.configuration_exclusion",
        { ...ROMAN_GUIDE, page: 10 },
        { shade_type: shadeType, fold_style: fold },
        "Edge and Ribbon Banded styles are not offered for Day & Night or Common Valance configurations.",
      ),
    );
  }
  if ((fold.includes("edge banded") || fold.includes("ribbon banded")) && !text(configValue(context, "banding_color"))) {
    issues.push(
      issue(
        "hard_block",
        "roman.banding.color_required",
        { ...ROMAN_GUIDE, page: 10 },
        { fold_style: fold, banding_color: null },
        "Select the documented banding color for a banded Roman style.",
      ),
    );
  }
  const bandingColor = text(configValue(context, "banding_color"));
  const bandingCode = bandingColor.match(/\b([FT]\d{3,5})\b/i)?.[1]?.toUpperCase() ?? "";
  if (fold.includes("edge banded") && bandingColor) {
    const border = findRomanFrontColor(collection, bandingCode);
    if (!bandingCode || !border) {
      issues.push(
        issue(
          "hard_block",
          "roman.edge_banding.color_ineligible",
          { ...ROMAN_GUIDE, page: 9 },
          { fabric_collection: collection, banding_color: bandingColor },
          "The edge-band color must be an exact active color from the same Roman fabric collection.",
        ),
      );
    } else if (bandingCode === colorCode.toUpperCase()) {
      issues.push(
        issue(
          "hard_block",
          "roman.edge_banding.same_as_base",
          { ...ROMAN_GUIDE, page: 9 },
          { fabric_color_code: colorCode, banding_color: bandingColor },
          "Roman base and edge-band colors must be different colors from the same collection.",
        ),
      );
    }
  }
  if (
    fold.includes("ribbon banded") &&
    bandingColor &&
    !["T001", "T002", "T169", "T201", "T402", "T5124"].includes(bandingCode)
  ) {
    issues.push(
      issue(
        "hard_block",
        "roman.ribbon_banding.color_ineligible",
        { ...ROMAN_GUIDE, page: 8 },
        { banding_color: bandingColor },
        "Select one of the six documented Roman ribbon decorative tape colors.",
      ),
    );
  }

  if (fabric) {
    const rawMax = Number.parseFloat(fabric.maxWidth);
    if (Number.isFinite(rawMax) && context.widthInches > rawMax) {
      const acknowledgment = normalized(configValue(context, "fabric_join_acknowledgment"));
      const selectedOrientation = normalized(configValue(context, "fabric_orientation"));
      const selectedIsRailroaded =
        selectedOrientation.includes("railroad") &&
        !selectedOrientation.includes("non railroad");
      const selectedSeaming = normalized(configValue(context, "seaming"));
      const documentedJoinSelected =
        selectedIsRailroaded ||
        selectedSeaming.includes("vertical seam") ||
        selectedSeaming.includes("horizontal seam") ||
        acknowledgment.includes("railroad") ||
        acknowledgment.includes("vertical seam") ||
        acknowledgment.includes("horizontal seam");
      if (fabric.joinable === "N" && fabric.clothCode !== "AB0103") {
        issues.push(
          issue(
            "hard_block",
            "roman.fabric.not_joinable",
            { ...ROMAN_GUIDE, pages: [12, 13] },
            { widthInches: context.widthInches, fabricMaxWidthInches: rawMax, clothCode: fabric.clothCode },
            "This fabric is not joinable and the selected width exceeds its documented fabric width.",
          ),
        );
      } else if (!documentedJoinSelected) {
        issues.push(
          issue(
            "hard_block",
            "roman.fabric.orientation_ack_required",
            { ...ROMAN_GUIDE, pages: [12, 13] },
            { widthInches: context.widthInches, fabricMaxWidthInches: rawMax, fabric_orientation: configValue(context, "fabric_orientation") ?? null },
            "A railroad, seam, or railroad-and-seam acknowledgment is required when the order exceeds the usable fabric width.",
          ),
        );
      }
      if (
        colorCode.toUpperCase() === "F0031" &&
        normalized(configValue(context, "fabric_orientation")).includes("railroad") &&
        !normalized(configValue(context, "fabric_orientation")).includes("non railroad")
      ) {
        const maxRailroadHeight = fold.includes("soft") ? 26 : fold.includes("batten") ? 36 : 45;
        if (context.heightInches > maxRailroadHeight) {
          issues.push(
            issue(
              "hard_block",
              "roman.f0031.railroad.max_height",
              { ...ROMAN_GUIDE, page: 13 },
              { heightInches: context.heightInches, maxHeightInches: maxRailroadHeight, fold_style: fold },
              `Railroaded Lorraine F0031 cannot exceed ${maxRailroadHeight} inches high for this style.`,
            ),
          );
        }
      }
    }
  }

  if (isCommonValance) {
    const panels = configValue(context, "common_valance_panel_widths");
    const gap = finiteNumber(configValue(context, "common_valance_gap"));
    if (!Array.isArray(panels) || panels.length !== 2 || panels.some((value) => finiteNumber(value) === null)) {
      issues.push(
        issue(
          "hard_block",
          "roman.common_valance.two_panel_widths_required",
          { ...ROMAN_GUIDE, page: 13 },
          { common_valance_panel_widths: panels ?? null },
          "Common Valance requires the two actual panel widths; V2 does not infer equal panels from the overall opening.",
        ),
      );
    }
    if (gap === null || gap < 0.125 || gap > 6) {
      issues.push(
        issue(
          "hard_block",
          "roman.common_valance.gap_range",
          { ...ROMAN_GUIDE, page: 13 },
          { common_valance_gap: gap, minGapInches: 0.125, maxGapInches: 6 },
          "Common Valance gap must be between 1/8 inch and 6 inches.",
        ),
      );
    }
    if (Array.isArray(panels) && panels.length === 2 && gap !== null) {
      const widths = panels.map(finiteNumber);
      if (widths.every((value): value is number => value !== null)) {
        const total = widths[0] + widths[1] + gap;
        if (Math.abs(total - context.widthInches) > 0.0625) {
          issues.push(
            issue(
              "hard_block",
              "roman.common_valance.panel_width_reconciliation",
              { ...ROMAN_GUIDE, page: 13 },
              {
                common_valance_panel_widths: widths,
                common_valance_gap: gap,
                totalWidthInches: total,
                orderWidthInches: context.widthInches,
              },
              "The two actual panel widths plus the selected gap must equal the measured Common Valance order width.",
            ),
          );
        }
        if (total > 144) {
          issues.push(
            issue(
              "hard_block",
              "roman.common_valance.max_total_width",
              { ...ROMAN_GUIDE, page: 13 },
              { common_valance_panel_widths: widths, common_valance_gap: gap, totalWidthInches: total, maxWidthInches: 144 },
              "The two Common Valance panels plus their gap cannot exceed 144 inches.",
            ),
          );
        }
      }
    }
  }

  if (yes(configValue(context, "side_by_side"))) {
    if (isDayNight || isCommonValance || fold.includes("without seams") || fold.includes("banded")) {
      issues.push(
        issue(
          "hard_block",
          "roman.side_by_side.configuration_exclusion",
          { ...ROMAN_GUIDE, page: 14 },
          { side_by_side: true, shade_type: shadeType, fold_style: fold },
          "Side-by-side matching is unavailable for this Roman shade type/style.",
        ),
      );
    } else if (!text(configValue(context, "side_by_side_match_line_id"))) {
      issues.push(
        issue(
          "hard_block",
          "roman.side_by_side.match_required",
          { ...ROMAN_GUIDE, page: 14 },
          { side_by_side: true, side_by_side_match_line_id: null },
          "Select the exact line this shade must match for side-by-side production.",
        ),
      );
    }
  }

  issues.push(...validateNormanShadeMotorization(context));
  return issues;
}

function validateHoneycomb(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const application = normalized(configValue(context, "application"));
  const specialtyShapeApplication = application.includes("specialty shape");
  requireText(
    context,
    issues,
    "honeycomb",
    [
      { key: "mount_type", label: "Mount type" },
      { key: "cell_size", label: "Cell size" },
      ...(specialtyShapeApplication
        ? []
        : [{ key: "lift_system", label: "Operating system" }]),
      { key: "fabric_collection", label: "Fabric collection" },
      { key: "fabric_color_code", label: "Exact fabric color" },
      { key: "application", label: "Application" },
    ],
    { ...HONEYCOMB_GUIDE, pages: [15, 16, 17] },
  );

  const colorCode = text(configValue(context, "fabric_color_code"));
  const collection = text(configValue(context, "fabric_collection"));
  const color = findHoneycombColor(collection, colorCode);
  const cellSize = text(configValue(context, "cell_size"));
  const normalizedCell = normalized(cellSize);
  const sourceCell =
    normalizedCell.includes("smartfit") || normalizedCell.includes("decoflex")
      ? normalizeIdentity('3/8" Single Cell')
      : normalizedCell;
  const expectedProgramId = expectedHoneycombProgramId(collection, colorCode, cellSize);
  if (color && expectedProgramId && context.programId !== expectedProgramId) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.program.fabric_cell_mismatch",
        { sourceId: "norman-retail-guide-2026-07", page: 8 },
        {
          fabric_collection: collection,
          fabric_color_code: colorCode,
          cell_size: cellSize,
          selectedProgramId: context.programId,
          expectedProgramId,
        },
        "The selected Honeycomb price program does not match the exact fabric and cell-size price group.",
      ),
    );
  }
  const lift = normalized(configValue(context, "lift_system"));

  if (colorCode && !color) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.fabric.unknown_identity",
        HONEYCOMB_COLORS,
        { fabric_collection: collection, fabric_color_code: colorCode },
        "This Honeycomb collection/color identity is not active in the pinned companion workbook.",
      ),
    );
  }
  if (color && !color.cellSizes.some((size) => normalizeIdentity(size) === sourceCell)) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.fabric.cell_ineligible",
        HONEYCOMB_COLORS,
        { fabric_color_code: colorCode, cell_size: cellSize, fabric_family: color.family },
        "The selected exact color is not offered in this cell size.",
      ),
    );
  }
  if (
    normalizeIdentity(color?.family) === "whispers" ||
    normalizeIdentity(text(configValue(context, "fabric_collection"))) === "whispers"
  ) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.fabric.whispers.unavailable",
        HONEYCOMB_COLORS,
        { fabric_color_code: colorCode, fabric_family: color?.family ?? "Whispers" },
        "Whispers is unavailable because it appears only as stale workbook residue.",
      ),
    );
  }
  const exactApplicationRows = application.includes("patio door vertical")
    ? normanHoneycombV2Source.verticalColors
    : application.includes("motorized skylight")
      ? normanHoneycombV2Source.motorizedSkylightColors
      : null;
  if (
    color &&
    exactApplicationRows &&
    !exactApplicationRows.some(
      (row) =>
        normalizeIdentity(row.family) === normalizeIdentity(color.family) &&
        (normalizeIdentity(row.customerColorCode) === normalizeIdentity(color.customerColorCode) ||
          normalizeIdentity(row.factoryColorCode) === normalizeIdentity(color.factoryColorCode)),
    )
  ) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.fabric.application_ineligible",
        HONEYCOMB_COLORS,
        {
          application: text(configValue(context, "application")),
          fabric_collection: collection,
          fabric_color_code: colorCode,
        },
        "The selected exact Honeycomb fabric/color is not eligible for this application.",
      ),
    );
  }
  const dayNight = lift.includes("day night") || application.includes("day night");
  if (normalizeIdentity(color?.family) === "sheer" && !dayNight) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.sheer.day_night_only",
        HONEYCOMB_COLORS,
        { fabric_collection: collection, fabric_color_code: colorCode, application },
        "The pinned catalog offers these Sheer Honeycomb fabrics only as the sheer layer of a Day & Night configuration.",
      ),
    );
  }

  if (dayNight) {
    const rearCollection = text(configValue(context, "rear_fabric_collection"));
    const rearCode = text(configValue(context, "rear_fabric_color_code"));
    const rearCell = text(configValue(context, "rear_cell_size"));
    const rearColor = findHoneycombColor(rearCollection, rearCode);
    if (!rearCollection || !rearCode || !rearCell) {
      issues.push(
        issue(
          "hard_block",
          "honeycomb.day_night.rear_exact_selection_required",
          HONEYCOMB_COLORS,
          { rear_fabric_collection: rearCollection || null, rear_fabric_color_code: rearCode || null, rear_cell_size: rearCell || null },
          "Day & Night requires the exact rear fabric color and cell size.",
        ),
      );
    } else if (!rearColor || !rearColor.cellSizes.some((size) => normalizeIdentity(size) === normalizeIdentity(rearCell))) {
      issues.push(
        issue(
          "hard_block",
          "honeycomb.day_night.invalid_pair",
          HONEYCOMB_COLORS,
          { front_fabric_color_code: colorCode, rear_fabric_color_code: rearCode, rear_cell_size: rearCell },
          "The selected front/rear Day & Night fabric-color pair is not documented as compatible.",
        ),
      );
    }
  }
  issues.push(...validateNormanShadeMotorization(context));
  return issues;
}

function validateSynchronyVertical(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requireText(
    context,
    issues,
    "vertical",
    [
      { key: "mount_type", label: "Mount type" },
      { key: "fabric_collection", label: "Vane collection" },
      { key: "fabric_color_name", label: "Exact vane color" },
      { key: "stack_option", label: "Stack direction" },
      { key: "draw_direction", label: "Draw/wand direction" },
    ],
    { ...VERTICAL_GUIDE, pages: [6, 7, 9] },
  );
  if (context.widthInches < 18 || context.widthInches > 100) {
    issues.push(
      issue(
        "hard_block",
        "vertical.dimension.width",
        { ...VERTICAL_GUIDE, page: 6 },
        { widthInches: context.widthInches, minWidthInches: 18, maxWidthInches: 100 },
        "Synchrony Vertical width must be from 18 through 100 inches.",
      ),
    );
  }
  if (context.heightInches < 36 || context.heightInches > 108) {
    issues.push(
      issue(
        "hard_block",
        "vertical.dimension.height",
        { ...VERTICAL_GUIDE, page: 6 },
        { heightInches: context.heightInches, minHeightInches: 36, maxHeightInches: 108 },
        "Synchrony Vertical height must be from 36 through 108 inches.",
      ),
    );
  }
  const collection = text(configValue(context, "fabric_collection", "fabric_group"));
  const colorName = text(configValue(context, "fabric_color_name", "vertical_color"));
  const verticalColor = findSynchronyVerticalColor(collection, colorName);
  if (collection && colorName && !verticalColor) {
    issues.push(
      issue(
        "hard_block",
        "vertical.color.inactive_or_unknown",
        { ...VERTICAL_GUIDE, page: 9 },
        { fabric_collection: collection, fabric_color_name: colorName },
        "The selected collection/color identity is not one of the 46 active Synchrony Vertical colors.",
      ),
    );
  }
  if (verticalColor && !programMatchesGroup(context.programId, verticalColor.priceGroup ?? "")) {
    issues.push(
      issue(
        "hard_block",
        "vertical.program.color_mismatch",
        { sourceId: "norman-retail-guide-2026-07", page: 33 },
        {
          fabric_collection: collection,
          fabric_color_name: colorName,
          selectedProgramId: context.programId,
          expectedPriceGroup: verticalColor.priceGroup,
        },
        "The selected Synchrony price program does not match the exact collection/color price group.",
      ),
    );
  }

  const mount = normalized(configValue(context, "mount_type"));
  if (mount.includes("inside")) {
    const mountDepth = finiteNumber(configValue(context, "mount_depth_inches"));
    if (mountDepth === null || mountDepth < 2.8125) {
      issues.push(
        issue(
          "hard_block",
          "vertical.inside_mount.minimum_depth",
          { ...VERTICAL_GUIDE, page: 11 },
          { mount_depth_inches: mountDepth, minimumDepthInches: 2.8125 },
          "Synchrony inside mount requires at least 2 13/16 inches of mounting depth.",
        ),
      );
    } else {
      issues.push(
        issue(
          "auto_derive",
          "vertical.inside_mount.depth_class",
          { ...VERTICAL_GUIDE, page: 11 },
          { mount_depth_inches: mountDepth },
          mountDepth >= 3.75
            ? "The supplied depth supports a fully flushed inside mount."
            : "The supplied depth supports a semi-inside mount but not a fully flushed mount.",
          { insideMountClass: mountDepth >= 3.75 ? "fully_flushed" : "semi_inside" },
        ),
      );
    }
    issues.push(
      issue(
        "auto_derive",
        "vertical.inside_mount.deductions",
        { ...VERTICAL_GUIDE, page: 6 },
        { mount_type: text(configValue(context, "mount_type")), orderWidthInches: context.widthInches, orderHeightInches: context.heightInches },
        "Inside-mount finished dimensions use the exact published 3/8-inch width and 3/16-inch height deductions.",
        {
          finishedWidthInches: context.widthInches - 0.375,
          finishedHeightInches: context.heightInches - 0.1875,
        },
      ),
    );
  } else if (mount.includes("outside")) {
    issues.push(
      issue(
        "warning",
        "vertical.outside_mount.coverage_recommendation",
        { ...VERTICAL_GUIDE, page: 6 },
        { mount_type: text(configValue(context, "mount_type")) },
        "Norman recommends adding 1 1/2 inches on all four sides for outside-mount light-leakage coverage; this is a recommendation, not an order block.",
      ),
    );
  }

  const wandDrop = context.heightInches <= 84 ? 34 : context.heightInches <= 96 ? 49 : 61;
  issues.push(
    issue(
      "auto_derive",
      "vertical.wand_drop",
      { ...VERTICAL_GUIDE, page: 6 },
      { heightInches: context.heightInches },
      `The published standard wand drop for this height is ${wandDrop} inches.`,
      { wandDropInches: wandDrop },
    ),
  );
  const bracketCount = context.widthInches <= 48 ? 2 : context.widthInches <= 78 ? 3 : 4;
  issues.push(
    issue(
      "auto_derive",
      "vertical.bracket_count",
      { ...VERTICAL_GUIDE, page: 12 },
      { widthInches: context.widthInches },
      `The published bracket count for this width is ${bracketCount}.`,
      { bracketCount, centerSupportRequired: context.widthInches >= 78 },
    ),
  );

  if (yes(configValue(context, "side_by_side"))) {
    const orientation = normalized(
      configValue(context, "side_by_side_wand_orientation", "draw_direction"),
    );
    const stack = normalized(configValue(context, "stack_option"));
    if (!orientation) {
      issues.push(
        issue(
          "hard_block",
          "vertical.side_by_side.wand_orientation_required",
          { ...VERTICAL_GUIDE, page: 7 },
          { side_by_side: true, side_by_side_wand_orientation: null },
          "Side-by-side Vertical blinds must record the same exact wand orientation for both blinds.",
        ),
      );
    }
    if (stack.includes("center") || stack.includes("split")) {
      issues.push(
        issue(
          "hard_block",
          "vertical.side_by_side.center_opening_prohibited",
          { ...VERTICAL_GUIDE, page: 7 },
          { side_by_side: true, stack_option: text(configValue(context, "stack_option")) },
          "Do not butt a left-stack and right-stack blind to create a center opening; order separate same-orientation blinds.",
        ),
      );
    }
  }
  if (mount.includes("inside") && yes(configValue(context, "shims"))) {
    issues.push(
      issue(
        "hard_block",
        "vertical.shims.outside_mount_only",
        { ...VERTICAL_GUIDE, page: 12 },
        { mount_type: text(configValue(context, "mount_type")), shims: true },
        "Synchrony shims are available for outside mount only.",
      ),
    );
  }
  return issues;
}

export function productRuleStatusForSelection(context: SelectionContext): ProductRuleStatus {
  if (context.productId === "vertical_honeycomb") return "manual_quote_required";
  // The pinned May 2026 Motorization Guide now supplies exact motor-family,
  // power, control, accessory, and size rules. Unsupported or incomplete
  // configurations remain fail-closed through structured hard blocks rather
  // than downgrading every motorized selection to a blanket product status.
  if (
    context.productId === "honeycomb" &&
    normalizeIdentity(text(configValue(context, "fabric_collection"))) === "whispers"
  ) {
    return "unavailable";
  }
  // A price book entry is not restriction evidence. Any newly added product
  // stays blocked until it receives an explicit V2 catalog status and rules.
  return QUOTE_V2_PRODUCT_STATUS[context.productId] ?? "restriction_source_incomplete";
}

export function validateSelection(context: SelectionContext): readonly ValidationIssue[] {
  const issues = validateCommon(context);
  switch (context.productId) {
    case "roller":
      issues.push(...validateRoller(context));
      break;
    case "roman":
      issues.push(...validateRoman(context));
      break;
    case "honeycomb":
      issues.push(...validateHoneycomb(context));
      issues.push(...validateHoneycombMatrix(context));
      break;
    case "vertical_honeycomb":
      issues.push(...validateHoneycomb(context));
      issues.push(...validateHoneycombMatrix(context));
      break;
    case "synchrony_vertical":
      issues.push(...validateSynchronyVertical(context));
      break;
    case "onyx_shutters":
      issues.push(...validateOnyxShutterRestrictions(context));
      break;
    case "polar_elite_patio":
      issues.push(...validatePolarElitePortalConflict(context));
      break;
    default:
      break;
  }
  return issues;
}

export const quoteV2RuleTestHelpers = {
  configValue,
  optionValue,
  values,
};
