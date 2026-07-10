import {
  normanRomanDealerFabricRows,
  type NormanRomanDealerFabricRow,
} from "@/lib/quote/norman-roman-dealer-fabrics.generated";

export type RomanShadeSpecWarning = {
  id: string;
  message: string;
};

export type RomanShadeSpecInput = {
  productType: string | null | undefined;
  widthInches: number;
  heightInches: number;
  fabric?: string | null;
  fabricCollection?: string | null;
  fabricColorCode?: string | null;
  fabricColorName?: string | null;
  foldStyle?: string | null;
  shadeType?: string | null;
  liftSystem?: string | null;
  mountType?: string | null;
  lining?: string | null;
};

type RomanStyleCode = "RM001" | "RM003" | "RM003E" | "RM003R" | "RM004";

const COMMON_VALANCE_MIN_GAP_INCHES = 0.125;
const COMMON_VALANCE_MAX_WIDTH_INCHES = 144;
const DAY_NIGHT_MAX_HEIGHT_TO_WIDTH_RATIO = 3;
const INSIDE_MOUNT_FABRIC_ALLOWANCE_INCHES = 0.375;
const RM003_SPECIAL_CLOTH_CODES = new Set(["AC0401", "AC0402", "AB0665", "AB0674"]);
const SEAM_SPECIAL_CLOTH_CODES = new Set(["AB0203", "AB0702", "AA0372"]);

const STYLE_CODES: Record<string, RomanStyleCode> = {
  "flat fold without seams": "RM001",
  "flat fold with batten back": "RM003",
  "edge banded": "RM003E",
  "ribbon banded": "RM003R",
  "soft fold": "RM004",
};

export function getRomanShadeSpecWarnings(input: RomanShadeSpecInput): RomanShadeSpecWarning[] {
  if (input.productType !== "Roman Shades") return [];
  if (!hasEnteredMeasurements(input.widthInches, input.heightInches)) return [];

  const fabric = findRomanFabricRow(input);
  if (!fabric) return [];

  const warnings: RomanShadeSpecWarning[] = [];
  const styleCode = getRomanStyleCode(input.foldStyle);
  const isCommonValance = normalizeText(input.shadeType) === "common valance";
  const isDayNight = normalizeText(input.shadeType) === "day night";

  if (input.foldStyle && !fabric.styles.includes(input.foldStyle)) {
    warnings.push({
      id: "roman-style-fabric",
      message: `${formatRomanFabric(fabric)} is not available with ${input.foldStyle} per the Norman Roman Shades order form.`,
    });
  }

  if (isCommonValance && input.widthInches > COMMON_VALANCE_MAX_WIDTH_INCHES) {
    warnings.push({
      id: "roman-common-valance-width",
      message: `Roman Common Valance specs must be ${formatInches(
        COMMON_VALANCE_MAX_WIDTH_INCHES,
      )} wide or less across all panels and gaps. This opening is ${formatInches(
        input.widthInches,
      )} wide.`,
    });
  }

  if (isDayNight && input.heightInches / input.widthInches > DAY_NIGHT_MAX_HEIGHT_TO_WIDTH_RATIO) {
    warnings.push({
      id: "roman-day-night-ratio",
      message: `Roman Day & Night specs must keep the height-to-width ratio at 3:1 or less. This opening is ${formatInches(
        input.widthInches,
      )} x ${formatInches(input.heightInches)}.`,
    });
  }

  if (styleCode) {
    const maxFabricWidth = getEffectiveRomanFabricMaxWidth({
      fabric,
      foldStyle: input.foldStyle,
      shadeType: input.shadeType,
      liftSystem: input.liftSystem,
      mountType: input.mountType,
    });
    const effectiveWidth = getEffectiveRomanOrderWidth(input.widthInches, input.shadeType);

    if (
      maxFabricWidth !== null &&
      effectiveWidth > maxFabricWidth &&
      Number.isFinite(effectiveWidth)
    ) {
      warnings.push({
        id: "roman-fabric-width",
        message: buildFabricWidthMessage({
          fabric,
          foldStyle: input.foldStyle,
          shadeType: input.shadeType,
          liftSystem: input.liftSystem,
          effectiveWidth,
          maxFabricWidth,
          heightInches: input.heightInches,
        }),
      });

      const f0031MaxLength = getRailroadedF0031MaxLength(styleCode, input.mountType);
      if (isRomanF0031(fabric) && f0031MaxLength !== null && input.heightInches > f0031MaxLength) {
        warnings.push({
          id: "roman-f0031-railroad-height",
          message: `Roman Lorraine F0031 railroaded fabric must be ${formatInches(
            f0031MaxLength,
          )} high or less for ${input.foldStyle}. This opening is ${formatInches(
            input.heightInches,
          )} high.`,
        });
      }
    }
  }

  if (
    normalizeText(fabric.collection) === "valencia" &&
    normalizeText(fabric.colorCode) === "f0139" &&
    normalizeText(input.lining) === "blackout"
  ) {
    warnings.push({
      id: "roman-valencia-natural-white-lining",
      message:
        "Valencia F0139 Natural White must be ordered with translucent lining per the Norman Roman Shades order form.",
    });
  }

  return warnings;
}

