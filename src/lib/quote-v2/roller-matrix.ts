import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { normalizeIdentity } from "./catalog";
import { sourceProvenance } from "./source-manifest";
import {
  normanRollerV2Source,
  type NormanRollerV2LimitProfile,
  type NormanRollerV2Offering,
  type NormanRollerV2ProfileAssignment,
  type NormanRollerV2ProfileDefinition,
} from "./generated/norman-roller-v2.generated";
import { rollerUiSheetForSelection } from "./roller-ui-facets";

export type RollerMatrixResolution =
  | {
      ok: true;
      offering: NormanRollerV2Offering;
      definition: NormanRollerV2ProfileDefinition;
      assignment: NormanRollerV2ProfileAssignment;
      profile: NormanRollerV2LimitProfile;
      sheet: string;
      orientationDerived: boolean;
    }
  | {
      ok: false;
      code:
        | "OFFERING_NOT_FOUND"
        | "OFFERING_AMBIGUOUS"
        | "REGION_SCOPE_REQUIRED"
        | "REGION_SCOPE_UNKNOWN"
        | "SHEET_NOT_RESOLVED"
        | "LIMIT_ROW_NOT_FOUND"
        | "PROFILE_NOT_FOUND"
        | "PROFILE_AMBIGUOUS"
        | "SOURCE_PROFILE_UNUSABLE";
      message: string;
      sheet?: string;
      sourceRange?: string;
      candidates?: readonly string[];
    };

export const ROLLER_REGION_SCOPES = ["ca_ma", "other_regions"] as const;
export type RollerRegionScope = (typeof ROLLER_REGION_SCOPES)[number];

export type RollerOfferingResolution =
  | {
      ok: true;
      offering: NormanRollerV2Offering;
      regionScope: RollerRegionScope | "all_regions";
      regionScopeRequired: boolean;
    }
  | {
      ok: false;
      code:
        | "OFFERING_NOT_FOUND"
        | "OFFERING_AMBIGUOUS"
        | "REGION_SCOPE_REQUIRED"
        | "REGION_SCOPE_UNKNOWN";
      message: string;
      sheet?: string;
      sourceRange?: string;
      candidates?: readonly string[];
    };

const definitionById = new Map(
  normanRollerV2Source.profileDefinitions.map((definition) => [definition.id, definition]),
);
const profileById = new Map(
  normanRollerV2Source.limitProfiles.map((profile) => [profile.id, profile]),
);

function compact(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
}

