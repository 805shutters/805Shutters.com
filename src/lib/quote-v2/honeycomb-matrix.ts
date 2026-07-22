import type {
  SelectionContext,
  SelectionRecord,
  SelectionValue,
  ValidationIssue,
} from "./core";
import { sourceProvenance, type SourceManifestId } from "./source-manifest";
import {
  NORMAN_MOTORIZATION_SOURCE_ID,
  resolveNormanShadeMotorization,
} from "./norman-shade-motorization";

export const HONEYCOMB_GUIDE_SOURCE_ID =
  "norman-honeycomb-guide-2026-07" as const;

export const HONEYCOMB_CELL_SIZES = [
  "3_8_single",
  "9_16_single",
  "1_2_double",
  "3_4_single",
  "3_4_double",
  "1_1_4_single",
] as const;
export type HoneycombCellSize = (typeof HONEYCOMB_CELL_SIZES)[number];

export const HONEYCOMB_SYSTEMS = [
  "smartrise_cordless",
  "cordless_tdbu",
  "cordless_day_night",
  "woven_cordless",
  "woven_cordless_tdbu",
  "smartrelease",
  "cord_loop",
  "cord_loop_td",
  "cord_loop_day_night",
  "smartfit",
  "smartfit_dual",
  "smartfit_sloped",
  "smartfit_frame",
  "smartfit_dual_frame",
  "smartfit_sloped_frame",
  "motorized_bottom_up",
  "motorized_top_down",
  "smart_motorized_bottom_up",
  "smart_motorized_tdbu",
  "smart_motorized_day_night",
  "motorized_skylight",
  "autowand_motorized_bottom_up",
  "patio_door_vertical",
  "patio_door_vertical_day_night",
  "specialty_shape",
] as const;
export type HoneycombSystem = (typeof HONEYCOMB_SYSTEMS)[number];

export const HONEYCOMB_FABRIC_CLASSES = [
  "sheer",
  "light_filtering",
  "room_darkening",
  "designer_lf",
  "designer_rd",
  "designer_ashton",
  "flame_resistant",
  "fr_essentials",
  "solus",
  "windsong",
  "breeze",
] as const;
export type HoneycombFabricClass = (typeof HONEYCOMB_FABRIC_CLASSES)[number];

export interface HoneycombDimensionLimits {
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly maxAreaSqFt?: number;
}

export interface HoneycombDimensionProfile {
  readonly id: string;
  readonly system: HoneycombSystem;
  readonly cells: readonly HoneycombCellSize[];
  readonly fabricClasses?: readonly HoneycombFabricClass[];
  readonly limits: HoneycombDimensionLimits;
  readonly sourcePage: number;
  readonly sourceId?: SourceManifestId;
}

const ALL_CELLS = HONEYCOMB_CELL_SIZES;
const SMALL_CELLS = ["3_8_single", "9_16_single"] as const;
const LARGE_SMARTRISE_CELLS = [
  "1_2_double",
  "3_4_single",
  "3_4_double",
  "1_1_4_single",
] as const;

