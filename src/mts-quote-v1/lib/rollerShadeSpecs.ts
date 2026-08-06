export type RollerShadeSpecWarning = {
  id: string;
  message: string;
};

export type RollerShadeSpecInput = {
  productType: string | null | undefined;
  widthInches: number;
  heightInches: number;
  fabricCollection?: string | null;
  fabricColorCode?: string | null;
  shadeType?: string | null;
  liftSystem?: string | null;
};

const FABRIC_WIDTH_DEDUCTION_INCHES = 1;
const DEFAULT_MAX_FABRIC_WIDTH = 118;
const MAUI_MAX_FABRIC_HEIGHT = 120;

const COLLECTION_MAX_WIDTH: Record<string, number> = {
  aruba: 96,
  bali: 78,
  "bora bora": 96,
  caroline: 96,
  catalina: 96,
  chelsea: 110,
  cove: 110,
  dazzle: 110,
  java: 78,
  "lake tahoe": 96,
  maui: 94.5,
  phuket: 96,
  riviera: 94.5,
  samoa: 96,
  shimmer: 110,
  sierra: 110,
  sumatra: 96,
  valerie: 106,
};

const COLOR_MAX_WIDTH: Record<string, number> = {
  "bali:f0668": 78,
  "bali:f1668": 78,
  "bali:f1669": 78,
  "bali:f1926": 94.5,
  "bali:f1927": 94.5,
  "bali:f2023": 94.5,
  "bali:f2024": 94.5,
  "bali:f2025": 94.5,
  "bali:f2026": 94.5,
  "bali:f2027": 94.5,
  "valerie:f0740": 106,
  "valerie:f0741": 106,
  "valerie:f0738": 118,
  "valerie:f0739": 118,
  "valerie:f0742": 118,
  "valerie:f0743": 118,
};

type SystemSizeLimits = {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  label: string;
};

export function getRollerShadeSpecWarnings(input: RollerShadeSpecInput): RollerShadeSpecWarning[] {
  if (input.productType !== "Roller Shades") return [];
  if (!hasEnteredMeasurements(input.widthInches, input.heightInches)) return [];

  const fabricCollection = normalizeText(input.fabricCollection);
  if (!fabricCollection) return [];

  const effectiveWidth = getEffectiveFabricWidth(input.widthInches, input.shadeType);
  if (effectiveWidth <= 0 || input.heightInches <= 0) return [];

  const warnings: RollerShadeSpecWarning[] = [];
  const maxFabricWidth = getRollerFabricMaxWidth(input.fabricCollection, input.fabricColorCode);
  const systemLimits = getSystemSizeLimits(input.liftSystem, effectiveWidth);
  const widthMax = Math.min(maxFabricWidth, systemLimits?.maxWidth ?? maxFabricWidth);
  const widthMin = systemLimits?.minWidth;

  if ((widthMin !== undefined && effectiveWidth < widthMin) || effectiveWidth > widthMax) {
    warnings.push({
      id: "roller-fabric-width",
      message: buildWidthMessage({
        effectiveWidth,
        maxWidth: widthMax,
        minWidth: widthMin,
        shadeType: input.shadeType,
        systemLabel: systemLimits?.label,
      }),
    });
  }

  if (systemLimits?.minHeight !== undefined && input.heightInches < systemLimits.minHeight) {
    warnings.push({
      id: "roller-min-height",
      message: `Roller shade height must be at least ${formatInches(systemLimits.minHeight)} for ${systemLimits.label}. This opening is ${formatInches(input.heightInches)} high.`,
    });
  }

  if (systemLimits?.maxHeight !== undefined && input.heightInches > systemLimits.maxHeight) {
    warnings.push({
      id: "roller-max-height",
      message: `Roller shade height must be ${formatInches(systemLimits.maxHeight)} or less for ${systemLimits.label}. This opening is ${formatInches(input.heightInches)} high.`,
    });
  }

  if (fabricCollection === "maui" && input.heightInches > MAUI_MAX_FABRIC_HEIGHT) {
    warnings.push({
      id: "roller-maui-height",
      message: `Maui fabric height must be ${formatInches(MAUI_MAX_FABRIC_HEIGHT)} or less. This opening is ${formatInches(input.heightInches)} high.`,
    });
  }

  return warnings;
}