function stringConfig(context: SelectionContext, ...keys: string[]): string {
  for (const key of keys) {
    const value = context.configuration[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberConfig(context: SelectionContext, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = context.configuration[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function componentOrderWidths(context: SelectionContext): number[] {
  const direct =
    context.configuration.roller_component_order_widths ??
    context.configuration.roller_component_widths;
  if (Array.isArray(direct)) {
    return direct.flatMap((value) => {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) return [value];
      if (typeof value === "string" && Number.isFinite(Number(value)) && Number(value) > 0) return [Number(value)];
      return [];
    });
  }
  return [1, 2, 3, 4].flatMap((index) => {
    const value = numberConfig(
      context,
      `roller_component_${index}_width`,
      `roller_component_width_${index}`,
    );
    return value && value > 0 ? [value] : [];
  });
}

const ROLLER_COMPONENT_COUNT_BY_SHEET: Readonly<Record<string, number>> = {
  "LG360 with T-Post (2 ) (Std)": 2,
  "LG360 with T-Post (2 ) (Ind)": 2,
  "LG360 with T-Post (3 Shades)": 3,
  "LG360 with T-Post (4 Shades)": 4,
  "Standard Coupled Shade(2)": 2,
  "Independently Coupled Shade(2)": 2,
  "Coupled Shades(3)": 3,
  "Coupled Shades(4)": 4,
};

export function rollerComponentOrderWidthsForPricing(
  context: SelectionContext,
): number[] | null {
  const sheet = rollerSheetForSelection(context);
  const expectedCount = sheet ? ROLLER_COMPONENT_COUNT_BY_SHEET[sheet] : undefined;
  if (expectedCount === undefined) return null;
  const widths = componentOrderWidths(context);
  return widths.length === expectedCount ? widths : null;
}

export function rollerSheetForSelection(context: SelectionContext): string | null {
  const count = numberConfig(
    context,
    "roller_coupling_count",
    "coupled_shade_count",
    "lightguard_360_shade_count",
  );
  return rollerUiSheetForSelection({
    application: stringConfig(context, "roller_application", "shade_type"),
    couplingArrangement: stringConfig(context, "coupling_arrangement"),
    componentCount: count,
    topTreatment: stringConfig(
      context,
      "roller_top_treatment",
      "top_treatment_class",
    ),
  });
}

function targetOperatingSystem(context: SelectionContext): string {
  const lift = compact(stringConfig(context, "lift_system"));
  if (lift.includes("smartrelease")) return "smartrelease";
  if (lift.includes("continuouscordloop") || lift === "cordloop") return "cordloop";
  if (lift.includes("cordless")) return "cordless";
  if (lift.includes("autowand")) return "autowand";
  if (lift.includes("motor")) {
    return compact(stringConfig(context, "roller_power_configuration", "power_configuration", "motor_type"));
  }
  return lift;
}

function definitionMatchesTopTreatment(
  definition: NormanRollerV2ProfileDefinition,
  topTreatment: string,
): boolean {
  if (!topTreatment) return false;
  // Specialized appendix sheets (Cassette and LightGuard 360 variants) encode
  // the top treatment in the sheet identity instead of repeating it per column.
  if (!definition.application) return true;
  const application = compact(definition.application);
  const aliases: Record<string, string[]> = {
    notoptreatment: ["notoptreatment"],
    squarefascia: ["squarefascia"],
    curvedfascia: ["curvedfascia"],
    fabricvalance: ["fabricvalance"],
    woodvalance: ["woodvalance"],
    cassette: ["cassette"],
    lightguard360housing: ["lightguard360", "housing"],
  };
  const required = aliases[compact(topTreatment)] ?? [compact(topTreatment)];
  return required.every((token) => application.includes(token));
}

function definitionMatchesTube(
  definition: NormanRollerV2ProfileDefinition,
  selectedTube: string,
): boolean {
  const wanted = compact(selectedTube);
  const actual = compact(definition.tube);
  if (wanted === "alltubes") return !actual || actual === "alltubes";
  if (!wanted) return !actual;
  return wanted === actual;
}

export function normalizeRollerRegionScope(
  value: unknown,
): RollerRegionScope | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = normalizeIdentity(value);
  if (
    normalized === "ca ma" ||
    normalized === "ca ma states only" ||
    normalized === "for ca ma states only" ||
    normalized === "california massachusetts" ||
    normalized === "california and massachusetts"
  ) {
    return "ca_ma";
  }
  if (
    normalized === "other regions" ||
    normalized === "all other regions" ||
    normalized === "for all other regions"
  ) {
    return "other_regions";
  }
  return null;
}

/**
 * Resolve the exact regional fabric-code row from the appendix.
 *
 * Shipping zones are intentionally not accepted here. `continental_us` does
 * not distinguish CA/MA from the other states and therefore cannot safely
 * select one of the source's two region-specific fabric codes.
 */
export function resolveRollerOffering(
  context: SelectionContext,
): RollerOfferingResolution {
  const collection = normalizeIdentity(stringConfig(context, "fabric_collection"));
  const colorCode = compact(stringConfig(context, "fabric_color_code"));
  const matches = normanRollerV2Source.offerings.filter(
    (offering) =>
      normalizeIdentity(offering.collection) === collection && compact(offering.colorCode) === colorCode,
  );
  if (matches.length === 0) {
    return {
      ok: false,
      code: "OFFERING_NOT_FOUND",
      message: "The exact Roller collection/color offering is absent from the effective appendix.",
    };
  }

  const sourceRange = matches.map((offering) => offering.sourceRef.range).join(",");
  const allRegionMatches = matches.filter((offering) => offering.regionScope === "all_regions");
  if (allRegionMatches.length === 1 && matches.length === 1) {
    return {
      ok: true,
      offering: allRegionMatches[0],
      regionScope: "all_regions",
      regionScopeRequired: false,
    };
  }
  if (allRegionMatches.length > 0) {
    return {
      ok: false,
      code: "OFFERING_AMBIGUOUS",
      sheet: "Fabric Code List",
      sourceRange,
      candidates: matches.map((offering) => offering.id),
      message: "The Roller fabric has conflicting all-region and region-specific source rows; it is quarantined rather than guessed.",
    };
  }

  const rawRegionScope = context.configuration.roller_region_scope;
  if (typeof rawRegionScope !== "string" || !rawRegionScope.trim()) {
    return {
      ok: false,
      code: "REGION_SCOPE_REQUIRED",
      sheet: "Fabric Code List",
      sourceRange,
      candidates: matches.map((offering) => offering.id),
      message: "This Roller color has separate CA/MA and other-region fabric codes. Select the explicit Roller region scope before pricing.",
    };
  }
  const regionScope = normalizeRollerRegionScope(rawRegionScope);
  if (!regionScope) {
    return {
      ok: false,
      code: "REGION_SCOPE_UNKNOWN",
      sheet: "Fabric Code List",
      sourceRange,
      candidates: matches.map((offering) => offering.id),
      message: `Roller region scope ${JSON.stringify(rawRegionScope)} is not supported. Use ca_ma or other_regions; shipping zones are not substitutes.`,
    };
  }
  const scopedMatches = matches.filter((offering) => offering.regionScope === regionScope);
  if (scopedMatches.length !== 1) {
    return {
      ok: false,
      code: scopedMatches.length === 0 ? "OFFERING_NOT_FOUND" : "OFFERING_AMBIGUOUS",
      sheet: "Fabric Code List",
      sourceRange,
      candidates: scopedMatches.map((offering) => offering.id),
      message: scopedMatches.length === 0
        ? `The exact Roller collection/color offering is not documented for region scope ${regionScope}.`
        : `More than one Roller offering matches region scope ${regionScope}; it is quarantined rather than guessed.`,
    };
  }
  return {
    ok: true,
    offering: scopedMatches[0],
    regionScope,
    regionScopeRequired: true,
  };
}

export function resolveRollerMatrixProfile(context: SelectionContext): RollerMatrixResolution {
  const offeringResolution = resolveRollerOffering(context);
  if (!offeringResolution.ok) {
    return offeringResolution;
  }
  const offering = offeringResolution.offering;
  const sheet = rollerSheetForSelection(context);
  if (!sheet) {
    return {
      ok: false,
      code: "SHEET_NOT_RESOLVED",
      message: "The Roller application, coupling arrangement, and physical shade count do not resolve to one source matrix.",
    };
  }
  const rows = normanRollerV2Source.limitRows.filter(
    (row) => row.sheet === sheet && row.fabricCodes.includes(offering.fabricCode),
  );
  if (rows.length === 0) {
    return {
      ok: false,
      code: "LIMIT_ROW_NOT_FOUND",
      sheet,
      message: `Fabric code ${offering.fabricCode} has no active restriction row on ${sheet}.`,
    };
  }

  const operatingSystem = targetOperatingSystem(context);
  const selectedTopTreatment = stringConfig(
    context,
    "roller_top_treatment",
    "top_treatment_class",
  );
  const selectedTube = stringConfig(context, "roller_tube", "tube_class");
  const selectedOrientation = stringConfig(context, "fabric_orientation");
  const orientation = selectedOrientation ? compact(selectedOrientation) : "normalfabricorientation";
  const definitions = normanRollerV2Source.profileDefinitions.filter(
    (definition) =>
      definition.sheet === sheet &&
      compact(definition.operatingSystem) === operatingSystem &&
      (!definition.orientation || compact(definition.orientation) === orientation) &&
      definitionMatchesTopTreatment(definition, selectedTopTreatment) &&
      definitionMatchesTube(definition, selectedTube),
  );
  const usable = definitions.filter((definition) => definition.usable);
  if (usable.length === 0) {
    const unusable = definitions.find((definition) => !definition.usable);
    return {
      ok: false,
      code: unusable ? "SOURCE_PROFILE_UNUSABLE" : "PROFILE_NOT_FOUND",
      sheet,
      sourceRange: unusable?.sourceColumnLettersByMetric
        ? Object.values(unusable.sourceColumnLettersByMetric).join(",")
        : undefined,
      candidates: definitions.map((definition) => definition.id),
      message: unusable
        ? `The exact source profile ${unusable.id} is unusable because required metrics or units are missing/invalid.`
        : "No exact Roller matrix profile matches the selected operating system, orientation, top treatment, and tube.",
    };
  }

  const rowIds = new Set(rows.map((row) => row.id));
  const definitionIds = new Set(usable.map((definition) => definition.id));
  const assignments = normanRollerV2Source.profileAssignments.filter(
    (assignment) =>
      rowIds.has(assignment.limitRowId) &&
      definitionIds.has(assignment.profileDefinitionId),
  );
  if (assignments.length !== 1) {
    return {
      ok: false,
      code: assignments.length > 1 ? "PROFILE_AMBIGUOUS" : "PROFILE_NOT_FOUND",
      sheet,
      candidates: assignments.map((assignment) => assignment.profileId),
      message:
        assignments.length > 1
          ? "More than one exact Roller profile matches this selection; the configuration is quarantined rather than guessed."
          : "The matching Roller fabric row has no usable normalized profile assignment.",
    };
  }
  const assignment = assignments[0];
  const definition = definitionById.get(assignment.profileDefinitionId);
  const profile = profileById.get(assignment.profileId);
  if (!definition || !profile) {
    return {
      ok: false,
      code: "PROFILE_NOT_FOUND",
      sheet,
      message: "The normalized Roller assignment is internally incomplete.",
    };
  }
  return {
    ok: true,
    offering,
    definition,
    assignment,
    profile,
    sheet,
    orientationDerived: !selectedOrientation,
  };
}

function selectedValues(context: SelectionContext): SelectionRecord {
  return {
    widthInches: context.widthInches,
    heightInches: context.heightInches,
    roller_application: context.configuration.roller_application ?? null,
    coupling_arrangement: context.configuration.coupling_arrangement ?? null,
    roller_region_scope: context.configuration.roller_region_scope ?? null,
    roller_component_order_widths:
      context.configuration.roller_component_order_widths ??
      context.configuration.roller_component_widths ??
      null,
    lift_system: context.configuration.lift_system ?? null,
    top_treatment_class:
      context.configuration.roller_top_treatment ??
      context.configuration.top_treatment_class ??
      null,
    tube_class: context.configuration.roller_tube ?? context.configuration.tube_class ?? null,
    fabric_collection: context.configuration.fabric_collection ?? null,
    fabric_color_code: context.configuration.fabric_color_code ?? null,
  };
}

export function validateRollerMatrix(context: SelectionContext): readonly ValidationIssue[] {
  const resolved = resolveRollerMatrixProfile(context);
  if (!resolved.ok) {
    return [
      {
        severity: "hard_block",
        ruleId: `roller.matrix.${resolved.code.toLowerCase()}`,
        source: sourceProvenance("norman-roller-minmax-appendix-2026-08", {
          ...(resolved.sheet ? { sheet: resolved.sheet } : { sheet: "Revision Log" }),
          ...(resolved.sourceRange ? { range: resolved.sourceRange } : {}),
        }),
        selectedValues: selectedValues(context),
        explanation: resolved.message,
      },
    ];
  }

  const issues: ValidationIssue[] = [];
  const source = sourceProvenance("norman-roller-minmax-appendix-2026-08", {
    sheet: resolved.sheet,
    range: Object.values(resolved.assignment.sourceCells).join(","),
  });
  if (resolved.orientationDerived) {
    issues.push({
      severity: "auto_derive",
      ruleId: "roller.matrix.orientation.normal_derived",
      source,
      selectedValues: { fabric_orientation: null },
      explanation: "Normal fabric orientation is derived because no railroaded orientation was selected.",
      derivedValues: { fabric_orientation: "NORMAL FABRIC ORIENTATION" },
    });
  }
  const limits = resolved.profile.limits;
  const checks: Array<[string, number | undefined, boolean, string]> = [
    ["minWidth", limits.minWidth, context.widthInches < (limits.minWidth ?? Number.NEGATIVE_INFINITY), "width"],
    ["maxWidth", limits.maxWidth, context.widthInches > (limits.maxWidth ?? Number.POSITIVE_INFINITY), "width"],
    ["minHeight", limits.minHeight, context.heightInches < (limits.minHeight ?? Number.NEGATIVE_INFINITY), "height"],
    ["maxHeight", limits.maxHeight, context.heightInches > (limits.maxHeight ?? Number.POSITIVE_INFINITY), "height"],
  ];
  for (const [metric, limit, failed, dimension] of checks) {
    if (limit === undefined || !failed) continue;
    issues.push({
      severity: "hard_block",
      ruleId: `roller.matrix.${metric}`,
      source,
      selectedValues: {
        [`${dimension}Inches`]: dimension === "width" ? context.widthInches : context.heightInches,
        [metric]: limit,
        profileId: resolved.profile.id,
      },
      explanation: `Roller ${dimension} violates the exact ${metric} value (${limit}) for source profile ${resolved.profile.id}.`,
    });
  }

  const totalArea = (context.widthInches * context.heightInches) / 144;
  for (const metric of ["maxAreaSqft", "totalMaxAreaTwoShadesSqft"]) {
    const max = limits[metric];
    if (max === undefined || totalArea <= max) continue;
    issues.push({
      severity: "hard_block",
      ruleId: `roller.matrix.${metric}`,
      source,
      selectedValues: { areaSqft: totalArea, [metric]: max, profileId: resolved.profile.id },
      explanation: `Roller area ${totalArea.toFixed(3)} sq ft exceeds the exact ${max} sq ft ${metric} limit.`,
    });
  }

  const expectedComponentCount = ROLLER_COMPONENT_COUNT_BY_SHEET[resolved.sheet] ?? null;
  const widths = componentOrderWidths(context);
  const componentSource = sourceProvenance("norman-roller-guide-2026-07", {
    pages: [45, 46],
  });
  const componentsComplete =
    expectedComponentCount !== null && widths.length === expectedComponentCount;
  if (expectedComponentCount !== null && !componentsComplete) {
    issues.push({
      severity: "hard_block",
      ruleId: "roller.matrix.component_widths_required",
      source: componentSource,
      selectedValues: {
        expectedComponentCount,
        roller_component_order_widths: widths,
      },
      explanation: "The component order width for every coupled/T-post shade is required to reconcile the overall order width and verify component-area limits.",
    });
  }
  if (componentsComplete) {
    const componentWidthTotal = widths.reduce((sum, width) => sum + width, 0);
    if (Math.abs(componentWidthTotal - context.widthInches) > 0.000_001) {
      issues.push({
        severity: "hard_block",
        ruleId: "roller.matrix.component_width_total_mismatch",
        source: componentSource,
        selectedValues: {
          overallOrderWidthInches: context.widthInches,
          roller_component_order_widths: widths,
          componentOrderWidthTotalInches: componentWidthTotal,
        },
        explanation: `The component order widths total ${componentWidthTotal} inches, but the coupled/T-post overall order width is ${context.widthInches} inches.`,
      });
    }
  }

  const addComponentAreaIssue = (
    metric: string,
    actualArea: number,
    maxArea: number,
    selected: SelectionRecord,
    explanation: string,
  ) => {
    if (actualArea <= maxArea) return;
    issues.push({
      severity: "hard_block",
      ruleId: `roller.matrix.${metric}`,
      source,
      selectedValues: {
        ...selected,
        heightInches: context.heightInches,
        areaSqft: actualArea,
        [metric]: maxArea,
        profileId: resolved.profile.id,
      },
      explanation,
    });
  };

  if (componentsComplete) {
    const eachMax = limits.maxAreaEachShadeSqft;
    if (eachMax !== undefined) {
      widths.forEach((width, index) => {
        const area = (width * context.heightInches) / 144;
        addComponentAreaIssue(
          "maxAreaEachShadeSqft",
          area,
          eachMax,
          { component: index + 1, componentOrderWidthInches: width },
          `Roller component ${index + 1} exceeds the ${eachMax}-square-foot per-shade limit.`,
        );
      });
    }

    const groupingValue = normalizeIdentity(
      stringConfig(context, "roller_coupled_grouping"),
    );
    const coupledLeft =
      groupingValue === "coupled left single right" ||
      groupingValue === "coupled shades l single shade r";
    const coupledRight =
      groupingValue === "single left coupled right" ||
      groupingValue === "single shade l coupled shades r";
    const needsThreeShadeGrouping =
      expectedComponentCount === 3 &&
      (limits.totalMaxAreaCoupledPairSqft !== undefined ||
        limits.maxAreaSingleShadeSqft !== undefined);
    if (needsThreeShadeGrouping && !coupledLeft && !coupledRight) {
      issues.push({
        severity: "hard_block",
        ruleId: "roller.matrix.coupled_grouping_required",
        source: sourceProvenance("norman-roller-guide-2026-07", {
          pages: [25, 32],
        }),
        selectedValues: {
          roller_coupled_grouping:
            context.configuration.roller_coupled_grouping ?? null,
          roller_component_order_widths: widths,
        },
        explanation: "Select whether the coupled pair is on the left or right so the pair and single-shade area limits can be evaluated independently.",
      });
    } else if (needsThreeShadeGrouping) {
      const pairIndexes = coupledLeft ? [0, 1] : [1, 2];
      const singleIndex = coupledLeft ? 2 : 0;
      const pairArea =
        ((widths[pairIndexes[0]] + widths[pairIndexes[1]]) * context.heightInches) /
        144;
      const pairMax = limits.totalMaxAreaCoupledPairSqft;
      if (pairMax !== undefined) {
        addComponentAreaIssue(
          "totalMaxAreaCoupledPairSqft",
          pairArea,
          pairMax,
          {
            coupledPairComponents: pairIndexes.map((index) => index + 1),
            coupledPairOrderWidths: pairIndexes.map((index) => widths[index]),
          },
          `The two-shade coupled pair exceeds the ${pairMax}-square-foot pair limit.`,
        );
      }
      const singleMax = limits.maxAreaSingleShadeSqft;
      if (singleMax !== undefined) {
        const singleArea = (widths[singleIndex] * context.heightInches) / 144;
        addComponentAreaIssue(
          "maxAreaSingleShadeSqft",
          singleArea,
          singleMax,
          {
            singleComponent: singleIndex + 1,
            singleComponentOrderWidth: widths[singleIndex],
          },
          `The single shade in the three-shade assembly exceeds the ${singleMax}-square-foot limit.`,
        );
      }
    }

    const pairMax = limits.totalMaxAreaOneCoupledPairSqft;
    if (pairMax !== undefined && expectedComponentCount === 4) {
      [[0, 1], [2, 3]].forEach((pairIndexes, pairIndex) => {
        const pairArea =
          ((widths[pairIndexes[0]] + widths[pairIndexes[1]]) * context.heightInches) /
          144;
        addComponentAreaIssue(
          "totalMaxAreaOneCoupledPairSqft",
          pairArea,
          pairMax,
          {
            coupledPair: pairIndex + 1,
            coupledPairComponents: pairIndexes.map((index) => index + 1),
            coupledPairOrderWidths: pairIndexes.map((index) => widths[index]),
          },
          `Coupled pair ${pairIndex + 1} exceeds the ${pairMax}-square-foot per-pair limit.`,
        );
      });
    }
  }
  return issues;
}