export function getEffectiveRomanOrderWidth(
  openingWidthInches: number,
  shadeType?: string | null,
): number {
  if (normalizeText(shadeType) !== "common valance") return openingWidthInches;
  return (openingWidthInches - COMMON_VALANCE_MIN_GAP_INCHES) / 2;
}

export function getEffectiveRomanFabricMaxWidth({
  fabric,
  foldStyle,
  shadeType,
  liftSystem,
  mountType,
}: {
  fabric: NormanRomanDealerFabricRow;
  foldStyle?: string | null;
  shadeType?: string | null;
  liftSystem?: string | null;
  mountType?: string | null;
}): number | null {
  const rawMax = Number.parseFloat(fabric.maxWidth);
  if (!Number.isFinite(rawMax) || rawMax <= 0) return null;

  const styleCode = getRomanStyleCode(foldStyle);
  if (!styleCode) return null;

  const deduction = getRomanFabricWidthDeduction({
    styleCode,
    clothCode: fabric.clothCode,
    shadeType,
    liftSystem,
  });
  if (deduction === null) return null;

  const mountAllowance =
    normalizeText(mountType) === "inside mount" ? INSIDE_MOUNT_FABRIC_ALLOWANCE_INCHES : 0;
  return rawMax - deduction + mountAllowance;
}

function getRomanFabricWidthDeduction({
  styleCode,
  clothCode,
  shadeType,
  liftSystem,
}: {
  styleCode: RomanStyleCode;
  clothCode: string;
  shadeType?: string | null;
  liftSystem?: string | null;
}): number | null {
  if (styleCode === "RM001") {
    const lift = normalizeText(liftSystem);
    if (!lift) return null;
    if (normalizeText(shadeType) === "day night" && lift.includes("cordless")) return 9.125;
    if (lift.includes("cordless")) return 8.375;
    return 5.75;
  }

  if (styleCode === "RM003" || styleCode === "RM003E" || styleCode === "RM003R") {
    return RM003_SPECIAL_CLOTH_CODES.has(clothCode) ? 3.5 : 1.9375;
  }

  if (styleCode === "RM004") return 2.4375;

  return 0;
}

function findRomanFabricRow(input: RomanShadeSpecInput): NormanRomanDealerFabricRow | null {
  const collection = normalizeText(input.fabricCollection);
  const colorCode = normalizeText(input.fabricColorCode) || extractColorCode(input.fabric);
  const colorName = normalizeText(input.fabricColorName);

  if (collection && colorCode) {
    const match = normanRomanDealerFabricRows.find(
      (row) =>
        normalizeText(row.collection) === collection && normalizeText(row.colorCode) === colorCode,
    );
    if (match) return match;
  }

  if (colorCode) {
    const matches = normanRomanDealerFabricRows.filter(
      (row) => normalizeText(row.colorCode) === colorCode,
    );
    if (matches.length === 1) return matches[0];
  }

  if (collection && colorName) {
    const match = normanRomanDealerFabricRows.find(
      (row) =>
        normalizeText(row.collection) === collection && normalizeText(row.colorName) === colorName,
    );
    if (match) return match;
  }

  return null;
}