export function getRollerFabricMaxWidth(
  collection: string | null | undefined,
  colorCode?: string | null,
): number {
  const normalizedCollection = normalizeText(collection);
  if (!normalizedCollection) return DEFAULT_MAX_FABRIC_WIDTH;

  const normalizedCode = normalizeText(colorCode);
  if (normalizedCode) {
    const colorLimit = COLOR_MAX_WIDTH[`${normalizedCollection}:${normalizedCode}`];
    if (colorLimit !== undefined) return colorLimit;
  }

  return COLLECTION_MAX_WIDTH[normalizedCollection] ?? DEFAULT_MAX_FABRIC_WIDTH;
}

export function getEffectiveRollerFabricWidth(
  openingWidthInches: number,
  shadeType?: string | null,
): number {
  return getEffectiveFabricWidth(openingWidthInches, shadeType);
}

function hasEnteredMeasurements(widthInches: number, heightInches: number): boolean {
  return Number.isFinite(widthInches) && Number.isFinite(heightInches) && widthInches > 0 && heightInches > 0;
}

function getEffectiveFabricWidth(openingWidthInches: number, shadeType?: string | null): number {
  const deductedWidth = openingWidthInches - FABRIC_WIDTH_DEDUCTION_INCHES;
  return normalizeText(shadeType) === "common valance" ? deductedWidth / 2 : deductedWidth;
}

function getSystemSizeLimits(
  liftSystem: string | null | undefined,
  effectiveWidth: number,
): SystemSizeLimits | null {
  const normalizedLift = normalizeText(liftSystem);
  if (!normalizedLift) return null;
  if (normalizedLift.includes("motor")) return null;

  if (normalizedLift.includes("smart release") || normalizedLift.includes("smartrelease")) {
    return {
      minWidth: 12,
      maxWidth: 118,
      minHeight: 12,
      maxHeight: 144,
      label: "Smart Release",
    };
  }

  if (normalizedLift.includes("cordless") || normalizedLift.includes("precisionlift")) {
    return {
      minWidth: 9.5,
      maxWidth: 118,
      minHeight: 12,
      maxHeight: getCordlessMaxHeight(effectiveWidth),
      label: "PrecisionLift Cordless",
    };
  }

  if (
    normalizedLift.includes("continuous cord loop") ||
    normalizedLift.includes("cord loop") ||
    normalizedLift === "ccl"
  ) {
    return {
      minWidth: 8,
      maxWidth: 118,
      minHeight: 12,
      maxHeight: 144,
      label: "Continuous Cord Loop",
    };
  }

  return null;
}

function getCordlessMaxHeight(effectiveWidth: number): number {
  if (effectiveWidth <= 20) return 72;
  if (effectiveWidth <= 24) return 96;
  return 144;
}

function buildWidthMessage({
  effectiveWidth,
  maxWidth,
  minWidth,
  shadeType,
  systemLabel,
}: {
  effectiveWidth: number;
  maxWidth: number;
  minWidth?: number;
  shadeType?: string | null;
  systemLabel?: string;
}): string {
  const range =
    minWidth === undefined
      ? `${formatInches(maxWidth)} or less`
      : `${formatInches(minWidth)} to ${formatInches(maxWidth)}`;
  const scope = systemLabel ? " for this fabric and lift system" : " for this fabric";
  const deductionText =
    normalizeText(shadeType) === "common valance"
      ? "after the fabric deduction and common valance split"
      : "after the fabric deduction";

  return `Fabric specs must be within ${range}${scope}. This opening is ${formatInches(effectiveWidth)} ${deductionText}.`;
}

function formatInches(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toString()}"`;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
