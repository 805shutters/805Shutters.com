export type HoneycombShadeSpecWarning = {
  id: string;
  message: string;
};

export type HoneycombShadeSpecInput = {
  productType: string | null | undefined;
  widthInches: number;
  heightInches: number;
  fabric?: string | null;
  fabricCollection?: string | null;
  fabricColorCode?: string | null;
  fabricType?: string | null;
  fabricProgramId?: string | null;
  cellSize?: string | null;
  shadeType?: string | null;
  liftSystem?: string | null;
};

type CellSize =
  | "3/8 single"
  | "9/16 single"
  | "1/2 double"
  | "3/4 single"
  | "3/4 double"
  | "1 1/4 single";

type HoneycombFabricKind =
  | "light filtering"
  | "room darkening"
  | "sheer"
  | "designer light filtering"
  | "designer room darkening"
  | "ashton"
  | "solus"
  | "woven breeze"
  | "woven windsong"
  | "flame resistant"
  | "fr essentials";

type SizeLimits = {
  label: string;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  maxAreaSqft?: number;
};

const CELL_LABELS: Record<CellSize, string> = {
  "3/8 single": '3/8" Single Cell',
  "9/16 single": '9/16" Single Cell',
  "1/2 double": '1/2" Double Cell',
  "3/4 single": '3/4" Single Cell',
  "3/4 double": '3/4" Double Cell',
  "1 1/4 single": '1 1/4" Single Cell',
};

export function getHoneycombShadeSpecWarnings(
  input: HoneycombShadeSpecInput,
): HoneycombShadeSpecWarning[] {
  if (input.productType !== "Honeycomb Shades") return [];
  if (!hasEnteredMeasurements(input.widthInches, input.heightInches)) return [];
  if (!hasSelectedFabric(input)) return [];

  const fabricKind = getHoneycombFabricKind(input);
  const cellSize = normalizeCellSize(input.cellSize);
  const warnings: HoneycombShadeSpecWarning[] = [];

  if (cellSize) {
    const cellWarning = getFabricCellWarning(fabricKind, cellSize, input);
    if (cellWarning) warnings.push(cellWarning);
  }

  const dayNightWarning = getDayNightFabricWarning(fabricKind, input);
  if (dayNightWarning) warnings.push(dayNightWarning);

  const limits = getSizeLimits({
    cellSize,
    fabricKind,
    liftSystem: input.liftSystem,
    shadeType: input.shadeType,
    widthInches: input.widthInches,
    heightInches: input.heightInches,
  });
  if (!limits) return warnings;

  if (
    input.widthInches < limits.minWidth ||
    input.widthInches > limits.maxWidth ||
    input.heightInches < limits.minHeight ||
    input.heightInches > limits.maxHeight
  ) {
    warnings.push({
      id: "honeycomb-size",
      message: `Honeycomb specs must be within ${formatInches(limits.minWidth)} to ${formatInches(
        limits.maxWidth,
      )} wide and ${formatInches(limits.minHeight)} to ${formatInches(limits.maxHeight)} high for ${
        limits.label
      }. This opening is ${formatInches(input.widthInches)} x ${formatInches(input.heightInches)}.`,
    });
  }

  if (limits.maxAreaSqft !== undefined) {
    const areaSqft = (input.widthInches * input.heightInches) / 144;
    if (areaSqft > limits.maxAreaSqft) {
      warnings.push({
        id: "honeycomb-area",
        message: `Honeycomb specs must be ${formatNumber(limits.maxAreaSqft)} SQFT or less for ${
          limits.label
        }. This opening is ${formatNumber(areaSqft)} SQFT.`,
      });
    }
  }

  return warnings;
}

function getSizeLimits({
  cellSize,
  fabricKind,
  liftSystem,
  shadeType,
  widthInches,
  heightInches,
}: {
  cellSize: CellSize | null;
  fabricKind: HoneycombFabricKind;
  liftSystem?: string | null;
  shadeType?: string | null;
  widthInches: number;
  heightInches: number;
}): SizeLimits | null {
  const lift = normalizeText(liftSystem);
  if (!lift) return null;

  if (lift.includes("motor")) return null;

  if (lift.includes("smart release") || lift.includes("smartrelease")) {
    const dayNight = isDayNight(shadeType);
    const minWidth = dayNight && heightInches > 72 ? 30 : dayNight ? 24 : 15.5;
    return {
      label: dayNight ? "Cord Loop Day & Night" : "Cord Loop & SmartRelease",
      minWidth,
      maxWidth: 120,
      minHeight: 12,
      maxHeight: 144,
      maxAreaSqft: 80,
    };
  }

  if (isTopDownBottomUp(liftSystem)) {
    return getTopDownBottomUpLimits(cellSize, fabricKind, widthInches, heightInches);
  }

  if (lift.includes("cordless")) {
    if (isDayNight(shadeType)) return getCordlessDayNightLimits(fabricKind);
    if (isWovenDedicatedFabric(fabricKind)) {
      return getWovenLimits("Woven Cordless", 86, widthInches);
    }
    return getSmartRiseCordlessLimits(cellSize, fabricKind, heightInches);
  }

  return null;
}