/** Normalized from the NET-size table on guide page 5. */
export const HONEYCOMB_DIMENSION_PROFILES: readonly HoneycombDimensionProfile[] =
  [
    {
      id: "smartrise-small",
      system: "smartrise_cordless",
      cells: SMALL_CELLS,
      limits: { minWidth: 11.5, maxWidth: 96, minHeight: 10, maxHeight: 120 },
      sourcePage: 5,
    },
    {
      id: "smartrise-large",
      system: "smartrise_cordless",
      cells: LARGE_SMARTRISE_CELLS,
      limits: { minWidth: 11.5, maxWidth: 108, minHeight: 10, maxHeight: 120 },
      sourcePage: 5,
    },
    {
      id: "smartrise-solus",
      system: "smartrise_cordless",
      cells: ["3_4_single", "1_1_4_single"],
      fabricClasses: ["solus"],
      limits: { minWidth: 15.5, maxWidth: 108, minHeight: 10, maxHeight: 120 },
      sourcePage: 5,
    },
    {
      id: "smartrise-fr-3-8",
      system: "smartrise_cordless",
      cells: ["3_8_single"],
      fabricClasses: ["flame_resistant"],
      limits: { minWidth: 25, maxWidth: 96, minHeight: 10, maxHeight: 120 },
      sourcePage: 5,
    },
    {
      id: "smartrise-fr-3-4",
      system: "smartrise_cordless",
      cells: ["3_4_single"],
      fabricClasses: ["flame_resistant"],
      limits: { minWidth: 25, maxWidth: 108, minHeight: 10, maxHeight: 120 },
      sourcePage: 5,
    },
    {
      id: "tdbu-3-8",
      system: "cordless_tdbu",
      cells: ["3_8_single"],
      limits: { minWidth: 15, maxWidth: 96, minHeight: 10, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "tdbu-9-16",
      system: "cordless_tdbu",
      cells: ["9_16_single"],
      limits: {
        minWidth: 15,
        maxWidth: 96,
        minHeight: 10,
        maxHeight: 96,
        maxAreaSqFt: 60,
      },
      sourcePage: 5,
    },
    {
      id: "tdbu-large",
      system: "cordless_tdbu",
      cells: LARGE_SMARTRISE_CELLS,
      limits: {
        minWidth: 15,
        maxWidth: 108,
        minHeight: 10,
        maxHeight: 96,
        maxAreaSqFt: 60,
      },
      sourcePage: 5,
    },
    {
      id: "tdbu-solus",
      system: "cordless_tdbu",
      cells: ["3_4_single", "1_1_4_single"],
      fabricClasses: ["solus"],
      limits: {
        minWidth: 15.5,
        maxWidth: 108,
        minHeight: 10,
        maxHeight: 96,
        maxAreaSqFt: 60,
      },
      sourcePage: 5,
    },
    {
      id: "tdbu-fr-3-8",
      system: "cordless_tdbu",
      cells: ["3_8_single"],
      fabricClasses: ["flame_resistant"],
      limits: { minWidth: 25, maxWidth: 96, minHeight: 10, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "tdbu-fr-3-4",
      system: "cordless_tdbu",
      cells: ["3_4_single"],
      fabricClasses: ["flame_resistant"],
      limits: {
        minWidth: 25,
        maxWidth: 108,
        minHeight: 10,
        maxHeight: 96,
        maxAreaSqFt: 60,
      },
      sourcePage: 5,
    },
    {
      id: "cordless-day-night",
      system: "cordless_day_night",
      cells: ALL_CELLS,
      limits: { minWidth: 15, maxWidth: 96, minHeight: 10, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "cordless-day-night-solus",
      system: "cordless_day_night",
      cells: ["3_4_single", "1_1_4_single"],
      fabricClasses: ["solus"],
      limits: { minWidth: 15.5, maxWidth: 96, minHeight: 10, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "cordless-day-night-windsong",
      system: "cordless_day_night",
      cells: ["3_4_single", "1_1_4_single"],
      fabricClasses: ["windsong"],
      limits: { minWidth: 15, maxWidth: 86, minHeight: 10, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "woven-cordless",
      system: "woven_cordless",
      cells: ["3_4_single", "1_1_4_single"],
      fabricClasses: ["windsong", "breeze", "designer_ashton"],
      limits: { minWidth: 15.5, maxWidth: 86, minHeight: 10, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "woven-cordless-tdbu",
      system: "woven_cordless_tdbu",
      cells: ["3_4_single", "1_1_4_single"],
      fabricClasses: ["windsong", "breeze", "designer_ashton"],
      limits: { minWidth: 15.5, maxWidth: 78, minHeight: 10, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "smartfit-compact",
      system: "smartfit",
      cells: ALL_CELLS,
      fabricClasses: ["breeze", "designer_ashton"],
      limits: { minWidth: 8.5, maxWidth: 50, minHeight: 6, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "smartfit-3-8",
      system: "smartfit",
      cells: ["3_8_single"],
      limits: { minWidth: 8.5, maxWidth: 50, minHeight: 6, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "smartfit-other",
      system: "smartfit",
      cells: ALL_CELLS,
      limits: { minWidth: 8.5, maxWidth: 72, minHeight: 6, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "smartfit-dual-compact",
      system: "smartfit_dual",
      cells: ALL_CELLS,
      fabricClasses: ["breeze", "designer_ashton"],
      limits: { minWidth: 8.5, maxWidth: 50, minHeight: 12, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "smartfit-dual-3-8",
      system: "smartfit_dual",
      cells: ["3_8_single"],
      limits: { minWidth: 8.5, maxWidth: 50, minHeight: 12, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "smartfit-dual-other",
      system: "smartfit_dual",
      cells: ALL_CELLS,
      limits: { minWidth: 8.5, maxWidth: 72, minHeight: 12, maxHeight: 86 },
      sourcePage: 5,
    },
    {
      id: "smartfit-sloped",
      system: "smartfit_sloped",
      cells: ["3_8_single"],
      limits: {
        minWidth: 8.5,
        maxWidth: 59,
        minHeight: 6,
        maxHeight: 120,
        maxAreaSqFt: 48,
      },
      sourcePage: 5,
    },
    {
      id: "cord-loop",
      system: "cord_loop",
      cells: ALL_CELLS,
      limits: {
        minWidth: 15.5,
        maxWidth: 120,
        minHeight: 12,
        maxHeight: 144,
        maxAreaSqFt: 80,
      },
      sourcePage: 5,
    },
    {
      id: "smartrelease",
      system: "smartrelease",
      cells: ALL_CELLS,
      limits: {
        minWidth: 15.5,
        maxWidth: 120,
        minHeight: 12,
        maxHeight: 144,
        maxAreaSqFt: 80,
      },
      sourcePage: 5,
    },
    {
      id: "cord-loop-td",
      system: "cord_loop_td",
      cells: ALL_CELLS,
      limits: {
        minWidth: 24,
        maxWidth: 120,
        minHeight: 12,
        maxHeight: 144,
        maxAreaSqFt: 80,
      },
      sourcePage: 5,
    },
    {
      id: "cord-loop-day-night",
      system: "cord_loop_day_night",
      cells: ALL_CELLS,
      limits: {
        minWidth: 24,
        maxWidth: 120,
        minHeight: 12,
        maxHeight: 144,
        maxAreaSqFt: 80,
      },
      sourcePage: 5,
    },
    {
      id: "vertical",
      system: "patio_door_vertical",
      cells: ["3_4_single", "1_1_4_single"],
      limits: { minWidth: 30, maxWidth: 146, minHeight: 24, maxHeight: 120 },
      sourcePage: 5,
    },
    {
      id: "vertical-day-night",
      system: "patio_door_vertical_day_night",
      cells: ["3_4_single", "1_1_4_single"],
      limits: { minWidth: 30, maxWidth: 146, minHeight: 24, maxHeight: 120 },
      sourcePage: 5,
    },
    {
      id: "smartfit-frame-panel",
      system: "smartfit_frame",
      cells: ["3_8_single"],
      limits: {
        minWidth: 8.5,
        maxWidth: 50,
        minHeight: 6,
        maxHeight: 86,
        maxAreaSqFt: 30,
      },
      sourcePage: 20,
    },
    {
      id: "smartfit-dual-frame-panel",
      system: "smartfit_dual_frame",
      cells: ["3_8_single"],
      limits: {
        minWidth: 8.5,
        maxWidth: 50,
        minHeight: 12,
        maxHeight: 86,
        maxAreaSqFt: 43,
      },
      sourcePage: 34,
    },
    {
      id: "smartfit-sloped-frame-panel",
      system: "smartfit_sloped_frame",
      cells: ["3_8_single"],
      limits: {
        minWidth: 8.5,
        maxWidth: 59,
        minHeight: 6,
        maxHeight: 120,
        maxAreaSqFt: 48,
      },
      sourcePage: 35,
    },
  ] as const;

export interface HoneycombFrameProfile {
  readonly id: string;
  readonly frameAliases: readonly string[];
  readonly mountTypes: readonly ("inside" | "outside")[];
  readonly minWidthsByTPostCount: readonly [number, number, number, number];
  readonly maxWidthsByTPostCount: readonly [number, number, number, number];
  readonly minHeight: number;
  readonly minDualHeight: number;
  readonly maxHeight: number;
}

/** Frame-to-frame limits from guide page 20. */
export const HONEYCOMB_FRAME_PROFILES = [
  {
    id: "l-and-hang-strip",
    frameAliases: [
      "vintage l frame 1 4 light block",
      "vintage l frame 3 4 light block",
      "vintage hang strip with insert",
      "hang strip",
      "beaded l frame",
    ],
    mountTypes: ["inside", "outside"],
    minWidthsByTPostCount: [10.5, 20, 29.5, 39],
    maxWidthsByTPostCount: [51.75, 102.75, 153.75, 204.75],
    minHeight: 8,
    minDualHeight: 14,
    maxHeight: 87.75,
  },
  {
    id: "1-1-4-beaded-z",
    frameAliases: ["1 1 4 beaded z frame"],
    mountTypes: ["inside"],
    minWidthsByTPostCount: [11.25, 20.75, 30.25, 39.75],
    maxWidthsByTPostCount: [52.5, 103.5, 154.5, 205.5],
    minHeight: 8.75,
    minDualHeight: 14.75,
    maxHeight: 88.5,
  },
  {
    id: "1-1-2-bullnose-z",
    frameAliases: ["1 1 2 bullnose z frame"],
    mountTypes: ["inside"],
    minWidthsByTPostCount: [11.75, 21.25, 30.75, 40.25],
    maxWidthsByTPostCount: [53, 104, 155, 206],
    minHeight: 9.25,
    minDualHeight: 15.25,
    maxHeight: 89,
  },
  {
    id: "2-inch-frame",
    frameAliases: [
      "2 camber deco frame",
      "2 classic deco frame",
      "2 belair z frame",
      "2 bullnose z frame",
    ],
    mountTypes: ["inside", "outside"],
    minWidthsByTPostCount: [12.75, 22.25, 31.75, 41.25],
    maxWidthsByTPostCount: [54, 105, 156, 207],
    minHeight: 10.25,
    minDualHeight: 16.25,
    maxHeight: 90,
  },
  {
    id: "3-inch-frame",
    frameAliases: ["3 ridge deco frame", "3 crown z frame"],
    mountTypes: ["inside", "outside"],
    minWidthsByTPostCount: [14.75, 24.25, 33.75, 43.25],
    maxWidthsByTPostCount: [56, 107, 158, 209],
    minHeight: 12.25,
    minDualHeight: 18.25,
    maxHeight: 92,
  },
] as const satisfies readonly HoneycombFrameProfile[];

const SYSTEM_CELL_COMPATIBILITY: Readonly<
  Record<HoneycombSystem, readonly HoneycombCellSize[]>
> = {
  smartrise_cordless: ALL_CELLS,
  cordless_tdbu: ALL_CELLS,
  cordless_day_night: ALL_CELLS,
  woven_cordless: ["3_4_single", "1_1_4_single"],
  woven_cordless_tdbu: ["3_4_single", "1_1_4_single"],
  smartrelease: ALL_CELLS,
  cord_loop: ALL_CELLS,
  cord_loop_td: ALL_CELLS,
  cord_loop_day_night: ALL_CELLS,
  smartfit: ALL_CELLS,
  smartfit_dual: ALL_CELLS,
  smartfit_sloped: ["3_8_single"],
  smartfit_frame: ["3_8_single"],
  smartfit_dual_frame: ["3_8_single"],
  smartfit_sloped_frame: ["3_8_single"],
  motorized_bottom_up: ALL_CELLS,
  motorized_top_down: ALL_CELLS,
  smart_motorized_bottom_up: ALL_CELLS,
  smart_motorized_tdbu: ALL_CELLS,
  smart_motorized_day_night: ALL_CELLS,
  motorized_skylight: ["1_2_double", "3_4_single"],
  autowand_motorized_bottom_up: ALL_CELLS,
  patio_door_vertical: ["3_4_single", "1_1_4_single"],
  patio_door_vertical_day_night: ["3_4_single", "1_1_4_single"],
  specialty_shape: ["3_8_single", "9_16_single", "1_2_double", "3_4_single"],
};

const FABRIC_CELL_COMPATIBILITY: Readonly<
  Record<HoneycombFabricClass, readonly HoneycombCellSize[]>
> = {
  sheer: ["3_8_single", "9_16_single", "3_4_single", "1_1_4_single"],
  light_filtering: ALL_CELLS,
  room_darkening: ALL_CELLS,
  designer_lf: ["3_8_single", "3_4_single", "1_1_4_single"],
  designer_rd: ["3_4_single", "1_1_4_single"],
  designer_ashton: ["3_4_single", "1_1_4_single"],
  flame_resistant: ["3_8_single", "3_4_single"],
  fr_essentials: ["3_8_single", "3_4_single"],
  solus: ["3_4_single", "1_1_4_single"],
  windsong: ["3_4_single", "1_1_4_single"],
  breeze: ["3_4_single", "1_1_4_single"],
};

const DAY_NIGHT_CLASSES = [
  "sheer",
  "light_filtering",
  "room_darkening",
  "designer_lf",
  "designer_rd",
  "solus",
  "windsong",
] as const;
const WOVEN_CLASSES = ["windsong", "breeze", "designer_ashton"] as const;
const ALL_FABRICS = HONEYCOMB_FABRIC_CLASSES;

const SYSTEM_FABRIC_COMPATIBILITY: Readonly<
  Record<HoneycombSystem, readonly HoneycombFabricClass[]>
> = {
  smartrise_cordless: [
    "light_filtering",
    "room_darkening",
    "sheer",
    "designer_lf",
    "designer_rd",
    "flame_resistant",
    "fr_essentials",
    "solus",
  ],
  cordless_tdbu: [
    "light_filtering",
    "room_darkening",
    "sheer",
    "designer_lf",
    "designer_rd",
    "flame_resistant",
    "fr_essentials",
    "solus",
  ],
  cordless_day_night: DAY_NIGHT_CLASSES,
  woven_cordless: WOVEN_CLASSES,
  woven_cordless_tdbu: WOVEN_CLASSES,
  smartrelease: ALL_FABRICS,
  cord_loop: ALL_FABRICS,
  cord_loop_td: ALL_FABRICS,
  cord_loop_day_night: DAY_NIGHT_CLASSES,
  smartfit: ALL_FABRICS,
  smartfit_dual: [
    "sheer",
    "light_filtering",
    "room_darkening",
    "designer_lf",
    "designer_rd",
    "designer_ashton",
    "solus",
    "windsong",
    "breeze",
  ],
  smartfit_sloped: [
    "sheer",
    "light_filtering",
    "room_darkening",
    "designer_lf",
    "flame_resistant",
    "fr_essentials",
  ],
  smartfit_frame: [
    "sheer",
    "light_filtering",
    "room_darkening",
    "designer_lf",
    "flame_resistant",
    "fr_essentials",
  ],
  smartfit_dual_frame: [
    "sheer",
    "light_filtering",
    "room_darkening",
    "designer_lf",
  ],
  smartfit_sloped_frame: [
    "sheer",
    "light_filtering",
    "room_darkening",
    "designer_lf",
    "flame_resistant",
    "fr_essentials",
  ],
  motorized_bottom_up: ALL_FABRICS,
  motorized_top_down: [
    "sheer",
    "light_filtering",
    "room_darkening",
    "designer_lf",
    "designer_rd",
    "flame_resistant",
    "fr_essentials",
    "solus",
    "windsong",
  ],
  smart_motorized_bottom_up: ALL_FABRICS,
  smart_motorized_tdbu: ALL_FABRICS,
  smart_motorized_day_night: DAY_NIGHT_CLASSES,
  motorized_skylight: [
    "light_filtering",
    "room_darkening",
    "designer_lf",
    "designer_rd",
    "fr_essentials",
    "solus",
  ],
  autowand_motorized_bottom_up: [
    "sheer",
    "light_filtering",
    "room_darkening",
    "designer_lf",
    "designer_rd",
    "designer_ashton",
    "flame_resistant",
    "fr_essentials",
    "solus",
    "windsong",
  ],
  patio_door_vertical: [
    "light_filtering",
    "room_darkening",
    "designer_lf",
    "designer_rd",
    "flame_resistant",
    "fr_essentials",
  ],
  patio_door_vertical_day_night: [
    "light_filtering",
    "room_darkening",
    "designer_lf",
    "designer_rd",
  ],
  specialty_shape: [
    "sheer",
    "light_filtering",
    "room_darkening",
    "designer_lf",
    "designer_rd",
    "fr_essentials",
    "solus",
    "windsong",
  ],
};

function compact(value: unknown): string {
  return typeof value === "string"
    ? value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
}

function stringConfig(context: SelectionContext, ...keys: string[]): string {
  for (const key of keys) {
    const value = context.configuration[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberConfig(
  context: SelectionContext,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = context.configuration[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      typeof value === "string" &&
      value.trim() &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }
  return null;
}

function booleanConfig(
  context: SelectionContext,
  ...keys: string[]
): boolean | null {
  for (const key of keys) {
    const value = context.configuration[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = compact(value);
      if (["yes", "true", "selected"].includes(normalized)) return true;
      if (["no", "false", "none", "not selected"].includes(normalized))
        return false;
    }
  }
  return null;
}

function numberArray(value: SelectionValue | undefined): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "number" && Number.isFinite(entry)) return [entry];
    if (
      typeof entry === "string" &&
      entry.trim() &&
      Number.isFinite(Number(entry))
    ) {
      return [Number(entry)];
    }
    return [];
  });
}

export function normalizeHoneycombCellSize(
  value: unknown,
): HoneycombCellSize | null {
  const normalized = compact(value);
  if (normalized.includes("3 8") && normalized.includes("single"))
    return "3_8_single";
  if (normalized.includes("9 16") && normalized.includes("single"))
    return "9_16_single";
  if (normalized.includes("1 2") && normalized.includes("double"))
    return "1_2_double";
  if (normalized.includes("3 4") && normalized.includes("double"))
    return "3_4_double";
  if (normalized.includes("3 4") && normalized.includes("single"))
    return "3_4_single";
  if (
    (normalized.includes("1 1 4") || normalized.includes("1 25")) &&
    normalized.includes("single")
  )
    return "1_1_4_single";
  return null;
}

export function normalizeHoneycombFabricClass(
  value: unknown,
): HoneycombFabricClass | null {
  const normalized = compact(value);
  if (!normalized) return null;
  if (normalized.includes("fr essentials")) return "fr_essentials";
  if (normalized.includes("flame resistant")) return "flame_resistant";
  if (normalized.includes("ashton")) return "designer_ashton";
  if (
    normalized.includes("designer") &&
    (normalized.includes("room darkening") || /\brd\b/.test(normalized))
  )
    return "designer_rd";
  if (normalized.includes("designer")) return "designer_lf";
  if (normalized.includes("breeze")) return "breeze";
  if (normalized.includes("windsong")) return "windsong";
  if (normalized.includes("solus")) return "solus";
  if (normalized.includes("sheer")) return "sheer";
  if (normalized.includes("room darkening") || normalized === "rd")
    return "room_darkening";
  if (normalized.includes("light filtering") || normalized === "lf")
    return "light_filtering";
  return null;
}

export function normalizeHoneycombSystem(
  context: SelectionContext,
): HoneycombSystem | null {
  const application = compact(
    stringConfig(context, "application", "honeycomb_application"),
  );
  const lift = compact(
    stringConfig(context, "honeycomb_operating_system", "lift_system"),
  );
  const powerSource = compact(
    stringConfig(context, "motor_type", "power_source"),
  );
  const combined = `${application} ${lift}`;
  if (application.includes("specialty shape")) return "specialty_shape";
  if (
    application.includes("patio door vertical") &&
    application.includes("day night")
  )
    return "patio_door_vertical_day_night";
  if (application.includes("patio door vertical")) return "patio_door_vertical";
  if (
    combined.includes("smartfit") &&
    combined.includes("sloped") &&
    combined.includes("frame")
  )
    return "smartfit_sloped_frame";
  if (
    combined.includes("smartfit") &&
    combined.includes("dual") &&
    combined.includes("frame")
  )
    return "smartfit_dual_frame";
  if (combined.includes("smartfit") && combined.includes("frame"))
    return "smartfit_frame";
  if (combined.includes("smartfit") && combined.includes("sloped"))
    return "smartfit_sloped";
  if (combined.includes("smartfit") && combined.includes("dual"))
    return "smartfit_dual";
  if (combined.includes("smartfit")) return "smartfit";
  if (combined.includes("motorized skylight")) return "motorized_skylight";
  if (
    combined.includes("motor") &&
    (combined.includes("autowand") || powerSource.includes("autowand"))
  )
    return "autowand_motorized_bottom_up";
  if (combined.includes("motor") && powerSource.includes("automate")) {
    return combined.includes("top down") || combined.endsWith(" td")
      ? "motorized_top_down"
      : "motorized_bottom_up";
  }
  if (
    combined.includes("motor") &&
    (powerSource.includes("charging wand") ||
      powerSource.includes("ac adapter") ||
      powerSource.includes("dc low voltage"))
  ) {
    if (combined.includes("day night")) return "smart_motorized_day_night";
    if (combined.includes("tdbu")) return "smart_motorized_tdbu";
    return "smart_motorized_bottom_up";
  }
  if (
    combined.includes("norman smart motorized") &&
    combined.includes("day night")
  )
    return "smart_motorized_day_night";
  if (combined.includes("norman smart motorized") && combined.includes("tdbu"))
    return "smart_motorized_tdbu";
  if (combined.includes("norman smart motorized"))
    return "smart_motorized_bottom_up";
  if (combined.includes("motorized") && combined.includes("top down"))
    return "motorized_top_down";
  if (combined.includes("motorized")) return "motorized_bottom_up";
  if (combined.includes("woven") && combined.includes("tdbu"))
    return "woven_cordless_tdbu";
  if (combined.includes("woven") && combined.includes("cordless"))
    return "woven_cordless";
  if (combined.includes("smartrelease")) return "smartrelease";
  if (combined.includes("cord loop") && combined.includes("day night"))
    return "cord_loop_day_night";
  if (
    combined.includes("cord loop") &&
    (combined.includes(" top down") || combined.endsWith(" td"))
  )
    return "cord_loop_td";
  if (combined.includes("cord loop")) return "cord_loop";
  if (combined.includes("cordless") && combined.includes("day night"))
    return "cordless_day_night";
  if (combined.includes("cordless") && combined.includes("tdbu"))
    return "cordless_tdbu";
  if (combined.includes("smartrise") || combined.includes("cordless"))
    return "smartrise_cordless";
  return null;
}

function selectedFabricClass(
  context: SelectionContext,
  rear = false,
): HoneycombFabricClass | null {
  const prefix = rear ? "rear_" : "";
  return normalizeHoneycombFabricClass(
    stringConfig(
      context,
      `${prefix}fabric_class`,
      `${prefix}fabric_collection`,
      `${prefix}fabric_family`,
    ),
  );
}

export type HoneycombMatrixResolution =
  | {
      readonly ok: true;
      readonly system: HoneycombSystem;
      readonly cell: HoneycombCellSize;
      readonly fabricClass: HoneycombFabricClass;
      readonly profile: HoneycombDimensionProfile;
    }
  | {
      readonly ok: false;
      readonly code:
        | "SYSTEM_REQUIRED"
        | "CELL_REQUIRED"
        | "FABRIC_CLASS_REQUIRED"
        | "SYSTEM_CELL_INELIGIBLE"
        | "FABRIC_CELL_INELIGIBLE"
        | "SYSTEM_FABRIC_INELIGIBLE"
        | "PROFILE_NOT_FOUND"
        | "MOTORIZATION_SOURCE_INCOMPLETE";
      readonly message: string;
      readonly page: number;
      readonly sourceId?: SourceManifestId;
    };

export function resolveHoneycombMatrixProfile(
  context: SelectionContext,
): HoneycombMatrixResolution {
  const system = normalizeHoneycombSystem(context);
  if (!system)
    return {
      ok: false,
      code: "SYSTEM_REQUIRED",
      message:
        "Select one documented Honeycomb application and operating system.",
      page: 5,
    };
  const cell = normalizeHoneycombCellSize(stringConfig(context, "cell_size"));
  if (!cell)
    return {
      ok: false,
      code: "CELL_REQUIRED",
      message: "Select one exact documented Honeycomb cell size.",
      page: 8,
    };
  const fabricClass = selectedFabricClass(context);
  if (!fabricClass)
    return {
      ok: false,
      code: "FABRIC_CLASS_REQUIRED",
      message:
        "The exact selected fabric family does not resolve to a documented Honeycomb fabric class.",
      page: 9,
    };
  if (!SYSTEM_CELL_COMPATIBILITY[system].includes(cell))
    return {
      ok: false,
      code: "SYSTEM_CELL_INELIGIBLE",
      message:
        "The selected cell size is not offered for this Honeycomb operating system/application.",
      page: 8,
    };
  if (!FABRIC_CELL_COMPATIBILITY[fabricClass].includes(cell))
    return {
      ok: false,
      code: "FABRIC_CELL_INELIGIBLE",
      message: "The selected fabric class is not produced in this cell size.",
      page: 8,
    };
  if (!SYSTEM_FABRIC_COMPATIBILITY[system].includes(fabricClass))
    return {
      ok: false,
      code: "SYSTEM_FABRIC_INELIGIBLE",
      message:
        "The selected fabric class is not offered for this Honeycomb operating system/application.",
      page: 9,
    };
  if (
    system === "motorized_bottom_up" ||
    system === "motorized_top_down" ||
    system === "smart_motorized_bottom_up" ||
    system === "smart_motorized_tdbu" ||
    system === "smart_motorized_day_night" ||
    system === "motorized_skylight" ||
    system === "autowand_motorized_bottom_up"
  ) {
    const motorization = resolveNormanShadeMotorization(context);
    const motorLimits = motorization?.limits?.[0];
    if (motorLimits) {
      return {
        ok: true,
        system,
        cell,
        fabricClass,
        profile: {
          id: motorLimits.id,
          system,
          cells: [cell],
          fabricClasses: [fabricClass],
          limits: {
            minWidth: motorLimits.minWidth,
            maxWidth: motorLimits.maxWidth,
            minHeight: motorLimits.minHeight,
            maxHeight: motorLimits.maxHeight,
            ...(motorLimits.maxAreaSqFt === undefined
              ? {}
              : { maxAreaSqFt: motorLimits.maxAreaSqFt }),
          },
          sourcePage: motorLimits.sourcePage,
          sourceId: NORMAN_MOTORIZATION_SOURCE_ID,
        },
      };
    }
    return {
      ok: false,
      code: "MOTORIZATION_SOURCE_INCOMPLETE",
      message:
        motorization && !motorization.ok && motorization.issues[0]
          ? motorization.issues[0].explanation
          : "Select an exact Motorization Guide-backed power and control configuration before this Honeycomb branch can be priced.",
      page: 9,
      sourceId: NORMAN_MOTORIZATION_SOURCE_ID,
    };
  }
  if (system === "specialty_shape") {
    return {
      ok: true,
      system,
      cell,
      fabricClass,
      profile: {
        id: "specialty-shape-envelope",
        system,
        cells: SYSTEM_CELL_COMPATIBILITY.specialty_shape,
        limits: { minWidth: 5, maxWidth: 96, minHeight: 5, maxHeight: 48 },
        sourcePage: 39,
      },
    };
  }
  const candidates = HONEYCOMB_DIMENSION_PROFILES.filter(
    (profile) =>
      profile.system === system &&
      profile.cells.includes(cell) &&
      (!profile.fabricClasses || profile.fabricClasses.includes(fabricClass)),
  );
  const exactFabric = candidates.find((profile) =>
    profile.fabricClasses?.includes(fabricClass),
  );
  const profile =
    exactFabric ?? candidates.find((candidate) => !candidate.fabricClasses);
  if (!profile)
    return {
      ok: false,
      code: "PROFILE_NOT_FOUND",
      message:
        "No source-backed Honeycomb size row matches this exact system, cell, and fabric class.",
      page: 5,
    };
  return { ok: true, system, cell, fabricClass, profile };
}

export type HoneycombDimensionFailure =
  "min_width" | "max_width" | "min_height" | "max_height" | "max_area";

export function evaluateHoneycombDimensionLimits(
  limits: HoneycombDimensionLimits,
  widthInches: number,
  heightInches: number,
): readonly HoneycombDimensionFailure[] {
  const failures: HoneycombDimensionFailure[] = [];
  if (widthInches < limits.minWidth) failures.push("min_width");
  if (widthInches > limits.maxWidth) failures.push("max_width");
  if (heightInches < limits.minHeight) failures.push("min_height");
  if (heightInches > limits.maxHeight) failures.push("max_height");
  if (
    limits.maxAreaSqFt !== undefined &&
    (widthInches * heightInches) / 144 > limits.maxAreaSqFt
  )
    failures.push("max_area");
  return failures;
}

function issue(
  ruleId: string,
  page: number | readonly number[],
  selectedValues: SelectionRecord,
  explanation: string,
  severity: ValidationIssue["severity"] = "hard_block",
  derivedValues?: SelectionRecord,
  sourceId: SourceManifestId = HONEYCOMB_GUIDE_SOURCE_ID,
): ValidationIssue {
  const location = typeof page === "number" ? { page } : { pages: page };
  return {
    severity,
    ruleId,
    source: sourceProvenance(sourceId, location),
    selectedValues,
    explanation,
    ...(derivedValues ? { derivedValues } : {}),
  };
}

function baseSelected(context: SelectionContext): SelectionRecord {
  return {
    widthInches: context.widthInches,
    heightInches: context.heightInches,
    application: context.configuration.application ?? null,
    lift_system: context.configuration.lift_system ?? null,
    cell_size: context.configuration.cell_size ?? null,
    fabric_collection: context.configuration.fabric_collection ?? null,
  };
}

function validateDimensionProfile(
  context: SelectionContext,
  profile: HoneycombDimensionProfile,
): ValidationIssue[] {
  return evaluateHoneycombDimensionLimits(
    profile.limits,
    context.widthInches,
    context.heightInches,
  ).map((failure) => {
    const labels: Record<HoneycombDimensionFailure, string> = {
      min_width: `Width is below ${profile.limits.minWidth} inches.`,
      max_width: `Width exceeds ${profile.limits.maxWidth} inches.`,
      min_height: `Height is below ${profile.limits.minHeight} inches.`,
      max_height: `Height exceeds ${profile.limits.maxHeight} inches.`,
      max_area: `Area exceeds ${profile.limits.maxAreaSqFt} square feet.`,
    };
    return issue(
      `honeycomb.matrix.${profile.id}.${failure}`,
      profile.sourcePage,
      { ...baseSelected(context), profileId: profile.id, ...profile.limits },
      labels[failure],
      "hard_block",
      undefined,
      profile.sourceId,
    );
  });
}

function validateConditionalLimits(
  context: SelectionContext,
  system: HoneycombSystem,
  fabricClass: HoneycombFabricClass,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (
    system === "smartrise_cordless" &&
    context.heightInches > 86 &&
    context.widthInches < 25
  ) {
    issues.push(
      issue(
        "honeycomb.matrix.smartrise_tall_min_width",
        5,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          thresholdHeight: 86,
          minWidth: 25,
        },
        "SmartRise Cordless shades over 86 inches high require at least 25 inches of width.",
      ),
    );
  }
  if (
    system === "cordless_tdbu" &&
    context.heightInches > 86 &&
    context.widthInches < 30
  ) {
    issues.push(
      issue(
        "honeycomb.matrix.tdbu_tall_min_width",
        5,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          thresholdHeight: 86,
          minWidth: 30,
        },
        "Cordless TDBU shades over 86 inches high require at least 30 inches of width.",
      ),
    );
  }
  if (
    (system === "cord_loop_td" || system === "cord_loop_day_night") &&
    context.heightInches > 72 &&
    context.widthInches < 30
  ) {
    issues.push(
      issue(
        "honeycomb.matrix.cord_loop_td_day_night_tall_min_width",
        5,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          thresholdHeight: 72,
          minWidth: 30,
        },
        "Cord Loop TD and Day & Night shades over 72 inches high require at least 30 inches of width.",
      ),
    );
  }
  if (
    (system === "woven_cordless" || system === "woven_cordless_tdbu") &&
    ["windsong", "breeze", "designer_ashton"].includes(fabricClass) &&
    context.widthInches <= 19 &&
    context.heightInches > 62
  ) {
    issues.push(
      issue(
        "honeycomb.matrix.woven_narrow_max_height",
        5,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          thresholdWidth: 19,
          maxHeight: 62,
        },
        "Woven Cordless shades 19 inches wide or narrower cannot exceed 62 inches high.",
      ),
    );
  }
  if (
    ["windsong", "breeze", "designer_ashton"].includes(fabricClass) &&
    (context.widthInches > 86 || context.heightInches > 86)
  ) {
    issues.push(
      issue(
        "honeycomb.matrix.woven_ashton_86_envelope",
        5,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          maxWidth: 86,
          maxHeight: 86,
        },
        "Woven fabrics and Designer Ashton cannot exceed 86 by 86 inches.",
      ),
    );
  }
  if (
    fabricClass === "flame_resistant" &&
    (system === "patio_door_vertical" ||
      system === "patio_door_vertical_day_night") &&
    context.heightInches > 96
  ) {
    issues.push(
      issue(
        "honeycomb.matrix.vertical_fr_max_height",
        5,
        { heightInches: context.heightInches, maxHeight: 96 },
        "Patio Door Vertical using 3/4-inch Flame Resistant fabric cannot exceed 96 inches high.",
      ),
    );
  }
  return issues;
}

function validateMountAndSideBySide(
  context: SelectionContext,
  system: HoneycombSystem,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const installation = compact(
    stringConfig(context, "installation_method", "bracket_installation"),
  );
  const mount = compact(stringConfig(context, "mount_type"));
  if (installation.includes("side mount")) {
    const allowed: HoneycombSystem[] = [
      "smartrise_cordless",
      "cordless_tdbu",
      "cordless_day_night",
      "woven_cordless",
      "woven_cordless_tdbu",
      "cord_loop",
      "cord_loop_td",
      "cord_loop_day_night",
      "smartrelease",
      "motorized_bottom_up",
      "motorized_top_down",
      "smart_motorized_bottom_up",
      "smart_motorized_tdbu",
      "smart_motorized_day_night",
      "autowand_motorized_bottom_up",
      "patio_door_vertical",
      "patio_door_vertical_day_night",
    ];
    if (!mount.includes("inside"))
      issues.push(
        issue(
          "honeycomb.matrix.side_mount.inside_only",
          6,
          {
            mount_type: stringConfig(context, "mount_type"),
            installation_method: stringConfig(context, "installation_method"),
          },
          "Side Mount installation is available only for inside-mount windows.",
        ),
      );
    if (!allowed.includes(system))
      issues.push(
        issue(
          "honeycomb.matrix.side_mount.system_ineligible",
          6,
          { system },
          "This Honeycomb system is marked N/A for Side Mount installation.",
        ),
      );
    if (context.widthInches > 37)
      issues.push(
        issue(
          "honeycomb.matrix.side_mount.max_width",
          6,
          { widthInches: context.widthInches, maxWidth: 37 },
          "A true Side Mount installation cannot exceed 37 inches; wider shades require regular support brackets and are not side-mounted.",
        ),
      );
  }

  if (booleanConfig(context, "side_by_side") === true) {
    const prohibited =
      system.includes("motorized") ||
      system === "motorized_skylight" ||
      system === "smartfit_frame" ||
      system === "smartfit_dual_frame" ||
      system === "smartfit_sloped" ||
      system === "smartfit_sloped_frame";
    if (prohibited)
      issues.push(
        issue(
          "honeycomb.matrix.side_by_side.system_ineligible",
          15,
          { system },
          "Side by Side is unavailable for motorized, SmartFit with Frame, and SmartFit for Sloped Windows applications.",
        ),
      );
    const matchValue = context.configuration.side_by_side_matches;
    const matches =
      matchValue && typeof matchValue === "object" && !Array.isArray(matchValue)
        ? (matchValue as Readonly<Record<string, SelectionValue>>)
        : null;
    const required = [
      "mount_type",
      "lift_system",
      "fabric_color",
      "shade_height",
      "cell_size",
    ];
    const missing = required.filter((key) => matches?.[key] !== true);
    if (missing.length)
      issues.push(
        issue(
          "honeycomb.matrix.side_by_side.exact_match_required",
          15,
          { missingMatchConfirmations: missing },
          "Side-by-side shades must be ordered together and match mount, lift system, exact fabric color, shade height, and cell size without exception.",
        ),
      );
  }
  return issues;
}

interface TwoOnOneProfile {
  readonly id: string;
  readonly system: HoneycombSystem;
  readonly cells: readonly HoneycombCellSize[];
  readonly fabrics?: readonly HoneycombFabricClass[];
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly maxPerShadeWidth: number;
  readonly maxPerShadeAreaSqFt: number;
}

export const HONEYCOMB_TWO_ON_ONE_PROFILES: readonly TwoOnOneProfile[] = [
  {
    id: "smartrise-small",
    system: "smartrise_cordless",
    cells: SMALL_CELLS,
    minWidth: 23.25,
    maxWidth: 120,
    minHeight: 10,
    maxHeight: 120,
    maxPerShadeWidth: 96,
    maxPerShadeAreaSqFt: 80,
  },
  {
    id: "smartrise-large",
    system: "smartrise_cordless",
    cells: LARGE_SMARTRISE_CELLS,
    minWidth: 23.25,
    maxWidth: 120,
    minHeight: 10,
    maxHeight: 120,
    maxPerShadeWidth: 108,
    maxPerShadeAreaSqFt: 90,
  },
  {
    id: "smartrise-solus",
    system: "smartrise_cordless",
    cells: ["3_4_single", "1_1_4_single"],
    fabrics: ["solus"],
    minWidth: 31.25,
    maxWidth: 120,
    minHeight: 10,
    maxHeight: 120,
    maxPerShadeWidth: 108,
    maxPerShadeAreaSqFt: 90,
  },
  {
    id: "smartrise-fr-3-8",
    system: "smartrise_cordless",
    cells: ["3_8_single"],
    fabrics: ["flame_resistant"],
    minWidth: 50.25,
    maxWidth: 120,
    minHeight: 10,
    maxHeight: 120,
    maxPerShadeWidth: 96,
    maxPerShadeAreaSqFt: 80,
  },
  {
    id: "smartrise-fr-3-4",
    system: "smartrise_cordless",
    cells: ["3_4_single"],
    fabrics: ["flame_resistant"],
    minWidth: 50.25,
    maxWidth: 120,
    minHeight: 10,
    maxHeight: 120,
    maxPerShadeWidth: 108,
    maxPerShadeAreaSqFt: 90,
  },
  {
    id: "cord-loop",
    system: "cord_loop",
    cells: ALL_CELLS,
    minWidth: 31.25,
    maxWidth: 120,
    minHeight: 12,
    maxHeight: 144,
    maxPerShadeWidth: 120,
    maxPerShadeAreaSqFt: 80,
  },
  {
    id: "woven-cordless",
    system: "woven_cordless",
    cells: ["3_4_single", "1_1_4_single"],
    fabrics: WOVEN_CLASSES,
    minWidth: 31.25,
    maxWidth: 120,
    minHeight: 10,
    maxHeight: 86,
    maxPerShadeWidth: 86,
    maxPerShadeAreaSqFt: 51.36,
  },
] as const;

function validateTwoOnOne(
  context: SelectionContext,
  system: HoneycombSystem,
  cell: HoneycombCellSize,
  fabricClass: HoneycombFabricClass,
): ValidationIssue[] {
  if (
    !compact(
      stringConfig(context, "shade_type", "honeycomb_unit_type"),
    ).includes("2 on 1")
  )
    return [];
  const candidates = HONEYCOMB_TWO_ON_ONE_PROFILES.filter(
    (profile) =>
      profile.system === system &&
      profile.cells.includes(cell) &&
      (!profile.fabrics || profile.fabrics.includes(fabricClass)),
  );
  const profile =
    candidates.find((candidate) => candidate.fabrics?.includes(fabricClass)) ??
    candidates.find((candidate) => !candidate.fabrics);
  if (!profile)
    return [
      issue(
        "honeycomb.matrix.two_on_one.configuration_ineligible",
        [6, 15],
        { system, cell, fabricClass },
        "2-on-1 is documented only for Cord Loop, Cordless, and Woven Cordless configurations in the source table.",
      ),
    ];
  const issues: ValidationIssue[] = [];
  const limits = {
    minWidth: profile.minWidth,
    maxWidth: profile.maxWidth,
    minHeight: profile.minHeight,
    maxHeight: profile.maxHeight,
  };
  for (const failure of evaluateHoneycombDimensionLimits(
    limits,
    context.widthInches,
    context.heightInches,
  ))
    issues.push(
      issue(
        `honeycomb.matrix.two_on_one.${profile.id}.${failure}`,
        6,
        { ...baseSelected(context), profileId: profile.id, ...limits },
        `The 2-on-1 whole-unit ${failure.replaceAll("_", " ")} boundary is violated.`,
      ),
    );
  if (
    system === "smartrise_cordless" &&
    context.heightInches > 86 &&
    context.widthInches < 50.25
  )
    issues.push(
      issue(
        "honeycomb.matrix.two_on_one.smartrise_tall_min_width",
        6,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          minWidth: 50.25,
          thresholdHeight: 86,
        },
        "A SmartRise 2-on-1 unit over 86 inches high requires at least 50 1/4 inches total width.",
      ),
    );
  const widths = numberArray(
    context.configuration.honeycomb_component_net_widths,
  );
  if (widths.length !== 2)
    return [
      ...issues,
      issue(
        "honeycomb.matrix.two_on_one.component_widths_required",
        6,
        { honeycomb_component_net_widths: widths },
        "Both shade net widths are required to enforce each-shade limits; the guide does not permit deriving them from whole-unit width and gap/deduction data.",
      ),
    ];
  widths.forEach((width, index) => {
    if (width > profile.maxPerShadeWidth)
      issues.push(
        issue(
          "honeycomb.matrix.two_on_one.max_per_shade_width",
          6,
          {
            component: index + 1,
            widthInches: width,
            maxWidth: profile.maxPerShadeWidth,
          },
          `2-on-1 shade ${index + 1} exceeds the documented per-shade width.`,
        ),
      );
    const area = (width * context.heightInches) / 144;
    if (area > profile.maxPerShadeAreaSqFt)
      issues.push(
        issue(
          "honeycomb.matrix.two_on_one.max_per_shade_area",
          6,
          {
            component: index + 1,
            areaSqFt: area,
            maxAreaSqFt: profile.maxPerShadeAreaSqFt,
          },
          `2-on-1 shade ${index + 1} exceeds the documented per-shade area.`,
        ),
      );
    if (
      system === "smartrise_cordless" &&
      context.heightInches > 86 &&
      width < 25
    )
      issues.push(
        issue(
          "honeycomb.matrix.two_on_one.smartrise_tall_per_shade_min_width",
          6,
          {
            component: index + 1,
            widthInches: width,
            minWidth: 25,
            thresholdHeight: 86,
          },
          `SmartRise component ${index + 1} over 86 inches high must be at least 25 inches wide.`,
        ),
      );
  });
  return issues;
}

function normalizedMount(
  context: SelectionContext,
): "inside" | "outside" | null {
  const mount = compact(stringConfig(context, "mount_type"));
  if (mount.includes("inside") || mount === "ib") return "inside";
  if (mount.includes("outside") || mount === "ob") return "outside";
  return null;
}

function resolveFrameProfile(frameType: string): HoneycombFrameProfile | null {
  const normalized = compact(frameType);
  return (
    HONEYCOMB_FRAME_PROFILES.find((profile) =>
      profile.frameAliases.some(
        (alias) => normalized === alias || normalized.includes(alias),
      ),
    ) ?? null
  );
}

function validateFrame(
  context: SelectionContext,
  system: HoneycombSystem,
  panelProfile: HoneycombDimensionProfile,
): ValidationIssue[] {
  if (
    ![
      "smartfit_frame",
      "smartfit_dual_frame",
      "smartfit_sloped_frame",
    ].includes(system)
  )
    return [];
  const issues: ValidationIssue[] = [];
  const frameType = stringConfig(context, "frame_type", "honeycomb_frame_type");
  const mount = normalizedMount(context);
  if (system === "smartfit_sloped_frame") {
    const normalized = compact(frameType);
    const lFrame = normalized.includes("beaded l frame");
    const zFrame =
      normalized.includes("2 belair z frame") ||
      normalized.includes("2 bullnose z frame");
    if (!lFrame && !zFrame)
      issues.push(
        issue(
          "honeycomb.matrix.sloped_frame.frame_ineligible",
          35,
          { frame_type: frameType || null },
          "Sloped SmartFit with Frame permits only Beaded L, 2-inch Belair Z, or 2-inch Bullnose Z frames.",
        ),
      );
    if (zFrame && mount !== "inside")
      issues.push(
        issue(
          "honeycomb.matrix.sloped_frame.z_inside_only",
          35,
          {
            frame_type: frameType,
            mount_type: stringConfig(context, "mount_type"),
          },
          "Sloped Z frames are inside-mount only.",
        ),
      );
    if (
      booleanConfig(context, "sill_plate") === true ||
      (numberConfig(context, "t_post_count") ?? 0) > 0
    )
      issues.push(
        issue(
          "honeycomb.matrix.sloped_frame.tpost_sill_excluded",
          35,
          {
            t_post_count: numberConfig(context, "t_post_count"),
            sill_plate: booleanConfig(context, "sill_plate"),
          },
          "T-posts and sill plates are not available for Sloped SmartFit with Frame.",
        ),
      );
    const frameLimits: HoneycombDimensionLimits = lFrame
      ? { minWidth: 10.5, maxWidth: 60.875, minHeight: 7.75, maxHeight: 121.75 }
      : { minWidth: 12.625, maxWidth: 63.125, minHeight: 10, maxHeight: 124 };
    for (const failure of evaluateHoneycombDimensionLimits(
      frameLimits,
      context.widthInches,
      context.heightInches,
    ))
      issues.push(
        issue(
          `honeycomb.matrix.sloped_frame.${failure}`,
          35,
          { ...baseSelected(context), ...frameLimits },
          `Sloped frame-to-frame ${failure.replaceAll("_", " ")} boundary is violated.`,
        ),
      );
    if (Math.max(context.widthInches, context.heightInches) > 120)
      issues.push(
        issue(
          "honeycomb.matrix.sloped_frame.splice_derived",
          35,
          {
            widthInches: context.widthInches,
            heightInches: context.heightInches,
          },
          "The frame will be split when its length exceeds 120 inches.",
          "auto_derive",
          { frame_splice_required: true },
        ),
      );
  } else {
    const profile = resolveFrameProfile(frameType);
    const tPostCount = numberConfig(
      context,
      "t_post_count",
      "honeycomb_t_post_count",
    );
    if (!profile)
      return [
        issue(
          "honeycomb.matrix.frame.type_required",
          [19, 20, 33],
          { frame_type: frameType || null },
          "Select one exact documented SmartFit frame type.",
        ),
      ];
    if (
      tPostCount === null ||
      !Number.isInteger(tPostCount) ||
      tPostCount < 0 ||
      tPostCount > 3
    )
      return [
        issue(
          "honeycomb.matrix.frame.tpost_count_required",
          [20, 27],
          { t_post_count: tPostCount },
          "T-post count must be an explicit whole number from 0 through 3.",
        ),
      ];
    const z = compact(frameType).includes(" z frame");
    const deco = compact(frameType).includes("deco frame");
    if ((z && mount !== "inside") || (deco && mount !== "outside"))
      issues.push(
        issue(
          "honeycomb.matrix.frame.mount_ineligible",
          33,
          {
            frame_type: frameType,
            mount_type: stringConfig(context, "mount_type"),
          },
          z
            ? "Z frames are inside-mount only."
            : "Deco frames are outside-mount only.",
        ),
      );
    const frameLimits: HoneycombDimensionLimits = {
      minWidth: profile.minWidthsByTPostCount[tPostCount],
      maxWidth: profile.maxWidthsByTPostCount[tPostCount],
      minHeight:
        system === "smartfit_dual_frame"
          ? profile.minDualHeight
          : profile.minHeight,
      maxHeight: profile.maxHeight,
    };
    for (const failure of evaluateHoneycombDimensionLimits(
      frameLimits,
      context.widthInches,
      context.heightInches,
    ))
      issues.push(
        issue(
          `honeycomb.matrix.frame.${profile.id}.${tPostCount}.${failure}`,
          20,
          { ...baseSelected(context), frameType, tPostCount, ...frameLimits },
          `Frame-to-frame ${failure.replaceAll("_", " ")} boundary is violated.`,
        ),
      );
    if (context.widthInches > 120)
      issues.push(
        issue(
          "honeycomb.matrix.frame.splice_derived",
          27,
          { widthInches: context.widthInches, t_post_count: tPostCount },
          "Frames wider than 120 inches are split away from T-post locations.",
          "auto_derive",
          { frame_splice_required: true },
        ),
      );
    const sill = booleanConfig(context, "sill_plate") === true;
    if (sill && !z && !deco)
      issues.push(
        issue(
          "honeycomb.matrix.frame.sill_plate_ineligible",
          19,
          { frame_type: frameType, sill_plate: true },
          "Sill plates are optional only for Z and Deco frames.",
        ),
      );
    if (
      compact(frameType).includes("vintage l frame 3 4") &&
      booleanConfig(context, "frame_notch_out") !== true
    )
      issues.push(
        issue(
          "honeycomb.matrix.frame.notch_required",
          19,
          {
            frame_type: frameType,
            frame_notch_out: booleanConfig(context, "frame_notch_out"),
          },
          "Vintage L Frame with 3/4-inch light block is available only with the documented notch-out.",
        ),
      );
    if (booleanConfig(context, "frame_notch_out") === true) {
      const a = numberConfig(context, "frame_notch_a_inches");
      const b = numberConfig(context, "frame_notch_b_inches");
      if (
        !compact(frameType).includes("vintage l frame 3 4") ||
        a === null ||
        b === null ||
        a > 1.125 ||
        b > 0.5 ||
        a < 0 ||
        b < 0
      )
        issues.push(
          issue(
            "honeycomb.matrix.frame.notch_dimensions",
            19,
            {
              frame_type: frameType,
              frame_notch_a_inches: a,
              frame_notch_b_inches: b,
              maxA: 1.125,
              maxB: 0.5,
            },
            "Frame notch-out is allowed only on the 3/4-inch-light-block Vintage L frame, with A at most 1 1/8 inches and B at most 1/2 inch.",
          ),
        );
    }
  }
  const panelWidths = numberArray(
    context.configuration.honeycomb_panel_net_widths,
  );
  const panelHeights = numberArray(
    context.configuration.honeycomb_panel_net_heights,
  );
  const expected =
    system === "smartfit_sloped_frame"
      ? 1
      : (numberConfig(context, "t_post_count", "honeycomb_t_post_count") ??
          -1) + 1;
  if (
    expected < 1 ||
    panelWidths.length !== expected ||
    panelHeights.length !== expected
  )
    issues.push(
      issue(
        "honeycomb.matrix.frame.panel_net_sizes_required",
        [20, 34, 35],
        {
          expectedPanelCount: expected,
          honeycomb_panel_net_widths: panelWidths,
          honeycomb_panel_net_heights: panelHeights,
        },
        "Every shade between T-posts requires its actual net width and height; frame-to-frame dimensions cannot be used as a substitute.",
      ),
    );
  else
    panelWidths.forEach((width, index) => {
      const failures = evaluateHoneycombDimensionLimits(
        panelProfile.limits,
        width,
        panelHeights[index],
      );
      failures.forEach((failure) =>
        issues.push(
          issue(
            `honeycomb.matrix.frame.panel.${failure}`,
            panelProfile.sourcePage,
            {
              panel: index + 1,
              widthInches: width,
              heightInches: panelHeights[index],
              ...panelProfile.limits,
            },
            `Frame panel ${index + 1} violates its net-shade ${failure.replaceAll("_", " ")} limit.`,
          ),
        ),
      );
    });
  return issues;
}

function validateSlope(
  context: SelectionContext,
  system: HoneycombSystem,
): ValidationIssue[] {
  if (
    ![
      "smartfit",
      "smartfit_dual",
      "smartfit_sloped",
      "smartfit_sloped_frame",
    ].includes(system)
  )
    return [];
  const angle = numberConfig(context, "slope_angle_degrees");
  const sloped =
    system === "smartfit_sloped" || system === "smartfit_sloped_frame";
  const min = sloped ? (system === "smartfit_sloped_frame" ? 15 : 45) : 0;
  const max = sloped ? 90 : 15;
  if (angle === null || angle < min || angle > max)
    return [
      issue(
        "honeycomb.matrix.slope_angle",
        system === "smartfit_sloped_frame"
          ? 35
          : system === "smartfit_sloped"
            ? 17
            : 16,
        { slope_angle_degrees: angle, minAngle: min, maxAngle: max },
        `This SmartFit application requires an explicit slope angle from ${min} through ${max} degrees.`,
      ),
    ];
  return [];
}

function validateDayNight(
  context: SelectionContext,
  system: HoneycombSystem,
  frontClass: HoneycombFabricClass,
  frontCell: HoneycombCellSize,
): ValidationIssue[] {
  const dayNight =
    system === "cordless_day_night" ||
    system === "cord_loop_day_night" ||
    system === "smart_motorized_day_night" ||
    system === "smartfit_dual" ||
    system === "smartfit_dual_frame" ||
    system === "patio_door_vertical_day_night";
  if (!dayNight) {
    if (frontClass === "sheer" && frontCell === "9_16_single")
      return [
        issue(
          "honeycomb.matrix.sheer_9_16_day_night_only",
          8,
          { frontClass, frontCell },
          "9/16-inch Sheer fabric is available only as a Day & Night layer, never as a single shade.",
        ),
      ];
    return [];
  }
  const rearClass = selectedFabricClass(context, true);
  const rearCell = normalizeHoneycombCellSize(
    stringConfig(context, "rear_cell_size"),
  );
  if (!rearClass || !rearCell)
    return [
      issue(
        "honeycomb.matrix.day_night.exact_rear_required",
        [8, 9],
        {
          rear_fabric_collection:
            context.configuration.rear_fabric_collection ?? null,
          rear_cell_size: context.configuration.rear_cell_size ?? null,
        },
        "Day & Night requires an exact rear fabric class/color and cell size before compatibility can be established.",
      ),
    ];
  const issues: ValidationIssue[] = [];
  if (
    !FABRIC_CELL_COMPATIBILITY[rearClass].includes(rearCell) ||
    !SYSTEM_FABRIC_COMPATIBILITY[system].includes(rearClass)
  )
    issues.push(
      issue(
        "honeycomb.matrix.day_night.rear_ineligible",
        [8, 9],
        { system, rearClass, rearCell },
        "The rear Day & Night fabric/cell is unavailable for this application.",
      ),
    );
  if (system === "smartfit_dual" || system === "smartfit_dual_frame") {
    if (frontCell !== rearCell)
      issues.push(
        issue(
          "honeycomb.matrix.day_night.smartfit_same_cell",
          16,
          { frontCell, rearCell },
          "SmartFit Dual top and bottom shades must use the same cell size.",
        ),
      );
    return issues;
  }
  if (system === "patio_door_vertical_day_night") {
    if (frontCell !== rearCell)
      issues.push(
        issue(
          "honeycomb.matrix.day_night.vertical_same_cell",
          8,
          { frontCell, rearCell },
          "Vertical Day & Night left and right shades must use the same cell size.",
        ),
      );
    const light = new Set<HoneycombFabricClass>([
      "light_filtering",
      "designer_lf",
    ]);
    const dark = new Set<HoneycombFabricClass>([
      "room_darkening",
      "designer_rd",
    ]);
    const valid =
      (frontClass === "sheer" &&
        (light.has(rearClass) || dark.has(rearClass))) ||
      (rearClass === "sheer" &&
        (light.has(frontClass) || dark.has(frontClass))) ||
      (light.has(frontClass) &&
        (light.has(rearClass) || dark.has(rearClass))) ||
      (light.has(rearClass) && dark.has(frontClass));
    if (!valid)
      issues.push(
        issue(
          "honeycomb.matrix.day_night.vertical_pair",
          8,
          { frontClass, rearClass },
          "This left/right fabric-class pair is absent from the Vertical Day & Night combination table.",
        ),
      );
    return issues;
  }
  const topLayer = compact(
    stringConfig(context, "day_night_top_layer", "honeycomb_top_layer"),
  );
  if (topLayer !== "front" && topLayer !== "rear")
    return [
      ...issues,
      issue(
        "honeycomb.matrix.day_night.layer_position_required",
        8,
        {
          day_night_top_layer:
            stringConfig(context, "day_night_top_layer") || null,
        },
        "Identify whether the front or rear selection is the top layer so top-only and bottom-only fabric rules can be enforced.",
      ),
    ];
  const topClass = topLayer === "front" ? frontClass : rearClass;
  const bottomClass = topLayer === "front" ? rearClass : frontClass;
  if (
    (topClass === "room_darkening" || topClass === "designer_rd") &&
    (bottomClass === "room_darkening" || bottomClass === "designer_rd")
  )
    issues.push(
      issue(
        "honeycomb.matrix.day_night.room_darkening_pair",
        8,
        { topClass, bottomClass },
        "Room Darkening plus Room Darkening is prohibited.",
      ),
    );
  if (topClass === "sheer" && bottomClass === "sheer")
    issues.push(
      issue(
        "honeycomb.matrix.day_night.sheer_pair",
        8,
        { topClass, bottomClass },
        "Sheer plus Sheer is prohibited.",
      ),
    );
  if (topClass === "windsong" && bottomClass === "windsong")
    issues.push(
      issue(
        "honeycomb.matrix.day_night.windsong_pair",
        8,
        { topClass, bottomClass },
        "Windsong plus Windsong is prohibited.",
      ),
    );
  if (
    (topClass === "sheer" && bottomClass === "windsong") ||
    (topClass === "windsong" && bottomClass === "sheer")
  )
    issues.push(
      issue(
        "honeycomb.matrix.day_night.sheer_windsong_pair",
        8,
        { topClass, bottomClass },
        "Sheer plus Windsong is prohibited.",
      ),
    );
  if (["sheer", "windsong"].includes(bottomClass))
    issues.push(
      issue(
        "honeycomb.matrix.day_night.top_only_fabric",
        8,
        { topClass, bottomClass },
        "Sheer and Windsong are top-shade-only fabrics.",
      ),
    );
  if (topClass === "solus")
    issues.push(
      issue(
        "honeycomb.matrix.day_night.solus_bottom_only",
        8,
        { topClass, bottomClass },
        "Solus is a bottom-shade-only fabric.",
      ),
    );
  const lfRd =
    (topClass === "light_filtering" || topClass === "designer_lf") &&
    (bottomClass === "room_darkening" || bottomClass === "designer_rd");
  if (lfRd && !["3_4_single", "1_1_4_single"].includes(frontCell))
    issues.push(
      issue(
        "honeycomb.matrix.day_night.lf_rd_cell",
        8,
        { frontCell, topClass, bottomClass },
        "LF plus RD is offered only in 3/4-inch or 1 1/4-inch Single Cell.",
      ),
    );
  if (
    (frontCell === "1_2_double" &&
      rearClass === "sheer" &&
      rearCell !== "3_4_single") ||
    (rearCell === "1_2_double" &&
      frontClass === "sheer" &&
      frontCell !== "3_4_single") ||
    (frontCell === "3_4_double" &&
      rearClass === "sheer" &&
      rearCell !== "1_1_4_single") ||
    (rearCell === "3_4_double" &&
      frontClass === "sheer" &&
      frontCell !== "1_1_4_single")
  )
    issues.push(
      issue(
        "honeycomb.matrix.day_night.sheer_double_pairing",
        8,
        { frontClass, frontCell, rearClass, rearCell },
        "A 1/2-inch Double non-sheer pairs with 3/4-inch Single Sheer; a 3/4-inch Double pairs with 1 1/4-inch Single Sheer.",
      ),
    );
  if (frontClass !== "sheer" && rearClass !== "sheer" && frontCell !== rearCell)
    issues.push(
      issue(
        "honeycomb.matrix.day_night.same_cell",
        8,
        { frontCell, rearCell },
        "Top and bottom non-sheer shades must use the same cell size.",
      ),
    );
  return issues;
}

function validateVertical(
  context: SelectionContext,
  system: HoneycombSystem,
): ValidationIssue[] {
  if (
    system !== "patio_door_vertical" &&
    system !== "patio_door_vertical_day_night"
  )
    return [];
  const issues: ValidationIssue[] = [];
  const stacking = compact(
    stringConfig(context, "stacking_configuration", "vertical_stacking"),
  );
  const allowed = [
    "left stack",
    "right stack",
    "traveling center stack",
    "centre opening",
    "center opening",
    "split evenly",
    "custom split",
  ];
  if (!allowed.some((candidate) => stacking.includes(candidate)))
    issues.push(
      issue(
        "honeycomb.matrix.vertical.stacking_required",
        36,
        {
          stacking_configuration:
            stringConfig(context, "stacking_configuration") || null,
        },
        "Select one documented Patio Door Vertical stacking configuration.",
      ),
    );
  if (
    system === "patio_door_vertical_day_night" &&
    !stacking.includes("center opening") &&
    !stacking.includes("centre opening")
  )
    issues.push(
      issue(
        "honeycomb.matrix.vertical.day_night_center_opening",
        38,
        {
          stacking_configuration:
            stringConfig(context, "stacking_configuration") || null,
        },
        "Vertical Day & Night is available only as Center Opening.",
      ),
    );
  if (stacking.includes("custom split")) {
    const left = numberConfig(context, "vertical_left_width_inches");
    const right = numberConfig(context, "vertical_right_width_inches");
    if (left === null || right === null)
      issues.push(
        issue(
          "honeycomb.matrix.vertical.custom_split_widths_required",
          5,
          {
            vertical_left_width_inches: left,
            vertical_right_width_inches: right,
          },
          "Custom Split requires exact left and right shade widths.",
        ),
      );
    else {
      for (const [side, width] of [
        ["left", left],
        ["right", right],
      ] as const)
        if (width < 15 || width > 131)
          issues.push(
            issue(
              `honeycomb.matrix.vertical.custom_split_${side}_width`,
              5,
              { side, widthInches: width, minWidth: 15, maxWidth: 131 },
              `Custom Split ${side} side must be from 15 through 131 inches.`,
            ),
          );
      if (
        left + right > 146 ||
        Math.abs(left + right - context.widthInches) > 0.000001
      )
        issues.push(
          issue(
            "honeycomb.matrix.vertical.custom_split_total",
            5,
            {
              leftWidth: left,
              rightWidth: right,
              total: left + right,
              orderWidth: context.widthInches,
              maxWidth: 146,
            },
            "Custom Split sides must reconcile exactly to order width and cannot total more than 146 inches.",
          ),
        );
    }
  }
  const mount = normalizedMount(context);
  if (mount && context.widthInches >= 97.625) {
    const threshold =
      mount === "outside"
        ? context.heightInches - 2.1875
        : context.heightInches - 2.3125;
    if (context.widthInches > threshold)
      issues.push(
        issue(
          "honeycomb.matrix.vertical.headrail_splice_derived",
          [5, 37],
          {
            mount_type: mount,
            widthInches: context.widthInches,
            heightInches: context.heightInches,
            thresholdWidth: threshold,
          },
          "The documented width/height condition requires an evenly spliced vertical headrail.",
          "auto_derive",
          { vertical_headrail_splice_required: true },
        ),
      );
  }
  return issues;
}

function validateSpecialtyShape(
  context: SelectionContext,
  system: HoneycombSystem,
): ValidationIssue[] {
  if (system !== "specialty_shape") return [];
  const issues: ValidationIssue[] = [];
  const shape = compact(stringConfig(context, "specialty_shape"));
  const mount = normalizedMount(context);
  if (mount !== "inside")
    issues.push(
      issue(
        "honeycomb.matrix.specialty.inside_only",
        39,
        { mount_type: stringConfig(context, "mount_type") || null },
        "Honeycomb Specialty Shapes are inside-mount only.",
      ),
    );
  if (stringConfig(context, "template_id", "template_reference"))
    issues.push(
      issue(
        "honeycomb.matrix.specialty.templates_not_accepted",
        39,
        {
          template_reference: stringConfig(
            context,
            "template_id",
            "template_reference",
          ),
        },
        "The guide explicitly states that templates are not accepted for Honeycomb Specialty Shapes.",
      ),
    );
  if (!booleanConfig(context, "non_operable"))
    issues.push(
      issue(
        "honeycomb.matrix.specialty.non_operable",
        39,
        { non_operable: booleanConfig(context, "non_operable") },
        "All Honeycomb Specialty Shapes are non-operable.",
      ),
    );
  const wide =
    shape.includes("perfect arch") ||
    shape === "eyebrow" ||
    shape.includes("elongated eyebrow") ||
    shape === "triangle";
  const limits: HoneycombDimensionLimits = wide
    ? { minWidth: 10, maxWidth: 96, minHeight: 5, maxHeight: 48 }
    : { minWidth: 5, maxWidth: 48, minHeight: 5, maxHeight: 48 };
  const documented =
    wide ||
    shape.includes("quarter round") ||
    shape.includes("angle top") ||
    shape.includes("arch on top") ||
    shape.includes("half eyebrow");
  if (!documented)
    return [
      ...issues,
      issue(
        "honeycomb.matrix.specialty.shape_required",
        39,
        { specialty_shape: stringConfig(context, "specialty_shape") || null },
        "Select one of the eight documented Honeycomb Specialty Shape families and its left/right orientation where applicable.",
      ),
    ];
  for (const failure of evaluateHoneycombDimensionLimits(
    limits,
    context.widthInches,
    context.heightInches,
  ))
    issues.push(
      issue(
        `honeycomb.matrix.specialty.${failure}`,
        39,
        { ...baseSelected(context), shape, ...limits },
        `Specialty shape ${failure.replaceAll("_", " ")} boundary is violated.`,
      ),
    );
  const close = (a: number, b: number) => Math.abs(a - b) <= 0.000001;
  if (
    shape.includes("perfect arch") &&
    !close(context.heightInches, context.widthInches / 2)
  )
    issues.push(
      issue(
        "honeycomb.matrix.specialty.perfect_arch_ratio",
        39,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          requiredHeight: context.widthInches / 2,
        },
        "Perfect Arch height must equal exactly half its width.",
      ),
    );
  if (shape === "eyebrow" && !(context.heightInches < context.widthInches / 2))
    issues.push(
      issue(
        "honeycomb.matrix.specialty.eyebrow_ratio",
        39,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          maxExclusiveHeight: context.widthInches / 2,
        },
        "Eyebrow height must be less than half its width.",
      ),
    );
  if (
    shape.includes("quarter round") &&
    !close(context.widthInches, context.heightInches)
  )
    issues.push(
      issue(
        "honeycomb.matrix.specialty.quarter_round_ratio",
        39,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
        },
        "Quarter Round width and height must be equal.",
      ),
    );
  if (
    shape.includes("half eyebrow") &&
    !(context.heightInches < context.widthInches)
  )
    issues.push(
      issue(
        "honeycomb.matrix.specialty.half_eyebrow_ratio",
        39,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
        },
        "Half Eyebrow height must be less than its width.",
      ),
    );
  if (shape.includes("elongated eyebrow")) {
    const left = numberConfig(context, "left_leg_height_inches");
    const right = numberConfig(context, "right_leg_height_inches");
    if (
      left === null ||
      right === null ||
      !close(left, right) ||
      left < 1 ||
      left >= context.heightInches ||
      context.heightInches - left < 5 ||
      context.heightInches - left > context.widthInches / 2
    )
      issues.push(
        issue(
          "honeycomb.matrix.specialty.elongated_eyebrow_legs",
          39,
          {
            leftLegHeight: left,
            rightLegHeight: right,
            widthInches: context.widthInches,
            heightInches: context.heightInches,
          },
          "Elongated Eyebrow leg heights must match, be at least 1 inch but below total height, and leave a rise of 5 inches through one-half width.",
        ),
      );
  }
  if (shape.includes("arch on top")) {
    const leg = numberConfig(context, "leg_height_inches");
    if (
      leg === null ||
      leg < 1 ||
      leg >= context.heightInches ||
      context.heightInches - leg < 5 ||
      context.heightInches - leg > context.widthInches
    )
      issues.push(
        issue(
          "honeycomb.matrix.specialty.arch_on_top_leg",
          39,
          {
            legHeight: leg,
            widthInches: context.widthInches,
            heightInches: context.heightInches,
          },
          "Arch-on-Top leg height must be at least 1 inch but below total height, and leave a rise from 5 inches through the shade width.",
        ),
      );
  }
  return issues;
}

function validateCutout(
  context: SelectionContext,
  system: HoneycombSystem,
  fabricClass: HoneycombFabricClass,
): ValidationIssue[] {
  if (booleanConfig(context, "cutout") !== true) return [];
  const issues: ValidationIssue[] = [];
  const type = compact(stringConfig(context, "cutout_type"));
  if (
    system === "patio_door_vertical" ||
    system === "patio_door_vertical_day_night"
  ) {
    const height = numberConfig(context, "cutout_height_inches");
    const rail = compact(stringConfig(context, "vertical_cutout_rail"));
    const stacking = compact(
      stringConfig(context, "stacking_configuration", "vertical_stacking"),
    );
    if (type && !type.includes("baseboard"))
      issues.push(
        issue(
          "honeycomb.matrix.cutout.vertical_baseboard_only",
          46,
          { cutout_type: stringConfig(context, "cutout_type") },
          "Vertical cut-outs are for baseboards only and affect rails, not fabric.",
        ),
      );
    if (height === null || height < 0 || height > 6)
      issues.push(
        issue(
          "honeycomb.matrix.cutout.vertical_height",
          46,
          { cutout_height_inches: height, minHeight: 0, maxHeight: 6 },
          "Vertical baseboard cut-out height cannot exceed 6 inches.",
        ),
      );
    const stationaryOnly =
      stacking.includes("center opening") ||
      system === "patio_door_vertical_day_night";
    const movingOnly = stacking.includes("traveling center");
    if (
      (stationaryOnly && rail !== "stationary") ||
      (movingOnly && rail !== "movable" && rail !== "moveable")
    )
      issues.push(
        issue(
          "honeycomb.matrix.cutout.vertical_rail",
          46,
          {
            stacking_configuration: stacking,
            vertical_cutout_rail: rail || null,
          },
          stationaryOnly
            ? "This stacking configuration permits a cut-out only on the stationary rail."
            : "Traveling Center Stack permits a cut-out only on the movable rail.",
        ),
      );
    return issues;
  }
  const excluded = [
    "cordless_tdbu",
    "cordless_day_night",
    "woven_cordless",
    "woven_cordless_tdbu",
    "cord_loop_td",
    "cord_loop_day_night",
    "smartfit",
    "smartfit_dual",
    "smartfit_sloped",
    "smartfit_frame",
    "smartfit_dual_frame",
    "smartfit_sloped_frame",
    "motorized_top_down",
    "smart_motorized_tdbu",
    "smart_motorized_day_night",
    "motorized_skylight",
    "specialty_shape",
  ] as readonly HoneycombSystem[];
  if (
    excluded.includes(system) ||
    ["windsong", "breeze", "designer_ashton"].includes(fabricClass)
  )
    return [
      issue(
        "honeycomb.matrix.cutout.configuration_ineligible",
        46,
        { system, fabricClass },
        "Horizontal cut-outs are unavailable for woven/Ashton, TD/TDBU, Day & Night, SmartFit, 2-on-1, Specialty Shape, and Motorized Skylight configurations.",
      ),
    ];
  if (
    compact(
      stringConfig(context, "shade_type", "honeycomb_unit_type"),
    ).includes("2 on 1")
  )
    return [
      issue(
        "honeycomb.matrix.cutout.two_on_one_ineligible",
        46,
        { shade_type: stringConfig(context, "shade_type") },
        "Cut-outs are unavailable on 2-on-1 Honeycomb shades.",
      ),
    ];
  const width = numberConfig(context, "cutout_width_inches");
  const height = numberConfig(context, "cutout_height_inches");
  const cordless = system === "smartrise_cordless";
  if (cordless && context.widthInches <= 16)
    return [
      issue(
        "honeycomb.matrix.cutout.cordless_width_ineligible",
        46,
        { shadeWidth: context.widthInches, minExclusiveWidth: 16 },
        "Cordless cut-outs are unavailable when shade width is 16 inches or less.",
      ),
    ];
  const maxWidth = cordless && context.widthInches <= 23.5 ? 0.75 : 1;
  const minHeight = system === "smart_motorized_bottom_up" ? 1 : 0.875;
  if (width === null || width < 0.125 || width > maxWidth)
    issues.push(
      issue(
        "honeycomb.matrix.cutout.width",
        46,
        { cutout_width_inches: width, minWidth: 0.125, maxWidth },
        `Cut-out width must be from 1/8 inch through ${maxWidth} inch for this shade width/system.`,
      ),
    );
  if (
    height === null ||
    height < minHeight ||
    height > context.heightInches - 2
  )
    issues.push(
      issue(
        "honeycomb.matrix.cutout.height",
        46,
        {
          cutout_height_inches: height,
          minHeight,
          maxHeight: context.heightInches - 2,
        },
        `Cut-out height must be from ${minHeight} inches through shade height minus 2 inches.`,
      ),
    );
  return issues;
}

export function validateHoneycombMatrix(
  context: SelectionContext,
): readonly ValidationIssue[] {
  const resolved = resolveHoneycombMatrixProfile(context);
  if (!resolved.ok)
    return [
      issue(
        `honeycomb.matrix.${resolved.code.toLowerCase()}`,
        resolved.page,
        baseSelected(context),
        resolved.message,
        "hard_block",
        undefined,
        resolved.sourceId,
      ),
    ];
  const issues =
    resolved.system === "specialty_shape" ||
    resolved.system === "smartfit_frame" ||
    resolved.system === "smartfit_dual_frame" ||
    resolved.system === "smartfit_sloped_frame"
      ? []
      : validateDimensionProfile(context, resolved.profile);
  issues.push(
    ...validateConditionalLimits(
      context,
      resolved.system,
      resolved.fabricClass,
    ),
  );
  issues.push(...validateMountAndSideBySide(context, resolved.system));
  issues.push(
    ...validateTwoOnOne(
      context,
      resolved.system,
      resolved.cell,
      resolved.fabricClass,
    ),
  );
  issues.push(...validateFrame(context, resolved.system, resolved.profile));
  issues.push(...validateSlope(context, resolved.system));
  issues.push(
    ...validateDayNight(
      context,
      resolved.system,
      resolved.fabricClass,
      resolved.cell,
    ),
  );
  issues.push(...validateVertical(context, resolved.system));
  issues.push(...validateSpecialtyShape(context, resolved.system));
  issues.push(
    ...validateCutout(context, resolved.system, resolved.fabricClass),
  );
  if (
    compact(stringConfig(context, "fabric_collection")).includes(
      "silverbrook",
    ) &&
    resolved.cell === "3_8_single"
  )
    issues.push(
      issue(
        "honeycomb.matrix.silverbrook_3_8_excluded",
        8,
        {
          fabric_collection: stringConfig(context, "fabric_collection"),
          cell_size: stringConfig(context, "cell_size"),
        },
        "Silverbrook Designer Light Filtering is not available in 3/8-inch Single Cell.",
      ),
    );
  if (
    (resolved.system === "smartfit" || resolved.system === "smartfit_dual") &&
    normalizedMount(context) === "outside" &&
    (resolved.cell === "3_4_double" || resolved.cell === "1_1_4_single")
  )
    issues.push(
      issue(
        "honeycomb.matrix.smartfit_ob_large_cell_excluded",
        8,
        {
          system: resolved.system,
          mount_type: stringConfig(context, "mount_type"),
          cell: resolved.cell,
        },
        "Outside-mount SmartFit and SmartFit Dual are unavailable in 3/4-inch Double and 1 1/4-inch Single cells.",
      ),
    );
  return issues;
}