function buildFabricWidthMessage({
  fabric,
  foldStyle,
  shadeType,
  liftSystem,
  effectiveWidth,
  maxFabricWidth,
  heightInches,
}: {
  fabric: NormanRomanDealerFabricRow;
  foldStyle?: string | null;
  shadeType?: string | null;
  liftSystem?: string | null;
  effectiveWidth: number;
  maxFabricWidth: number;
  heightInches: number;
}): string {
  const context = [
    foldStyle || "this style",
    liftSystem ? `${liftSystem} control` : null,
  ].filter(Boolean).join(" / ");
  const commonValanceNote =
    normalizeText(shadeType) === "common valance"
      ? ` This common valance panel is estimated at ${formatInches(
          effectiveWidth,
        )} wide after the required ${formatInches(COMMON_VALANCE_MIN_GAP_INCHES)} minimum gap.`
      : ` This opening is ${formatInches(effectiveWidth)} wide.`;
  const prefix = `Roman fabric specs must be ${formatInches(
    maxFabricWidth,
  )} wide or less for ${formatRomanFabric(fabric)}${context ? ` with ${context}` : ""}.`;

  if (fabric.joinable === "N" && fabric.clothCode !== "AB0103") {
    return `${prefix}${commonValanceNote} Norman marks this fabric as not joinable.`;
  }

  if (fabric.joinable === "R") {
    return `${prefix}${commonValanceNote} Norman requires this fabric to be railroaded.`;
  }

  const fabricHeightAlsoExceeds = heightInches > maxFabricWidth;
  const styleCode = getRomanStyleCode(foldStyle);
  const mustSeam =
    styleCode === "RM001" ||
    fabric.clothCode === "AA0210" ||
    SEAM_SPECIAL_CLOTH_CODES.has(fabric.clothCode);
  const treatment =
    fabricHeightAlsoExceeds && !mustSeam
      ? "railroaded and seamed"
      : mustSeam
        ? "seamed"
        : "railroaded";

  return `${prefix}${commonValanceNote} Norman requires this fabric to be ${treatment}.`;
}

function getRailroadedF0031MaxLength(
  styleCode: RomanStyleCode,
  mountType?: string | null,
): number | null {
  const insideAllowance =
    normalizeText(mountType) === "inside mount" ? INSIDE_MOUNT_FABRIC_ALLOWANCE_INCHES : 0;
  if (styleCode === "RM001") return 45 + insideAllowance;
  if (styleCode === "RM003") return 36;
  if (styleCode === "RM004") return 26;
  return null;
}

function isRomanF0031(fabric: NormanRomanDealerFabricRow): boolean {
  return normalizeText(fabric.collection) === "lorraine" && normalizeText(fabric.colorCode) === "f0031";
}

function getRomanStyleCode(foldStyle?: string | null): RomanStyleCode | null {
  const normalized = normalizeText(foldStyle);
  return normalized ? STYLE_CODES[normalized] ?? null : null;
}

function hasEnteredMeasurements(widthInches: number, heightInches: number): boolean {
  return (
    Number.isFinite(widthInches) &&
    Number.isFinite(heightInches) &&
    widthInches > 0 &&
    heightInches > 0
  );
}

function extractColorCode(value?: string | null): string {
  const match = (value ?? "").match(/\bF\d{4}\b/i);
  return match ? normalizeText(match[0]) : "";
}

function formatRomanFabric(fabric: NormanRomanDealerFabricRow): string {
  return `${fabric.collection} ${fabric.colorCode}`;
}

function formatInches(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded).replace(/0+$/, "").replace(/\.$/, "")}"`;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