function getSmartRiseCordlessLimits(
  cellSize: CellSize | null,
  fabricKind: HoneycombFabricKind,
  heightInches: number,
): SizeLimits | null {
  if (!cellSize) return null;

  const narrowCell = cellSize === "3/8 single" || cellSize === "9/16 single";
  let minWidth = 11.5;
  let maxWidth = narrowCell ? 96 : 108;

  if (fabricKind === "solus") {
    minWidth = 15.5;
    maxWidth = 108;
  }

  if (fabricKind === "flame resistant") {
    minWidth = 25;
    maxWidth = cellSize === "3/8 single" ? 96 : 108;
  }

  if (heightInches > 86) minWidth = Math.max(minWidth, 25);

  return {
    label: `SmartRise Cordless ${CELL_LABELS[cellSize]}`,
    minWidth,
    maxWidth,
    minHeight: 10,
    maxHeight: 120,
  };
}

function getTopDownBottomUpLimits(
  cellSize: CellSize | null,
  fabricKind: HoneycombFabricKind,
  widthInches: number,
  heightInches: number,
): SizeLimits | null {
  if (isWovenDedicatedFabric(fabricKind)) {
    return getWovenLimits("Woven Cordless TDBU", 78, widthInches);
  }

  if (!cellSize) return null;

  const isThreeEighth = cellSize === "3/8 single";
  const isNarrowStandardCell = isThreeEighth || cellSize === "9/16 single";
  const largeCellMaxWidth = isNarrowStandardCell ? 96 : 108;
  const hasAreaCap = !isThreeEighth;
  let minWidth = 15;
  let maxWidth = largeCellMaxWidth;
  let maxHeight = isThreeEighth ? 86 : 96;

  if (fabricKind === "solus") {
    minWidth = 15.5;
    maxWidth = 108;
    maxHeight = 96;
  }

  if (fabricKind === "flame resistant") {
    minWidth = 25;
    maxWidth = isThreeEighth ? 96 : 108;
    maxHeight = isThreeEighth ? 86 : 96;
  }

  if (heightInches > 86) minWidth = Math.max(minWidth, 30);

  return {
    label: `Cordless TDBU ${CELL_LABELS[cellSize]}`,
    minWidth,
    maxWidth,
    minHeight: 10,
    maxHeight,
    ...(hasAreaCap ? { maxAreaSqft: 60 } : {}),
  };
}

function getCordlessDayNightLimits(fabricKind: HoneycombFabricKind): SizeLimits {
  if (fabricKind === "woven windsong") {
    return {
      label: "Cordless Day & Night Windsong",
      minWidth: 15,
      maxWidth: 86,
      minHeight: 10,
      maxHeight: 86,
    };
  }

  return {
    label: fabricKind === "solus" ? "Cordless Day & Night Solus" : "Cordless Day & Night",
    minWidth: fabricKind === "solus" ? 15.5 : 15,
    maxWidth: 96,
    minHeight: 10,
    maxHeight: 86,
  };
}

function getWovenLimits(label: string, maxWidth: number, widthInches: number): SizeLimits {
  return {
    label,
    minWidth: 15.5,
    maxWidth,
    minHeight: 10,
    maxHeight: widthInches <= 19 ? 62 : 86,
  };
}

function getFabricCellWarning(
  fabricKind: HoneycombFabricKind,
  cellSize: CellSize,
  input: HoneycombShadeSpecInput,
): HoneycombShadeSpecWarning | null {
  const allowedCells = getAllowedCellsForFabric(fabricKind, input);
  if (allowedCells.includes(cellSize)) return null;

  return {
    id: "honeycomb-fabric-cell",
    message: `This honeycomb fabric is only available in ${formatCellList(allowedCells)}. Selected cell size is ${CELL_LABELS[cellSize]}.`,
  };
}

function getAllowedCellsForFabric(
  fabricKind: HoneycombFabricKind,
  input: HoneycombShadeSpecInput,
): CellSize[] {
  switch (fabricKind) {
    case "sheer":
      return isDayNight(input.shadeType)
        ? ["3/8 single", "9/16 single", "3/4 single", "1 1/4 single"]
        : ["3/8 single", "3/4 single", "1 1/4 single"];
    case "designer light filtering":
      if (normalizeText(input.fabricCollection).includes("silverbrook")) {
        return ["3/4 single", "1 1/4 single"];
      }
      return ["3/8 single", "3/4 single", "1 1/4 single"];
    case "designer room darkening":
    case "ashton":
    case "solus":
    case "woven breeze":
    case "woven windsong":
      return ["3/4 single", "1 1/4 single"];
    case "flame resistant":
    case "fr essentials":
      return ["3/8 single", "3/4 single"];
    case "light filtering":
    case "room darkening":
      return [
        "3/8 single",
        "9/16 single",
        "1/2 double",
        "3/4 single",
        "3/4 double",
        "1 1/4 single",
      ];
  }
}

function getDayNightFabricWarning(
  fabricKind: HoneycombFabricKind,
  input: HoneycombShadeSpecInput,
): HoneycombShadeSpecWarning | null {
  if (!isDayNight(input.shadeType)) return null;
  if (
    fabricKind !== "woven breeze" &&
    fabricKind !== "ashton" &&
    fabricKind !== "flame resistant" &&
    fabricKind !== "fr essentials"
  ) {
    return null;
  }

  return {
    id: "honeycomb-day-night-fabric",
    message: "This honeycomb fabric is not available for Day/Night shades per the Norman guide.",
  };
}

function getHoneycombFabricKind(input: HoneycombShadeSpecInput): HoneycombFabricKind {
  const collection = normalizeText(input.fabricCollection);
  const fabricType = normalizeText(input.fabricType);
  const fabric = normalizeText(input.fabric);
  const haystack = `${collection} ${fabricType} ${fabric}`.trim();

  if (collection.includes("breeze")) return "woven breeze";
  if (collection.includes("windsong")) return "woven windsong";
  if (collection.includes("ashton")) return "ashton";
  if (collection.includes("solus") || haystack.includes(" solus")) return "solus";
  if (haystack.includes("fr essentials")) return "fr essentials";
  if (haystack.includes("flame resistant")) return "flame resistant";
  if (haystack.includes("sheer")) return "sheer";
  if (haystack.includes("designer") && haystack.includes("room darkening")) {
    return "designer room darkening";
  }
  if (haystack.includes("designer")) return "designer light filtering";
  if (haystack.includes("room darkening") || haystack.includes("blackout")) {
    return "room darkening";
  }
  return "light filtering";
}

function isWovenDedicatedFabric(kind: HoneycombFabricKind): boolean {
  return kind === "woven breeze" || kind === "woven windsong" || kind === "ashton";
}

function hasEnteredMeasurements(widthInches: number, heightInches: number): boolean {
  return Number.isFinite(widthInches) && Number.isFinite(heightInches) && widthInches > 0 && heightInches > 0;
}

function hasSelectedFabric(input: HoneycombShadeSpecInput): boolean {
  return [
    input.fabric,
    input.fabricCollection,
    input.fabricColorCode,
    input.fabricType,
    input.fabricProgramId,
  ].some((value) => Boolean(normalizeText(value)));
}

function isDayNight(shadeType: string | null | undefined): boolean {
  const normalized = normalizeText(shadeType);
  return normalized.includes("day") && normalized.includes("night");
}

function isTopDownBottomUp(value: string | null | undefined): boolean {
  const normalized = normalizeText(value);
  return normalized.includes("top down") || normalized.includes("bottom up") || normalized.includes("tdbu");
}

function normalizeCellSize(value: string | null | undefined): CellSize | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.includes("1 1 4") || normalized.includes("1 1/4")) return "1 1/4 single";
  if (normalized.includes("1/2") || normalized.includes("1 2")) return "1/2 double";
  if (normalized.includes("9/16") || normalized.includes("9 16")) return "9/16 single";
  if (normalized.includes("3/8") || normalized.includes("3 8")) return "3/8 single";
  if (normalized.includes("3/4") || normalized.includes("3 4")) {
    return normalized.includes("double") ? "3/4 double" : "3/4 single";
  }
  return null;
}

function formatCellList(cells: CellSize[]): string {
  return cells.map((cell) => CELL_LABELS[cell]).join(", ");
}

function formatInches(value: number): string {
  const whole = Math.trunc(value);
  const fraction = Math.round((value - whole) * 4);
  if (fraction === 0) return `${whole}"`;
  if (fraction === 1) return `${whole} 1/4"`;
  if (fraction === 2) return `${whole} 1/2"`;
  if (fraction === 3) return `${whole} 3/4"`;
  return `${formatNumber(value)}"`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
